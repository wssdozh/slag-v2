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

    // Filter by typing 'про'
    await textarea.pressSequentially('про');

    // The item 'Проекты' should be visible
    const projectItem = page.locator('button', { hasText: 'Проекты' }).first();
    await expect(projectItem).toBeVisible();

    // Press Enter to select the folder
    await textarea.press('Enter');

    // Menu should disappear
    await expect(folderMenuHeader).toBeHidden();

    // The folder stays in the draft as an @token instead of a separate chip row
    const value = await textarea.inputValue();
    expect(value.trim()).toBe('Тестовая таска @Проекты');
    await expect(page.locator('span[title*="Целевая папка для сохранения"]')).toHaveCount(0);

    // Visual screenshot of composer with the folder token in the text
    await page.screenshot({ path: 'test-results/screenshots/folder_chip_active.png' });

    // Send the note
    await textarea.press('Enter');

    // Toast or note created
    await expect(page.locator('text=Папка «Проекты» выбрана')).toBeVisible({ timeout: 3000 });

    // The token routed the note and never reached the saved body
    await expect(textarea).toHaveValue('');
    const saved = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('slag_items_'));
      return JSON.parse(localStorage.getItem(key || '') || '[]') as Array<{ title: string; content: string; folder: string }>;
    });
    const note = saved.find(i => i.title === 'Тестовая таска');
    expect(note).toBeTruthy();
    expect(note!.folder).toBe('Проекты');
    expect(note!.content).not.toContain('@Проекты');
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

    // The token lands in the text; no separate chip row is rendered
    await expect(textarea).toHaveValue('@Личное ');
    await expect(page.locator('span[title*="Целевая папка для сохранения"]')).toHaveCount(0);

    // Deleting the token in the text is how the destination is dropped
    await textarea.fill('');
    await expect(textarea).toHaveValue('');
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

  test('6. New folder structure taxonomy renders with clean tree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify root folders
    await expect(page.locator('aside span', { hasText: 'Карьера' }).first()).toBeVisible();
    await expect(page.locator('aside span', { hasText: 'Личное' }).first()).toBeVisible();
    await expect(page.locator('aside span', { hasText: 'Проекты' }).first()).toBeVisible();
    await expect(page.locator('aside span', { hasText: 'База знаний' }).first()).toBeVisible();
    await expect(page.locator('aside span', { hasText: 'Архив' }).first()).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/new-folder-structure.png',
      fullPage: false,
    });
  });

  test('7. Deleting a folder permanently removes it, re-routes notes to Inbox, and never resurrects or moves down', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test programmatically via exposed storage
    const result = await page.evaluate(() => {
      const storage = (window as any).storage;
      // 1. Create a custom folder and a note in it
      storage.saveFolder({ path: 'Временная', name: 'Временная' });
      storage.saveItem({
        id: 'test_delete_folder_item',
        type: 'note',
        title: 'Note to be re-routed',
        content: 'Content inside temporary folder',
        folder: 'Временная',
      });

      // 2. Ensure folder was in getFolders
      const beforeFolders = storage.getFolders().map((f: any) => f.path);
      const hadFolder = beforeFolders.includes('Временная');

      // 3. Delete folder
      storage.deleteFolder('Временная');

      // 4. Repeatedly check getFolders to ensure it does NOT resurrect at bottom
      const afterFolders1 = storage.getFolders().map((f: any) => f.path);
      const afterFolders2 = storage.getFolders().map((f: any) => f.path);

      // 5. Check item was moved to 'Входящие'
      const movedItem = storage.getItemById('test_delete_folder_item');

      return {
        hadFolder,
        hasAfter1: afterFolders1.includes('Временная'),
        hasAfter2: afterFolders2.includes('Временная'),
        itemFolder: movedItem ? movedItem.folder : null,
        lastFolder: afterFolders2[afterFolders2.length - 1],
      };
    });

    expect(result.hadFolder).toBe(true);
    expect(result.hasAfter1).toBe(false);
    expect(result.hasAfter2).toBe(false);
    expect(result.itemFolder).toBe('Входящие');
    expect(result.lastFolder).not.toBe('Временная');

    // Also take a screenshot of UI
    await page.screenshot({
      path: 'test-results/screenshots/folder-deleted-cleanly.png',
      fullPage: false,
    });
  });
});
