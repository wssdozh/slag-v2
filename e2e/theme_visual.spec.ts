import { test, expect } from '@playwright/test';

test('Capture softened slate-gray workspace and fullscreen editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);

  // 1. Capture Main Workspace
  await page.screenshot({
    path: 'test-results/screenshots/theme_workspace_slate_gray.png',
    fullPage: false,
  });

  // 2. Open Fullscreen Editor
  const expandBtn = page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first();
  await expect(expandBtn).toBeVisible();
  await expandBtn.click();
  await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(600);

  // Capture Fullscreen Editor
  await page.screenshot({
    path: 'test-results/screenshots/theme_fullscreen_editor_slate_gray.png',
    fullPage: false,
  });
});
