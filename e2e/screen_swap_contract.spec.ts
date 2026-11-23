import { test, expect } from './support/selfhostFixture';

/**
 * Contract of `swapScreen` at the browser boundary. The app calls it from taps,
 * so these cases drive the module directly against a synthetic view-transition
 * implementation: fast-forwarding a deferred callback is the only way to catch
 * a stale one deterministically.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { __rejections: string[] };
    state.__rejections = [];
    window.addEventListener('unhandledrejection', event => {
      state.__rejections.push(String(event.reason));
    });
  });
});

const rejections = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __rejections: string[] }).__rejections);

test('a missing or throwing view-transition API applies the update exactly once', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const motion = await import('/src/lib/motion.ts');
    const calls: string[] = [];
    const attr = () => document.documentElement.dataset.motionSwap ?? null;

    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
    motion.swapScreen('tab', () => calls.push('missing'));
    const missing = { calls: [...calls], attr: attr() };

    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: () => {
        throw new Error('boom');
      },
    });
    motion.swapScreen('push', () => calls.push('throwing'));
    const throwing = { calls: [...calls], attr: attr() };

    // A callback that throws is a real failure, not a reason to apply it twice.
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
    let thrown = '';
    try {
      motion.swapScreen('pop', () => {
        calls.push('failing');
        throw new Error('update failed');
      });
    } catch (error) {
      thrown = (error as Error).message;
    }

    return { missing, throwing, failing: { calls: [...calls], thrown } };
  });

  expect(result.missing).toEqual({ calls: ['missing'], attr: null });
  expect(result.throwing).toEqual({ calls: ['missing', 'throwing'], attr: null });
  expect(result.failing).toEqual({ calls: ['missing', 'throwing', 'failing'], thrown: 'update failed' });
});

test('a skipped transition still paints once and leaves no unhandled rejection', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const motion = await import('/src/lib/motion.ts');
    let calls = 0;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        // A skip runs the DOM update; only `ready` reports the skip.
        callback();
        return {
          ready: Promise.reject(new DOMException('skipped', 'AbortError')),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition() {},
          types: new Set<string>(),
        };
      },
    });

    motion.swapScreen('tab-next', () => {
      calls += 1;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return { calls, attr: document.documentElement.dataset.motionSwap ?? null };
  });

  expect(result).toEqual({ calls: 1, attr: null });
  expect(await rejections(page)).toEqual([]);
});

test('a deferred request is drained before the next swap, and the callback cannot run twice', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const motion = await import('/src/lib/motion.ts');
    const attr = () => document.documentElement.dataset.motionSwap ?? null;
    let deferred: (() => void) | undefined;
    let finish: (() => void) | undefined;
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        deferred = callback;
        return {
          ready: new Promise<never>(() => {}),
          finished,
          updateCallbackDone: finished,
          skipTransition() {},
          types: new Set<string>(),
        };
      },
    });

    const applied: string[] = [];
    let screen = '';
    // A vault switch is still waiting for its callback when a dock tab lands.
    motion.swapScreen('tab', () => {
      applied.push('vault');
      screen = 'vault';
    });
    const started = { applied: [...applied], screen, attr: attr() };

    motion.swapScreen('tab-next', () => {
      applied.push('tab');
      screen = 'tab';
    });
    const latest = { applied: [...applied], screen, attr: attr() };

    deferred?.();
    const stale = { applied: [...applied], screen, attr: attr() };

    finish?.();
    await Promise.resolve();
    return { started, latest, stale, settled: attr() };
  });

  // The pending request lands first, the newer one last: nothing is dropped and
  // the last value for the same screen still wins.
  expect(result.started).toEqual({ applied: [], screen: '', attr: 'tab' });
  expect(result.latest).toEqual({ applied: ['vault', 'tab'], screen: 'tab', attr: 'tab' });
  expect(result.stale).toEqual({ applied: ['vault', 'tab'], screen: 'tab', attr: 'tab' });
  expect(result.settled).toBeNull();
});

test('a failed update during a skip surfaces as its own error, not as a skip', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const motion = await import('/src/lib/motion.ts');
    let calls = 0;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        // Real Chromium: a skipped transition whose callback throws rejects
        // `ready` with AbortError, and `updateCallbackDone`/`finished` with the
        // update error.
        let failure: unknown;
        try {
          callback();
        } catch (error) {
          failure = error;
        }
        return {
          ready: Promise.reject(new DOMException('skipped', 'AbortError')),
          updateCallbackDone: Promise.reject(failure),
          finished: Promise.reject(failure),
          skipTransition() {},
          types: new Set<string>(),
        };
      },
    });

    motion.swapScreen('push', () => {
      calls += 1;
      throw new Error('update failed');
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return { calls, attr: document.documentElement.dataset.motionSwap ?? null };
  });

  expect(result).toEqual({ calls: 1, attr: null });
  const unhandled = await rejections(page);
  // The update ran once; its failure stays observable through the one channel
  // that carries it, and is not misreported as an expected skip.
  expect(unhandled).toEqual(['Error: update failed']);
});

test('a direct callback failure reports exactly once, not once per promise', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const motion = await import('/src/lib/motion.ts');
    let calls = 0;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        // Without a skip, Chromium rejects ready/updateCallbackDone/finished
        // with the same update error.
        let failure: unknown;
        try {
          callback();
        } catch (error) {
          failure = error;
        }
        return {
          ready: Promise.reject(failure),
          updateCallbackDone: Promise.reject(failure),
          finished: Promise.reject(failure),
          skipTransition() {},
          types: new Set<string>(),
        };
      },
    });

    motion.swapScreen('push', () => {
      calls += 1;
      throw new Error('update failed');
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return { calls, attr: document.documentElement.dataset.motionSwap ?? null };
  });

  expect(result).toEqual({ calls: 1, attr: null });
  expect(await rejections(page)).toEqual(['Error: update failed']);
});

test('an aborted visual transition is expected and stays silent', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const motion = await import('/src/lib/motion.ts');
    let calls = 0;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        callback();
        return {
          ready: Promise.reject(new DOMException('aborted', 'InvalidStateError')),
          updateCallbackDone: Promise.resolve(),
          finished: Promise.resolve(),
          skipTransition() {},
          types: new Set<string>(),
        };
      },
    });

    motion.swapScreen('pop', () => {
      calls += 1;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return { calls, attr: document.documentElement.dataset.motionSwap ?? null };
  });

  expect(result).toEqual({ calls: 1, attr: null });
  expect(await rejections(page)).toEqual([]);
});
