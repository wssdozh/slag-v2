import { test, expect, type Page } from '@playwright/test';

/** Долгое нажатие: Playwright не умеет touch-hold, а меню на мобилке теперь только на нём. */
const longPress = async (page: Page, selector: string) => {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const touch = new Touch({
      identifier: 1,
      target: el,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + 24,
    });
    el.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
      })
    );
  });
  await page.waitForTimeout(600);
  await target.evaluate(el => {
    const touch = new Touch({ identifier: 1, target: el, clientX: 0, clientY: 0 });
    el.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [touch],
      })
    );
  });
};

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
    await expect(dock.locator('button[aria-label^="Папки"]')).toBeVisible();
    await expect(dock.locator('button[aria-label="Таски"]')).toBeVisible();
    await expect(dock.locator('button[aria-label="ИИ"]')).toBeVisible();
    await expect(dock.locator('button[aria-label="Настройки"]')).toBeVisible();

    // Verify FAB button
    const fab = page.locator('button[aria-label="Создать новую запись"]');
    await expect(fab).toBeVisible();

    // Verify root folders list has "Входящие"
    await expect(page.locator('button', { hasText: 'Входящие' }).first()).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_root_folders.png' });

    // Press feedback: a folder row tints the moment the finger lands, then fades back.
    const folderRow = page.locator('.divide-y > button').first();
    const rowBox = await folderRow.boundingBox();
    if (rowBox) {
      await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
      await page.mouse.down();
      // The flash is set on pointer-down and outlives the finger, so a fast tap is
      // acknowledged even when `:active` never paints a frame.
      await expect(folderRow).toHaveAttribute('data-tapped', 'true');
      await expect
        .poll(() =>
          folderRow.evaluate(el => {
            const color = getComputedStyle(el).backgroundColor;
            const alpha = color.match(/\/\s*([\d.]+)\)$/)?.[1] ?? color.match(/,\s*([\d.]+)\)$/)?.[1];
            return Number(alpha ?? 0);
          })
        )
        .toBe(0.1);
      await page.screenshot({ path: 'test-results/screenshots/mobile_folder_press.png' });
      await page.mouse.up();
    }
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

    const composer = page.locator('[data-composer-root]');
    const composerBox = await composer.boundingBox();
    expect(composerBox).not.toBeNull();
    // Small island: 8px of air on each side, not a flush bar
    expect(composerBox!.x).toBe(8);
    expect(composerBox!.width).toBe(390 - 16);
    for (const viewport of [{ width: 360, height: 800 }, { width: 700, height: 390 }]) {
      await page.setViewportSize(viewport);
      await expect(composer).toHaveCSS('width', `${viewport.width - 16}px`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = composer.locator(':scope > div').last();
    await expect(panel).toHaveCSS('border-radius', '16px');
    await expect(panel).toHaveClass(/rounded-2xl/);
    await expect(panel).toHaveCSS('box-shadow', 'none');
    const feed = page.locator('.overflow-y-auto').filter({ has: page.locator('[id^="item-"]') }).first();
    await feed.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await composerTextarea.fill(Array.from({ length: 20 }, (_, i) => `строка ${i}`).join('\n'));
    await expect(composerTextarea).toHaveCSS('height', '220px');
    // Resize above invalidates the scroll anchor; the grown composer shrinks the
    // viewport, so pin the feed to the bottom after the new height lands.
    await feed.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => feed.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(3);
    const lastCardSpacer = page.locator('[aria-hidden="true"].h-2');
    await expect(lastCardSpacer).toHaveCount(1);

    // Type a note in mobile composer and send
    const testNoteText = 'Мобильная мысль с телефона ' + Date.now();
    await composerTextarea.fill(testNoteText);

    await page.screenshot({ path: 'test-results/screenshots/composer_alignment.png' });

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

  test('android composer wrappers stay transparent and preserve safe areas', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await page.locator('button', { hasText: 'Входящие' }).first().click();
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--sab', '24px');
        document.documentElement.style.setProperty('--sal', '12px');
        document.documentElement.style.setProperty('--sar', '16px');
      });

      const composer = page.locator('[data-composer-root]');
      const panel = composer.locator('[data-composer-panel]');
      const footer = composer.locator('..');
      for (const wrapper of [composer, footer]) {
        await expect(wrapper).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(wrapper).toHaveCSS('border-top-width', '0px');
        await expect(wrapper).toHaveCSS('backdrop-filter', 'none');
      }
      await expect(panel).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(panel).toHaveCSS('border-radius', '16px');
      await expect(panel).toHaveCSS('box-shadow', 'none');
      await expect(footer).toHaveCSS('padding-bottom', '32px');
      await expect(footer).toHaveCSS('padding-left', '20px');
      await expect(footer).toHaveCSS('padding-right', '24px');
      await page.screenshot({ path: 'test-results/screenshots/android_composer_outer_surface.png' });

      await page.locator('button[title*="Назад к списку папок"]').click();
      await page.getByRole('button', { name: 'ИИ', exact: true }).click();
      const assistantComposer = page.locator('[data-composer-root]');
      for (const wrapper of [assistantComposer, assistantComposer.locator('..'), assistantComposer.locator('../..')]) {
        await expect(wrapper).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(wrapper).toHaveCSS('border-top-width', '0px');
        await expect(wrapper).toHaveCSS('backdrop-filter', 'none');
      }
      await expect(assistantComposer.locator('[data-composer-panel]')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(assistantComposer.locator('[data-composer-panel]')).toHaveCSS('box-shadow', 'none');

      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await page.getByRole('button', { name: 'Таски', exact: true }).click();
      await page.getByRole('button', { name: /Добавить (таску|задачу)/ }).click();
      const modal = page.getByRole('dialog');
      await expect(modal.locator('[data-composer-panel]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(modal.locator('[data-composer-panel]')).toHaveClass(/shadow-none/);
      await expect(modal.locator('.motion-dialog')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await modal.getByRole('button', { name: 'Закрыть', exact: true }).click();

      await expect(modal).not.toBeVisible();
    } finally {
      await context.close();
    }
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
    await expect(page.locator('h1', { hasText: /Таски|Задачи/ })).toBeVisible();

    // Verify segmented status buttons
    await expect(page.locator('button', { hasText: /К выполнению/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /В работе/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Готово/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Бэклог/ })).toBeVisible();

    // Verify view switcher and inline add button
    await expect(page.locator('button', { hasText: 'Календарь' })).toBeVisible();
    await expect(page.locator('button', { hasText: /Добавить (таску|задачу)/ })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_tasks.png' });
  });

  test('5. Mobile Settings & Dock Customization', async ({ page }) => {
    // Tap on "Настройки" tab in dock
    const settingsTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    await settingsTab.click();

    // Verify Settings view title and profile card
    await expect(page.locator('h1', { hasText: 'Настройки' })).toBeVisible();
    await expect(page.locator('span', { hasText: 'Obsidian' }).first()).toBeVisible();

    // Dock lives in the Interface tab now, not on the settings root.
    await page.locator('button', { hasText: 'Интерфейс & Панели' }).click();
    await expect(page.locator('text=Нижняя панель (Dock)')).toBeVisible();

    // Verify active rows have checkmark and grip handle
    const foldersActiveRow = page.locator('[data-dock-tab-index="0"]');
    await expect(foldersActiveRow).toContainText('Папки');

    // Drag-and-drop test: drag "Папки" over "Таски" (index 0 to index 1)
    const tasksActiveRow = page.locator('[data-dock-tab-index="1"]');
    await foldersActiveRow.dispatchEvent('dragstart');
    await tasksActiveRow.dispatchEvent('dragover');
    await foldersActiveRow.dispatchEvent('dragend');
    await page.waitForTimeout(100);

    // Verify that in the dock, "Таски" is now before "Папки"
    const dockButtons = page.locator('nav[aria-label="Мобильная навигация"] button');
    const firstTabLabel = await dockButtons.nth(0).getAttribute('aria-label');
    const secondTabLabel = await dockButtons.nth(1).getAttribute('aria-label');
    expect(firstTabLabel).toBe('Таски');
    expect(secondTabLabel).toContain('Папки');

    // Close the settings sheet before the root screenshot.
    await page.locator('[role="dialog"] button[title="Назад"]').first().click();
    await expect(page.locator('h1', { hasText: 'Настройки' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/audit/25_settings_root.png' });
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

    // Три точки с мобилки убраны: меню открывается долгим нажатием по карточке
    await expect(page.locator('.feed-card-contain').first()).toBeVisible();
    await longPress(page, '.feed-card-contain div[id^="item-"]');

    // Verify MobileActionSheet opened
    const actionSheet = page.locator('button', { hasText: 'Фокус-редактор' });
    await expect(actionSheet).toBeVisible();
    await expect(page.locator('button', { hasText: 'Ответить' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Копировать текст' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Удалить' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Разобрать с ИИ' })).toBeVisible();

    // Даём шиту доехать: скриншот посреди motion-sheet выглядит полупрозрачным
    await page.waitForTimeout(360);
    await page.screenshot({ path: 'test-results/screenshots/mobile_action_sheet.png' });

    // The sheet has no cancel button any more: tapping the backdrop dismisses it.
    await expect(page.locator('button', { hasText: 'Отмена' })).toHaveCount(0);
    await page.getByTestId('action-sheet').click({ position: { x: 10, y: 10 } });
    await expect(actionSheet).not.toBeVisible();
  });

  test('8. Mobile Settings Modal Fullscreen with Clean Subview (No Tabs)', async ({ page }) => {
    // Tap on "Настройки" tab in dock
    const settingsTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    await settingsTab.click();

    // Click "ИИ & Провайдеры" item
    await page.locator('button', { hasText: 'ИИ & Провайдеры' }).click();

    // Verify modal is open and has clean header with back button
    const modalHeader = page.locator('h3', { hasText: 'Настройки' });
    await expect(modalHeader).toBeVisible();

    // Verify content inside modal (Groq button is visible without horizontal tabs clutter)
    const sourceSelect = page.getByRole('button', { name: 'Использовать', exact: true });
    await expect(sourceSelect).toBeVisible();
    await sourceSelect.click();
    await page.getByRole('option', { name: 'Свой API-ключ', exact: true }).click();
    await expect(page.locator('button', { hasText: 'Groq' }).first()).toBeVisible();

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

    // Verify a boolean is a switch, sitting on the row's midline
    const autoTagSwitch = page.getByRole('switch', { name: 'Автотегирование новых заметок' });
    await expect(autoTagSwitch).toBeVisible();
    await autoTagSwitch.click(); // toggle

    // Verify NumberInput stepper
    const incButton = page.locator('button[aria-label="Увеличить"]').first();
    await expect(incButton).toBeVisible();
    await incButton.click();

    // Verify a dropdown row opens
    const caseSelect = page.locator('[data-testid="tag-case-select"]');
    if (!(await caseSelect.count())) {
      // The row is found by its label when no explicit hook is set.
      await page.getByRole('button', { name: /Стиль регистра/ }).click();
    } else {
      await caseSelect.click();
    }

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

    // Click "Интерфейс & Панели"
    await page.locator('button', { hasText: 'Интерфейс & Панели' }).click();

    // Verify UI settings panel opened
    await expect(page.getByTestId('font-scale-select')).toBeVisible();

    // Choices are dropdown rows: open, pick, close.
    const pick = async (rowTestId: string, option: string) => {
      await page.locator(`[data-testid="${rowTestId}"]`).click();
      await page.getByRole('option', { name: option, exact: true }).click();
    };

    await pick('font-scale-select', 'Крупный (120%)');

    const rootFontScale = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--slag-font-scale');
    });
    expect(rootFontScale).toBe('1.2');

    await pick('density-select', 'Компактный');

    const rootDensity = await page.evaluate(() => {
      return document.documentElement.dataset.density;
    });
    expect(rootDensity).toBe('compact');

    await page.screenshot({ path: 'test-results/screenshots/mobile_ui_scale_settings.png' });

    await pick('font-scale-select', 'Обычный (100%)');
    await pick('density-select', 'Просторный');

    // Dismiss settings modal
    await page.locator('button[title="Назад"]').click();

    // Navigate to Assistant to take a screenshot of the unified bottom controls
    const aiTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="ИИ"]');
    await aiTab.click();
    await expect(page.locator('header h1', { hasText: 'Ассистент' })).toBeVisible();

    // Take screenshot of Assistant with unified controls
    await page.screenshot({ path: 'test-results/screenshots/mobile_assistant_unified_controls.png' });
  });

  test('12. Mobile Todoist-style Calendar (Week Strip, No Date Sheet, Month Picker)', async ({ page }) => {
    // Tap on "Таски" tab in dock
    const tasksTab = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Таски"]');
    await tasksTab.click();

    // Switch view to "Календарь"
    const calendarToggle = page.locator('button', { hasText: 'Календарь' }).first();
    await calendarToggle.click();

    // Verify Week Strip with 7 day buttons
    await expect(page.locator('text=ПН').first()).toBeVisible();
    await expect(page.locator('text=ВС').first()).toBeVisible();

    // Verify "Сегодня" button exists in header
    await expect(page.locator('button', { hasText: 'Сегодня' }).first()).toBeVisible();

    // Take screenshot of the Todoist-style Week Strip & Agenda
    await page.screenshot({ path: 'test-results/screenshots/mobile_calendar_week_strip.png' });

    // Open Month Picker (Select a Date)
    const monthPickerBtn = page.locator('header button').filter({ hasText: /202/ }).first();
    await monthPickerBtn.click();

    const monthPickerSheet = page.locator('[data-testid="month-picker-sheet"]');
    await expect(monthPickerSheet).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_calendar_month_picker.png' });

    // Close Month Picker
    await monthPickerSheet.locator('button', { hasText: 'Отмена' }).click();
    await expect(monthPickerSheet).not.toBeVisible();

    // Switch layout to "3 дня" (24-hour multi-day grid)
    const threeDaysBtn = page.locator('button', { hasText: '3 дня' });
    await expect(threeDaysBtn).toBeVisible();
    await threeDaysBtn.click();

    // Verify 24-hour grid contains time rails
    await expect(page.locator('text=00:00')).toBeVisible();
    await expect(page.locator('text=12:00')).toBeVisible();
    await expect(page.locator('text=23:00')).toBeVisible();

    // Take screenshot of the 3-day 24h multi-day time grid for visual audit
    await page.screenshot({ path: 'test-results/screenshots/mobile_calendar_3day_grid.png' });
  });

  test('13. Mobile Filters alignment, streamlined Task Composer & Assistant calendar grounding', async ({ page }) => {
    // 1. Navigate to "Входящие"
    await page.locator('button', { hasText: 'Входящие' }).first().click();

    // 2. Verify unified clean header: no bloated filter strip, only vertical 3-dots button
    const dotsBtn = page.locator('header button[aria-label="Вид и фильтры папки"]');
    await expect(dotsBtn).toBeVisible();
    await expect(page.locator('div[aria-label="Фильтр входящих"]')).not.toBeVisible();
    await expect(page.locator('div[aria-label="Фильтр по типу"]')).not.toBeVisible();

    // Open FolderViewModal via 3-dots button and switch to Calendar mode
    await dotsBtn.click();
    const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
    await expect(modal).toBeVisible();
    await modal.locator('button', { hasText: 'Календарь' }).click();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/mobile_folder_calendar.png' });

    // Switch back to Feed mode via modal
    await dotsBtn.click();
    await expect(modal).toBeVisible();
    await modal.locator('button', { hasText: 'Лента' }).click();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // 3. Switch composer to Task mode
    const typeBtn = page.locator('button[aria-label="Сменить тип записи"]').or(page.locator('button', { hasText: 'Заметка' })).first();
    await typeBtn.click();
    await page.locator('body > div button', { hasText: 'Таска' }).first().click();

    // Verify the old bloated row "Приоритет:" & "Дедлайн:" is completely absent
    await expect(page.locator('text=Приоритет:')).not.toBeVisible();
    await expect(page.locator('text=Дедлайн:')).not.toBeVisible();

    // Type a task with date
    const textarea = page.locator('main textarea, .relative textarea').first();
    await textarea.fill('завтра проверить отчет');
    await page.waitForTimeout(250);

    // Send is the smallest plate in the row: a circle, not a rounded square
    const sendBtn = page.locator('button[title*="Отправить"]').first();
    await expect(sendBtn).toHaveClass(/composer-send/);
    await expect(sendBtn).toHaveCSS('border-radius', '9999px');

    // Capture screenshot of mobile folder filters and streamlined task composer
    await page.screenshot({ path: 'test-results/screenshots/mobile_composer_task_mode.png' });

    // 4. Test Assistant grounding on "чо на завтра"
    // Tap Back to root folders
    await page.locator('button[title*="Назад к списку папок"]').click();

    // Tap "ИИ" dock tab
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await dock.locator('button[aria-label="ИИ"]').click();

    // Wait for chat to open
    const chatInput = page.locator('textarea[placeholder*="ассистента"]');
    await expect(chatInput).toBeVisible();

    // Ask "чо на завтра"
    await chatInput.fill('чо на завтра');
    await page.locator('button[title*="Отправить сообщение"]').click();

    // Wait for assistant response
    const replyLocator = page.locator('text=Повестка на').or(page.locator('text=завтра')).first();
    await expect(replyLocator).toBeVisible({ timeout: 8000 });

    // Verify no Google Calendar hallucination in the page
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain('Google Calendar');
    expect(pageText).not.toContain('активировать это расширение');

    // Capture screenshot of Assistant calendar response
    await page.screenshot({ path: 'test-results/screenshots/mobile_assistant_tomorrow.png' });
  });

  test('14. Mobile Audio Player Tab & Dock Customization', async ({ page }) => {
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await expect(dock).toBeVisible();

    // 1. Go to Settings tab
    await dock.locator('button[aria-label="Настройки"]').click();
    await expect(page.locator('h1', { hasText: 'Настройки' })).toBeVisible();

    // 2. Open Interface tab and locate "Плеер" row in dock customization
    await page.locator('button', { hasText: 'Интерфейс & Панели' }).click();
    const audioPill = page.locator('[aria-label="Добавить Плеер"]');
    await expect(audioPill).toBeVisible();
    await audioPill.click();
    await page.locator('[role="dialog"] button[title="Назад"]').first().click();

    // 3. Verify audio player tab button appeared in dock
    const audioDockBtn = dock.locator('button[aria-label="Плеер"]');
    await expect(audioDockBtn).toBeVisible();

    // 4. Click Audio Player dock tab
    await audioDockBtn.click();

    // The player has no header anymore: the panel starts right under the safe area.
    await expect(page.locator('header h1', { hasText: 'Плеер' })).toHaveCount(0);
    await expect(page.locator('main')).toBeVisible();

    // Verify player transport or placeholder is visible
    const playerView = page.locator('text=В папке нет аудиозаписей').or(page.locator('button[aria-label="Воспроизведение"]')).first();
    await expect(playerView).toBeVisible();

    // Capture screenshot of mobile audio player
    await page.screenshot({ path: 'test-results/screenshots/audit/31_mobile_audio_player.png' });

    // 5. Test Hardware/Browser back from Audio Player returns to Folders
    await page.goBack();
    await expect(page.locator('header h1', { hasText: 'Заметки' })).toBeVisible();
  });
});

test.describe('SLAG v2 mobile feed sheet & metadata', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  const openInboxWithCards = async (page: Page) => {
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
    await page.locator('button', { hasText: 'Входящие' }).first().click();

    const seedBtn = page.locator('button', { hasText: 'Сгенерировать демо-заметки' });
    if (await seedBtn.count()) {
      await seedBtn.first().click();
    }
    await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });
  };

  const cardOf = (page: Page) =>
    page.locator('.feed-card-contain').first().locator('div[id^="item-"]').first();

  test('1. Строка метаданных одна, без трёх точек', async ({ page }) => {
    await openInboxWithCards(page);

    const row = page.locator('[data-testid="item-meta-row"]').first();
    await expect(row).toBeVisible();
    expect(await row.evaluate(el => getComputedStyle(el).flexWrap)).toBe('nowrap');

    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.height).toBeLessThan(28);

    const tagsRow = page.locator('[data-testid="item-tags-row"]').first();
    if (await tagsRow.count()) {
      expect(await tagsRow.evaluate(el => getComputedStyle(el).flexWrap)).toBe('nowrap');
    }

    await expect(page.locator('[title="Действия"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/screenshots/mobile_feed_meta_row.png' });
  });

  test('2. Тап открывает половинный редактор', async ({ page }) => {
    await openInboxWithCards(page);
    await cardOf(page).click();

    const sheet = page.locator('[data-testid="editor-sheet"]');
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(320);

    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    const visibleHeight = page.viewportSize()!.height - box!.y;
    expect(visibleHeight).toBeGreaterThan(380);
    expect(visibleHeight).toBeLessThan(600);
    const bar = page.getByTestId('mobile-editor-bar');
    expect(await bar.evaluate(el => el.closest('[data-testid="editor-sheet"]') !== null)).toBe(true);
    const barBox = await bar.boundingBox();
    expect(Math.abs(barBox!.y + barBox!.height - page.viewportSize()!.height)).toBeLessThan(2);

    await page.screenshot({ path: 'test-results/screenshots/mobile_half_sheet.png' });
  });

  test('3. Ручка вверх разворачивает, вниз сворачивает и закрывает', async ({ page }) => {
    await openInboxWithCards(page);
    await cardOf(page).click();

    const sheet = page.locator('[data-testid="editor-sheet"]');
    const handle = page.locator('[data-sheet-handle]').first();
    await expect(handle).toBeVisible();
    await page.waitForTimeout(320);

    const drag = async (deltaY: number) => {
      const hb = await handle.boundingBox();
      expect(hb).not.toBeNull();
      const x = hb!.x + hb!.width / 2;
      const startY = hb!.y + hb!.height / 2;
      await page.mouse.move(x, startY);
      await page.mouse.down();
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(x, startY + (deltaY * i) / steps);
      }
      await page.mouse.up();
      await page.waitForTimeout(360);
    };

    await drag(-320);
    const expanded = await sheet.boundingBox();
    expect(Math.abs(expanded!.y)).toBeLessThan(2);
    await page.screenshot({ path: 'test-results/screenshots/mobile_editor_full.png' });

    await drag(320);
    const collapsed = await sheet.boundingBox();
    expect(collapsed!.y).toBeGreaterThan(300);
    const barBox = await page.getByTestId('mobile-editor-bar').boundingBox();
    expect(Math.abs(barBox!.y + barBox!.height - page.viewportSize()!.height)).toBeLessThan(2);

    await drag(420);
    await expect(sheet).toHaveCount(0, { timeout: 5000 });
  });

  test('3b. Тело шита тянет вниз и сворачивает его при scrollTop=0', async ({ page }) => {
    await openInboxWithCards(page);
    await cardOf(page).click();

    const sheet = page.locator('[data-testid="editor-sheet"]');
    const handle = page.locator('[data-sheet-handle]').first();
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(320);

    // Развернуть шторку ручкой, чтобы проверить именно полноэкранный случай.
    const hb = await handle.boundingBox();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2 - (320 * i) / 10);
    }
    await page.mouse.up();
    await page.waitForTimeout(360);
    expect(Math.abs((await sheet.boundingBox())!.y)).toBeLessThan(2);

    // Жест по телу: события touch, потому что обработчик намеренно нативный
    // (только cancelable touchmove может отобрать скролл у браузера).
    const pullBody = async (deltaY: number) => {
      await page.locator('[data-editor-body]').first().evaluate(async (el, dy) => {
        const at = (y: number) => new Touch({ identifier: 2, target: el, clientX: 120, clientY: y });
        const fire = (type: string, y: number, touches: Touch[]) => {
          el.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches,
              targetTouches: touches,
              changedTouches: [at(y)],
            })
          );
        };
        const start = 300;
        fire('touchstart', start, [at(start)]);
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const y = start + (dy * i) / steps;
          fire('touchmove', y, [at(y)]);
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        fire('touchend', start + dy, []);
      }, deltaY);
      await page.waitForTimeout(420);
    };

    // Первый рывок: из полного размера — в половину, не в закрытие.
    await pullBody(340);
    const collapsed = await sheet.boundingBox();
    expect(collapsed!.y).toBeGreaterThan(300);
    await page.screenshot({ path: 'test-results/screenshots/mobile_body_pull_half.png' });

    // Второй: из половины — закрыть.
    await pullBody(460);
    await expect(sheet).toHaveCount(0, { timeout: 5000 });
  });

  test('3c. Пикер папок показывает дерево, а не полный путь', async ({ page }) => {
    await openInboxWithCards(page);
    await cardOf(page).click();

    const sheet = page.locator('[data-testid="editor-sheet"]');
    const handle = page.locator('[data-sheet-handle]').first();
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(320);

    // В свёрнутой шторке тулбар компактный — разворачиваем, чтобы пикер был в кадре.
    const hb = await handle.boundingBox();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2 - (320 * i) / 10);
    }
    await page.mouse.up();
    await page.waitForTimeout(360);

    await sheet.locator('[aria-haspopup="listbox"]').first().click();
    const list = page.locator('[role="listbox"]').first();
    await expect(list).toBeVisible();

    const labels = await list.locator('[role="option"]').allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    // Дерево подписывает ветку именем, поэтому слэша в подписях быть не должно.
    expect(labels.filter((label) => label.includes('/'))).toEqual([]);

    await page.screenshot({ path: 'test-results/screenshots/mobile_folder_tree_picker.png' });
  });

  test('4. Дабл-тап копирует текст', async ({ page }) => {
    await openInboxWithCards(page);

    // Два клика в одном тике страницы: задержка Playwright между click() уже
    // вылезает за окно DOUBLE_TAP_MS.
    await cardOf(page).evaluate(el => {
      el.click();
      window.setTimeout(() => el.click(), 60);
    });
    await page.waitForTimeout(500);

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.trim().length).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="editor-sheet"]')).toHaveCount(0);
  });
});
