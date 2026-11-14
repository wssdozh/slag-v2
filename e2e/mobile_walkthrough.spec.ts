import { test, expect } from '@playwright/test';

test.describe('SLAG v2 Mobile Full Walkthrough & Interaction Audit', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('Walkthrough: visit all screens, interact, capture screenshots', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });

    // 1. Root Folders Screen
    await page.screenshot({ path: 'test-results/screenshots/audit/01_root_folders.png' });

    // 2. Open Create Folder Modal from Root Header
    await page.locator('button[aria-label="Новая папка"]').click();
    const folderModal = page.locator('h3', { hasText: 'Создать новую папку' });
    await expect(folderModal).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/02_create_folder_modal.png' });
    // Close modal
    await page.locator('button', { hasText: 'Отмена' }).click();
    await expect(folderModal).not.toBeVisible();

    // 3. Open Search Modal from Root Header
    await page.locator('button[aria-label="Поиск"]').click();
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/03_search_initial.png' });
    // Type in search query to see active results
    await searchInput.fill('замет');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/screenshots/audit/04_search_with_results.png' });
    // Close search
    await page.locator('button[title="Назад"]').click();
    await expect(searchInput).not.toBeVisible();

    // 4. Enter "Входящие" Folder Feed
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    await expect(page.locator('header span', { hasText: 'Входящие' }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/05_folder_feed_inbox.png' });

    // 5. Interact with Composer in Feed
    const composerTextarea = page.locator('main textarea, .relative textarea').first();
    await composerTextarea.click();
    await composerTextarea.fill('Тестовая мысль для мобильного аудита #тест');
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/screenshots/audit/06_composer_typing.png' });

    // Switch type in composer to Task
    const typeBtn = page.locator('button[aria-label="Сменить тип записи"]').or(page.locator('button', { hasText: 'Заметка' })).first();
    await typeBtn.click();
    const taskOption = page.locator('body button', { hasText: 'Таска' }).first();
    if (await taskOption.isVisible()) {
      await taskOption.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/audit/07_composer_task_mode.png' });
    }

    // Clear composer textarea
    await composerTextarea.fill('');

    // 6. Action Sheet on Card
    const cardMoreBtn = page.locator('button[title="Действия"]').first();
    if (await cardMoreBtn.isVisible()) {
      await cardMoreBtn.click();
      const actionSheetTitle = page.locator('button', { hasText: 'Фокус-редактор' });
      await expect(actionSheetTitle).toBeVisible();
      await page.screenshot({ path: 'test-results/screenshots/audit/08_action_sheet.png' });
      // Close action sheet
      await page.locator('button', { hasText: 'Отмена' }).click();
      await expect(actionSheetTitle).not.toBeVisible();
    }

    // 7. Fullscreen Focus Editor (open via FAB from root or current view)
    // Return to root to trigger FAB or use existing item
    await page.locator('button[title*="Назад к списку папок"]').click();
    const fabBtn = page.locator('button[aria-label="Создать новую запись"]');
    await expect(fabBtn).toBeVisible();
    await fabBtn.click();

    // Focus editor should be open
    const editorTitleInput = page.getByPlaceholder('Заголовок...');
    await expect(editorTitleInput).toBeVisible({ timeout: 5000 });
    await editorTitleInput.fill('Новая идея для мобилки');
    await page.screenshot({ path: 'test-results/screenshots/audit/09_fullscreen_editor.png' });

    // Close Fullscreen editor
    const editorBackBtn = page.locator('button', { hasText: 'Назад' }).first();
    await editorBackBtn.click();
    await expect(editorTitleInput).not.toBeVisible();

    // 8. Re-enter "Входящие" and switch to Kanban View
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    const dotsBtn = page.locator('button[aria-label="Вид и фильтры папки"]');
    if (await dotsBtn.isVisible()) {
      await dotsBtn.click();
      const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
      await expect(modal).toBeVisible();
      await modal.locator('button', { hasText: 'Канбан' }).click();
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/screenshots/audit/10_folder_kanban.png' });

    // Open Kanban materials dock if button is visible
    const materialsBtn = page.locator('button[aria-label="Материалы папки"]');
    if (await materialsBtn.isVisible()) {
      await materialsBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/audit/11_folder_kanban_materials.png' });
      await materialsBtn.click(); // close materials
    }

    // Switch back to Feed
    if (await dotsBtn.isVisible()) {
      await dotsBtn.click();
      const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
      await expect(modal).toBeVisible();
      await modal.locator('button', { hasText: 'Лента' }).click();
      await page.keyboard.press('Escape');
    }

    // 9. Folder Info View (Profile & Media tabs)
    await page.locator('button[aria-label="Информация о папке"]').click();
    await expect(page.locator('h1', { hasText: 'Входящие' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/12_folder_info_main.png' });

    // Switch to "Файлы" tab
    const filesTab = page.locator('button', { hasText: /Файлы/ });
    if (await filesTab.isVisible()) {
      await filesTab.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/audit/13_folder_info_files_tab.png' });
    }

    // Switch to "Теги" tab
    const tagsTab = page.locator('button', { hasText: /Теги/ });
    if (await tagsTab.isVisible()) {
      await tagsTab.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/audit/14_folder_info_tags_tab.png' });
    }

    // Open Triage Modal from Folder Info (button "Трибунал" / "Сортировка")
    const triageBtn = page.locator('button', { hasText: /Трибунал|Сортировка|Разбор/ }).first();
    if (await triageBtn.isVisible()) {
      await triageBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'test-results/screenshots/audit/15_triage_modal.png' });
      // Close triage modal
      const closeTriageBtn = page.locator('button[aria-label="Закрыть"]').or(page.locator('button[title*="Закрыть"]')).first();
      if (await closeTriageBtn.isVisible()) {
        await closeTriageBtn.click();
      }
    } else {
      // Close folder info
      await page.locator('header button', { hasText: 'Назад' }).click();
    }

    // Ensure we go back to root folders
    const backToFoldersBtn = page.locator('button[title*="Назад к списку папок"]');
    if (await backToFoldersBtn.isVisible()) {
      await backToFoldersBtn.click();
    }

    // 10. Tasks Tab
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await dock.locator('button[aria-label="Таски"]').click();
    await expect(page.locator('h1', { hasText: /Таски|Задачи/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/16_tasks_todo.png' });

    // Switch to "В работе" tab
    await page.locator('button', { hasText: /В работе/ }).click();
    await page.screenshot({ path: 'test-results/screenshots/audit/17_tasks_in_progress.png' });

    // Switch to "Готово" tab
    await page.locator('button', { hasText: /Готово/ }).click();
    await page.screenshot({ path: 'test-results/screenshots/audit/18_tasks_done.png' });

    // Click "+ Добавить задачу" button (opens unified ComposerModal)
    const addInlineTaskBtn = page.locator('button', { hasText: /Добавить (таску|задачу)/ });
    if (await addInlineTaskBtn.isVisible()) {
      await addInlineTaskBtn.click();
      await page.waitForTimeout(300);
      await expect(page.locator('h3', { hasText: 'Новая задача' })).toBeVisible();
      await page.screenshot({ path: 'test-results/screenshots/audit/19_tasks_inline_add.png' });
      // Close composer modal
      await page.locator('button[aria-label="Закрыть"]').click();
      await page.waitForTimeout(200);
    }

    // Switch to Calendar View inside Tasks screen
    const calendarToggle = page.locator('button[aria-label="Календарь"]').or(page.locator('button[title*="Календарь"]')).first();
    await calendarToggle.click();
    await expect(page.locator('text=ПН').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/20_tasks_calendar_agenda.png' });

    // Switch to 3-day grid
    const threeDaysBtn = page.locator('button', { hasText: '3 дня' });
    await threeDaysBtn.click();
    await page.screenshot({ path: 'test-results/screenshots/audit/21_tasks_calendar_3day.png' });

    // Open month picker bottom sheet
    const monthPickerBtn = page.locator('header button').filter({ hasText: /202/ }).first();
    await monthPickerBtn.click();
    const monthPickerSheet = page.locator('[data-testid="month-picker-sheet"]');
    await expect(monthPickerSheet).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/22_month_picker_sheet.png' });
    await monthPickerSheet.locator('button', { hasText: 'Отмена' }).click();

    // 11. Assistant Tab
    await dock.locator('button[aria-label="ИИ"]').click();
    await expect(page.locator('header h1', { hasText: 'Ассистент' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/23_assistant_initial.png' });

    // Send a test prompt to Assistant
    const chatInput = page.locator('textarea[placeholder*="ассистента"]');
    await chatInput.fill('привет, покажи кратко что умеешь');
    await page.locator('button[title*="Отправить сообщение"]').click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'test-results/screenshots/audit/24_assistant_response.png' });

    // 12. Settings Tab
    // Header has Back button which returns to folders, dock reappears
    await page.locator('header button[aria-label="Назад"]').click();
    await dock.locator('button[aria-label="Настройки"]').click();
    await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/25_settings_root.png' });

    // Open AI Settings Modal
    await page.locator('button', { hasText: 'ИИ & Провайдеры' }).click();
    await expect(page.locator('h3', { hasText: 'Настройки' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/26_settings_ai_modal.png' });
    await page.locator('button[title="Назад"]').click();
    await expect(page.getByRole('dialog', { name: 'Настройки', exact: true })).toBeHidden();

    // Open Storage & Obsidian Settings
    await page.locator('button', { hasText: 'Хранилище & Бэкап' }).click();
    await expect(page.locator('h3', { hasText: 'Настройки' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/27_settings_vault_modal.png' });
    await page.locator('button[title="Назад"]').click();
    await expect(page.getByRole('dialog', { name: 'Настройки', exact: true })).toBeHidden();

    // Open UI Scale & Density Settings
    await page.locator('button', { hasText: 'Интерфейс & Панели' }).click();
    await expect(page.locator('h3', { hasText: 'Настройки' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/28_settings_ui_modal.png' });
    await page.locator('button[title="Назад"]').click();
    await expect(page.getByRole('dialog', { name: 'Настройки', exact: true })).toBeHidden();

    // Open Hotkeys Settings
    await page.locator('button', { hasText: 'Горячие клавиши' }).click();
    await expect(page.locator('h3', { hasText: 'Настройки' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/29_settings_hotkeys_modal.png' });
    await page.locator('button[title="Назад"]').click();
    await expect(page.getByRole('dialog', { name: 'Настройки', exact: true })).toBeHidden();

    // Open Logs tab of the settings dialog
    await page.locator('button', { hasText: 'Логи & Диагностика' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/screenshots/audit/30_log_viewer_modal.png' });
  });
});
