import { test, expect } from '@playwright/test';
import { chooseMobileFolder, mobileFolderTrigger, openMobileFolderProfile, openMobileNoteSearch } from './support/mobileFolders';

test.describe('Back Navigation Engine: Desktop Mouse Back & Keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('Desktop: Mouse Back Button (Button 4 / Back) closes SearchModal', async ({ page }) => {
    // Open Search via Ctrl+K
    await page.keyboard.press('Control+k');
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    // Trigger mouse back button (button 3 / Mouse 4)
    await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true }));
    });
    await expect(searchInput).toBeHidden();
  });

  test('Desktop: Mouse Back Button closes SettingsModal', async ({ page }) => {
    const settingsButton = page.locator('button[title*="Настройки"]').first();
    await settingsButton.click();
    const settingsTitle = page.locator('h3:has-text("Настройки")');
    await expect(settingsTitle).toBeVisible();

    // Trigger mouse back button
    await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true }));
    });
    await expect(settingsTitle).toBeHidden();
  });

  test('Desktop: UI Dismiss (Escape) keeps history stack synchronized', async ({ page }) => {
    const initialUrl = page.url();

    // Open Search
    await page.keyboard.press('Control+k');
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(searchInput).toBeHidden();

    // Open Search again and close via Escape
    await page.keyboard.press('Control+k');
    await expect(searchInput).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(searchInput).toBeHidden();

    // Verify app URL is unchanged and no crash
    expect(page.url()).toBe(initialUrl);
  });
});

test.describe('Back Navigation Engine: Mobile Touch, Gestures & PopState', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
  });

  test('Mobile: Browser Back (page.goBack()) closes Search modal without leaving app', async ({ page }) => {
    const searchInput = await openMobileNoteSearch(page);

    // Emulate Android back gesture / browser back
    await page.goBack();

    // Search should be dismissed, mobile shell remains active
    await expect(searchInput).toBeHidden();
    await expect(mobileFolderTrigger(page)).toHaveAccessibleName('Переключить папку: Входящие');
  });

  test('Mobile: Browser Back navigates from Tasks tab back to Folders tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Назад к папкам' }).click();
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await expect(dock).toBeVisible();

    // Switch to Tasks tab
    await dock.locator('button[aria-label="Таски"]').click();
    await expect(page.locator('h1', { hasText: 'Таски' })).toBeVisible();

    // Emulate system back
    await page.goBack();

    await expect(page.getByTestId('mobile-vault-switcher-btn')).toBeVisible();
  });

  test('Mobile: Browser Back navigates out of folder back to root folders list', async ({ page }) => {
    await chooseMobileFolder(page, 'Проекты');
    const folderBackBtn = page.getByRole('button', { name: 'Назад к папкам' });
    await expect(folderBackBtn).toBeVisible();

    // Emulate system back
    await page.goBack();

    // Should be back at root folders list (h1 "Заметки" visible)
    await expect(page.getByTestId('mobile-vault-switcher-btn')).toBeVisible();
    await expect(folderBackBtn).toBeHidden();
  });

  test('Mobile: Stacked Layers - closes top layer first, then underlying folder', async ({ page }) => {
    await chooseMobileFolder(page, 'Проекты');
    const folderBackBtn = page.getByRole('button', { name: 'Назад к папкам' });
    const profile = await openMobileFolderProfile(page);

    // First Back closes the profile, not the underlying folder.
    await page.goBack();
    await expect(profile).toBeHidden();
    await expect(folderBackBtn).toBeVisible();

    // Second Back -> Exits "Входящие" folder back to root
    await page.goBack();
    await expect(page.getByTestId('mobile-vault-switcher-btn')).toBeVisible();
    await expect(folderBackBtn).toBeHidden();
  });
});
