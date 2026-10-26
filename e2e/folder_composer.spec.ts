import { test, expect } from '@playwright/test';

test.describe('Composer @ Folder Selection E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. Typing @ opens Folder Suggestion Menu, keyboard navigates and selects folder', async ({ page }) => {
    const textarea = page.locator('main textarea');
    await expect(textarea).toBeVisible();

    // Type text and trigger @ menu
    await textarea.click();
    await textarea.pressSequentially('Тестовая таска @');

    // Menu should appear
    const folderMenuHeader = page.locator('text=Целевая папка (@)');
    await expect(folderMenuHeader).toBeVisible();

    // Visual screenshot of the open @ folder menu
    await page.screenshot({ path: 'test-results/screenshots/folder_menu_open.png' });

    // Filter by typing 'диз'
    await textarea.pressSequentially('диз');

    // The item 'Дизайн' should be visible
    const designItem = page.locator('button', { hasText: 'Дизайн' }).first();
    await expect(designItem).toBeVisible();

    // Press Enter to select the folder
    await textarea.press('Enter');

    // Menu should disappear
    await expect(folderMenuHeader).toBeHidden();

    // Text in textarea should no longer contain '@диз'
    const value = await textarea.inputValue();
    expect(value.trim()).toBe('Тестовая таска');

    // Target folder chip should be visible in composer properties
    const folderChip = page.locator('span[title*="Целевая папка для сохранения"]');
    await expect(folderChip).toBeVisible();
    await expect(folderChip).toContainText('Проекты/Дизайн');

    // Visual screenshot of composer with folder chip
    await page.screenshot({ path: 'test-results/screenshots/folder_chip_active.png' });

    // Send the note
    await textarea.press('Enter');

    // Toast or note created
    await expect(page.locator('text=Папка «Дизайн» выбрана')).toBeVisible({ timeout: 3000 });
  });

  test('2. Clicking folder button in toolbar opens folder menu', async ({ page }) => {
    const textarea = page.locator('main textarea');
    await expect(textarea).toBeVisible();

    // Click folder button in composer toolbar
    const folderBtn = page.locator('button[title*="Выбрать целевую папку"]').first();
    await expect(folderBtn).toBeVisible();
    await folderBtn.click();

    // Folder menu should open
    const folderMenuHeader = page.locator('text=Целевая папка (@)');
    await expect(folderMenuHeader).toBeVisible();

    // Click on 'Личное' in the suggestion menu list
    const personalItem = page.locator('[data-folder-item="Личное"]').first();
    await expect(personalItem).toBeVisible();
    await personalItem.click();

    // Folder menu closes
    await expect(folderMenuHeader).toBeHidden();

    // Chip appears
    const folderChip = page.locator('span[title*="Целевая папка для сохранения"]');
    await expect(folderChip).toBeVisible();
    await expect(folderChip).toContainText('Личное');

    // Click close button on chip to dismiss target folder
    const chipCloseBtn = folderChip.locator('button');
    await chipCloseBtn.click();
    await expect(folderChip).toBeHidden();
  });
});
