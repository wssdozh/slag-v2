// Regression: the prompt/persona dialogs were mounted only while `editing` was set, so the
// close unmounted the surface in the same commit and neither the desktop BaseModal nor the
// mobile full-screen sheet ever played an exit. This spec watches the real surfaces frame by
// frame, then proves the draft it kept on screen while fading is not what the next open reads.
import { test, expect, type Page } from './support/selfhostFixture';

test.setTimeout(300_000);

interface SurfaceFrame {
  state: string | null;
  inert: boolean;
  ariaHidden: string | null;
  opacity: number;
  durationMs: number;
  text: string;
  focusInside: boolean;
}

const FIELDS = '[data-testid="ai-prompt-text"], [data-testid="ai-persona-text"]';

/** The surface that currently carries a prompt editor: the BaseModal overlay or the phone sheet. */
function surfaceOf(page: Page) {
  return page.locator('[data-motion-state]').filter({ has: page.locator(FIELDS) }).last();
}

async function waitForSettledOpen(page: Page) {
  await expect.poll(() => surfaceOf(page).evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
}

async function startFrameProbe(page: Page) {
  await page.evaluate((fields) => {
    const host = window as unknown as { __promptFrames: SurfaceFrame[] };
    host.__promptFrames = [];
    let frame = 0;
    const sample = () => {
      const field = document.querySelector(fields);
      // The outermost motion surface: BaseModal's inner card also carries `data-motion-state`,
      // but `inert` and `aria-hidden` live on the overlay around it.
      let surface: Element | null = field;
      while (surface && !surface.hasAttribute('data-motion-state')) surface = surface.parentElement;
      while (surface?.parentElement?.closest('[data-motion-state]')) {
        surface = surface.parentElement.closest('[data-motion-state]');
      }
      if (!surface) {
        host.__promptFrames.push(null as unknown as SurfaceFrame);
      } else {
        const focused = document.activeElement;
        const durations = getComputedStyle(surface).transitionDuration
          .split(',')
          .map(value => (value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000));
        host.__promptFrames.push({
          state: surface.getAttribute('data-motion-state'),
          inert: surface.hasAttribute('inert'),
          ariaHidden: surface.getAttribute('aria-hidden'),
          opacity: Number(getComputedStyle(surface).opacity),
          durationMs: Math.max(0, ...durations),
          text: surface.textContent ?? '',
          focusInside: focused instanceof Node && surface.contains(focused),
        });
      }
      if (++frame < 140) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, FIELDS);
}

async function readFrames(page: Page): Promise<(SurfaceFrame | null)[]> {
  return page.evaluate(() => (window as unknown as { __promptFrames: (SurfaceFrame | null)[] }).__promptFrames);
}

function exitingFrames(frames: (SurfaceFrame | null)[]): SurfaceFrame[] {
  return frames.filter((frame): frame is SurfaceFrame => frame !== null && frame.state === 'exiting');
}

async function openDesktopSettings(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 240_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();
}

async function openMobileSettings(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Назад к папкам' }).click();
  await expect(page.locator('[data-tab-id="settings"]')).toBeVisible({ timeout: 240_000 });
  await page.locator('[data-tab-id="settings"]').click();
  await page.getByTestId('mobile-settings-ai').click();
}

/** Holds the next workspace write inside the page, so a save can outlive the dialog that asked it. */
async function deferWorkspaceSave(page: Page) {
  await page.evaluate(async () => {
    const module = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
    const storage = module.storage;
    const host = window as unknown as {
      __deferredSaves: {
        succeed: () => Promise<void>;
        fail: (reason: string) => void;
      }[];
    };
    host.__deferredSaves = [];
    const original = storage.saveWorkspaceState.bind(storage);
    storage.saveWorkspaceState = (patch: unknown) => new Promise<void>((resolve, reject) => {
      host.__deferredSaves.push({
        succeed: async () => {
          await original(patch);
          resolve();
        },
        fail: (reason: string) => reject(new Error(reason)),
      });
    });
  });
}

/** Starts a save, answers the prompt, and opens persona inside the exit: same surface, new session. */
async function deferPromptSaveAndOpenPersona(page: Page, draft: string) {
  await page.getByTestId('ai-prompt-open').click();
  await page.getByTestId('ai-prompt-text').fill(draft);
  await deferWorkspaceSave(page);
  await page.getByTestId('ai-prompt-save').click();
  await expect(page.getByTestId('ai-prompt-save')).toBeDisabled();

  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Промпт"]');
    const cancel = [...(dialog?.querySelectorAll('button') ?? [])]
      .find(button => button.textContent?.trim() === 'Отмена');
    cancel?.click();
    window.setTimeout(() => {
      (document.querySelector('[data-testid="ai-persona-open"]') as HTMLElement | null)?.click();
    }, 20);
  });

  const persona = page.getByTestId('ai-persona-text');
  await expect(persona).toBeVisible();
  return persona;
}

async function resolveDeferredSave(page: Page, outcome: 'succeed' | 'fail') {
  await page.evaluate((mode) => {
    const saves = (window as unknown as {
      __deferredSaves: { succeed: () => Promise<void>; fail: (reason: string) => void }[];
    }).__deferredSaves;
    if (mode === 'succeed') return saves[0].succeed();
    saves[0].fail('offline');
  }, outcome);
}

async function startDeferredSaveAndClose(page: Page, draft: string) {
  const persona = await deferPromptSaveAndOpenPersona(page, draft);
  // The new session is not "saving": the switch answers and the editor is editable at once.
  await page.getByLabel('Персона включена').click();
  await expect(page.getByTestId('ai-persona-switch-row')).toContainText('ассистент говорит от её лица');
  await expect(persona).toBeEnabled();
  await expect(page.getByTestId('ai-persona-save')).toBeEnabled();
  return persona;
}

test('desktop: a closed prompt fades with its draft, then opens clean and returns focus', async ({ page }) => {
  await openDesktopSettings(page);
  const opener = page.getByTestId('ai-prompt-open');
  await opener.click();

  const editor = page.getByTestId('ai-prompt-text');
  await expect(editor).toBeVisible();
  await editor.fill('DRAFT-THAT-MUST-NOT-LEAK');
  await expect(page.getByTestId('ai-prompt-save')).toBeEnabled();
  await waitForSettledOpen(page);
  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-exit-open.png' });

  await startFrameProbe(page);
  await page.getByRole('dialog', { name: 'Промпт' }).getByRole('button', { name: 'Отмена' }).click();
  // The DOM goes away only after the exit: `aria-hidden` hides the role earlier, so wait on the
  // editor's test id instead of the dialog role.
  await expect(editor).toHaveCount(0);

  const exiting = exitingFrames(await readFrames(page));
  expect(exiting.length).toBeGreaterThan(0);
  // The surface still shows the abandoned text while it fades, but is already closed to input
  // and to the accessibility tree.
  expect(exiting.some(frame => frame.text.includes('DRAFT-THAT-MUST-NOT-LEAK'))).toBe(true);
  expect(exiting.every(frame => frame.inert && frame.ariaHidden === 'true')).toBe(true);
  expect(exiting.some(frame => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
  expect(exiting.every(frame => frame.focusInside === false)).toBe(true);
  await expect(opener).toBeFocused();

  // A new open starts from the stored text, not from the draft that was on screen during exit.
  await opener.click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue('');
  await expect(page.getByTestId('ai-prompt-save')).toBeDisabled();
  await page.getByRole('dialog', { name: 'Промпт' }).getByRole('button', { name: 'Отмена' }).click();
  await expect(editor).toHaveCount(0);
});

test('desktop: a different field opened inside the exit window is not the previous draft', async ({ page }) => {
  await openDesktopSettings(page);
  await page.getByTestId('ai-prompt-open').click();
  await page.getByTestId('ai-prompt-text').fill('PROMPT-ONLY-DRAFT');
  await waitForSettledOpen(page);

  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Промпт"]');
    const cancel = [...(dialog?.querySelectorAll('button') ?? [])]
      .find(button => button.textContent?.trim() === 'Отмена');
    cancel?.click();
    window.setTimeout(() => {
      (document.querySelector('[data-testid="ai-persona-open"]') as HTMLElement | null)?.click();
    }, 20);
  });

  const persona = page.getByTestId('ai-persona-text');
  await expect(persona).toBeVisible();
  await expect(persona).toHaveValue('');
  await expect(page.getByTestId('ai-prompt-text')).toHaveCount(0);
  await expect(page.getByTestId('ai-persona-save')).toBeDisabled();

  // Same surface, reopened: the old question is not left behind as a second fading layer.
  const dialog = page.getByRole('dialog', { name: 'Персона' });
  await expect(dialog).toHaveAttribute('data-motion-state', 'open');
  expect(await dialog.evaluate(element => element.hasAttribute('inert'))).toBe(false);
  await expect(page.locator('[role="dialog"][data-motion-state="exiting"]')).toHaveCount(0);
  await expect(dialog).toHaveCount(1);

  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(persona).toHaveCount(0);
});

test('desktop: a save deferred past its close cannot close, disable or error the next field', async ({ page }) => {
  await openDesktopSettings(page);
  const persona = await startDeferredSaveAndClose(page, 'DEFERRED-PROMPT-SAVE');

  await resolveDeferredSave(page, 'succeed');

  // The write is fulfilled, but it no longer owns the surface it started from.
  await expect(persona).toBeVisible();
  await expect(persona).toBeEnabled();
  await expect(page.getByText('Не удалось сохранить. Текст остался в редакторе.')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Персона' })).toHaveAttribute('data-motion-state', 'open');
  await expect.poll(() => page.evaluate(async () => {
    const module = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
    return module.storage.getWorkspaceState().aiPrompt ?? '';
  })).toContain('DEFERRED-PROMPT-SAVE');
});

test('desktop: a save finishing after its field was replaced does not close the replacement', async ({ page }) => {
  await openDesktopSettings(page);
  const persona = await deferPromptSaveAndOpenPersona(page, 'DEFERRED-PROMPT-SAVE');

  await resolveDeferredSave(page, 'succeed');

  await expect(persona).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Персона' })).toHaveAttribute('data-motion-state', 'open');
  await expect(page.getByText('Не удалось сохранить. Текст остался в редакторе.')).toHaveCount(0);
});

test('desktop: a save failing after its field was replaced does not mark the replacement', async ({ page }) => {
  await openDesktopSettings(page);
  const persona = await deferPromptSaveAndOpenPersona(page, 'FAILING-PROMPT-SAVE');

  await resolveDeferredSave(page, 'fail');

  await expect(page.getByText('Не удалось сохранить. Текст остался в редакторе.')).toHaveCount(0);
  await expect(persona).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Персона' })).toHaveAttribute('data-motion-state', 'open');
});

test('desktop: a save failing after its close cannot mark the next field', async ({ page }) => {
  await openDesktopSettings(page);
  const persona = await startDeferredSaveAndClose(page, 'FAILING-PROMPT-SAVE');

  await resolveDeferredSave(page, 'fail');

  await expect(persona).toBeVisible();
  await expect(persona).toBeEnabled();
  await expect(page.getByTestId('ai-persona-save')).toBeEnabled();
  await expect(page.getByTestId('ai-persona-switch-row')).toContainText('ассистент говорит от её лица');
  await expect(page.getByText('Не удалось сохранить. Текст остался в редакторе.')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Персона' })).toHaveAttribute('data-motion-state', 'open');
});

test('desktop: reduced motion shortens the exit instead of forcing the usual duration', async ({ page }) => {
  await openDesktopSettings(page);
  const opener = page.getByTestId('ai-prompt-open');
  await opener.click();
  const editor = page.getByTestId('ai-prompt-text');
  await expect(editor).toBeVisible();

  const measure = (scope: Page) => surfaceOf(scope).evaluate(element => Math.max(...getComputedStyle(element).transitionDuration
    .split(',')
    .map(value => (value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000))));

  expect(await measure(page)).toBe(200);

  await page.getByRole('dialog', { name: 'Промпт' }).getByRole('button', { name: 'Отмена' }).click();
  await expect(editor).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await opener.click();
  await expect(editor).toBeVisible();
  expect(await measure(page)).toBe(100);
  expect(await surfaceOf(page).evaluate(element => getComputedStyle(element).scale)).toBe('none');

  // The presence deadline follows that shorter CSS, and the surface still leaves completely.
  await startFrameProbe(page);
  await page.getByRole('dialog', { name: 'Промпт' }).getByRole('button', { name: 'Отмена' }).click();
  await expect(editor).toHaveCount(0);
  const exiting = exitingFrames(await readFrames(page));
  expect(exiting.length).toBeGreaterThan(0);
  expect(exiting.every(frame => frame.durationMs <= 100)).toBe(true);
  expect(exiting.every(frame => frame.inert && frame.ariaHidden === 'true')).toBe(true);
});

test('mobile: the prompt sheet fades out and a different field starts clean', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMobileSettings(page);

  await page.getByTestId('ai-prompt-open').click();
  const prompt = page.getByTestId('ai-prompt-text');
  await expect(prompt).toBeVisible();
  await prompt.fill('MOBILE-PROMPT-DRAFT');
  await waitForSettledOpen(page);
  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-mobile-sheet.png' });

  await startFrameProbe(page);
  await surfaceOf(page).getByRole('button', { name: 'Назад' }).click();
  await expect(prompt).toHaveCount(0);

  const exiting = exitingFrames(await readFrames(page));
  expect(exiting.length).toBeGreaterThan(0);
  expect(exiting.some(frame => frame.text.includes('MOBILE-PROMPT-DRAFT'))).toBe(true);
  expect(exiting.every(frame => frame.inert && frame.ariaHidden === 'true')).toBe(true);
  expect(exiting.some(frame => frame.opacity > 0 && frame.opacity < 1)).toBe(true);

  // A different field opens its own sheet with its own stored text, not the draft above.
  await page.getByTestId('ai-persona-open').click();
  const persona = page.getByTestId('ai-persona-text');
  await expect(persona).toBeVisible();
  await expect(persona).toHaveValue('');
  await expect(page.getByTestId('ai-prompt-text')).toHaveCount(0);
  await surfaceOf(page).getByRole('button', { name: 'Назад' }).click();
  await expect(persona).toHaveCount(0);
});
