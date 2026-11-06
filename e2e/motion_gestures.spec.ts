import { test, expect } from './support/selfhostFixture';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

/** Long-press is a touch gesture, and Playwright's touchscreen only taps. */
async function longPress(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
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
  await page.waitForTimeout(700);
}

test('the action sheet drags 1:1, snaps back, then dismisses', async ({ page }) => {
  await page.goto('/');
  await page.locator('button', { hasText: 'Входящие' }).first().click();

  const text = 'Жест шита ' + Date.now();
  await page.locator('main textarea, .relative textarea').first().fill(text);
  await page.locator('button[title*="Отправить"]').first().click();
  const card = page.locator('.group', { hasText: text });
  await expect(card).toBeVisible();

  await longPress(page, card);
  const sheet = page.getByTestId('action-sheet');
  const panel = page.getByTestId('sheet-panel');
  await expect(sheet).toBeVisible();
  await expect(panel).toHaveAttribute('data-motion-state', 'open');
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
  await expect.poll(async () => {
    const b = await panel.boundingBox();
    return b ? Math.abs(b.y - rest.y) : 999;
  }).toBeLessThan(1.5);

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
