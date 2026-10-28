import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts & Command Engine E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      localStorage.removeItem('slag_workspace_layout_v2');
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. Ctrl+F opens SearchModal and prevents browser default find bar', async ({ page }) => {
    // Press Control+F
    await page.keyboard.press('Control+f');
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    // Verify ESC closes it
    await page.keyboard.press('Escape');
    await expect(searchInput).toBeHidden();
  });

  test('2. Ctrl+K works as alias for search', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(searchInput).toBeHidden();
  });

  test('3. Command Palette in Search: filter by ">" and execute command via Enter', async ({ page }) => {
    // Open search
    await page.keyboard.press('Control+f');
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    // Type ">" to switch to Command Palette mode
    await searchInput.fill('>задача');
    const commandItem = page.locator('text=Создать задачу');
    await expect(commandItem).toBeVisible();

    // Press Enter to execute the command
    await page.keyboard.press('Enter');

    // SearchModal should close and Composer Modal for task should open
    await expect(searchInput).toBeHidden();
    const taskModalHeader = page.locator('span:has-text("Новая задача")');
    await expect(taskModalHeader).toBeVisible();

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await expect(taskModalHeader).toBeHidden();
  });

  test('4. Ctrl+J toggles Assistant tab in Dockview workspace', async ({ page }) => {
    // If "Инфо" tab is visible, click it first to switch away from Assistant
    const infoTab = page.getByRole('tab', { name: 'Инфо' });
    if (await infoTab.isVisible()) {
      await infoTab.click();
      await page.waitForTimeout(100);
    }

    // Press Ctrl+J to toggle Assistant
    await page.keyboard.press('Control+j');
    const assistantTab = page.getByRole('tab', { name: 'Ассистент' });
    await expect(assistantTab).toBeVisible();
    await expect(assistantTab).toHaveAttribute('aria-selected', 'true');
  });

  test('5. Ctrl+` opens and closes System Logs & HUD', async ({ page }) => {
    // Open HUD via Ctrl+`
    await page.keyboard.press('Control+Backquote');
    const logViewer = page.locator('[data-testid="log-viewer"]');
    await expect(logViewer).toBeVisible();
    await expect(logViewer.locator('text=Логи & HUD')).toBeVisible();

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(logViewer).toBeHidden();
  });

  test('6. Single-key shortcuts "C" (Task) and "N" (Note) outside of inputs', async ({ page }) => {
    // Ensure focus is completely cleared from any active element
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    // Press "c" -> opens Task composer modal
    await page.keyboard.press('c');
    const taskHeader = page.locator('span:has-text("Новая задача")');
    await expect(taskHeader).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/composer_task_modal_header.png' });
    await page.keyboard.press('Escape');
    await expect(taskHeader).toBeHidden();

    // Ensure focus cleared again
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    // Press "n" -> opens Note composer modal
    await page.keyboard.press('n');
    const noteHeader = page.locator('span:has-text("Новая заметка")');
    await expect(noteHeader).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(noteHeader).toBeHidden();
  });

  test('7. Focus Guard: typing "c", "n", "f", "j", "k" inside textarea does not trigger hotkeys', async ({ page }) => {
    const composerTextarea = page.locator('main textarea').first();
    await expect(composerTextarea).toBeVisible();

    // Click inside textarea and type letters that correspond to hotkeys
    await composerTextarea.click();
    await composerTextarea.type('conference note json file');

    // Verify modals are NOT open
    await expect(page.locator('input[placeholder*="Поиск по заметкам"]')).toBeHidden();
    await expect(page.locator('span:has-text("Новая задача")')).toBeHidden();
    await expect(page.locator('span:has-text("Новая заметка")')).toBeHidden();
    await expect(page.locator('[data-testid="log-viewer"]')).toBeHidden();

    // Verify content typed into textarea intact
    expect(await composerTextarea.inputValue()).toContain('conference note json file');
  });

  test('8. SettingsModal accurately displays hotkeys registered in engine', async ({ page }) => {
    const settingsButton = page.locator('button[title*="Настройки"]').first();
    await settingsButton.click();
    const settingsTitle = page.locator('h3:has-text("Настройки")');
    await expect(settingsTitle).toBeVisible();

    // Switch to "Горячие клавиши" tab
    await page.locator('button:has-text("Горячие клавиши")').click();

    // Verify displayed hotkeys
    await expect(page.locator('span:has-text("Быстрый поиск и команды")')).toBeVisible();
    await expect(page.locator('kbd:has-text("Ctrl+F / Ctrl+K")')).toBeVisible();
    await expect(page.locator('span:has-text("Переключить Ассистента")')).toBeVisible();
    await expect(page.locator('kbd:has-text("Ctrl+J")')).toBeVisible();
    await expect(page.locator('span:has-text("Создать задачу")')).toBeVisible();
    await expect(page.locator('kbd:text-is("C")')).toBeVisible();
    await expect(page.locator('span:has-text("Создать заметку")')).toBeVisible();
    await expect(page.locator('kbd:text-is("N")')).toBeVisible();

    // Take audit screenshot
    await page.screenshot({ path: 'test-results/screenshots/settings_shortcuts.png' });

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(settingsTitle).toBeHidden();
  });

  test('9. Screenshot audit for Command Palette search modal', async ({ page }) => {
    await page.keyboard.press('Control+f');
    const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    // Switch to commands filter
    await page.locator('button:has-text("Команды")').click();
    await page.waitForTimeout(150);

    // Take screenshot of command palette
    await page.screenshot({ path: 'test-results/screenshots/command_palette.png' });
    await page.keyboard.press('Escape');
    await expect(searchInput).toBeHidden();
  });

  test('10. Standalone Quick Composer Island view rendering and audit', async ({ page }) => {
    await page.setViewportSize({ width: 660, height: 380 });
    await page.goto('/?window=quick-composer');
    await page.waitForLoadState('networkidle');

    // Verify Island Header
    await expect(page.locator('span:has-text("Быстрая мысль")')).toBeVisible();
    await expect(page.locator('span:has-text("Esc — закрыть")')).toBeVisible();
    await expect(page.locator('button[aria-label="Закрыть окно"]')).toBeVisible();

    // Verify header does not contain duplicate folder badge
    const headerTitleContainer = page.locator('div[data-tauri-drag-region]');
    await expect(headerTitleContainer.locator('span:has-text("Входящие")')).toHaveCount(0);

    // Verify Textarea Placeholder
    const textarea = page.locator('textarea[placeholder*="Содержимое записи..."]');
    await expect(textarea).toBeVisible();

    // Verify Action Controls
    await expect(page.locator('button[aria-label*="ИИ классификация"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Прикрепить файл"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Записать голосовую заметку"]')).toBeVisible();

    // Type @ sequentially to open folder suggestions menu in transparent area
    await textarea.pressSequentially('@');
    await page.waitForTimeout(300);
    const suggestionMenu = page.locator('div:has-text("Целевая папка (@)"), div:has-text("не найдена")');
    await expect(suggestionMenu.first()).toBeVisible();

    // Take screenshot with command menu open above island
    await page.screenshot({ path: 'test-results/screenshots/quick_composer_island_menu.png' });

    // Clear @ to reset
    await textarea.fill('');
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'test-results/screenshots/quick_composer_island.png' });
  });

  test('11. Quick Composer Island typing and Enter submission', async ({ page }) => {
    await page.setViewportSize({ width: 660, height: 380 });
    await page.goto('/?window=quick-composer');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea[placeholder*="Содержимое записи..."]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Тестовая быстрая заметка для островка');

    // Press Enter to submit
    await textarea.press('Enter');
    await page.waitForTimeout(300);

    // Verify input clears after submission
    await expect(textarea).toHaveValue('');
  });

  test('12. Item card tag overflow folding (+N counter)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find main composer and create a note with many tags
    const composer = page.locator('textarea[placeholder*="Мысль, заметка или код"]');
    await expect(composer).toBeVisible();
    await composer.fill('Заметка с кучей тегов для проверки счетчика #один #два #три #четыре #пять #шесть');
    await composer.press('Enter');
    await page.waitForTimeout(500);

    // Verify +3 counter button is visible on the created note
    const tagCounter = page.locator('button:has-text("+3")').first();
    await expect(tagCounter).toBeVisible();

    // Take screenshot of collapsed tags in item card
    await page.screenshot({ path: 'test-results/screenshots/item_card_compact_tags.png' });

    // Click counter to expand
    await tagCounter.click();
    await expect(page.locator('button:has-text("свернуть")').first()).toBeVisible();
  });
});
