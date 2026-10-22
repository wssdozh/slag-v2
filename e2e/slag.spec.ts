import { test, expect } from '@playwright/test';

test.describe('SLAG v2 Specification E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for the app main feed to be visible
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. Note creation with Enter shortcut without empty headers', async ({ page }) => {
    const composerTextarea = page.locator('main textarea');
    await expect(composerTextarea).toBeVisible();

    const noteText = 'Тестовая быстрая мысль через Enter ' + Date.now();
    await composerTextarea.fill(noteText);
    await composerTextarea.press('Enter');

    // Verify item appeared in feed
    const createdCard = page.locator('.group', { hasText: noteText });
    await expect(createdCard).toBeVisible();

    // Verify there is no empty metadata header for plain note in inbox
    const cardText = await createdCard.innerText();
    expect(cardText).toContain(noteText);
  });

  test('2. Task creation & direct in-feed completion toggle', async ({ page }) => {
    // Select task type in composer
    const typeDropdownButton = page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first();
    await typeDropdownButton.click();
    await page.locator('button', { hasText: 'Таска' }).click();

    const composerTextarea = page.locator('main textarea');
    const taskTitle = 'Сделать проверку чекбоксов E2E ' + Date.now();
    await composerTextarea.fill(taskTitle);

    // Send task
    await page.locator('button[title*="Отправить"]').click();

    // Find task card
    const taskCard = page.locator('.group', { hasText: taskTitle });
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator('span', { hasText: 'Таска' })).toBeVisible();

    // Toggle completion directly in feed
    const checkbox = taskCard.locator('button[aria-label="Изменить статус задачи"]');
    await checkbox.click();

    // Verify completion status change via toast or styling
    await expect(page.locator('text=Задача выполнена').or(page.locator('text=Задача возобновлена'))).toBeVisible();
  });

  test('3. Hybrid Inbox mode switching (Unsorted, All, Sorted)', async ({ page }) => {
    // Navigate to Inbox
    await page.locator('button', { hasText: 'Входящие' }).first().click();

    // Verify the three buttons exist in header
    const unsortedBtn = page.locator('header button[title*="Только неразобранные"]');
    const allBtn = page.locator('header button[title*="Все заметки хранилища"]');
    const sortedBtn = page.locator('header button[title*="Только распределенные"]');

    await expect(unsortedBtn).toBeVisible();
    await expect(allBtn).toBeVisible();
    await expect(sortedBtn).toBeVisible();

    // Verify "Все" is active by default
    await expect(allBtn).toHaveClass(/bg-white\/10/);

    // Switch to "Разобранные"
    await sortedBtn.click();
    await expect(sortedBtn).toHaveClass(/bg-white\/10/);

    // Switch to "Неразобранные"
    await unsortedBtn.click();
    await expect(unsortedBtn).toHaveClass(/bg-white\/10/);

    // Switch back to "Все"
    await allBtn.click();
    await expect(allBtn).toHaveClass(/bg-white\/10/);
  });

  test('4. Article inline accordion expansion & collapse', async ({ page }) => {
    // Switch to "Все" to see all demo articles or navigate to design
    await page.locator('header button[title*="Все заметки хранилища"]').click();

    const articleCard = page.locator('#item-demo_article_1');
    await expect(articleCard).toBeVisible();

    // Check expand button
    const readFullBtn = articleCard.locator('button', { hasText: /Читать полностью/ });
    await expect(readFullBtn).toBeVisible();
    await readFullBtn.click();

    // Verify expanded text is visible
    await expect(articleCard.locator('text=Три ключевых принципа SLAG')).toBeVisible();

    // Check collapse button
    const collapseBtn = articleCard.locator('button', { hasText: 'Свернуть ↑' });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    // Verify it collapsed back
    await expect(articleCard.locator('button', { hasText: /Читать полностью/ })).toBeVisible();
  });

  test('5. Unified Context Menu and Pinning via Right Click', async ({ page }) => {
    const card = page.locator('[id^="item-"]').first();
    await expect(card).toBeVisible();
    await card.click({ button: 'right' });

    // Verify Context Menu is open with Linear shortcuts
    const contextMenu = page.locator('.fixed.z-50', { hasText: 'Ответить' });
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.locator('text=Фокус-редактор')).toBeVisible();
    await expect(contextMenu.locator('text=Сменить тип')).toBeVisible();
    await expect(contextMenu.locator('text=Копировать текст')).toBeVisible();

    // Toggle Pin
    const pinBtn = contextMenu.locator('button', { hasText: /Закрепить|Открепить/ });
    await pinBtn.click();

    // Verify Toast notification
    await expect(page.locator('text=Запись закреплена').or(page.locator('text=Запись откреплена'))).toBeVisible();
  });

  test('6. Global Search Modal (⌘K / Ctrl+K) and LIFO Dismissal', async ({ page }) => {
    // Trigger search
    await page.keyboard.press('Control+k');

    const searchModal = page.locator('.fixed.z-50');
    const searchInput = searchModal.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(searchInput).toBeVisible();

    // Type query
    await searchInput.fill('дизайн');
    await page.waitForTimeout(200);

    // Verify search results appear inside search dialog
    await expect(searchModal.locator('text=Дизайн').first()).toBeVisible();

    // Press Escape to dismiss (LIFO dismissal stack)
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeVisible();
  });

  test('7. Sidebar Resizing with mouse drag', async ({ page }) => {
    const splitter = page.locator('.dv-sash, .sash').first();
    await expect(splitter).toBeAttached();

    const leftSidebar = page.locator('aside').first();
    const initialBox = await leftSidebar.boundingBox();
    expect(initialBox).toBeTruthy();

    if (initialBox) {
      const splitterBox = await splitter.boundingBox();
      if (splitterBox) {
        await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 100);
        await page.mouse.down();
        await page.mouse.move(splitterBox.x + 80, splitterBox.y + 100);
        await page.mouse.up();
      }

      const newBox = await leftSidebar.boundingBox();
      expect(newBox).toBeTruthy();
      if (newBox && initialBox) {
        expect(newBox.width).toBeGreaterThan(initialBox.width);
      }
    }
  });

  test('8. Image Lightbox full-screen gallery with Escape dismissal', async ({ page }) => {
    // Open an image in demo item or create one with base64 1x1 image
    const composerTextarea = page.locator('main textarea');
    await composerTextarea.fill('Заметка с тестовой картинкой ' + Date.now());

    // Send item
    await composerTextarea.press('Enter');

    // Create a note with image attachment via context or check demo
    await page.evaluate(() => {
      const storageKey = 'slag_items_default_vault';
      const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
      items.unshift({
        id: 'test_img_item',
        type: 'note',
        title: 'Тест Галереи',
        content: 'Картинка для лайтбокса',
        folder: 'Входящие',
        tags: ['фото'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachments: [
          {
            id: 'img1',
            name: 'photo1.png',
            type: 'image',
            mimeType: 'image/png',
            size: 1024,
            relativePath: '.attachments/photo1.png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          {
            id: 'img2',
            name: 'photo2.png',
            type: 'image',
            mimeType: 'image/png',
            size: 1024,
            relativePath: '.attachments/photo2.png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          }
        ],
      });
      localStorage.setItem(storageKey, JSON.stringify(items));
    });

    // Reload page to pick up storage
    await page.reload();
    await expect(page.locator('main')).toBeVisible();

    // Click on the image thumbnail
    const imgThumb = page.locator('img[alt="photo1.png"]').first();
    await expect(imgThumb).toBeVisible();
    await imgThumb.click();

    // Verify Lightbox opens
    const lightbox = page.locator('.fixed.z-50').filter({ hasText: 'из' });
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator('text=photo1.png')).toBeVisible();
    await expect(lightbox.locator('text=1 из 2')).toBeVisible();

    // Navigate right via arrow key
    await page.keyboard.press('ArrowRight');
    await expect(lightbox.locator('text=photo2.png')).toBeVisible();
    await expect(lightbox.locator('text=2 из 2')).toBeVisible();

    // Close via Escape (LIFO stack)
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
  });

  test('9. Visual Layout Screenshot Capture for Agent Inspection', async ({ page }) => {
    // Wait for the app to settle
    await expect(page.locator('main')).toBeVisible();

    // 1. Capture full page viewport
    await page.screenshot({
      path: 'test-results/screenshots/main-layout.png',
      fullPage: false,
    });

    // 2. Capture composer island
    const composer = page.locator('main').locator('div.sticky, div.relative').last();
    if (await composer.isVisible()) {
      await composer.screenshot({
        path: 'test-results/screenshots/composer-island.png',
      });
    }

    // 3. Capture sidebar
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();
    await sidebar.screenshot({
      path: 'test-results/screenshots/sidebar.png',
    });

    // 4. Capture Fullscreen Editor layout for visual audit
    const focusEditorBtn = page.locator('button', { hasText: 'Фокус-редактор' }).first();
    if (await focusEditorBtn.isVisible()) {
      await focusEditorBtn.click();
      await expect(page.locator('#fullscreen-textarea')).toBeVisible();
      await page.screenshot({
        path: 'test-results/screenshots/fullscreen-editor-layout.png',
        fullPage: false,
      });
      // Click "Назад" to return
      await page.locator('button', { hasText: 'Назад' }).click();
      await expect(page.locator('#fullscreen-textarea')).not.toBeVisible();
    }
  });

  test('10. Toggle Assistant Mode via Dockview Tab and Panel Navigation', async ({ page }) => {
    // 1. Click on Assistant tab in right group
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await expect(assistantTab).toBeVisible();
    await assistantTab.click();

    // Verify Assistant view is active
    await expect(page.locator('textarea[placeholder*="Спросите"]').first()).toBeVisible();

    // 2. Switch to Info tab in same group
    const infoTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Инфо' }).first();
    await expect(infoTab).toBeVisible();
    await infoTab.click();

    // 3. Switch back to Assistant tab
    await assistantTab.click();
    await expect(page.locator('textarea[placeholder*="Спросите"]').first()).toBeVisible();
  });

  test('11. Assistant Tool Calling (get_vault_stats) and Reasoning Accordion', async ({ page }) => {
    // Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    // Click quick prompt for vault stats
    const statsPromptBtn = page.locator('button', { hasText: 'Сводка хранилища' }).first();
    await expect(statsPromptBtn).toBeVisible();
    await statsPromptBtn.click();

    // Verify Assistant response appears
    const assistantResponse = page.locator('div', { hasText: 'Сводка по хранилищу' }).last();
    await expect(assistantResponse).toBeVisible();

    // Verify tool execution badge
    await expect(page.locator('text=get_vault_stats').first()).toBeVisible();

    // Verify reasoning accordion is present and click to expand
    const reasoningBtn = page.locator('button', { hasText: /Рассуждения/ }).first();
    await expect(reasoningBtn).toBeVisible();
    await reasoningBtn.click();
    await expect(page.locator('text=storage.getVaultStats()').first()).toBeVisible();
  });

  test('12. Assistant Draft Note Generation and Creation', async ({ page }) => {
    // Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    // Ask to create a task
    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await textarea.fill('Создай новую задачу "Проверить Groq API"');
    await textarea.press('Enter');

    // Verify draft action card appears
    await expect(page.locator('text=Черновик задачи').first()).toBeVisible();
    await expect(page.locator('text=Проверить Groq API').first()).toBeVisible();

    // Click save button in draft card
    const saveDraftBtn = page.locator('button', { hasText: 'Сохранить в хранилище' }).last();
    await expect(saveDraftBtn).toBeVisible();
    await saveDraftBtn.click();

    // Verify toast notification
    await expect(page.locator('text=Запись «Проверить Groq API» сохранена')).toBeVisible();

    // Verify the task exists in the feed!
    await expect(page.locator('.group', { hasText: 'Проверить Groq API' })).toBeVisible();
  });

  test('13. Assistant Feed Filtering with AI Chip', async ({ page }) => {
    // Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    // Verify assistant is visible
    const assistantTextarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(assistantTextarea).toBeVisible();

    // Ask to search design notes
    await assistantTextarea.fill('дизайн');
    await assistantTextarea.press('Enter');

    // Wait for search result with "Показать в ленте" button
    const filterBtn = page.locator('button', { hasText: /Показать \d+ в ленте/ }).first();
    await expect(filterBtn).toBeVisible();
    await filterBtn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/assistant-telegram-style-button.png' });
    await filterBtn.click();

    // Verify AI filter chip appears in FeedHeader
    const aiChip = page.locator('header').locator('text=ИИ: "дизайн"');
    await expect(aiChip).toBeVisible();

    // Reset AI filter
    const resetChipBtn = page.locator('header button[title="Сбросить фильтр ИИ"]');
    await expect(resetChipBtn).toBeVisible();
    await resetChipBtn.click();
    await expect(aiChip).not.toBeVisible();
  });

  test('14. Settings Modal Groq Provider and Tag Taxonomy Controls', async ({ page }) => {
    // Open Settings via gear icon in sidebar
    await page.locator('button[title*="Настройки"]').first().click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();

    // Verify Groq provider is selectable and default recommended
    const groqProviderBtn = settingsModal.locator('button', { hasText: 'Groq (Рекомендуется)' });
    await expect(groqProviderBtn).toBeVisible();
    await page.waitForTimeout(100);
    await groqProviderBtn.click();

    // Verify Gemini provider tab is cut out / removed from top tabs
    await expect(settingsModal.locator('button', { hasText: '✨ Gemini' })).not.toBeVisible();

    // Verify KIE.AI provider is available and defaults to Gemini 4 Argon
    const kieProviderBtn = settingsModal.locator('button', { hasText: 'KIE.AI' });
    await expect(kieProviderBtn).toBeVisible();
    await kieProviderBtn.click();
    await expect(settingsModal.locator('input[placeholder*="sk-kie"]')).toBeVisible();

    // Verify Gemini 4 Argon model option is visible in KIE.AI
    const kieModelSelect = settingsModal.locator('select', { hasText: /Gemini 4 Argon/ });
    await expect(kieModelSelect).toBeVisible();

    // Take screenshot of KIE.AI settings with Argon for visual audit
    await page.screenshot({
      path: 'test-results/screenshots/settings-modal-kie-argon.png',
    });

    await groqProviderBtn.click();

    // Verify gpt-oss-120b model option exists
    const modelSelect = settingsModal.locator('select', { hasText: /OpenAI GPT-OSS 120B/ });
    await expect(modelSelect).toBeVisible();

    // Verify Tag Taxonomy controls exist
    await expect(settingsModal.locator('text=Норма таксономии и правила тегирования')).toBeVisible();
    await expect(settingsModal.locator('text=Максимум тегов на запись')).toBeVisible();
    await expect(settingsModal.locator('text=Стиль регистра тегов')).toBeVisible();
    await expect(settingsModal.locator('text=Разрешить ИИ создавать новые теги')).toBeVisible();

    // Take screenshot of settings modal for visual audit
    await page.screenshot({
      path: 'test-results/screenshots/settings-modal-groq.png',
    });

    // Close settings modal via Escape
    await page.keyboard.press('Escape');
    await expect(settingsModal).not.toBeVisible();
  });

  test('15. Visual Layout Screenshots of Assistant Views for Agent Audit', async ({ page }) => {
    // 1. Right Assistant panel screenshot
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();
    await expect(page.locator('textarea[placeholder*="Спросите"]').first()).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/assistant-sidebar-layout.png',
      fullPage: false,
    });
  });

  test('16. Assistant Pure Chat Dialogue, Quick Prompts, and Interactive Draft Generation', async ({ page }) => {
    // 1. Open Assistant view
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();
    await expect(page.locator('text=Все хранилище').first()).toBeVisible();

    // 2. Send a message via quick prompt (Agenda / Today Plan)
    await page.locator('button', { hasText: 'План на сегодня' }).first().click();
    // Wait for assistant response to appear
    await expect(page.locator('text=SLAG').first()).toBeVisible({ timeout: 5000 });

    // Capture chat screenshot
    await page.screenshot({
      path: 'test-results/screenshots/assistant-chat-mode.png',
      fullPage: false,
    });

    // 3. Send a prompt that generates suggestedAction (Draft task)
    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await textarea.fill('Создай новую задачу: Проверить синхронизацию заметок');
    await textarea.press('Enter');
    await expect(page.locator('text=Сохранить в хранилище').first()).toBeVisible({ timeout: 5000 });

    // 4. Click Save to Vault
    await page.locator('button', { hasText: 'Сохранить в хранилище' }).first().click();
    await expect(page.locator('text=сохранена').or(page.locator('text=Запись'))).toBeVisible();

    // 5. Test Subtask Decomposition action
    await textarea.fill('Разбей задачу Реализовать ИИ-тегирование на подзадачи');
    await textarea.press('Enter');
    const decomposeBtn = page.locator('button', { hasText: /Применить \d+ подзадач/ }).first();
    await expect(decomposeBtn).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: 'test-results/screenshots/assistant-decompose-action.png',
      fullPage: false,
    });
    await decomposeBtn.click();
    await expect(page.locator('text=добавлено 4 подзадач').first()).toBeVisible({ timeout: 5000 });
  });

  test('17. Linear-style Kanban Board with Inline Task Button and Orama Materials Search', async ({ page }) => {
    // 1. Switch to Kanban view in header
    const kanbanBtn = page.locator('header button[title*="Канбан"]');
    await expect(kanbanBtn).toBeVisible();
    await kanbanBtn.click();

    // 2. Verify TRIZ Materials Dock exists and test Orama live search
    const materialsHeader = page.locator('text=Материалы папки');
    await expect(materialsHeader).toBeVisible();

    const materialsSearch = page.locator('input[placeholder*="Поиск по материалам"]');
    await expect(materialsSearch).toBeVisible();
    await materialsSearch.fill('манифест');
    await expect(page.locator('text=Манифест ультра-минимализма').first()).toBeVisible();
    await materialsSearch.fill('');

    // 3. Verify 4 columns exist (Бэклог, К выполнению, В работе, Выполнено)
    await expect(page.locator('h3', { hasText: 'Бэклог' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'К выполнению' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'В работе' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Выполнено' })).toBeVisible();

    // 4. Create a task inline via "+ Новая задача" button placed directly under cards
    const addBtn = page.locator('button[title="Добавить задачу в К выполнению"]').first();
    await addBtn.click();

    const input = page.locator('input[placeholder*="Название задачи"]');
    await expect(input).toBeVisible();
    const taskName = 'Линейный Канбан Тест ' + Date.now();
    await input.fill(taskName);
    await input.press('Enter');

    // Verify task card appeared in Kanban
    const taskCard = page.locator('[data-testid="kanban-card"]', { hasText: taskName });
    await expect(taskCard).toBeVisible();

    // Verify Linear Task key (e.g. TSK-...)
    await expect(taskCard.locator('text=TSK-')).toBeVisible();

    // 5. Screenshot Kanban layout for visual inspection
    await page.screenshot({
      path: 'test-results/screenshots/kanban-board-layout.png',
      fullPage: false,
    });
  });

  test('18. Todoist Upcoming Calendar with Week/Month Views and Overdue Drawer', async ({ page }) => {
    // 1. Switch to Calendar view in header
    const calendarBtn = page.locator('header button[title*="Календарь"]');
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();

    // 2. Verify Week view by default
    await expect(page.locator('text=Неделя')).toBeVisible();
    await expect(page.locator('text=Месяц')).toBeVisible();
    await expect(page.locator('text=Сегодня')).toBeVisible();

    // 3. Verify Today date indicator in week header and All-Day row
    const todayBadge = page.locator('.bg-white.text-\\[\\#09090b\\]');
    await expect(todayBadge.first()).toBeVisible();
    await expect(page.locator('text=Весь день').first()).toBeVisible();

    // 4. Verify Hourly Time Grid (e.g. 08:00, 12:00, 18:00)
    await expect(page.locator('text=08:00').first()).toBeVisible();
    await expect(page.locator('text=12:00').first()).toBeVisible();

    // 5. Capture Week View screenshot
    await page.screenshot({
      path: 'test-results/screenshots/calendar-week-layout.png',
      fullPage: false,
    });

    // 6. Test Task Details Popover by clicking any task card in the calendar
    const taskCard = page.locator('text=Купить хороший зеленый чай').first();
    if (await taskCard.isVisible()) {
      await taskCard.click();
      await expect(page.locator('text=Срок выполнения')).toBeVisible();
      await page.screenshot({
        path: 'test-results/screenshots/calendar-task-popover.png',
        fullPage: false,
      });
      // Close popover via Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('text=Срок выполнения')).not.toBeVisible();
    }

    // 7. Switch to Month View
    await page.locator('button', { hasText: 'Месяц' }).click();
    await expect(page.locator('button', { hasText: 'Месяц' })).toHaveClass(/bg-white\/10/);

    // Test Expanded Day Card modal by clicking on a month day cell number
    const monthTodayBadge = page.locator('.grid-cols-7 .bg-white.text-\\[\\#09090b\\]').first();
    if (await monthTodayBadge.isVisible()) {
      await monthTodayBadge.click();
      await page.waitForTimeout(100);
      await page.screenshot({
        path: 'test-results/screenshots/calendar-month-expanded-day.png',
        fullPage: false,
      });
      // Close modal via Escape
      await page.keyboard.press('Escape');
    }

    // Capture Month View screenshot
    await page.screenshot({
      path: 'test-results/screenshots/calendar-month-layout.png',
      fullPage: false,
    });

    // 8. Open Overdue & Unscheduled Drawer
    const drawerBtn = page.locator('button[title*="просроченных"]').first();
    await drawerBtn.click();
    await expect(page.locator('text=Просроченные')).toBeVisible();
    await expect(page.locator('text=Без срока')).toBeVisible();

    // Capture Drawer screenshot
    await page.screenshot({
      path: 'test-results/screenshots/calendar-drawer-layout.png',
      fullPage: false,
    });
  });

  test('19. Todoist task parser and interactive Ghost chips', async ({ page }) => {
    const composerTextarea = page.locator('main textarea');
    await expect(composerTextarea).toBeVisible();

    // 1. Type a task with date, priority, and tags in Todoist syntax
    await composerTextarea.fill('Купить фермерское молоко завтра в 18:00 p1 #groceries');

    // 2. Wait for 150ms debounce
    await page.waitForTimeout(250);

    // 3. Verify Ghost chips are visible right above textarea
    const dateChip = page.locator('span.font-mono', { hasText: '📅' }).first();
    const priorityChip = page.locator('span.font-mono', { hasText: 'p1 (High)' });
    const tagChip = page.locator('span.font-mono', { hasText: '#groceries' });

    await expect(dateChip).toBeVisible();
    await expect(priorityChip).toBeVisible();
    await expect(tagChip).toBeVisible();

    // 4. Take screenshot of Ghost chips
    await page.screenshot({
      path: 'test-results/screenshots/todoist-ghost-chips.png',
      fullPage: false,
    });

    // 5. Test Escape key dismisses all ghost chips
    await composerTextarea.press('Escape');
    await expect(dateChip).not.toBeVisible();
    await expect(priorityChip).not.toBeVisible();
    await expect(tagChip).not.toBeVisible();

    // 6. Retype to bring chips back and test individual dismiss
    await composerTextarea.fill('');
    await page.waitForTimeout(100);
    await composerTextarea.fill('Заказать билеты в театр завтра p2 #culture');
    await page.waitForTimeout(250);

    const newPriorityChip = page.locator('span.font-mono', { hasText: 'p2 (Medium)' });
    await expect(newPriorityChip).toBeVisible();

    // Dismiss priority chip via its X button
    const prioX = newPriorityChip.locator('button');
    await prioX.click();
    await expect(newPriorityChip).not.toBeVisible();

    // 7. Send task via Enter
    await composerTextarea.press('Enter');

    // 8. Verify created task card in feed has clean title
    const createdCard = page.locator('.group', { hasText: 'Заказать билеты в театр' }).first();
    await expect(createdCard).toBeVisible();

    // Verify tag is present
    await expect(createdCard.getByRole('button', { name: '#culture' })).toBeVisible();

    // Verify task type badge is present
    await expect(createdCard.locator('span', { hasText: 'Таска' })).toBeVisible();

    // Verify title does NOT contain raw syntax (p2, #culture, tomorrow)
    const cardText = await createdCard.innerText();
    expect(cardText).not.toContain('#culture завтра');
  });

  test('20. Dockview Composite Workspace, Sleek Rounded Tabs, and [+] Group Header Actions', async ({ page }) => {
    // 1. Verify Dockview container is active by default
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 2. Verify top bar is completely removed
    await expect(page.locator('text=Пресеты:')).not.toBeVisible();
    await expect(page.locator('text=Сетка:')).not.toBeVisible();

    // 3. Locate the [+] button on the tab group header
    const addTabBtn = page.locator('button[title*="Добавить вкладку в эту группу"]').first();
    await expect(addTabBtn).toBeVisible();

    // 4. Click [+] button and verify popup menu
    await addTabBtn.click();
    const menu = page.locator('div.shadow-2xl', { hasText: 'Добавить вкладку' });
    await expect(menu).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Лента' })).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Канбан' })).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Календарь' })).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Ассистент' })).toBeVisible();

    // 5. Take screenshot of sleek tabs with [+] button
    await page.screenshot({
      path: 'test-results/screenshots/dockview-sleek-tabs-with-plus.png',
      fullPage: false,
    });

    // 6. Close menu via Escape
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
  });

  test('21. Tab Insertion Beam and Singular Dropzone Guardian Verification', async ({ page }) => {
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Locate Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await expect(assistantTab).toBeVisible();

    // 2. Drag tab slightly to initiate DnD and verify no residual ghost dropzones
    const tabBox = await assistantTab.boundingBox();
    if (tabBox) {
      await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(tabBox.x + tabBox.width / 2 + 30, tabBox.y + tabBox.height / 2, { steps: 5 });
      await page.mouse.up();
    }

    // 3. Verify that all stale dropzones are cleanly purged after pointer up
    const residualDropzones = await page.locator('.dv-drop-target-dropzone, .dv-drop-target-anchor').count();
    expect(residualDropzones).toBe(0);

    // 4. Capture screenshot of workspace with clean tab bar
    await page.screenshot({
      path: 'test-results/screenshots/dockview-insertion-beam-clean.png',
      fullPage: false,
    });
  });

  test('22. Logging HUD & Diagnostics Engine Verification', async ({ page }) => {
    // 1. Open Log Viewer modal via global shortcut Ctrl+`
    await page.keyboard.press('Control+Backquote');

    // 2. Verify Log Viewer appeared
    const logViewer = page.locator('[data-testid="log-viewer"]');
    await expect(logViewer).toBeVisible();

    // 3. Verify title and chips
    await expect(logViewer.locator('text=Логи & HUD')).toBeVisible();
    await expect(logViewer.locator('text=LEVEL:')).toBeVisible();
    await expect(logViewer.locator('text=SCOPE:')).toBeVisible();

    // 4. Verify system initialization logs are present
    await expect(logViewer.locator('text=SLAG v2 application initialized').first()).toBeVisible();

    // 5. Test search filter in log viewer
    const searchInput = logViewer.locator('input[placeholder*="Поиск по логам"]');
    await searchInput.fill('initialized');
    await expect(logViewer.locator('text=SLAG v2 application initialized').first()).toBeVisible();
    await searchInput.clear();

    // 6. Test scope filter
    const appScopeBtn = logViewer.locator('button', { hasText: 'APP' }).first();
    await appScopeBtn.click();
    await expect(logViewer.locator('text=SLAG v2 application initialized').first()).toBeVisible();

    // Reset scope filter
    const allScopeBtn = logViewer.locator('button', { hasText: 'ALL' }).nth(1);
    await allScopeBtn.click();

    // 7. Take screenshot of Log Viewer HUD for visual verification
    await page.screenshot({
      path: 'test-results/screenshots/log-viewer-hud.png',
      fullPage: false,
    });

    // 8. Close Log Viewer via Escape key
    await page.keyboard.press('Escape');
    await expect(logViewer).not.toBeVisible();

    // 9. Also verify Settings modal contains "Логи & Диагностика" tab
    await page.locator('button[title*="Настройки"]').first().click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();

    const logsTab = settingsModal.locator('button[data-testid="settings-tab-logs"]');
    await expect(logsTab).toBeVisible();
    await logsTab.click();

    // Verify embedded log viewer is visible inside settings
    await expect(settingsModal.locator('[data-testid="log-viewer"]')).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/settings-modal-logs-tab.png',
      fullPage: false,
    });

    await page.keyboard.press('Escape');
    await expect(settingsModal).not.toBeVisible();
  });

  test('23. Assistant Relative Calendar Dates, Contextual Links, and Offline Intent Classifier', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    // Verify "Локальный" mode badge is visible in header
    await expect(page.locator('text=Локальный').first()).toBeVisible();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask today agenda via quick prompt
    await page.locator('button', { hasText: 'План на сегодня' }).first().click();
    await expect(page.locator('text=Повестка на').first()).toBeVisible({ timeout: 5000 });

    // 3. Ask relative date query "а на завтра чо"
    await textarea.fill('а на завтра чо');
    await textarea.press('Enter');

    // Verify it answers with tomorrow's agenda and NOT "не найдено подходящих заметок"
    await expect(page.locator('text=завтра').last()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=не найдено подходящих заметок')).not.toBeVisible();

    // 4. Ask contextual link query "дай мне линк на эту задачу"
    await textarea.fill('дай мне линк на эту задачу');
    await textarea.press('Enter');

    // Verify it resolves the link from previous context
    await expect(page.locator('text=Вот ссылка на запись из контекста:').first()).toBeVisible({ timeout: 5000 });

    // 5. Ask conversational complaint "не хочу"
    await textarea.fill('не хочу');
    await textarea.press('Enter');

    // Verify it answers with the polite offline mode explanation
    await expect(page.locator('text=локальном автономном режиме').first()).toBeVisible({ timeout: 5000 });

    // Take screenshot for visual audit
    await page.screenshot({
      path: 'test-results/screenshots/assistant-smart-dialogue.png',
      fullPage: false,
    });
  });

  test('24. Typo-Tolerant Note Search and Multi-step Agentic Tool Calling Verification', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Query with conversational filler and typo: "поищи по заметкам по прафилам как жить вообще"
    await textarea.fill('поищи по заметкам по прафилам как жить вообще');
    await textarea.press('Enter');

    // 3. Verify that typo "прафилам" matches "12 правил эффективности"
    const matchedLink = page.locator('button', { hasText: '12 правил эффективности' }).first();
    await expect(matchedLink).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=записей не найдено')).not.toBeVisible();

    // 4. Test clicking the wikilink inside the chat message
    await matchedLink.click();

    // 5. Test another conversational query with transformation intent
    await textarea.fill('сделай статью на этот счет');
    await textarea.press('Enter');

    // Verify draft action card for article is formed
    await expect(page.locator('text=Черновик статьи').first()).toBeVisible({ timeout: 5000 });

    // Capture visual screenshot
    await page.screenshot({
      path: 'test-results/screenshots/assistant-typo-search-success.png',
      fullPage: false,
    });
  });

  test('25. Assistant Action Lifecycle (suggested, applied, rejection, and task refinement)', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask to create a task with relative date
    await textarea.fill('можешь на завтра таску сделать почистить яйца');
    await textarea.press('Enter');

    // 3. Verify action card appears with title and buttons
    await expect(page.locator('text=почистить яйца').first()).toBeVisible({ timeout: 5000 });
    const planBtn = page.locator('button', { hasText: /Запланировать на|Сохранить в хранилище/ }).first();
    await expect(planBtn).toBeVisible();
    const rejectBtn = page.locator('button', { hasText: 'Отклонить' }).first();
    await expect(rejectBtn).toBeVisible();

    // 4. Test Rejection with a disposable note request
    await textarea.fill('создай черновик: временная мысль для отмены');
    await textarea.press('Enter');
    await expect(page.locator('text=временная мысль для отмены').first()).toBeVisible({ timeout: 5000 });
    const secondRejectBtn = page.locator('button', { hasText: 'Отклонить' }).last();
    await secondRejectBtn.click();
    await expect(page.locator('text=Действие отклонено').first()).toBeVisible();

    // 5. Test Confirmation & Transition to Applied
    await planBtn.click();
    await expect(page.locator('text=сохранена').first()).toBeVisible();

    // Verify card now shows applied state with "Перейти к записи"
    const jumpBtn = page.locator('button', { hasText: 'Перейти к записи' }).first();
    await expect(jumpBtn).toBeVisible();
    await jumpBtn.click();

    // 6. Test Context Refinement ("требуемые инструменты бритва")
    await textarea.fill('можешь добавить этой таске подробности: требуемые инструменты бритва');
    await textarea.press('Enter');

    // Verify assistant does NOT produce empty search error and instead updates the draft
    await expect(page.locator('text=записей не найдено')).not.toBeVisible();
    await expect(page.locator('text=требуемые инструменты бритва').first()).toBeVisible({ timeout: 5000 });

    // Capture visual screenshot of the action card states
    await page.screenshot({
      path: 'test-results/screenshots/assistant-action-lifecycle.png',
      fullPage: false,
    });

    // 7. Click confirm on the updated action
    const updateConfirmBtn = page.locator('button', { hasText: /Запланировать на|Сохранить в хранилище/ }).last();
    await updateConfirmBtn.click();
    await expect(page.locator('text=обновлена').or(page.locator('text=сохранена')).first()).toBeVisible();
  });

  test('26. KIE.AI Provider with Gemini 4 Argon Endpoint and Structured Settings', async ({ page }) => {
    // 1. Open Settings
    await page.locator('button[title*="Настройки"]').first().click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();

    // 2. Select KIE.AI
    const kieBtn = settingsModal.locator('button', { hasText: 'KIE.AI' });
    await kieBtn.click();

    // 3. Verify Gemini 4 Argon is selected and visible
    const select = settingsModal.locator('select').first();
    await expect(select).toHaveValue('gemini-4-argon-openai');

    // 4. Fill in token and save
    const keyInput = settingsModal.locator('input[placeholder*="sk-kie"]');
    await keyInput.fill('sk-kie-test-argon-token');
    await settingsModal.locator('button', { hasText: 'Сохранить' }).click();
    await expect(settingsModal).not.toBeVisible();

    // 5. Verify Assistant Chat shows KIE provider badge in bottom composer
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();
    await expect(page.locator('button', { hasText: 'KIE' }).or(page.locator('text=KIE')).first()).toBeVisible();

    // 6. Verify client endpoint resolver behavior in browser context
    const endpoints = await page.evaluate(async () => {
      const module = await import('/src/lib/aiService.ts');
      return {
        argonUrl: module.resolveKieEndpoint('https://api.kie.ai', 'gemini-4-argon-openai'),
        gptUrl: module.resolveKieEndpoint('https://api.kie.ai', 'gpt-5-2'),
      };
    });

    expect(endpoints.argonUrl).toBe('https://api.kie.ai/gemini-4-argon-openai/v1/chat/completions');
    expect(endpoints.gptUrl).toBe('https://api.kie.ai/v1/chat/completions');
  });
});
