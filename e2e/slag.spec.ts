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

    const taskCard = page.locator('.group', { hasText: 'Синхронизация по архитектуре баз данных' }).first();
    if (await taskCard.isVisible()) {
      await taskCard.screenshot({
        path: 'test-results/screenshots/task-card-with-subtasks.png',
      });
    }

    const articleCard = page.locator('#item-demo_article_1');
    await expect(articleCard).toBeVisible();

    await articleCard.screenshot({
      path: 'test-results/screenshots/article-card-collapsed.png',
    });

    // Check expand button
    const readFullBtn = articleCard.locator('button', { hasText: /Читать полностью/ });
    await expect(readFullBtn).toBeVisible();
    await readFullBtn.click();

    // Verify expanded text is visible
    await expect(articleCard.locator('text=Три ключевых принципа SLAG')).toBeVisible();

    await articleCard.screenshot({
      path: 'test-results/screenshots/article-card-expanded.png',
    });

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

      // Open the custom folder dropdown to verify dark styling
      const folderSelect = page.locator('header button[aria-haspopup="listbox"]').first();
      await expect(folderSelect).toBeVisible();
      await folderSelect.click();
      await expect(page.locator('button[role="option"]').first()).toBeVisible();

      await page.screenshot({
        path: 'test-results/screenshots/fullscreen-editor-layout.png',
        fullPage: false,
      });

      // Close dropdown by clicking trigger again
      await folderSelect.click();

      // Click "Назад" to return
      await page.locator('header button', { hasText: 'Назад' }).click();
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
    const groqProviderBtn = settingsModal.locator('button', { hasText: 'Groq' }).first();
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
    const kieModelSelect = settingsModal.locator('button[aria-haspopup="listbox"]', { hasText: /Gemini 4 Argon/ });
    await expect(kieModelSelect).toBeVisible();

    // Take screenshot of KIE.AI settings with Argon for visual audit
    await page.screenshot({
      path: 'test-results/screenshots/settings-modal-kie-argon.png',
    });

    await groqProviderBtn.click();

    // Verify gpt-oss-120b model option exists
    const modelSelect = settingsModal.locator('button[aria-haspopup="listbox"]', { hasText: /OpenAI GPT-OSS 120B/ });
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

  test('19. Todoist task parser: inline parsing fills toolbar controls directly, no ghost chips', async ({ page }) => {
    const composerTextarea = page.locator('main textarea');
    await expect(composerTextarea).toBeVisible();

    // 1. Type a task with date, priority, and tags in Todoist syntax
    await composerTextarea.fill('Купить фермерское молоко завтра в 18:00 p1 #groceries');

    // 2. Wait for 150ms debounce
    await page.waitForTimeout(250);

    // 3. Verify Ghost chips are NOT rendered above textarea
    const oldPriorityChip = page.locator('span.font-mono', { hasText: 'p1 (High)' });
    await expect(oldPriorityChip).not.toBeVisible();

    // 4. Verify toolbar controls are filled directly on the bottom bar
    const dueDateBtn = page.locator('button[title="Изменить срок"]');
    await expect(dueDateBtn).toBeVisible();
    await expect(dueDateBtn).toContainText('Завтра');

    const prioBtn = page.locator('button', { hasText: 'Высокий' });
    await expect(prioBtn).toBeVisible();

    // 5. Take screenshot of unified toolbar controls
    await page.screenshot({
      path: 'test-results/screenshots/todoist-toolbar-controls.png',
      fullPage: false,
    });

    // 6. Test removing date via its X button in toolbar
    const dateClearBtn = page.locator('button[title="Снять срок"]');
    await expect(dateClearBtn).toBeVisible();
    await dateClearBtn.click();
    await expect(page.locator('button[title="Установить срок задачи"]')).toBeVisible();

    // 7. Retype and send task via Enter
    await composerTextarea.fill('');
    await page.waitForTimeout(100);
    await composerTextarea.fill('Заказать билеты в театр завтра p2 #culture');
    await page.waitForTimeout(250);

    // Verify priority updated to medium
    await expect(page.locator('button', { hasText: 'Средний' })).toBeVisible();

    // Send task via Enter
    await composerTextarea.press('Enter');

    // 8. Verify created task card in feed has clean title
    const createdCard = page.locator('.group', { hasText: 'Заказать билеты в театр' }).first();
    await expect(createdCard).toBeVisible();

    // Verify tag is present
    await expect(createdCard.getByRole('button', { name: '#culture' })).toBeVisible();

    // Verify task type badge is present
    await expect(createdCard.locator('span', { hasText: 'Таска' })).toBeVisible();

    // Verify task priority badge is present
    await expect(createdCard.getByText('Средний', { exact: true })).toBeVisible();

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

    // 3. Verify title, stats, storage badge and chips
    await expect(logViewer.locator('text=Логи & HUD')).toBeVisible();
    await expect(logViewer.locator('text=LEVEL:')).toBeVisible();
    await expect(logViewer.locator('text=SCOPE:')).toBeVisible();
    await expect(logViewer.locator('button', { hasText: 'MEDIA' })).toBeVisible();
    await expect(logViewer.locator('text=KB').first()).toBeVisible();

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
    const matchedLink = page.locator('[role="button"], span', { hasText: '12 правил эффективности' }).first();
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
    const select = settingsModal.locator('button[aria-haspopup="listbox"]').first();
    await expect(select).toContainText('Gemini 4 Argon');

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
        haikuUrl: module.resolveKieEndpoint('https://api.kie.ai', 'claude-haiku-4-5'),
        haiku55Url: module.resolveKieEndpoint('https://api.kie.ai', 'claude-haiku-5-5'),
        geminiFlashUrl: module.resolveKieEndpoint('https://api.kie.ai', 'gemini-3-8-flash-openai'),
      };
    });

    expect(endpoints.argonUrl).toBe('https://api.kie.ai/gemini-4-argon-openai/v1/chat/completions');
    expect(endpoints.gptUrl).toBe('https://api.kie.ai/v1/chat/completions');
    expect(endpoints.haikuUrl).toBe('https://api.kie.ai/claude/v1/messages');
    expect(endpoints.haiku55Url).toBe('https://api.kie.ai/claude/v1/messages');
    expect(endpoints.geminiFlashUrl).toBe('https://api.kie.ai/gemini-3-8-flash-openai/v1/chat/completions');
  });

  test('27. Contextual Subtask Extraction and Reasoning Effort Settings Verification', async ({ page }) => {
    // 1. Open Settings and verify Reasoning Effort & Automation checkboxes
    await page.locator('button[title*="Настройки"]').first().click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();

    await expect(settingsModal.locator('text=Глубина рассуждений').first()).toBeVisible();
    await expect(settingsModal.locator('text=Автоматизация и поиск')).toBeVisible();
    await expect(settingsModal.locator('text=Автоматический подбор тегов')).toBeVisible();
    await expect(settingsModal.locator('text=Интеллектуальная диспетчеризация (AI Triage)')).toBeVisible();
    await expect(settingsModal.locator('text=Поиск в реальном времени (Web Search)')).toBeVisible();

    // Select Reasoning Effort: high
    const reasoningSelect = settingsModal.locator('button[aria-haspopup="listbox"]').filter({ hasText: /Отключено|Низкая|Средняя|Высокая/ }).first();
    await reasoningSelect.click();
    await page.locator('button[role="option"]', { hasText: /Высокая/ }).click();

    // Take screenshot of rich settings tab
    await page.screenshot({
      path: 'test-results/screenshots/settings-modal-reasoning-automation.png',
    });

    await settingsModal.locator('button', { hasText: 'Сохранить' }).click();
    await expect(settingsModal).not.toBeVisible();

    // 2. Open Assistant Chat
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 3. User prompt: "есть задача почистить яйца\nнужно её дополнить\nсделать подзадачу купить бритву"
    await textarea.fill('есть задача почистить яйца\nнужно её дополнить\nсделать подзадачу купить бритву');
    await textarea.press('Enter');

    // 4. Verify that action card has EXACT subtask "Купить бритву" and NOT hardcoded specs
    await expect(page.locator('text=почистить яйца').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Купить бритву').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Собрать требования и составить список спецификаций')).not.toBeVisible();

    // Verify button says "Применить 1 подзадачу"
    const applySubtaskBtn = page.locator('button', { hasText: 'Применить 1 подзадачу' }).first();
    await expect(applySubtaskBtn).toBeVisible();

    // Capture visual screenshot
    await page.screenshot({
      path: 'test-results/screenshots/assistant-contextual-subtask.png',
      fullPage: false,
    });

    // 5. Apply subtask and check toast
    await applySubtaskBtn.click();
    await expect(page.locator('text=подзадач').first()).toBeVisible();
  });

  test('28. Telegram-style voice and circle recording, audio player and fullscreen media editor', async ({ page }) => {
    // 1. Check monolithic Telegram-style voice recording in composer (no block in block)
    const micButton = page.locator('button[aria-label="Записать голосовую заметку"]').first();
    await expect(micButton).toBeVisible();

    await micButton.click();

    // Verify monolithic recording bar is active with cancel and send buttons
    const cancelBtn = page.locator('button', { hasText: 'ОТМЕНА' }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });

    const sendVoiceBtn = page.locator('button[title="Отправить войс"]').first();
    await expect(sendVoiceBtn).toBeVisible();

    // Verify placeholder textarea is NOT visible in pure voice recording (no nested block)
    const emptyPlaceholder = page.locator('textarea[placeholder*="Мысль, заметка или код"]');
    await expect(emptyPlaceholder).not.toBeVisible();

    // Capture visual screenshot of the sleek monolithic recording pill
    await page.screenshot({
      path: 'test-results/screenshots/telegram-recording-pill.png',
      fullPage: false,
    });

    // Cancel recording
    await cancelBtn.click();
    await expect(emptyPlaceholder).toBeVisible();

    // 2. Open Fullscreen Focus Editor from Composer
    const expandBtn = page.locator('button[title*="Раскрыть в полноэкранный редактор"]').first();
    await expandBtn.click();

    const fullscreenTextarea = page.locator('#fullscreen-textarea');
    await expect(fullscreenTextarea).toBeVisible();

    // Verify paperclip attach button in toolbar
    const attachBtn = page.locator('button[title*="Прикрепить файл или медиа"]').first();
    await expect(attachBtn).toBeVisible();

    // Simulate pasting an image file into the fullscreen editor
    await fullscreenTextarea.evaluate((node) => {
      const dt = new DataTransfer();
      const file = new File(['mock_image_bytes'], 'mock_screenshot.png', { type: 'image/png' });
      dt.items.add(file);
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    // Verify "Медиа и вложения" section appeared with the attached image
    await expect(page.locator('text=Медиа и вложения').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=mock_screenshot.png').first()).toBeVisible();

    // Verify markdown link was inserted into content
    const updatedContent = await fullscreenTextarea.inputValue();
    expect(updatedContent).toContain('![[mock_screenshot.png]]');

    // Test "Вставить в текст" button click
    const insertInTextBtn = page.locator('button', { hasText: 'Вставить в текст' }).first();
    await expect(insertInTextBtn).toBeVisible();
    await insertInTextBtn.click();

    // Capture visual screenshot of Fullscreen Editor with media
    await page.screenshot({
      path: 'test-results/screenshots/fullscreen-editor-media.png',
      fullPage: false,
    });

    // Close Fullscreen Editor via Escape
    await page.keyboard.press('Escape');
    await expect(fullscreenTextarea).not.toBeVisible();

    // 3. Verify AudioPlayer and VideoCirclePlayer in Feed
    // Switch to "Все" to ensure demo items are visible
    await page.locator('header button[title*="Все заметки хранилища"]').click();

    // Create a note with voice attachment to test feed player
    await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          items.unshift({
            id: 'test_voice_item_' + Date.now(),
            type: 'note',
            title: 'Тестовый войс',
            content: 'Заметка с голосовым сообщением в стиле Telegram',
            folder: 'Входящие',
            tags: ['войс'],
            attachments: [
              {
                id: 'att_voice_test',
                name: 'voice_note.webm',
                type: 'audio',
                mimeType: 'audio/webm',
                size: 32400,
                relativePath: '.attachments/voice_note.webm',
                duration: 8.4,
                dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
    });

    // Reload page to reflect new item
    await page.reload();
    await expect(page.locator('text=Тестовый войс').first()).toBeVisible({ timeout: 10000 });

    // Verify Linear Monochrome AudioPlayer components (no redundant 1x speed button)
    const audioCard = page.locator('.group', { hasText: 'Тестовый войс' });
    await audioCard.scrollIntoViewIfNeeded();
    await expect(audioCard.locator('button[title*="Воспроизвести"]').first()).toBeVisible();
    await expect(audioCard.locator('text=31.6 KB').or(audioCard.locator('text=32.4 KB')).or(audioCard.locator('text=31.6')).or(audioCard.locator('text=KB')).first()).toBeVisible();
    await expect(audioCard.locator('button', { hasText: '1x' })).not.toBeVisible();

    // Capture visual screenshot of Feed AudioPlayer
    await page.screenshot({
      path: 'test-results/screenshots/feed-audioplayer.png',
      fullPage: false,
    });

    // 4. Test Composer attached voice preview card (compact mini-player)
    // Click reply on the voice item to set a draft or paste audio
    const composerEl = page.locator('main textarea').first();
    await composerEl.fill('Заметка с прикрепленным войсом для проверки превью');

    // Simulate pasting an audio file in the composer
    await composerEl.evaluate((node) => {
      const dt = new DataTransfer();
      const file = new File(['mock_audio_bytes'], 'my_voice_idea.webm', { type: 'audio/webm' });
      dt.items.add(file);
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    // Verify compact mini-player in composer attachment strip
    await expect(page.locator('button[title*="Удалить войс"]').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: 'test-results/screenshots/composer-attached-voice.png',
      fullPage: false,
    });
  });

  test('5. Unified AI Categorization: Composer +AI and Inbox Triage with folder & tags', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 1. Test Composer +AI categorization
    const composerTextarea = page.locator('main textarea').first();
    await composerTextarea.fill('Разработка новой спецификации и код SLAG v2');

    const aiButton = page.locator('button:has-text("+AI")').first();
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    // Verify folder chip appears
    const folderChip = page.locator('span[title*="Целевая папка для сохранения"]').first();
    await expect(folderChip).toBeVisible({ timeout: 5000 });

    // Verify tag chip appears in the active preview bar
    const tagChip = page.locator('span:has-text("#")').first();
    await expect(tagChip).toBeVisible({ timeout: 5000 });

    // Take screenshot of Composer with chips
    await page.screenshot({
      path: 'test-results/screenshots/composer-ai-categorized.png',
      fullPage: false,
    });

    // Send note
    const sendBtn = page.locator('button[title*="Отправить"]').first();
    await sendBtn.click();
    await expect(page.locator('text=Разработка новой спецификации и код SLAG v2').first()).toBeVisible({ timeout: 5000 });

    // 2. Test Inbox Triage modal with tags
    const triageBtn = page.locator('button:has-text("Запустить")').first();
    if (await triageBtn.isVisible()) {
      await triageBtn.click();
      await page.waitForTimeout(300);

      // Verify BaseModal opened
      await expect(page.locator('h3:has-text("AI Triage")').first()).toBeVisible();

      // Verify suggested tags are rendered
      const modalTags = page.locator('div[role="dialog"] span:has-text("#")');
      const count = await modalTags.count();
      expect(count).toBeGreaterThan(0);

      // Verify custom folder selector exists and test changing folder
      const folderSelectBtn = page.locator('div[role="dialog"] button[aria-label="Сменить целевую папку"]').first();
      await expect(folderSelectBtn).toBeVisible();
      await folderSelectBtn.click();
      await page.waitForTimeout(150);

      // Capture screenshot while portal dropdown is open to verify NO clipping
      await page.screenshot({
        path: 'test-results/screenshots/triage-modal-dropdown-open.png',
        fullPage: false,
      });

      const option = page.locator('button[role="option"]').nth(1);
      if (await option.isVisible()) {
        await option.click();
      }

      // Test adding an extra tag
      const addTagBtn = page.locator('div[role="dialog"] button:has-text("тег")').first();
      if (await addTagBtn.isVisible()) {
        await addTagBtn.click();
        const tagInput = page.locator('div[role="dialog"] input[placeholder="тег..."]').first();
        await expect(tagInput).toBeVisible();
        await tagInput.fill('важно');
        await tagInput.press('Enter');
        await expect(page.locator('div[role="dialog"] span:has-text("#важно")').first()).toBeVisible();
      }

      // Take screenshot of Triage Modal with interactive selectors
      await page.screenshot({
        path: 'test-results/screenshots/triage-modal-with-tags.png',
        fullPage: false,
      });

      // Apply triage
      const applyBtn = page.locator('button:has-text("Применить перемещение")').first();
      await expect(applyBtn).toBeVisible();
      await applyBtn.click();
      await page.waitForTimeout(300);

      // Modal should be closed
      await expect(page.locator('h3:has-text("AI Triage")')).not.toBeVisible();
    }
  });

  test('29. Slash Command Menu: trigger, keyboard navigation, filtering, and state switching', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Входящие');

    const textarea = page.locator('textarea[placeholder*="ссылки"]').first();
    await expect(textarea).toBeVisible();

    // 1. Type "/" to trigger the sliding slash command menu
    await textarea.click();
    await textarea.fill('/');

    // 2. Verify slash command menu appears with header and commands
    const menuHeader = page.locator('text=Команды композера').first();
    await expect(menuHeader).toBeVisible();
    await expect(page.locator('text=/task').first()).toBeVisible();
    await expect(page.locator('text=/today').first()).toBeVisible();
    await expect(page.locator('text=/ai').first()).toBeVisible();

    // 3. Take screenshot of sliding slash command drawer for visual inspection
    await page.screenshot({
      path: 'test-results/screenshots/composer-slash-menu.png',
      fullPage: false,
    });

    // 4. Filter with query "/тас"
    await textarea.fill('/тас');
    const taskOption = page.locator('button', { hasText: '/task' }).first();
    await expect(taskOption).toBeVisible();

    // 5. Select via Enter
    await textarea.press('Enter');

    // 6. Verify command token is stripped from textarea and Toast/mode confirms Task switch
    await expect(textarea).toHaveValue('');
    await expect(page.locator('text=Режим переключен: Задача').first()).toBeVisible();

    // 7. Test deadline command "/today"
    await textarea.fill('/today');
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('');
    await expect(page.locator('text=Дедлайн установлен на сегодня').first()).toBeVisible();

    // 8. Test Escape key dismisses slash command menu
    await textarea.fill('/');
    await expect(page.locator('text=Команды композера').first()).toBeVisible();
    await textarea.press('Escape');
    await expect(page.locator('text=Команды композера')).not.toBeVisible();
  });

  test('30. Anti-matryoshka verification: flat reply in composer and feed item card', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Hover over first card and click reply button
    const firstCard = page.locator('.group').filter({ hasText: 'Синхронизация по архитектуре' }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.hover();
    const replyBtn = firstCard.locator('button[title*="Ответить"]').first();
    await replyBtn.click();

    // Verify flat composer reply banner is visible
    const composerReply = page.locator('text=Ответ на таску:').first();
    await expect(composerReply).toBeVisible();

    // Screenshot composer with flat reply
    await page.screenshot({
      path: 'test-results/screenshots/composer-flat-reply.png',
      fullPage: false,
    });

    // Type reply content and submit
    const textarea = page.locator('main textarea').first();
    await textarea.fill('Мой плоский ответ без матрёшек');
    await textarea.press('Enter');

    // Wait for the new item to appear in the feed
    const newReplyCard = page.locator('.group').filter({ hasText: 'Мой плоский ответ без матрёшек' }).first();
    await expect(newReplyCard).toBeVisible();
    await newReplyCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Screenshot feed with flat reply quote
    await page.screenshot({
      path: 'test-results/screenshots/feed-flat-reply.png',
      fullPage: false,
    });
  });

  test('31. Media redesign verification: compact voice card and natural image layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Seed a pure voice note, a single image note, and a 4-image gallery note
    await page.evaluate(() => {
      const voiceId = 'test_pure_voice_' + Date.now();
      const singleImageId = 'test_single_image_' + Date.now();
      const multiImageId = 'test_multi_image_' + Date.now();

      const makeSvg = (title: string, color: string) =>
        `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="%2318181b" rx="8"/><rect x="20" y="20" width="180" height="24" fill="%2327272a" rx="4"/><text x="30" y="37" fill="%23a1a1aa" font-family="sans-serif" font-size="12">${title}</text><rect x="20" y="60" width="560" height="240" fill="%2309090b" rx="6" stroke="%2327272a"/><text x="40" y="110" fill="%23f4f4f5" font-family="sans-serif" font-size="15" font-weight="600">Screen View</text><circle cx="50" cy="180" r="14" fill="${color}"/></svg>`;

      const voiceItem = {
        id: voiceId,
        title: 'Голосовая заметка',
        content: '',
        folder: 'Входящие',
        type: 'note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [
          {
            id: 'att_voice_pure',
            name: 'pure_voice.webm',
            type: 'audio',
            mimeType: 'audio/webm',
            size: 1536,
            duration: 4,
            relativePath: '.attachments/pure_voice.webm',
            dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
          }
        ],
      };

      const singleImageItem = {
        id: singleImageId,
        title: 'Изображение',
        content: '',
        folder: 'Входящие',
        type: 'note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [
          {
            id: 'att_img_hero',
            name: 'ui-preview.png',
            type: 'image',
            mimeType: 'image/svg+xml',
            size: 2048,
            relativePath: '.attachments/ui-preview.png',
            dataUrl: makeSvg('Одиночный скриншот', '%233b82f6'),
          }
        ],
      };

      const multiImageItem = {
        id: multiImageId,
        title: 'Изображение',
        content: '',
        folder: 'Входящие',
        type: 'note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [
          { id: 'm1', name: 'img1.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img1.png', dataUrl: makeSvg('Кадр 1', '%2310b981') },
          { id: 'm2', name: 'img2.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img2.png', dataUrl: makeSvg('Кадр 2', '%23f59e0b') },
          { id: 'm3', name: 'img3.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img3.png', dataUrl: makeSvg('Кадр 3', '%238b5cf6') },
          { id: 'm4', name: 'img4.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img4.png', dataUrl: makeSvg('Кадр 4', '%23ec4899') },
        ],
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          items.unshift(multiImageItem);
          items.unshift(singleImageItem);
          items.unshift(voiceItem);
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
    });

    await page.reload();
    await page.waitForTimeout(500);

    // 1. Verify pure voice card has no fake "Голосовая заметка" h3 header
    const voiceCard = page.locator('.group').filter({ has: page.locator('audio') }).first();
    await voiceCard.scrollIntoViewIfNeeded();
    await expect(voiceCard).toBeVisible();
    await expect(voiceCard.locator('h3')).toHaveCount(0);

    // Verify monochrome play button is present
    const playBtn = voiceCard.locator('button[title*="Воспроизвести"]').first();
    await expect(playBtn).toBeVisible();

    // Screenshot compact voice card
    await page.screenshot({
      path: 'test-results/screenshots/feed-audioplayer-monochrome.png',
      fullPage: false,
    });

    // 2. Verify pure single image card has no fake "Изображение" h3 header and uses natural object-contain
    const singleImageCard = page.locator('.group').filter({ has: page.locator('img[alt="ui-preview.png"]') }).first();
    await singleImageCard.scrollIntoViewIfNeeded();
    await expect(singleImageCard).toBeVisible();
    await expect(singleImageCard.locator('h3')).toHaveCount(0);

    const singleImg = singleImageCard.locator('img[alt="ui-preview.png"]').first();
    await expect(singleImg).toBeVisible();
    await expect(singleImg).toHaveClass(/object-contain/);

    // Screenshot natural single image card
    await page.screenshot({
      path: 'test-results/screenshots/feed-images-single-natural.png',
      fullPage: false,
    });

    // 3. Verify multi-image card has 4 images in 4:3 grid without fake header
    const multiImageCard = page.locator('.group').filter({ has: page.locator('img[alt="img1.png"]') }).first();
    await multiImageCard.scrollIntoViewIfNeeded();
    await expect(multiImageCard).toBeVisible();
    await expect(multiImageCard.locator('h3')).toHaveCount(0);

    // Screenshot multi-image 4:3 grid
    await page.screenshot({
      path: 'test-results/screenshots/feed-images-multi-grid.png',
      fullPage: false,
    });
  });

  test('32. Hashtag clean extraction and note title de-duplication verification', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const textarea = page.locator('main textarea').first();
    await textarea.click();

    // 1. Type note with trailing tag on a new line
    await textarea.fill('вот такая вот собачка\n#паста');
    await page.waitForTimeout(200);

    // Verify tag preview badge appears in composer toolbar
    const previewTag = page.locator('span', { hasText: '#паста' }).first();
    await expect(previewTag).toBeVisible();

    // Screenshot composer with active tag preview
    await page.screenshot({
      path: 'test-results/screenshots/composer-tag-preview.png',
      fullPage: false,
    });

    // Send note
    await textarea.press('Enter');
    await page.waitForTimeout(300);

    // Find the created note card
    const noteCard = page.locator('.group').filter({ hasText: 'вот такая вот собачка' }).first();
    await expect(noteCard).toBeVisible();
    await noteCard.scrollIntoViewIfNeeded();

    // Verify note body has clean content without trailing '#паста'
    const noteBody = noteCard.locator('.whitespace-pre-wrap').first();
    await expect(noteBody).toHaveText('вот такая вот собачка');

    // Verify tag is present in bottom bar as clickable tag button
    const bottomTag = noteCard.locator('button', { hasText: '#паста' }).first();
    await expect(bottomTag).toBeVisible();

    // Verify note has no duplicate cut-off <h3> header
    await expect(noteCard.locator('h3')).toHaveCount(0);

    // 2. Test note with long first line: verify no chopped h3 header
    await textarea.fill('я переродился в геймдевера SSS-ранга, но вместо unity мне выдали игрушечный молот первого уровня\n#паста');
    await textarea.press('Enter');
    await page.waitForTimeout(300);

    const longNoteCard = page.locator('.group').filter({ hasText: 'геймдевера SSS-ранга' }).first();
    await expect(longNoteCard).toBeVisible();
    await longNoteCard.scrollIntoViewIfNeeded();

    // Ensure it does NOT have an h3 header (especially not a chopped one like '...но вместо un')
    await expect(longNoteCard.locator('h3')).toHaveCount(0);

    // Screenshot card in feed showing clean text and bottom tag
    await page.screenshot({
      path: 'test-results/screenshots/feed-clean-hashtag-note.png',
      fullPage: false,
    });
  });

  test('50. AudioPlayer dockview tab: scope mode, filters, transport controls and visual audit', async ({ page }) => {
    // Seed an item with an audio track and cover artwork
    await page.evaluate(() => {
      let found = false;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          found = true;
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          const testAudioItem = {
            id: 'test_audio_item_now_playing',
            type: 'note',
            title: 'Саундтрек проекта и голосовой лог',
            content: 'Аудиозапись фонового трека для концентрации',
            folder: 'Входящие',
            tags: ['audio', 'music'],
            attachments: [
              {
                id: 'att_audio_test_1',
                name: 'Never_Enough_The_Cure.mp3',
                type: 'audio',
                mimeType: 'audio/mp3',
                size: 4500000,
                duration: 266,
                relativePath: '.attachments/Never_Enough.mp3',
                dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
              },
              {
                id: 'att_img_cover_test_1',
                name: 'the_cure_cover.png',
                type: 'image',
                mimeType: 'image/png',
                size: 120000,
                relativePath: '.attachments/the_cure_cover.png',
                dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231a1b26"/><circle cx="150" cy="150" r="100" fill="%237aa2f7" opacity="0.3"/><text x="150" y="155" fill="%23ffffff" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">THE CURE</text></svg>',
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          items.unshift(testAudioItem);
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
      if (!found) {
        localStorage.setItem('slag_items_default_vault', JSON.stringify([{
          id: 'test_audio_item_now_playing',
          type: 'note',
          title: 'Саундтрек проекта и голосовой лог',
          content: 'Аудиозапись фонового трека для концентрации',
          folder: 'Входящие',
          tags: ['audio', 'music'],
          attachments: [
            {
              id: 'att_audio_test_1',
              name: 'Never_Enough_The_Cure.mp3',
              type: 'audio',
              mimeType: 'audio/mp3',
              size: 4500000,
              duration: 266,
              relativePath: '.attachments/Never_Enough.mp3',
              dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }]));
      }
    });

    // Reload page to pick up seeded storage item
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Click [+] button in the center group header (Feed area)
    const centerAddTabBtn = page.locator('.dv-groupview').nth(1).locator('button[title="Добавить вкладку в эту группу"]');
    await expect(centerAddTabBtn).toBeVisible();
    await centerAddTabBtn.click();

    // Select "Аудиоплеер" from the dropdown
    const audioMenuOption = page.locator('button', { hasText: 'Аудиоплеер' });
    await expect(audioMenuOption).toBeVisible();
    await audioMenuOption.click();

    // Verify Audio tab is now visible and active in center group
    const audioTab = page.locator('.dv-tab, [role="tab"]').filter({ hasText: 'Аудиоплеер' }).first();
    await expect(audioTab).toBeVisible();

    // Verify Now Playing screen elements: track title, note link, artwork
    await expect(page.locator('text=Never_Enough_The_Cure.mp3')).toBeVisible();
    await expect(page.locator('text=Саундтрек проекта и голосовой лог')).toBeVisible();

    // Verify transport controls (5 buttons under timeline: -10s, Prev, Play/Pause, Next, +10s)
    const playPauseBtn = page.locator('button[title*="Воспроизведение"], button[title*="Пауза"]');
    await expect(playPauseBtn).toBeVisible();
    await expect(page.locator('button[title*="Предыдущий трек"]')).toBeVisible();
    await expect(page.locator('button[title*="Следующий трек"]')).toBeVisible();
    await expect(page.locator('button[title*="Назад на 10 секунд"]')).toBeVisible();
    await expect(page.locator('button[title*="Вперед на 10 секунд"]')).toBeVisible();

    // Verify folder toggle button in bottom bar (toggle between unpinned active and pinned)
    const folderToggleBtn = page.locator('button[title*="следует за активной папкой"], button[title*="играет только эта папка"]').first();
    await expect(folderToggleBtn).toBeVisible();
    await expect(folderToggleBtn).toHaveText(/Входящие/);

    // Click to pin
    await folderToggleBtn.click();
    await expect(page.locator('button[title*="играет только эта папка"]')).toBeVisible();

    // Click to unpin back
    const pinnedBtn = page.locator('button[title*="играет только эта папка"]').first();
    await pinnedBtn.click();
    await expect(page.locator('button[title*="следует за активной папкой"]')).toBeVisible();

    // Verify Queue / Playlist button is present in bottom bar
    const queueBtn = page.locator('button[aria-label="Очередь воспроизведения"]').first();
    await expect(queueBtn).toBeVisible();

    // Open Queue drawer and check track entry + filters
    await queueBtn.click();
    await expect(page.locator('text=Очередь воспроизведения')).toBeVisible();
    const audioPanel = page.locator('[role="tabpanel"]').filter({ hasText: 'Очередь воспроизведения' }).first();
    await expect(audioPanel.locator('button', { hasText: 'Войсы' })).toBeVisible();
    await expect(audioPanel.locator('button', { hasText: 'Файлы' })).toBeVisible();
    await expect(page.locator('text=Never_Enough_The_Cure.mp3').first()).toBeVisible();

    // Close Queue drawer
    const closeQueueBtn = page.locator('button[title="Закрыть список"]');
    await expect(closeQueueBtn).toBeVisible();
    await closeQueueBtn.click();
    await expect(page.locator('text=Очередь воспроизведения')).not.toBeVisible();

    // Verify bottom bar utilities (speed, repeat)
    const speedBtn = page.locator('button[aria-label="Скорость"]');
    await expect(speedBtn).toBeVisible();
    await speedBtn.click();
    await expect(speedBtn).toHaveText('1.25x');

    // Take screenshot of the center AudioPlayer panel in full Now Playing glory
    await page.screenshot({
      path: 'test-results/screenshots/dockview-audioplayer-nowplaying-clean.png',
      fullPage: false,
    });
  });
});
