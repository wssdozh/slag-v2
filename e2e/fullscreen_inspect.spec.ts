import { test, expect } from '@playwright/test';

test('Capture Fullscreen Editor for Task and Note', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

  // Find a task card and open in Fullscreen Editor
  const taskCard = page.locator('article', { hasText: 'таска' }).first();
  if (await taskCard.isVisible()) {
    // Look for edit/expand button or click card
    const expandBtn = taskCard.locator('button[title*="Редактировать"], button[title*="фокус"], button[title*="Открыть"]').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    } else {
      await taskCard.dblclick();
    }
  } else {
    // Open via composer maximize
    const expandBtn = page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first();
    await expandBtn.click();
    // Switch to task
    await page.locator('header button:has-text("Таска")').click();
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_task.png' });

  // Switch to note
  await page.locator('header button:has-text("Заметка")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_note.png' });

  // Switch to article
  await page.locator('header button:has-text("Статья")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_article.png' });
});
