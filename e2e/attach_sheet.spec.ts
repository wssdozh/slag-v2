import { test, expect } from '@playwright/test';

const attachButton = (page: Parameters<Parameters<typeof test>[1]>[0]['page']) =>
  page.locator('button[aria-label="Прикрепить файл"]').first();

test('the paperclip opens one sheet with every source, and the pick lands in the tray', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const sheet = page.locator('[data-testid="attach-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Фото и видео');
  await expect(sheet).toContainText('Файл');
  await expect(sheet).toContainText('Голос');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-desktop.png' });

  // The picker itself stays the platform's; the sheet owns what happens around it.
  await page.locator('[data-testid="attach-input-media"]').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
      '0d0a2db40000000049454e44ae426082',
      'hex',
    ),
  });

  await expect(sheet).toHaveCount(0);
  // Images land in the tray as thumbnails, so the name lives in the alt text.
  await expect(page.locator('[data-composer-attachments] img[alt="shot.png"]')).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-picked.png' });
});

test('Esc closes the sheet, not the surface it was opened from', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const sheet = page.locator('[data-testid="attach-sheet"]');
  await expect(sheet).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // The composer is still there and usable.
  await expect(page.locator('main textarea').first()).toBeVisible();
});

test('on a phone the sheet is a bottom panel with a handle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The phone opens on the folder list; the composer (and its paperclip) lives in the feed.
  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const panel = page.locator('[data-testid="attach-sheet-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Камера');

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeGreaterThan(844 - 4);
  await expect(panel.locator('[data-sheet-handle]')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-mobile.png' });
});
