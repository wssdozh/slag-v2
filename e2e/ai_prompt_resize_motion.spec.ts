// The desktop prompt dialog can be expanded into a document-sized surface. The size change itself
// is one layout pass; only the shell is scaled from its old box to the new one (FLIP). This spec
// checks that state, that an interrupted toggle settles on the last choice, and that reduced
// motion skips the scale without skipping the resize.
import { test, expect, type Page } from './support/selfhostFixture';

test.setTimeout(300_000);

const DIALOG = '[role="dialog"][aria-label="Промпт"]';
const CARD = `${DIALOG} > div`;

interface ResizeFrame {
  visual: number;
  layout: number;
  running: number;
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
  // Settled entrance: otherwise its own scale/translate transition would be counted below.
  await expect.poll(() => page.locator(CARD).evaluate(element => element.getAnimations().length)).toBe(0);
}

/** Clicks the expand/collapse control and samples the card every frame for ~400 ms. */
async function toggleAndSample(page: Page, interrupt: boolean): Promise<ResizeFrame[]> {
  return page.evaluate(async ({ interrupt }) => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Промпт"]');
    const card = dialog?.firstElementChild as HTMLElement;
    const button = [...(dialog?.querySelectorAll('button') ?? [])]
      .find(element => ['Развернуть', 'Свернуть'].includes(element.getAttribute('aria-label') ?? '')) as HTMLElement;
    const frames: ResizeFrame[] = [];
    button.click();
    if (interrupt) {
      await new Promise(resolve => setTimeout(resolve, 45));
      button.click();
    }
    for (let index = 0; index < 24; index++) {
      await new Promise(requestAnimationFrame);
      const rect = card.getBoundingClientRect();
      frames.push({
        visual: rect.width,
        layout: card.offsetWidth,
        running: card.getAnimations().filter(animation => animation.playState === 'running').length,
        label: button.getAttribute('aria-label') ?? '',
      });
    }
    return frames;
  }, { interrupt });
}

test('desktop: expand is a shell flip and an interrupted toggle settles on the last choice', async ({ page }) => {
  await openPrompt(page);
  const card = page.locator(CARD);
  const editor = page.getByTestId('ai-prompt-text');
  await editor.fill('RESIZE-KEEPS-TEXT');
  const narrow = (await card.boundingBox())!.width;

  const expanded = await toggleAndSample(page, false);
  expect(expanded.some(frame => frame.running >= 1)).toBe(true);
  // Layout is already the wide box; the visual box still starts at the narrow one.
  expect(expanded.some(frame => frame.layout - frame.visual > 4)).toBe(true);
  expect(expanded.every(frame => frame.running <= 1)).toBe(true);
  expect(expanded.at(-1)!.label).toBe('Свернуть');
  expect(expanded.at(-1)!.running).toBe(0);
  expect(Math.abs(expanded.at(-1)!.visual - expanded.at(-1)!.layout)).toBeLessThan(1);
  const wide = (await card.boundingBox())!.width;
  expect(wide).toBeGreaterThan(narrow + 100);
  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-resize-wide.png' });

  // Collapse and expand again inside the first animation: the last click must win, no stale scale.
  const interrupted = await toggleAndSample(page, true);
  expect(interrupted.some(frame => frame.running >= 1)).toBe(true);
  expect(interrupted.some(frame => Math.abs(frame.visual - frame.layout) > 4)).toBe(true);
  expect(interrupted.every(frame => frame.running <= 1)).toBe(true);
  expect(interrupted.at(-1)!.label).toBe('Свернуть');
  expect(interrupted.at(-1)!.running).toBe(0);
  expect(Math.abs(interrupted.at(-1)!.visual - interrupted.at(-1)!.layout)).toBeLessThan(1);
  expect(Math.abs((await card.boundingBox())!.width - wide)).toBeLessThan(1);
  // The editor was never remounted: the text survives both size changes and stays editable.
  await expect(editor).toHaveValue('RESIZE-KEEPS-TEXT');
  await expect(editor).toBeEnabled();
});

test('desktop: reduced motion skips the scale but not the resize', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPrompt(page);
  const card = page.locator(CARD);
  const narrow = (await card.boundingBox())!.width;

  const frames = await toggleAndSample(page, false);
  expect(frames.every(frame => frame.running === 0)).toBe(true);
  expect(frames.every(frame => Math.abs(frame.visual - frame.layout) < 1)).toBe(true);
  expect(frames.at(-1)!.label).toBe('Свернуть');
  expect((await card.boundingBox())!.width).toBeGreaterThan(narrow + 100);
});
