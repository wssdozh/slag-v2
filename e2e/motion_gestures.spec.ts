import { test, expect } from './support/selfhostFixture';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

/** Long-press is a touch gesture, and Playwright's touchscreen only taps. */
async function pressAndHold(locator: import('@playwright/test').Locator) {
  await locator.evaluate(element => {
    const point = { clientX: 120, clientY: 260 };
    const touch = new Touch({
      identifier: 1,
      target: element,
      clientX: point.clientX,
      clientY: point.clientY,
      pageX: point.clientX,
      pageY: point.clientY,
      screenX: point.clientX,
      screenY: point.clientY,
    });
    element.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch],
    }));
  });
}

/**
 * Wait for the sheet to stop moving.
 *
 * `data-motion-state="open"` is not an "entrance finished" signal: `usePresence` flips the
 * phase one frame after mount, and that flip is what *starts* the `.motion-sheet` translate
 * from 100% to 0 — measured on this build, the panel is still at `translate: 0px 100%`
 * (top 844 of an 844px viewport) on that frame and only comes to rest at 471. The old fixed
 * 700ms wait after the press covered the 200ms slide with ~50ms to spare, so on a busy frame
 * the "resting" box was read mid-slide, and the snap-back comparison failed against a
 * baseline that was never the resting place.
 */
async function waitForStillSheet(panel: import('@playwright/test').Locator) {
  await expect(panel).toHaveAttribute('data-motion-state', 'open');
  await panel.evaluate(async element => {
    const deadline = performance.now() + 5_000;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    while (performance.now() < deadline) {
      const running = element.getAnimations({ subtree: true })
        .some(animation => animation.playState === 'running');
      if (!running) return;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  });
}

test('the action sheet drags 1:1, snaps back, then dismisses', async ({ page }) => {
  // The first load in a cold tree pays Vite's transform of the whole module graph.
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('button', { hasText: 'Входящие' }).first().click();

  const text = 'Жест шита ' + Date.now();
  await page.locator('main textarea, .relative textarea').first().fill(text);
  await page.locator('button[title*="Отправить"]').first().click();
  const card = page.locator('.group', { hasText: text });
  await expect(card).toBeVisible();

  await pressAndHold(card);
  const sheet = page.getByTestId('action-sheet');
  const panel = page.getByTestId('sheet-panel');
  // The sheet is a lazy overlay now: the long press mounts it and pulls its chunk, so on a cold
  // tree the first appearance is a network hop away, not a frame.
  await expect(sheet).toBeVisible({ timeout: 15000 });
  await waitForStillSheet(panel);
  const rest = (await panel.boundingBox())!;

  const handle = page.locator('[data-sheet-handle]');
  const handleBox = (await handle.boundingBox())!;
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;

  // A slow short drag is not a decision: the sheet has to come back.
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 5; step += 1) {
    await page.waitForTimeout(40);
    await page.mouse.move(x, y + step * 6);
  }
  await page.mouse.up();

  // "Came back" means the settle transition is over and the panel is home. The ease overshoots
  // past home on its way, so a box sampled mid-animation can sit within tolerance while still
  // travelling — the second drag then starts on a moving sheet.
  await expect.poll(async () => {
    const sample = await panel.evaluate(element => ({
      top: element.getBoundingClientRect().top,
      running: element.getAnimations({ subtree: true })
        .some(animation => animation.playState === 'running'),
    }));
    return sample.running ? Number.POSITIVE_INFINITY : Math.abs(sample.top - rest.y);
  }, { message: 'the sheet settles back to its resting place instead of dismissing' }).toBeLessThan(1.5);

  // A fast drag tracks the pointer exactly, then commits.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 90);
  const dragged = await panel.evaluate(element => getComputedStyle(element).translate);
  expect(dragged).toBe('0px 90px');
  await page.screenshot({ path: 'test-results/screenshots/motion_sheet_drag.png' });
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
});
