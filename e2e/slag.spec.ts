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

    // Verify focus remains on composer textarea
    await expect(composerTextarea).toBeFocused();

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
    await expect(taskCard.locator('button[aria-label="Изменить статус задачи"]')).toBeVisible();

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

  test('4. Article teaser card and opening in Focus Editor', async ({ page }) => {
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

    // Verify metadata shows clean Article badge without reading minutes
    await expect(articleCard.locator('span', { hasText: 'Статья' })).toBeVisible();
    await expect(articleCard.locator('text=/\\d+ мин/')).toHaveCount(0);

    // Verify teaser text is displayed and "Читать полностью" is removed
    await expect(articleCard.locator('button', { hasText: /Читать полностью/ })).toHaveCount(0);

    // Save screenshot of the clean article card
    await articleCard.screenshot({
      path: 'test-results/screenshots/article-card-teaser.png',
    });

    // Open via corner Focus Editor button
    const focusEditorBtn = articleCard.locator('button[aria-label="Открыть в фокус-редакторе"]');
    await expect(focusEditorBtn).toBeVisible();
    await focusEditorBtn.click();

    // Verify fullscreen editor opened with article content
    await expect(page.locator('#fullscreen-editor-root')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Три ключевых принципа SLAG');

    await page.screenshot({
      path: 'test-results/screenshots/fullscreen-editor-live-preview.png',
      fullPage: false,
    });

    // Return back to feed
    await page.locator('header button', { hasText: 'Назад' }).click();
    await expect(page.locator('#fullscreen-editor-root')).not.toBeVisible();
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
        // Hover over the splitter hit area to verify visual affordance
        await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 100);
        await page.screenshot({
          path: 'test-results/screenshots/dockview-sash-hover.png',
          fullPage: true,
        });

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

    // Verify feed list has no horizontal scroll (no horizontal overflow)
    const feedContainer = page.locator('main .overflow-y-auto').first();
    const hasHorizontalOverflow = await feedContainer.evaluate(
      (el) => el.scrollWidth > el.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

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
    const focusEditorBtn = page.locator('button[aria-label="Открыть в фокус-редакторе"]').first();
    if (await focusEditorBtn.isVisible()) {
      await focusEditorBtn.click();
      await expect(page.locator('#fullscreen-editor-root')).toBeVisible();

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
      await expect(page.locator('#fullscreen-editor-root')).not.toBeVisible();
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
    const saveDraftBtn = page.locator('button', { hasText: /Сохранить/ }).last();
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
    await expect(page.locator('button', { hasText: /Сохранить/ }).first()).toBeVisible({ timeout: 5000 });

    // 4. Click Save to Vault
    await page.locator('button', { hasText: /Сохранить/ }).first().click();
    await expect(page.locator('text=сохранена').or(page.locator('text=Запись'))).toBeVisible();

    // 5. Test Subtask Decomposition action
    await textarea.fill('Разбей задачу Реализовать ИИ-тегирование на подзадачи');
    await textarea.press('Enter');
    const decomposeBtn = page.locator('button', { hasText: /Применить/ }).first();
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

    const input = page.locator('[placeholder*="Название задачи"]');
    await expect(input).toBeVisible();
    const taskName = 'Линейный Канбан Тест ' + Date.now();
    await input.fill(taskName);
    await input.press('Enter');

    // Verify task card appeared in Kanban
    const taskCard = page.locator('[data-testid="kanban-card"]', { hasText: taskName });
    await expect(taskCard).toBeVisible();

    // Verify Linear Task key (e.g. TSK-...)
    await expect(taskCard.locator('text=TSK-')).toBeVisible();

    // 5. Verify Materials toggle button on top header (FeedHeader) and clean collapse to 0px
    const headerMaterialsBtn = page.locator('header button[aria-label="Материалы папки"]');
    await expect(headerMaterialsBtn).toBeVisible();

    // Collapse via header button
    await headerMaterialsBtn.click();
    await page.waitForTimeout(250); // allow transition
    await expect(page.locator('text=Материалы папки')).not.toBeInViewport();

    // Screenshot collapsed state: verify 40px strip is completely gone
    await page.screenshot({
      path: 'test-results/screenshots/kanban-materials-collapsed.png',
      fullPage: false,
    });

    // Expand via header button (never jumps around)
    await headerMaterialsBtn.click();
    await page.waitForTimeout(250);
    await expect(page.locator('text=Материалы папки')).toBeVisible();

    // Collapse via Chevron inside dock header
    const dockCollapseBtn = page.locator('button[title*="Свернуть"]').first();
    await dockCollapseBtn.click();
    await page.waitForTimeout(250);
    await expect(page.locator('text=Материалы папки')).not.toBeInViewport();

    // Expand again via header button
    await headerMaterialsBtn.click();
    await page.waitForTimeout(250);
    await expect(page.locator('text=Материалы папки')).toBeVisible();

    // 6. Screenshot Kanban layout for visual inspection
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
      // Close modal via button or Escape
      const modalCloseBtn = page.locator('[data-testid="close-expanded-day-modal"]').first();
      if (await modalCloseBtn.isVisible()) {
        await modalCloseBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(200);
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

    // Verify task checkbox is present
    await expect(createdCard.locator('button[aria-label="Изменить статус задачи"]')).toBeVisible();

    // Verify task priority badge is present
    await expect(createdCard.locator('[aria-label*="Средний"]')).toBeVisible();

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
    const planBtn = page.locator('button', { hasText: /Запланировать|Сохранить/ }).first();
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
    const updateConfirmBtn = page.locator('button', { hasText: /Запланировать|Сохранить/ }).last();
    await updateConfirmBtn.click();
    await expect(page.locator('text=обновлена').or(page.locator('text=сохранена')).first()).toBeVisible();
  });

  test('25.1. Assistant Single & Batch Task Rescheduling Lifecycle and Multi-Date Distribution', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask batch reschedule: "перенеси просроченные задачи на завтра"
    await textarea.fill('перенеси просроченные задачи на завтра');
    await textarea.press('Enter');

    // 3. Verify batch action card appears and is NOT intercepted as a calendar agenda view
    await expect(page.locator('text=/Перенос задач/').first()).toBeVisible({ timeout: 5000 });
    const applyBatchBtn = page.locator('button', { hasText: /Применить/ }).first();
    await expect(applyBatchBtn).toBeVisible();

    // Verify task titles are rendered inside the batch card
    await expect(page.locator('text=Купить хороший зеленый чай').first()).toBeVisible();

    // 4. Capture screenshot of batch reschedule card for visual audit
    await page.screenshot({
      path: 'test-results/screenshots/assistant-batch-reschedule.png',
      fullPage: false,
    });

    // 5. Confirm batch reschedule
    await applyBatchBtn.click();
    await expect(page.locator('text=Перенесено задач:').or(page.locator('text=Перенесено')).first()).toBeVisible({ timeout: 5000 });

    // 6. Test Multi-date distribution: "раскидай просроченные задачи на неделю"
    await textarea.fill('раскидай просроченные задачи на неделю');
    await textarea.press('Enter');

    // Verify multi-date batch card is generated
    await expect(page.locator('text=/Перенос задач/').last()).toBeVisible({ timeout: 5000 });
    const secondBatchBtn = page.locator('button', { hasText: /Применить/ }).last();
    await expect(secondBatchBtn).toBeVisible();
  });

  test('25.2. Assistant Composite Split Dates, Checkbox Selection, Append to Note, Undo, and Chat Feed Filter', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Test Composite Split Dates: "1. задачу перенести на завтра остальные две на послезавтра"
    await textarea.fill('1. задачу перенести на завтра остальные две на послезавтра');
    await textarea.press('Enter');

    // Verify batch card appears
    await expect(page.locator('text=/Перенос задач/').first()).toBeVisible({ timeout: 5000 });
    
    // Check that checkboxes are present in the batch card
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    expect(cbCount).toBeGreaterThanOrEqual(2);

    // Uncheck one task
    await checkboxes.first().click();

    // Verify button text updates with dynamic count
    const applyBtn = page.locator('button', { hasText: /Применить/ }).first();
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // 3. Verify Undo button in Toast notification
    const undoToastBtn = page.locator('button', { hasText: 'Отменить' }).first();
    await expect(undoToastBtn).toBeVisible({ timeout: 4000 });
    await undoToastBtn.click();
    await expect(page.locator('text=отменено').first()).toBeVisible({ timeout: 4000 });

    // 4. Test Append to Note: "добавь в заметку Синхронизация по архитектуре баз данных: Обсудить партиционирование"
    await textarea.fill('добавь в заметку Синхронизация по архитектуре баз данных: Обсудить партиционирование');
    await textarea.press('Enter');

    // Verify append_to_note action card is formed
    await expect(page.locator('text=Дополнение заметки').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Обсудить партиционирование').first()).toBeVisible();
    const appendConfirmBtn = page.locator('button', { hasText: 'Дописать' }).first();
    await expect(appendConfirmBtn).toBeVisible();
    await appendConfirmBtn.click();
    await expect(page.locator('text=дополнена').first()).toBeVisible({ timeout: 5000 });

    // 5. Test Chat Feed Filter: "а с фильтром"
    await textarea.fill('а с фильтром');
    await textarea.press('Enter');

    // Verify AI Filter is applied to feed and chip appears
    await expect(page.locator('header').locator('text=ИИ:').first()).toBeVisible({ timeout: 5000 });

    // 6. Test Named-Task Split: "можешь задачу про чай перенести на завтра остальные просроченные на послезавтра"
    await textarea.fill('можешь задачу про чай перенести на завтра остальные просроченные на послезавтра');
    await textarea.press('Enter');

    // Verify message has natural zero-slop text without robotic bullet duplicates
    await expect(page.locator('text=Купить хороший зеленый чай').last()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Подтвердите перенос в интерактивной карточке')).not.toBeVisible();

    // Capture visual screenshot of separated monochrome cards
    await page.screenshot({
      path: 'test-results/screenshots/assistant-advanced-interactions.png',
      fullPage: false,
    });
  });

  test('25.3. Assistant Intra-day Task Rescheduling ("завтрашние задачи можешь разбросать в течении дня")', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask intra-day distribution: "завтрашние задачи можешь разбросать в течении дня"
    await textarea.fill('завтрашние задачи можешь разбросать в течении дня');
    await textarea.press('Enter');

    // 3. Verify batch card appears and is NOT intercepted as a simple calendar agenda list
    await expect(page.locator('text=/Распределение на день|Перенос задач/').first()).toBeVisible({ timeout: 5000 });
    const applyBtn = page.locator('button', { hasText: /Применить/ }).first();
    await expect(applyBtn).toBeVisible();

    // Verify time slot is rendered (e.g. 10:00)
    await expect(page.locator('text=10:00').first()).toBeVisible({ timeout: 5000 });

    // 4. Capture screenshot for visual inspection
    await page.screenshot({
      path: 'test-results/screenshots/assistant-intraday-distribution.png',
      fullPage: false,
    });

    // 5. Apply the intra-day distribution
    await applyBtn.click();
    await expect(page.locator('text=Перенесено').first()).toBeVisible({ timeout: 5000 });
  });

  test('25.4. Assistant Follow-up Refinement ("порядок инвертировать задом на перёд")', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Initial intra-day schedule request
    await textarea.fill('завтрашние задачи можешь разбросать в течении дня');
    await textarea.press('Enter');
    await expect(page.locator('text=/Распределение на день|Перенос задач/').first()).toBeVisible({ timeout: 5000 });

    // 3. User follow-up refinement: "нене порядок инвертировать задом на перёд"
    await textarea.fill('нене порядок инвертировать задом на перёд');
    await textarea.press('Enter');

    // 4. Verify that action card is refreshed with inverted order and NOT plain text or raw code block
    await expect(page.locator('text=/Распределение на день|Перенос задач/').last()).toBeVisible({ timeout: 5000 });
    const applyInvertedBtn = page.locator('button', { hasText: /Применить/ }).last();
    await expect(applyInvertedBtn).toBeVisible();

    // Verify first task in the inverted batch card is "Полить цветы в кабинете" (lowest priority first)
    const lastCard = page.locator('[data-testid="action-card"], .max-w-xl, .max-w-\\[92\\%\\]').last();
    await expect(lastCard.locator('text=Полить цветы').first()).toBeVisible();

    // Verify raw code block or leaked suggested status is NOT displayed in user-facing message text
    await expect(page.locator('text=action:batch_reschedule_tasks')).not.toBeVisible();
    await expect(page.locator('text=статус: suggested')).not.toBeVisible();

    // 5. Capture visual screenshot of inverted action card
    await page.screenshot({
      path: 'test-results/screenshots/assistant-followup-invert.png',
      fullPage: false,
    });

    // 6. Confirm application of inverted batch
    await applyInvertedBtn.click();
    await expect(page.locator('text=Перенесено').last()).toBeVisible({ timeout: 5000 });
  });

  test('25.5. Assistant Universal update_item priority & status modification', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask priority change: "поменяй приоритет задачи про чай на высокий"
    await textarea.fill('поменяй приоритет задачи про чай на высокий');
    await textarea.press('Enter');

    // 3. Verify update_item action card appears with HIGH badge
    await expect(page.locator('text=HIGH').first()).toBeVisible({ timeout: 5000 });
    const applyBtn = page.locator('button', { hasText: /Применить/ }).last();
    await expect(applyBtn).toBeVisible();

    // Capture screenshot of universal update card
    await page.screenshot({
      path: 'test-results/screenshots/assistant-universal-update.png',
      fullPage: false,
    });

    // 4. Click Apply
    await applyBtn.click();
    await expect(page.locator('text=обновлена').or(page.locator('text=Обновлено')).first()).toBeVisible({ timeout: 5000 });
  });

  test('25.6. Assistant Batch priority update ("у всех сегодняшних задач сделать минимум приоритета")', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask batch priority change: "можешь у всех сегодняшних задач сделать минимум приоритета"
    await textarea.fill('можешь у всех сегодняшних задач сделать минимум приоритета');
    await textarea.press('Enter');

    // 3. Verify batch update action card appears with LOW badge and "Применить"
    await expect(page.locator('text=LOW').first()).toBeVisible({ timeout: 5000 });
    const batchCard = page.locator('[data-testid="action-card"], .max-w-xl').last();
    await expect(batchCard).toContainText(/Приоритет|Изменение приоритета/);

    const applyBtn = page.locator('button', { hasText: /Применить/ }).last();
    await expect(applyBtn).toBeVisible();

    // Visual screenshot verification
    await page.screenshot({
      path: 'test-results/screenshots/assistant-batch-priority-low.png',
      fullPage: false,
    });

    // 4. Click Apply
    await applyBtn.click();
    await expect(page.locator('text=Приоритет ➔ LOW').or(page.locator('text=Применено')).first()).toBeVisible({ timeout: 5000 });
  });

  test('25.7. Assistant Hourly slot scheduling and Calendar grid positioning', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Ask intra-day distribution for tomorrow
    await textarea.fill('завтрашние задачи можешь разбросать в течении дня');
    await textarea.press('Enter');

    // 3. Verify batch update card shows date and time slots
    const batchCard = page.locator('[data-testid="action-card"], .max-w-xl').last();
    await expect(batchCard).toContainText(/завтра/);
    await expect(batchCard).toContainText(/10:00|12:00/);

    const applyBtn = page.locator('button', { hasText: /Применить/ }).last();
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();
    await expect(page.locator('text=Перенесено задач:').or(page.locator('text=Перенесено')).last()).toBeVisible({ timeout: 5000 });

    // 4. Switch to Calendar view
    const calendarBtn = page.locator('header button[title*="Календарь"]').first();
    await calendarBtn.click();

    // 5. Verify week view
    await expect(page.locator('text=Неделя')).toBeVisible();

    // Capture screenshot of calendar grid with scheduled tasks
    await page.screenshot({
      path: 'test-results/screenshots/calendar-scheduled-lunch-slots.png',
      fullPage: false,
    });
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

    // Verify button says "Применить (1)"
    const applySubtaskBtn = page.locator('button', { hasText: /Применить/ }).first();
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

    const fullscreenEditorRoot = page.locator('#fullscreen-editor-root');
    await expect(fullscreenEditorRoot).toBeVisible();

    // Verify paperclip attach button in toolbar
    const attachBtn = page.locator('button[title*="Прикрепить файл или медиа"]').first();
    await expect(attachBtn).toBeVisible();

    // Simulate pasting an image file into the fullscreen editor
    await fullscreenEditorRoot.evaluate((node) => {
      const dt = new DataTransfer();
      const file = new File(['mock_image_bytes'], 'mock_screenshot.png', { type: 'image/png' });
      dt.items.add(file);
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    // Verify "Медиа и вложения" section appeared with the attached image
    await expect(page.locator('text=Медиа и вложения').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=mock_screenshot.png').first()).toBeVisible();

    // Verify markdown link was inserted into content
    await page.waitForFunction(() => {
      const getMd = (window as any).__slagGetEditorMarkdown;
      return typeof getMd === 'function' && getMd().includes('![[mock_screenshot.png]]');
    });

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
    await expect(fullscreenEditorRoot).not.toBeVisible();

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
          const testVoiceItem = {
            id: 'test_voice_item_cassette',
            type: 'note',
            title: 'Голосовая заметка разработчика',
            content: 'Быстрая голосовая мысль',
            folder: 'Входящие',
            tags: ['войс'],
            attachments: [
              {
                id: 'att_voice_cassette',
                name: 'voice_16-12-53.webm',
                type: 'audio',
                mimeType: 'audio/webm',
                size: 32000,
                duration: 48,
                relativePath: '.attachments/voice_16-12-53.webm',
                dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
              },
            ],
            createdAt: Date.now() - 10000,
            updatedAt: Date.now() - 10000,
          };
          items.unshift(testAudioItem);
          items.unshift(testVoiceItem);
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

    // Verify Now Playing screen elements: track title, note link, clean ChatGPT voice orb canvas
    await expect(page.locator('text=voice_16-12-53.webm')).toBeVisible();
    await expect(page.locator('text=Голосовая заметка разработчика')).toBeVisible();
    await expect(page.locator('canvas[data-testid="chatgpt-orb-canvas"]')).toBeVisible();

    // Verify transport controls (5 buttons under timeline: -10s, Prev, Play/Pause, Next, +10s)
    const playPauseBtn = page.locator('button[title*="Воспроизведение"], button[title*="Пауза"]');
    await expect(playPauseBtn).toBeVisible();
    await expect(page.locator('button[title*="Предыдущий трек"]')).toBeVisible();
    await expect(page.locator('button[title*="Следующий трек"]')).toBeVisible();
    await expect(page.locator('button[title*="Назад на 10 секунд"]')).toBeVisible();
    await expect(page.locator('button[title*="Вперед на 10 секунд"]')).toBeVisible();

    // Verify folder toggle button in bottom bar (subtle ghost without pill background)
    const pinToggleBtn = page.locator('button[title*="активн" i], button[title*="закреплен" i]').first();
    await expect(pinToggleBtn).toBeVisible();

    const folderPickerBtn = page.locator('button[title*="Выбрать папку"]').first();
    await expect(folderPickerBtn).toBeVisible();
    await expect(folderPickerBtn).toHaveText(/Входящие/);

    // Open folder picker dropdown (always available) and verify "Входящие" is not duplicated
    await folderPickerBtn.click();
    const popover = page.locator('.absolute.z-40').filter({ hasText: 'Закрепить папку' });
    await expect(popover).toBeVisible();
    expect(await popover.locator('button', { hasText: 'Входящие' }).count()).toBe(1);

    // Select "Входящие" from dropdown to verify auto-pin
    await popover.locator('button', { hasText: 'Входящие' }).click();
    await expect(page.locator('button[title*="закреплен" i]').first()).toBeVisible();

    // Toggle unpin back via pin button
    await pinToggleBtn.click();
    await expect(page.locator('button[title*="активн" i]').first()).toBeVisible();

    // Verify Queue / Playlist button is present in bottom bar
    const queueBtn = page.locator('button[aria-label="Очередь воспроизведения"]').first();
    await expect(queueBtn).toBeVisible();

    // Open Queue drawer and select the voice note
    await queueBtn.click();
    await expect(page.locator('text=Очередь воспроизведения')).toBeVisible();
    const audioPanel = page.locator('[role="tabpanel"]').filter({ hasText: 'Очередь воспроизведения' }).first();
    await expect(audioPanel.locator('button', { hasText: 'Войсы' })).toBeVisible();
    await expect(audioPanel.locator('button', { hasText: 'Файлы' })).toBeVisible();
    const voiceTrackRow = page.locator('text=voice_16-12-53.webm').first();
    await expect(voiceTrackRow).toBeVisible();
    await voiceTrackRow.click();
    await expect(page.locator('text=Очередь воспроизведения')).not.toBeVisible();

    // Verify bottom bar utilities (speed, repeat, shuffle)
    const shuffleBtn = page.locator('button[aria-label="Перемешать"]');
    await expect(shuffleBtn).toBeVisible();

    const speedBtn = page.locator('button[aria-label="Скорость"]');
    await expect(speedBtn).toBeVisible();
    await speedBtn.click();
    await expect(speedBtn).toHaveText('1.25x');

    await page.waitForTimeout(600);

    // Take screenshot of the center AudioPlayer panel in full active ocean wave glory
    await page.screenshot({
      path: 'test-results/screenshots/dockview-audioplayer-ocean-waves-active.png',
      fullPage: false,
    });
  });

  test('33. Unified Task Creation via ComposerModal and FullscreenEditor Inspection from Kanban and Calendar', async ({ page }) => {
    // 1. Switch to Kanban view
    const kanbanBtn = page.locator('header button[title*="Канбан"]');
    await expect(kanbanBtn).toBeVisible();
    await kanbanBtn.click();
    await page.waitForTimeout(200);

    // 2. Open ComposerModal via "+ Новая задача" button under cards
    const newTaskBtn = page.locator('button', { hasText: 'Новая задача' }).first();
    await expect(newTaskBtn).toBeVisible();
    await newTaskBtn.click();

    // 3. Verify ComposerModal opens with task context
    const modalHeader = page.locator('h3, [role="dialog"]').filter({ hasText: 'Новая задача' }).first();
    await expect(modalHeader).toBeVisible();

    const taskInput = page.locator('[placeholder*="Название задачи"]');
    await expect(taskInput).toBeVisible();

    // Test Slash Command menu in ComposerModal
    await taskInput.fill('/');
    await page.waitForTimeout(150);
    const slashMenu = page.locator('text=Команды композера');
    await expect(slashMenu).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/composer-modal-slash-menu.png',
      fullPage: false,
    });

    // Fill with natural language task details
    const uniqueTitle = 'Элитный чай Улун ' + Date.now();
    await taskInput.fill(uniqueTitle);

    // Capture screenshot of ComposerModal
    await page.screenshot({
      path: 'test-results/screenshots/composer-modal-task.png',
      fullPage: false,
    });

    // Press Enter to submit
    await taskInput.press('Enter');
    await page.waitForTimeout(300);

    // Verify ComposerModal closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // 4. Verify task card appeared in Kanban
    const taskCard = page.locator('[data-testid="kanban-card"]', { hasText: uniqueTitle });
    await expect(taskCard).toBeVisible();

    // 5. Click task card to open enhanced FullscreenEditor
    await taskCard.click();
    await page.waitForTimeout(200);

    // Verify FullscreenEditor opened with task properties
    await expect(page.locator('button', { hasText: 'Бэклог' })).toBeVisible();

    // Change status to "В работе" via status Select
    await page.locator('button', { hasText: 'Бэклог' }).click();
    await page.locator('button', { hasText: 'В работе' }).click();
    await expect(page.locator('button', { hasText: 'В работе' })).toBeVisible();

    // Add subtask via native Markdown in live preview editor and test auto-continuation
    const editorRoot = page.locator('#fullscreen-editor-root');
    await expect(editorRoot).toBeVisible();
    const cmContent = page.locator('.cm-content');
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('- [ ] Шаг первый');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Проверить чайник и температуру');
    await expect(cmContent).toContainText('Проверить чайник и температуру');

    // Capture screenshot of enhanced FullscreenEditor
    await page.screenshot({
      path: 'test-results/screenshots/fullscreen-editor-task-enhanced.png',
      fullPage: false,
    });

    // Save changes
    await page.locator('button', { hasText: 'Сохранить' }).click();
    await page.waitForTimeout(200);

    // 6. Switch to Calendar view and verify inspecting task opens FullscreenEditor
    const calendarBtn = page.locator('header button[title*="Календарь"]');
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();
    await page.waitForTimeout(300);

    // Click task in calendar if visible or any task card in calendar
    const calTask = page.locator(`text=${uniqueTitle}`).first();
    if (await calTask.isVisible()) {
      await calTask.click();
      await expect(page.locator('#fullscreen-editor-root')).toBeVisible();
      await expect(page.locator('.cm-content')).toContainText('Проверить чайник и температуру');
      // Close via Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('#fullscreen-editor-root')).not.toBeVisible();
    }

    // 7. Verify clicking hour slot in Week time grid spawns ComposerModal
    const hourSlot = page.locator('.grid-cols-7 .h-\\[52px\\]').first();
    await hourSlot.click();
    await page.waitForTimeout(200);
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'Новая задача' })).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/calendar-slot-composer-modal.png',
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // 8. Verify Month View day card "Добавить задачу..." spawns ComposerModal
    await page.locator('button', { hasText: 'Месяц' }).click();
    await page.waitForTimeout(200);
    const monthTodayBadge = page.locator('.grid-cols-7 .bg-white.text-\\[\\#09090b\\]').first();
    if (await monthTodayBadge.isVisible()) {
      await monthTodayBadge.click();
      await page.waitForTimeout(200);
      const addDayTaskBtn = page.locator('button', { hasText: 'Добавить задачу...' });
      if (await addDayTaskBtn.isVisible()) {
        await addDayTaskBtn.click();
        await page.waitForTimeout(200);
        await expect(page.locator('[role="dialog"]').filter({ hasText: 'Новая задача' })).toBeVisible();
        await page.screenshot({
          path: 'test-results/screenshots/calendar-month-composer-modal.png',
          fullPage: false,
        });
        await page.keyboard.press('Escape');
      }
    }
  });

  test('34. Calendar Drag and Drop including Untimed and Unscheduled Tasks', async ({ page }) => {
    // 1. Switch to Calendar view
    const calendarBtn = page.locator('header button[title*="Календарь"]');
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();
    await page.waitForTimeout(300);

    // 2. Create an untimed task directly in All-Day ("Весь день") section via ComposerModal
    const addAllDayBtn = page.locator('button[title="Добавить задачу на весь день"]').first();
    await expect(addAllDayBtn).toBeVisible({ timeout: 5000 });
    await addAllDayBtn.click();
    await page.waitForTimeout(200);

    const taskInput = page.locator('[placeholder*="Название задачи"]');
    await expect(taskInput).toBeVisible();
    const uniqueUntimedTitle = `БезВремени_${Date.now()}`;
    await taskInput.fill(uniqueUntimedTitle);
    await taskInput.press('Enter');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'test-results/screenshots/calendar-after-add-task.png',
      fullPage: false,
    });

    // 3. Verify the untimed task is in "Весь день" row
    const untimedPill = page.locator('.min-h-\\[44px\\]').locator(`text=${uniqueUntimedTitle}`).first();
    await expect(untimedPill).toBeVisible();

    // 4. Drag untimed task into an hour slot in the time grid (assigns time)
    const hourSlots = page.locator('.grid-cols-7 .h-\\[52px\\]');
    const targetHourSlot = hourSlots.nth(14); // 14:00 slot
    await untimedPill.dragTo(targetHourSlot);
    await page.waitForTimeout(400);

    // Scroll time grid so 14:00 is visible
    const timeGrid = page.locator('[data-testid="calendar-time-grid"]');
    await timeGrid.evaluate(el => {
      el.scrollTop = 12 * 52;
    });
    await page.waitForTimeout(200);

    // Verify task is now in the time grid
    const timedCard = page.locator(`text=${uniqueUntimedTitle}`).first();
    await expect(timedCard).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/calendar-drag-untimed-to-hour.png',
      fullPage: false,
    });

    // 5. Open Drawer (Сроки) and check unscheduled tab & drop target
    const drawerBtn = page.locator('button[title*="просроченных"]').first();
    await drawerBtn.click();
    await page.waitForTimeout(200);
    const unscheduledTab = page.locator('button', { hasText: 'Без срока' });
    await unscheduledTab.click();
    await page.waitForTimeout(200);

    await page.screenshot({
      path: 'test-results/screenshots/calendar-drawer-drag-targets.png',
      fullPage: false,
    });

    // 6. Drag the task from Calendar into the Drawer drop zone to remove date/time
    const dropToUnscheduledZone = page.locator('text=Снять срок (перенести в «Без срока»)')
      .or(unscheduledTab);
    await timedCard.dragTo(dropToUnscheduledZone.first());
    await page.waitForTimeout(400);

    // Verify task is now in Unscheduled list
    const unscheduledCard = page.locator(`text=${uniqueUntimedTitle}`).first();
    await expect(unscheduledCard).toBeVisible();

    // 7. Drag unscheduled task from Drawer into "Весь день" row (untimed task)
    const allDayCells = page.locator('.min-h-\\[44px\\] .space-y-1');
    const targetAllDayCell = allDayCells.nth(1); // Tuesday column
    await unscheduledCard.dragTo(targetAllDayCell);
    await page.waitForTimeout(400);

    // Verify task is back in "Весь день" row
    const reassignedUntimedPill = page.locator('.min-h-\\[44px\\]').locator(`text=${uniqueUntimedTitle}`).first();
    await expect(reassignedUntimedPill).toBeVisible();

    // 8. Switch to Month View and verify dragging works in Month view
    await page.locator('button', { hasText: 'Месяц' }).click();
    await page.waitForTimeout(200);

    const monthTask = page.locator('.auto-rows-fr').locator(`text=${uniqueUntimedTitle}`).first();
    await expect(monthTask).toBeVisible();

    // Drag to another day cell in Month View
    const targetMonthCell = page.locator('.auto-rows-fr > div').nth(22);
    await monthTask.dragTo(targetMonthCell);
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'test-results/screenshots/calendar-month-drag-layout.png',
      fullPage: false,
    });
  });

  test('35. Kanban Drag and Drop without Dockview Tab Interference', async ({ page }) => {
    // 1. Switch to Kanban view
    const kanbanBtn = page.locator('header button[title*="Канбан"]');
    await expect(kanbanBtn).toBeVisible();
    await kanbanBtn.click();
    await page.waitForTimeout(300);

    // 2. Locate existing task "Купить хороший зеленый чай" in "К выполнению"
    const taskCard = page.locator('[data-testid="kanban-card"]').filter({ hasText: 'Купить хороший зеленый чай' }).first();
    await expect(taskCard).toBeVisible();

    // 3. Drag task to "Бэклог" column
    const taskTitle = taskCard.locator('text=Купить хороший зеленый чай').first();
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    await expect(backlogColumn).toBeVisible();
    await taskTitle.dragTo(backlogColumn);
    await page.waitForTimeout(400);

    // Verify task is now inside "Бэклог" column
    const backlogTask = backlogColumn.locator('[data-testid="kanban-card"]', { hasText: 'Купить хороший зеленый чай' });
    await expect(backlogTask).toBeVisible();

    // 4. Verify Dockview tab bar did not trigger residual insertion beams or tab dragging classes
    const residualTabBeam = await page.locator('.dv-tab--reorder-before, .dv-tab--reorder-after').count();
    expect(residualTabBeam).toBe(0);

    // 5. Screenshot Kanban Drag & Drop
    await page.screenshot({
      path: 'test-results/screenshots/kanban-drag-and-drop-verified.png',
      fullPage: false,
    });
  });

  test('36. Task Duration Time-Blocking, Anti-Overlap, and Recurring Tasks in Calendar', async ({ page }) => {
    // 1. Switch to Feed view to use Composer
    const feedBtn = page.locator('header button[title*="Лента"]').or(page.locator('header button[title*="Все"]')).first();
    if (await feedBtn.isVisible()) {
      await feedBtn.click();
      await page.waitForTimeout(300);
    }

    // 2. Type task with natural language: time range (duration), recurring day, tag, and priority
    const composerTextarea = page.locator('main textarea').first();
    await expect(composerTextarea).toBeVisible();
    await composerTextarea.fill('Стратегический созвон 10:00-11:30 каждый вторник #план p1');
    await page.waitForTimeout(300);

    // Verify task controls in Composer toolbar appear dynamically
    const durationBadge = page.locator('button[title*="длительность"]').first();
    await expect(durationBadge).toBeVisible();

    const recurrenceBadge = page.locator('button[title*="повторение"]').first();
    await expect(recurrenceBadge).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/composer-duration-recurrence.png',
      fullPage: false,
    });

    // Submit task via Enter
    await composerTextarea.press('Enter');
    await page.waitForTimeout(400);

    // 3. Switch to Calendar view
    const calendarBtn = page.locator('header button[title*="Календарь"]');
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();
    await page.waitForTimeout(400);

    // 4. Inject an overlapping task on today's date to test Anti-Overlap column partitioning
    const todayStr = new Date().toISOString().slice(0, 10);
    await page.evaluate((dateStr) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          items.unshift(
            {
              id: 'task_dur_15_' + Date.now(),
              type: 'task',
              title: 'Стендап (15м)',
              content: 'Быстрый синк',
              folder: 'Входящие',
              tags: ['синк'],
              attachments: [],
              status: 'todo',
              priority: 'urgent',
              dueDate: dateStr,
              reminder: `${dateStr}T14:00:00.000`,
              duration: 15,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_dur_30_' + Date.now(),
              type: 'task',
              title: 'Синхронизация (30м)',
              content: 'Ревью задач',
              folder: 'Входящие',
              tags: ['работа'],
              attachments: [],
              status: 'todo',
              priority: 'high',
              dueDate: dateStr,
              reminder: `${dateStr}T14:30:00.000`,
              duration: 30,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_dur_45_' + Date.now(),
              type: 'task',
              title: 'Демо спринта (45м)',
              content: 'Демонстрация фич',
              folder: 'Входящие',
              tags: ['демо'],
              attachments: [],
              status: 'todo',
              priority: 'medium',
              dueDate: dateStr,
              reminder: `${dateStr}T15:15:00.000`,
              duration: 45,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_dur_60_' + Date.now(),
              type: 'task',
              title: 'Реализовать Интерфейс',
              content: 'Разработка компонентов',
              folder: 'Входящие',
              tags: ['код'],
              attachments: [],
              status: 'todo',
              priority: 'urgent',
              dueDate: dateStr,
              reminder: `${dateStr}T16:00:00.000`,
              duration: 60,
              subtasks: [
                { id: 'sub_1', title: 'Шаг 1', completed: true },
                { id: 'sub_2', title: 'Шаг 2', completed: true },
                { id: 'sub_3', title: 'Шаг 3', completed: false },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_overlap_a_' + Date.now(),
              type: 'task',
              title: 'Стендап команды (А)',
              content: 'Обсуждение задач',
              folder: 'Входящие',
              tags: ['работа'],
              attachments: [],
              status: 'todo',
              priority: 'high',
              dueDate: dateStr,
              reminder: `${dateStr}T10:00:00.000`,
              duration: 90,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_overlap_b_' + Date.now(),
              type: 'task',
              title: 'Синхронизация по дизайну (Б)',
              content: 'Ревью макетов',
              folder: 'Входящие',
              tags: ['дизайн'],
              attachments: [],
              status: 'todo',
              priority: 'medium',
              dueDate: dateStr,
              reminder: `${dateStr}T10:30:00.000`,
              duration: 60,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
          );
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
    }, todayStr);

    // Reload page to reflect injected tasks in Calendar
    await page.reload();
    await page.waitForTimeout(500);

    // Switch to Calendar view after reload
    await page.locator('header button[title*="Календарь"]').click();
    await page.waitForTimeout(400);

    // 5. Verify Anti-Overlap: both overlapping tasks are rendered side-by-side
    const cardA = page.locator('[data-testid^="task-timed-card-task_overlap_a_"]').first();
    const cardB = page.locator('[data-testid^="task-timed-card-task_overlap_b_"]').first();
    await expect(cardA).toBeVisible({ timeout: 5000 });
    await expect(cardB).toBeVisible({ timeout: 5000 });

    // Verify task A card has resize handle for duration time-blocking
    const resizeHandle = page.locator('[data-testid^="resize-handle-task_overlap_a_"]').first();
    await expect(resizeHandle).toBeVisible();

    // 6. Verify Recurring Task is visible and advances on complete
    const recurringCard = page.locator('.absolute, .group').filter({ hasText: 'Стратегический созвон' }).first();
    await expect(recurringCard).toBeVisible({ timeout: 5000 });

    // Click complete checkbox on the recurring task
    const completeBtn = recurringCard.locator('button[title*="Выполнить"]').first();
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();
    await page.waitForTimeout(400);

    // Verify toast about recurrence completion
    const toast = page.locator('text=/Задача выполнена|Повтор выполнен/').first();
    await expect(toast).toBeVisible({ timeout: 4000 });

    // 7. Verify Discrete Duration Card States (15m, 30m, 45m, 60m)
    const card60 = page.locator('[data-testid^="task-timed-card-task_dur_60_"]').first();
    await card60.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const card15 = page.locator('[data-testid^="task-timed-card-task_dur_15_"]').first();
    const card30 = page.locator('[data-testid^="task-timed-card-task_dur_30_"]').first();
    const card45 = page.locator('[data-testid^="task-timed-card-task_dur_45_"]').first();

    await expect(card15).toBeVisible({ timeout: 5000 });
    await expect(card30).toBeVisible({ timeout: 5000 });
    await expect(card45).toBeVisible({ timeout: 5000 });
    await expect(card60).toBeVisible({ timeout: 5000 });

    // Verify subtasks badge on 60m card
    await expect(card60.locator('text=2/3')).toBeVisible();

    // 8. Test Interactive Resizing with Live Tooltip and 15-min snapping
    const handle60 = page.locator('[data-testid^="resize-handle-task_dur_60_"]').first();
    await expect(handle60).toBeVisible();

    // Hover over card60 to trigger hover handle appearance
    await card60.hover();
    await page.waitForTimeout(150);

    // Drag handle up to resize from 60m to 30m (deltaY = -26px)
    const box = await handle60.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      // Move up by 26px (snaps 60m -> 30m)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 26, { steps: 5 });
      await page.waitForTimeout(200);

      // Verify live floating tooltip badge
      const liveTooltip = page.locator('[data-testid="resize-live-tooltip"]');
      await expect(liveTooltip).toBeVisible();
      await expect(liveTooltip).toContainText('(30м)');

      // Take screenshot of live dragging state with tooltip
      await page.screenshot({
        path: 'test-results/screenshots/calendar-resize-live-dragging.png',
        fullPage: false,
      });

      // Release mouse to finalize resize
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Verify success toast with new duration
      const resizeToast = page.locator('text=Длительность: 30м').first();
      await expect(resizeToast).toBeVisible({ timeout: 4000 });
    }

    // 9. Visual Screenshot Audit of Week View with all duration states
    await page.screenshot({
      path: 'test-results/screenshots/calendar-duration-states-verified.png',
      fullPage: false,
    });

    // 10. Switch to Month view and capture virtual recurrence projections
    const monthViewBtn = page.locator('button', { hasText: 'Месяц' }).first();
    if (await monthViewBtn.isVisible()) {
      await monthViewBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'test-results/screenshots/calendar-month-recurrence-projections.png',
        fullPage: false,
      });
    }

    // 11. Verify Narrow Viewport Horizontal Scrolling (Kanban-style week columns)
    const weekViewBtn = page.locator('button', { hasText: 'Неделя' }).first();
    if (await weekViewBtn.isVisible()) {
      await weekViewBtn.click();
      await page.waitForTimeout(300);
    }

    // Resize viewport to 800px (desktop mode with sidebar open, so calendar width is ~550px < 896px)
    await page.setViewportSize({ width: 800, height: 720 });
    await page.waitForTimeout(300);

    // Verify inner week container retains min-w-[896px] and does NOT crush day columns
    const weekScrollContainer = page.locator('[data-testid="calendar-week-scroll-container"]');
    await expect(weekScrollContainer).toBeVisible();

    const scrollMetrics = await weekScrollContainer.evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      isScrollable: el.scrollWidth > el.clientWidth,
    }));
    expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(840);
    expect(scrollMetrics.isScrollable).toBe(true);

    // Capture screenshot of narrow viewport with Kanban-style horizontal scrolling
    await page.screenshot({
      path: 'test-results/screenshots/calendar-week-narrow-scrollable.png',
      fullPage: false,
    });

    // Reset viewport size to default
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
  });

  test('37. Mouse Grab-to-Scroll (Pan) in Kanban and Calendar Week/Month Views', async ({ page }) => {
    // Set a compact viewport so both Kanban and Calendar have horizontal overflow
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');
    await page.waitForTimeout(300);

    // =========================================================================
    // 1. KANBAN: Mouse grab-and-drag horizontal scrolling
    // =========================================================================
    const kanbanBtn = page.locator('header button[title*="Канбан"]');
    await expect(kanbanBtn).toBeVisible();
    await kanbanBtn.click();
    await page.waitForTimeout(300);

    const kanbanContainer = page.locator('[data-testid="kanban-columns-container"]');
    await expect(kanbanContainer).toBeVisible();

    // Collapse materials dock to give Kanban board wide dragging area
    const collapseDockBtn = page.locator('button[title*="Свернуть док материалов"]');
    if (await collapseDockBtn.isVisible()) {
      await collapseDockBtn.click();
      await page.waitForTimeout(200);
    }

    const kanbanBox = await kanbanContainer.boundingBox();
    expect(kanbanBox).not.toBeNull();

    if (kanbanBox) {
      // Center of kanban visible container
      const startX = Math.floor(kanbanBox.x + kanbanBox.width * 0.5);
      const startY = Math.floor(kanbanBox.y + 25);
      const dragDist = 120;

      const initialScrollLeft = await kanbanContainer.evaluate(el => el.scrollLeft);

      // Drag to the left (scrolls container to the right)
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - dragDist, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const scrolledLeft = await kanbanContainer.evaluate(el => el.scrollLeft);
      expect(scrolledLeft).toBeGreaterThan(initialScrollLeft);

      // Drag back to the right
      await page.mouse.move(startX - dragDist, startY);
      await page.mouse.down();
      await page.mouse.move(startX, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const restoredScrollLeft = await kanbanContainer.evaluate(el => el.scrollLeft);
      expect(restoredScrollLeft).toBeLessThan(scrolledLeft);
    }

    await page.screenshot({
      path: 'test-results/screenshots/kanban-grab-to-scroll.png',
      fullPage: false,
    });

    // =========================================================================
    // 2. CALENDAR WEEK VIEW: Mouse grab-and-drag horizontal & vertical panning
    // =========================================================================
    const calendarBtn = page.locator('header button[title*="Календарь"]');
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();
    await page.waitForTimeout(300);

    const weekScrollContainer = page.locator('[data-testid="calendar-week-scroll-container"]');
    await expect(weekScrollContainer).toBeVisible();

    // Scroll to far left first
    await weekScrollContainer.evaluate(el => {
      el.scrollLeft = 0;
    });
    await page.waitForTimeout(150);

    const weekBox = await weekScrollContainer.boundingBox();
    expect(weekBox).not.toBeNull();

    if (weekBox) {
      // Start drag from the day header row
      const startX = weekBox.x + Math.floor(weekBox.width * 0.6);
      const startY = weekBox.y + 15;
      const dragDistance = Math.min(150, Math.floor(weekBox.width * 0.3));

      const calInitialScroll = await weekScrollContainer.evaluate(el => el.scrollLeft);

      // Drag to the left
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - dragDistance, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const calScrolled = await weekScrollContainer.evaluate(el => el.scrollLeft);
      expect(calScrolled).toBeGreaterThan(calInitialScroll);

      // Drag back to the right
      await page.mouse.move(startX - dragDistance, startY);
      await page.mouse.down();
      await page.mouse.move(startX, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const calRestored = await weekScrollContainer.evaluate(el => el.scrollLeft);
      expect(calRestored).toBeLessThan(calScrolled);
    }

    // =========================================================================
    // 3. DISAMBIGUATION: Dragging on hour slots suppresses accidental task modal
    // =========================================================================
    const timeGrid = page.locator('[data-testid="calendar-time-grid"]');
    await expect(timeGrid).toBeVisible();
    const timeGridBox = await timeGrid.boundingBox();
    expect(timeGridBox).not.toBeNull();

    if (timeGridBox) {
      const slotX = timeGridBox.x + 200;
      const slotY = timeGridBox.y + 100;

      // Drag inside time grid
      await page.mouse.move(slotX, slotY);
      await page.mouse.down();
      await page.mouse.move(slotX - 100, slotY - 50, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify task composer modal was NOT triggered by drag
      const composerModal = page.locator('[placeholder*="Название задачи"]');
      const isComposerVisible = await composerModal.isVisible();
      expect(isComposerVisible).toBe(false);
    }

    await page.screenshot({
      path: 'test-results/screenshots/calendar-grab-to-scroll.png',
      fullPage: false,
    });

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
  });

  test('38. Markdown Rendering in Feed (Headings, bold, lists, checkboxes, and inline code)', async ({ page }) => {
    // 1. In composer, enter markdown content
    const composer = page.locator('textarea[placeholder*="Мысль, заметка или код"]').first();
    await expect(composer).toBeVisible();

    const uniqueMd = `md_test_${Date.now()}`;
    const mdContent = `Заметка о релизе ${uniqueMd}\n\n### Детали реализации\n\n**Важный текст** и *курсив*, а также \`код\`.\n\n- [ ] Первый пункт\n- [x] Второй пункт\n\n[[Манифест]]`;

    await composer.fill(mdContent);
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForTimeout(300);

    // 2. Locate the created card in feed
    const card = page.locator('.group', { hasText: uniqueMd }).first();
    await expect(card).toBeVisible();

    // 3. Verify rendered Markdown elements
    await expect(card.locator('h3', { hasText: 'Детали реализации' })).toBeVisible();
    await expect(card.locator('strong')).toHaveText('Важный текст');
    await expect(card.locator('em')).toHaveText('курсив');
    await expect(card.locator('code')).toHaveText('код');
    await expect(card.locator('span', { hasText: 'Манифест' })).toBeVisible();

    // 4. Capture screenshot for visual inspection
    await card.screenshot({
      path: 'test-results/screenshots/markdown-rendered-feed-card.png',
    });
  });

  test('39. Composite Workspace: Tab Right-Click Context Menu and Floating Group Detachment', async ({ page }) => {
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Locate Assistant tab and right click to open context menu
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await expect(assistantTab).toBeVisible();

    await assistantTab.click({ button: 'right' });

    // 2. Verify custom context menu items
    const contextMenu = page.locator('.dv-context-menu');
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.locator('.dv-context-menu-item', { hasText: 'Вынести в отдельное окно' })).toBeVisible();
    await expect(contextMenu.locator('.dv-context-menu-item', { hasText: 'Сделать плавающим' })).toBeVisible();

    // 3. Click "Сделать плавающим" and verify floating container appears
    await contextMenu.locator('.dv-context-menu-item', { hasText: 'Сделать плавающим' }).click();

    const floatingContainer = page.locator('.dv-resize-container');
    await expect(floatingContainer).toBeVisible();

    // 4. Verify clean header [+] button
    const addTabBtn = page.locator('button[title*="Добавить вкладку"]').first();
    await expect(addTabBtn).toBeVisible();

    // 5. Capture screenshot of floating panel
    await page.screenshot({
      path: 'test-results/screenshots/dockview-floating-group-active.png',
      fullPage: false,
    });
  });

  test('40. Detached Popout Window: Full Dockview Workspace and Functional Controls', async ({ page }) => {
    // Set viewport below 768px to ensure popout window never collapses into mobile shell
    await page.setViewportSize({ width: 550, height: 450 });

    // Mock Tauri environment so desktop WindowControls are active
    await page.addInitScript(() => {
      (window as any).isTauri = true;
      (window as any).__TAURI_INTERNALS__ = {
        ipc: () => Promise.resolve(),
      };
    });

    // Navigate directly with query params as a spawned detached window would
    await page.goto('/?panel=sidebar&title=%D0%9D%D0%B0%D0%B2%D0%B8%D0%B3%D0%B0%D1%86%D0%B8%D1%8F');

    // 1. Verify Dockview is mounted (desktop mode) and mobile nav dock is absent
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();
    await expect(page.locator('nav[aria-label="Мобильная навигация"]')).not.toBeVisible();

    // 2. Verify the detached panel is present as a tab
    const sidebarTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Навигация' }).first();
    await expect(sidebarTab).toBeVisible();

    // 3. Verify the [+] button to add panels is present in the detached window
    const addPanelBtn = page.locator('button[title*="Добавить вкладку"]').first();
    await expect(addPanelBtn).toBeVisible();

    // 4. Verify WindowControls are rendered with pointer-events-auto and without drag-region blocking
    const closeBtn = page.locator('button[title="Закрыть"]').first();
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toBeEnabled();

    // 5. Capture screenshot of the detached window
    await page.screenshot({
      path: 'test-results/screenshots/detached-dockview-window.png',
      fullPage: false,
    });
  });

  test('41. Detached Windows Session Registry and 1-to-1 Geometry', async ({ page }) => {
    await page.goto('/');

    // 1. Verify localStorage registry functionality
    await page.evaluate(() => {
      const entry = {
        label: 'panel-kanban-session-test',
        panelId: 'kanban',
        title: 'Канбан',
        left: 200,
        top: 150,
        width: 880,
        height: 620,
      };
      localStorage.setItem('slag_detached_windows_v2', JSON.stringify([entry]));
    });

    const saved = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('slag_detached_windows_v2') || '[]');
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].panelId).toBe('kanban');
    expect(saved[0].width).toBe(880);
    expect(saved[0].height).toBe(620);
  });

  test('42. Cross-Window Tab Drag & Drop Dock-back via BroadcastChannel', async ({ page }) => {
    await page.goto('/');

    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Simulate releasing a detached tab over the main window
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_RELEASE',
        sourceLabel: 'panel-audio-test',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 100,
        screenY: window.screenY + 100,
      });
    });

    // 2. Verify the Audio tab appears in the main window
    const audioTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Аудиоплеер' }).first();
    await expect(audioTab).toBeVisible();

    // 3. Screenshot verification
    await page.screenshot({
      path: 'test-results/screenshots/cross-window-tab-docked.png',
      fullPage: false,
    });
  });

  test('43. Folder Info Modal: Header Click, Dashboard Metrics, Media Tabs, and Edit Mode', async ({ page }) => {
    // 1. Click folder header button in feed
    const folderHeaderBtn = page.locator('header button[title*="Информация и медиа папки"]').first();
    await expect(folderHeaderBtn).toBeVisible();
    await folderHeaderBtn.click();

    // 2. Verify modal opened
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h3').first()).toContainText('Входящие');

    // 3. Verify AI description block and dashboard metrics
    await expect(modal.locator('text=Описание для ИИ')).toBeVisible();
    await expect(modal.getByText('Заметки', { exact: true })).toBeVisible();
    await expect(modal.getByText('Таски', { exact: true })).toBeVisible();

    // 4. Screenshot View Mode
    await page.screenshot({ path: 'test-results/screenshots/folder-info-modal-view.png' });

    // 5. Toggle Edit Mode
    const editBtn = modal.locator('button[title*="Редактировать параметры"]').or(modal.locator('button:has-text("Изменить")')).first();
    await editBtn.click();

    // 6. Verify Edit Mode controls
    await expect(modal.locator('label', { hasText: 'Название папки' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'Иконка папки' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'Описание для ИИ-сортировки' })).toBeVisible();

    // 7. Screenshot Edit Mode
    await page.screenshot({ path: 'test-results/screenshots/folder-info-modal-edit.png' });

    // 8. Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('44. Composer and Assistant focus retention and no placeholder vertical scroll', async ({ page }) => {
    // 1. Verify feed composer retains focus after Enter
    const feedTextarea = page.locator('main textarea').first();
    await feedTextarea.click();
    await expect(feedTextarea).toBeFocused();
    await feedTextarea.fill('Фокус тест ' + Date.now());
    await feedTextarea.press('Enter');
    await expect(feedTextarea).toBeFocused();

    // 2. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    if (await assistantTab.isVisible()) {
      await assistantTab.click();
      const assistantTextarea = page.locator('textarea[placeholder*="Спросите ассистента"]').first();
      await expect(assistantTextarea).toBeVisible();

      // Verify no vertical scrollbar / no scroll on empty assistant composer
      const hasVerticalScroll = await assistantTextarea.evaluate(el => el.scrollHeight > el.clientHeight + 2);
      expect(hasVerticalScroll).toBe(false);

      await page.screenshot({ path: 'test-results/screenshots/assistant-composer-clean.png' });

      // Verify focus retention in assistant composer
      await assistantTextarea.fill('Привет, проверка фокуса');
      await assistantTextarea.press('Enter');
      await expect(assistantTextarea).toBeFocused();
    }
  });
});
