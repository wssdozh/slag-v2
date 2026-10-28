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

  test('5. Pure file note card: sleek compact row without matryoshka or thin pill', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const composer = page.locator('main').locator('.rounded-2xl').filter({ has: page.locator('textarea') }).first();
    await expect(composer).toBeVisible();

    // Drop file directly into composer without any text
    await composer.evaluate((el) => {
      const dt = new DataTransfer();
      const file = new File(['log events content'], 'slag_logs_2026-10-28-06-12-30.json', { type: 'application/json' });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // Wait for attachment in composer strip
    await expect(page.locator('text=slag_logs_2026-10-28-06-12-30.json').first()).toBeVisible({ timeout: 5000 });

    // Submit with Enter (no text typed)
    const textarea = page.locator('main textarea').first();
    await textarea.press('Enter');

    // Verify pure file card in feed
    const fileCard = page.locator('.group').filter({ hasText: 'slag_logs_2026-10-28-06-12-30.json' }).first();
    await expect(fileCard).toBeVisible({ timeout: 5000 });
    await fileCard.scrollIntoViewIfNeeded();

    // Verify pure file icon and download link exist without nested pill
    await expect(fileCard.locator('a[download]')).toBeVisible();
    await expect(fileCard.locator('text=slag_logs_2026-10-28-06-12-30.json')).toBeVisible();

    // Screenshot pure file card in feed
    await page.screenshot({
      path: 'test-results/screenshots/pure-file-card.png',
      fullPage: false,
    });
  });

  test('5. Discreet Linear Dark scrollbar verification: scrollbar-width is auto so Chromium uses custom webkit scrollbar without native buttons', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const feedContainer = page.locator('[data-testid="feed-list-container"]').first();
    await expect(feedContainer).toBeVisible();

    // Verify computed scrollbar-width is 'auto' (NOT 'thin', which breaks ::-webkit-scrollbar in Chromium)
    const scrollbarWidth = await feedContainer.evaluate((el) => {
      return window.getComputedStyle(el).scrollbarWidth;
    });
    expect(scrollbarWidth).toBe('auto');

    // Scroll up to trigger scroll position
    await feedContainer.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });

    // Hover over feed container
    await feedContainer.hover();

    // Screenshot feed container with custom Linear Dark scrollbar active
    await page.screenshot({
      path: 'test-results/screenshots/discreet-scrollbar.png',
      fullPage: false,
    });
  });
});
