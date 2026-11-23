// The desktop prompt dialog can be expanded into a document-sized surface. The size change itself
// is one layout pass; only the shell is scaled from its old box to the new one (FLIP). This spec
// pauses that animation at creation and scrubs its timeline, so the midpoint and the reversed
// toggle are deterministic instead of racing a 150 ms clock. Reduced motion must skip the scale
// but not the resize.
import { test, expect, type Page } from './support/selfhostFixture';

test.setTimeout(300_000);

const DIALOG = '[role="dialog"][aria-label="Промпт"]';
const CARD = `${DIALOG} > div`;
const TOGGLE_LABELS = ['Развернуть', 'Свернуть'];

interface ToggleResult {
  count: number;
  oldState: string;
  label: string;
}

async function openPrompt(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 240_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();
  await page.getByTestId('ai-prompt-open').click();
  await expect(page.getByTestId('ai-prompt-text')).toBeVisible();
  await expect(page.locator(DIALOG)).toHaveAttribute('data-motion-state', 'open');
  // Settled entrance: otherwise its own CSS transition would still be running under the probe.
  await expect.poll(() => page.locator(CARD).evaluate(element => element.getAnimations().length)).toBe(0);
}

/** Holds every shell animation at its first frame, so the test owns the timeline. */
async function holdShellAnimations(page: Page) {
  await page.evaluate(() => {
    const host = window as unknown as { __resizeAnimations: Animation[] };
    host.__resizeAnimations = [];
    const native = Element.prototype.animate;
    Element.prototype.animate = function patched(this: Element, ...args: Parameters<Element['animate']>) {
      const animation = native.apply(this, args);
      animation.pause();
      host.__resizeAnimations.push(animation);
      return animation;
    };
  });
}

async function clickToggle(page: Page) {
  await page.evaluate(({ dialogSelector, labels }) => {
    const dialog = document.querySelector(dialogSelector);
    const button = [...(dialog?.querySelectorAll('button') ?? [])]
      .find(element => labels.includes(element.getAttribute('aria-label') ?? '')) as HTMLElement;
    button.click();
  }, { dialogSelector: DIALOG, labels: TOGGLE_LABELS });
}

/** Clicks and waits for the held animation, reporting the old one's fate on an interruption. */
async function toggleAndHold(page: Page, interrupt = false): Promise<ToggleResult> {
  const before = await page.evaluate(() => (window as unknown as { __resizeAnimations: Animation[] }).__resizeAnimations.length);
  await clickToggle(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __resizeAnimations: Animation[] }).__resizeAnimations.length))
    .toBe(before + 1);
  return page.evaluate(({ previousIndex, dialogSelector, labels }) => {
    const host = window as unknown as { __resizeAnimations: Animation[] };
    const animations = host.__resizeAnimations;
    const card = (document.querySelector(dialogSelector) as HTMLElement).firstElementChild as HTMLElement;
    const button = [...((document.querySelector(dialogSelector) as HTMLElement).querySelectorAll('button'))]
      .find(element => labels.includes(element.getAttribute('aria-label') ?? ''));
    return {
      count: card.getAnimations().length,
      oldState: previousIndex >= 0 ? animations[previousIndex].playState : 'none',
      label: button?.getAttribute('aria-label') ?? '',
    };
  }, { previousIndex: interrupt ? before - 1 : -1, dialogSelector: DIALOG, labels: TOGGLE_LABELS });
}

/** Scrubs the held animation and compares the scaled visual box with the layout box. */
async function scrub(page: Page, timeMs: number) {
  return page.evaluate((time) => {
    const host = window as unknown as { __resizeAnimations: Animation[] };
    const animation = host.__resizeAnimations.at(-1)!;
    animation.currentTime = time;
    const card = (document.querySelector('[role="dialog"][aria-label="Промпт"]') as HTMLElement).firstElementChild as HTMLElement;
    return {
      playState: animation.playState,
      visual: card.getBoundingClientRect().width,
      layout: card.offsetWidth,
    };
  }, timeMs);
}

/** Ends the held animation and reports the settled shell. */
async function release(page: Page) {
  return page.evaluate(() => {
    const host = window as unknown as { __resizeAnimations: Animation[] };
    host.__resizeAnimations.at(-1)?.cancel();
    const dialog = document.querySelector('[role="dialog"][aria-label="Промпт"]') as HTMLElement;
    const card = dialog.firstElementChild as HTMLElement;
    const button = [...dialog.querySelectorAll('button')]
      .find(element => ['Развернуть', 'Свернуть'].includes(element.getAttribute('aria-label') ?? ''));
    return {
      animations: card.getAnimations().length,
      transform: getComputedStyle(card).transform,
      visual: card.getBoundingClientRect().width,
      layout: card.offsetWidth,
      label: button?.getAttribute('aria-label') ?? '',
    };
  });
}

test('desktop: expand is a shell flip and an interrupted toggle settles on the last choice', async ({ page }) => {
  await openPrompt(page);
  const card = page.locator(CARD);
  const editor = page.getByTestId('ai-prompt-text');
  await editor.fill('RESIZE-KEEPS-TEXT');
  const narrow = (await card.boundingBox())!.width;
  await holdShellAnimations(page);

  // Expand and hold it halfway: layout is already wide, the visual box is still between the two.
  const expand = await toggleAndHold(page);
  expect(expand.count).toBe(1);
  expect(expand.label).toBe('Свернуть');
  const expandMid = await scrub(page, 75);
  expect(expandMid.playState).toBe('paused');
  expect(expandMid.visual).toBeLessThan(expandMid.layout - 4);
  await release(page);
  const wide = (await card.boundingBox())!.width;
  expect(wide).toBeGreaterThan(narrow + 100);

  // Collapse, hold it halfway, then reverse inside that flight. Exactly one animation exists at
  // the trigger; the reversed effect cancels the old one before starting its own, so nothing is
  // left running beside the replacement.
  const collapse = await toggleAndHold(page);
  expect(collapse.count).toBe(1);
  expect(collapse.label).toBe('Развернуть');
  const collapseMid = await scrub(page, 75);
  expect(collapseMid.visual).toBeGreaterThan(collapseMid.layout + 4);

  const reversed = await toggleAndHold(page, true);
  expect(reversed.count).toBe(1);
  expect(reversed.oldState).toBe('idle');
  expect(reversed.label).toBe('Свернуть');
  const reversedMid = await scrub(page, 75);
  expect(reversedMid.visual).toBeLessThan(reversedMid.layout - 4);

  const settled = await release(page);
  expect(settled.animations).toBe(0);
  expect(settled.transform).toBe('none');
  expect(Math.abs(settled.visual - settled.layout)).toBeLessThan(1);
  expect(settled.label).toBe('Свернуть');
  expect(Math.abs((await card.boundingBox())!.width - wide)).toBeLessThan(1);

  // The editor was never remounted: the text survives both size changes and stays editable.
  await expect(editor).toHaveValue('RESIZE-KEEPS-TEXT');
  await expect(editor).toBeEnabled();
  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-resize-wide.png' });
});

test('desktop: reduced motion skips the scale but not the resize', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPrompt(page);
  const card = page.locator(CARD);
  const narrow = (await card.boundingBox())!.width;
  await holdShellAnimations(page);

  await page.getByRole('button', { name: 'Развернуть' }).click();
  await expect(page.getByRole('button', { name: 'Свернуть' })).toBeVisible();

  const result = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Промпт"]') as HTMLElement;
    const card = dialog.firstElementChild as HTMLElement;
    return {
      animateCalls: (window as unknown as { __resizeAnimations: Animation[] }).__resizeAnimations.length,
      animations: card.getAnimations().length,
      visual: card.getBoundingClientRect().width,
      layout: card.offsetWidth,
    };
  });

  expect(result.animateCalls).toBe(0);
  expect(result.animations).toBe(0);
  expect(Math.abs(result.visual - result.layout)).toBeLessThan(1);
  expect((await card.boundingBox())!.width).toBeGreaterThan(narrow + 100);
});
