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

  test('8. Mobile Settings Modal Fullscreen with Horizontal Tabs', async ({ page }) => {
    // Tap on "Настройки" tab in dock
    const settingsTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    await settingsTab.click();

    // Click "ИИ & Провайдеры" item
    await page.locator('button', { hasText: 'ИИ & Провайдеры' }).click();

    // Verify modal is open and has horizontal tab bar
    const modalHeader = page.locator('h3', { hasText: 'Настройки' });
    await expect(modalHeader).toBeVisible();

    // Verify tabs inside modal
    await expect(page.getByRole('button', { name: 'Хранилище & Бэкап', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Интерфейс & Панели', exact: true })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_settings_modal.png' });

    // Dismiss by tapping back button
    await page.locator('button[title="Назад"]').click();
    await expect(modalHeader).not.toBeVisible();
  });

  test('9. Mobile Assistant Header & Floating Dock Hidden', async ({ page }) => {
    // Tap on "ИИ" tab in dock
    const aiTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="ИИ"]');
    await expect(aiTab).toBeVisible();
    await aiTab.click();

    // Verify floating dock is hidden on assistant screen
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await expect(dock).not.toBeVisible();

    // Verify header has centered title and back button
    await expect(page.locator('header h1', { hasText: 'Ассистент' })).toBeVisible();
    const backBtn = page.locator('header button[aria-label="Назад"]');
    await expect(backBtn).toBeVisible();

    // Take screenshot of redesigned Mobile Assistant
    await page.screenshot({ path: 'test-results/screenshots/mobile_assistant_redesign.png' });

    // Tap back button to return to folders
    await backBtn.click();

    // Dock is visible again and root folders are shown
    await expect(dock).toBeVisible();
    await expect(page.locator('h1', { hasText: 'Заметки' })).toBeVisible();
  });

  test('10. Custom Form Controls (Select, Checkbox, NumberInput)', async ({ page }) => {
    // Tap on Settings tab
    const settingsTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    await settingsTab.click();

    // Click "ИИ & Провайдеры" item
    await page.locator('button', { hasText: 'ИИ & Провайдеры' }).click();

    // Verify custom Checkbox elements
    const autoTagCheckbox = page.locator('div[role="checkbox"]').filter({ hasText: 'Автоматический подбор тегов' });
    await expect(autoTagCheckbox).toBeVisible();
    await autoTagCheckbox.click(); // toggle

    // Verify NumberInput stepper
    const incButton = page.locator('button[aria-label="Увеличить"]').first();
    await expect(incButton).toBeVisible();
    await incButton.click();

    // Verify custom dark Select opens
    const caseSelect = page.locator('button[aria-haspopup="listbox"]').last();
    await expect(caseSelect).toBeVisible();
    await caseSelect.click();

    // Verify custom popover options
    const option = page.locator('button[role="option"]').filter({ hasText: 'kebab-case' });
    await expect(option).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_custom_controls.png' });

    await option.click();
  });

  test('11. UI Scale & Density Configuration (Control Matrix)', async ({ page }) => {
    // Navigate to mobile settings
    const settingsTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    await settingsTab.click();

    // Click "Интерфейс, масштаб и плотность"
    await page.locator('button', { hasText: 'Интерфейс, масштаб и плотность' }).click();

    // Verify UI settings panel opened
    await expect(page.locator('span', { hasText: 'Внешний вид, масштабы и плотность' })).toBeVisible();

    // Switch Font scale to "Крупный (115%)"
    const largeFontBtn = page.getByRole('button', { name: 'Крупный (115%)' });
    await expect(largeFontBtn).toBeVisible();
    await largeFontBtn.click();

    // Verify document root has updated font scale
    const rootFontScale = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--slag-font-scale');
    });
    expect(rootFontScale).toBe('1.15');

    // Switch Density to "Компактный"
    const compactDensityBtn = page.getByRole('button', { name: 'Компактный' });
    await expect(compactDensityBtn).toBeVisible();
    await compactDensityBtn.click();

    // Verify document root has updated density attribute
    const rootDensity = await page.evaluate(() => {
      return document.documentElement.dataset.density;
    });
    expect(rootDensity).toBe('compact');

    await page.screenshot({ path: 'test-results/screenshots/mobile_ui_scale_settings.png' });

    // Switch back to "Обычный (100%)" and "Просторный / Тач"
    await page.getByRole('button', { name: 'Обычный (100%)' }).click();
    await page.getByRole('button', { name: 'Просторный / Тач' }).click();

    // Dismiss settings modal
    await page.locator('button[title="Назад"]').click();

    // Navigate to Assistant to take a screenshot of the unified bottom controls
    const aiTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="ИИ"]');
    await aiTab.click();
    await expect(page.locator('header h1', { hasText: 'Ассистент' })).toBeVisible();

    // Take screenshot of Assistant with unified controls
    await page.screenshot({ path: 'test-results/screenshots/mobile_assistant_unified_controls.png' });
  });
});
