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
    const folderMenuHeader = page.locator('text=Целевая папка');
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

  test('2. Folder button is permanently absent from toolbar, typing @ opens menu', async ({ page }) => {
    const textarea = page.locator('main textarea');
    await expect(textarea).toBeVisible();

    // Verify folder button in composer toolbar is removed
    const folderBtn = page.locator('button[title*="Выбрать целевую папку"]');
    await expect(folderBtn).toBeHidden();

    // Type @ to open folder menu
    await textarea.fill('@');

    // Folder menu should open
    const folderMenuHeader = page.locator('text=Целевая папка');
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

  test('3. Drag and drop file from explorer directly into Composer', async ({ page }) => {
    const composer = page.locator('main').locator('.rounded-2xl').filter({ has: page.locator('textarea') }).first();
    await expect(composer).toBeVisible();

    // Trigger dragover with files type
    await composer.evaluate((el) => {
      const dt = new DataTransfer();
      const file = new File(['mock content here'], 'project_plan.pdf', { type: 'application/pdf' });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // Check dropzone visual indicator appears
    await expect(page.locator('text=Отпустите файлы для прикрепления')).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/composer-dropzone-active.png',
      fullPage: false,
    });

    // Dispatch drop event with file
    await composer.evaluate((el) => {
      const dt = new DataTransfer();
      const file = new File(['mock content here'], 'project_plan.pdf', { type: 'application/pdf' });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // Verify attachment chip appears in draft strip
    await expect(page.locator('text=project_plan.pdf').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Отпустите файлы для прикрепления')).not.toBeVisible();

    // Type content and submit
    const textarea = page.locator('main textarea').first();
    await textarea.fill('Прикрепляю план проекта');
    await textarea.press('Enter');

    // Verify note is created in feed with attachment
    const noteCard = page.locator('.group').filter({ hasText: 'Прикрепляю план проекта' }).first();
    await expect(noteCard).toBeVisible({ timeout: 5000 });
    await expect(noteCard.locator('text=project_plan.pdf')).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/composer-file-drop.png',
      fullPage: false,
    });
  });

  test('4. Drag and drop file into Quick Composer Island attaches to draft', async ({ page }) => {
    // Open Quick Composer view
    await page.setViewportSize({ width: 660, height: 760 });
    await page.goto('/?window=quick-composer', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Быстрая мысль')).toBeVisible({ timeout: 10000 });

    const textarea = page.locator('textarea[placeholder*="Содержимое записи"]').first();
    await expect(textarea).toBeVisible();

    // Dispatch drop event onto window with file
    await page.evaluate(() => {
      const dt = new DataTransfer();
      const file = new File(['mock image bytes'], 'screenshot_bug.png', { type: 'image/png' });
      dt.items.add(file);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // Verify image thumbnail attachment appears in draft strip
    await expect(page.locator('img[alt="screenshot_bug.png"]').first()).toBeVisible({ timeout: 5000 });

    // Type text and submit with Enter
    await textarea.fill('Баг с кнопкой');

    await page.screenshot({
      path: 'test-results/screenshots/quick-composer-file-drop.png',
      fullPage: false,
    });

    await textarea.press('Enter');
  });
});
