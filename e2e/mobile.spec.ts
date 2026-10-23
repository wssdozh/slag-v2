import { test, expect } from '@playwright/test';

test.describe('SLAG v2 Mobile Shell & Touch UX', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the mobile header or main content to load
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. Mobile Root Folders View & Linear Floating Dock', async ({ page }) => {
    // Verify "Заметки" header
    await expect(page.locator('h1', { hasText: 'Заметки' })).toBeVisible();

    // Verify Linear-style floating dock at the bottom
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await expect(dock).toBeVisible();

    // Verify tabs in dock
    await expect(dock.locator('button[aria-label="Папки"]')).toBeVisible();
    await expect(dock.locator('button[aria-label="Таски"]')).toBeVisible();
    await expect(dock.locator('button[aria-label="ИИ"]')).toBeVisible();
    await expect(dock.locator('button[aria-label="Настройки"]')).toBeVisible();

    // Verify FAB button
    const fab = page.locator('button[aria-label="Создать новую запись"]');
    await expect(fab).toBeVisible();

    // Verify root folders list has "Входящие"
    await expect(page.locator('button', { hasText: 'Входящие' }).first()).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_root_folders.png' });
  });

  test('2. Hierarchical folder navigation & Telegram-style Composer', async ({ page }) => {
    // Tap on "Входящие" folder
    const inboxFolderBtn = page.locator('button', { hasText: 'Входящие' }).first();
    await inboxFolderBtn.click();

    // Verify folder header with "< Папки" and title "Входящие"
    await expect(page.locator('header span', { hasText: 'Входящие' })).toBeVisible();
    await expect(page.locator('button[title*="Назад к списку папок"]')).toBeVisible();

    // Verify info button exists in header
    await expect(page.locator('button[aria-label="Информация о папке"]')).toBeVisible();

    // Verify Telegram-style Composer is visible at the bottom of the feed
    const composerTextarea = page.locator('main textarea, .relative textarea').first();
    await expect(composerTextarea).toBeVisible();

    // Type a note in mobile composer and send
    const testNoteText = 'Мобильная мысль с телефона ' + Date.now();
    await composerTextarea.fill(testNoteText);

    const sendBtn = page.locator('button[title*="Отправить"]').first();
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Verify item appeared in feed
    await expect(page.locator('.group', { hasText: testNoteText })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_folder_feed.png' });

    // Tap Back to return to root folders
    await page.locator('button[title*="Назад к списку папок"]').click();
    await expect(page.locator('h1', { hasText: 'Заметки' })).toBeVisible();

    // Floating dock is visible again
    await expect(page.locator('nav[aria-label="Мобильная навигация"]')).toBeVisible();
  });

  test('3. Mobile Folder Info Profile with Media Tabs', async ({ page }) => {
    // Open "Входящие"
    await page.locator('button', { hasText: 'Входящие' }).first().click();

    // Tap on info button
    await page.locator('button[aria-label="Информация о папке"]').click();

    // Verify Folder Profile view
    await expect(page.locator('h1', { hasText: 'Входящие' })).toBeVisible();

    // Verify segmented media tabs
    await expect(page.locator('button', { hasText: /Фото/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Аудио/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Файлы/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Ссылки/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Теги/ })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_folder_info.png' });

    // Tap Back to return to feed
    await page.locator('header button', { hasText: 'Назад' }).click();
    await expect(page.locator('header span', { hasText: 'Входящие' })).toBeVisible();
  });

  test('4. Mobile Tasks & Kanban View', async ({ page }) => {
    // Tap on "Таски" tab in dock
    const tasksTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Таски"]');
    await tasksTab.click();

    // Verify Tasks view title
    await expect(page.locator('h1', { hasText: 'Задачи' })).toBeVisible();

    // Verify segmented status buttons
    await expect(page.locator('button', { hasText: /К выполнению/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /В работе/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Готово/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Бэклог/ })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_tasks.png' });
  });

  test('5. Mobile Settings & Dock Customization', async ({ page }) => {
    // Tap on "Настройки" tab in dock
    const settingsTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    await settingsTab.click();

    // Verify Settings view title and profile card
    await expect(page.locator('h1', { hasText: 'Настройки' })).toBeVisible();
    await expect(page.locator('text=Local-First Obsidian Vault')).toBeVisible();

    // Verify dock customization section exists
    await expect(page.locator('text=Нижняя панель (Dock)')).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_settings.png' });
  });

  test('6. Mobile Fullscreen Search Modal', async ({ page }) => {
    // Click Search icon in header
    await page.locator('button[aria-label="Поиск"]').click();

    // Verify full screen search modal
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_search.png' });

    // Dismiss search
    await page.locator('button[title="Назад"]').click();
    await expect(searchInput).not.toBeVisible();
  });

  test('7. Mobile Action Sheet on Note item', async ({ page }) => {
    // Enter "Входящие"
    await page.locator('button', { hasText: 'Входящие' }).first().click();

    // Find any note card and tap its "..." (More) button
    const firstMoreBtn = page.locator('button[title="Действия"]').first();
    await expect(firstMoreBtn).toBeVisible();
    await firstMoreBtn.click();

    // Verify MobileActionSheet opened
    const actionSheet = page.locator('button', { hasText: 'Открыть в редакторе' });
    await expect(actionSheet).toBeVisible();
    await expect(page.locator('button', { hasText: 'Ответить' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Скопировать Markdown' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Удалить в корзину' })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_action_sheet.png' });

    // Dismiss by tapping "Отмена"
    await page.locator('button', { hasText: 'Отмена' }).click();
    await expect(actionSheet).not.toBeVisible();
  });
});
