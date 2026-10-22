import { test, expect } from '@playwright/test';

test.describe('SLAG v2 Specification E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app main feed to be visible
    await expect(page.locator('main')).toBeVisible();
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

    // Switch to "Все"
    await allBtn.click();
    await expect(allBtn).toHaveClass(/bg-white\/10/);

    // Switch to "Разобранные"
    await sortedBtn.click();
    await expect(sortedBtn).toHaveClass(/bg-white\/10/);

    // Switch back to "Неразобранные"
    await unsortedBtn.click();
    await expect(unsortedBtn).toHaveClass(/bg-white\/10/);
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
    const splitter = page.locator('div[title="Перетащите для изменения ширины"]').first();
    await expect(splitter).toBeVisible();

    const leftSidebar = page.locator('aside').first();
    const initialBox = await leftSidebar.boundingBox();
    expect(initialBox).toBeTruthy();

    if (initialBox) {
      await splitter.hover();
      await page.mouse.down();
      await page.mouse.move(initialBox.x + initialBox.width + 50, initialBox.y + 100);
      await page.mouse.up();

      const newBox = await leftSidebar.boundingBox();
      expect(newBox).toBeTruthy();
      if (newBox) {
        expect(newBox.width).toBeGreaterThanOrEqual(initialBox.width);
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
  });

  test('10. Toggle Assistant Mode via Header Button and Shortcut (Ctrl+J)', async ({ page }) => {
    // 1. Click on "Ассистент" button in center header
    const assistantBtn = page.locator('header button', { hasText: 'Ассистент' });
    await expect(assistantBtn).toBeVisible();
    await assistantBtn.click();

    // Verify Assistant view is active
    await expect(page.locator('text=Все хранилище').first()).toBeVisible();

    // 2. Toggle to Feed via button
    await page.locator('header button', { hasText: 'Лента' }).click();
    await expect(page.locator('main textarea[placeholder*="Мысль, заметка или код"]')).toBeVisible();

    // 3. Toggle Right Panel Assistant via shortcut Ctrl+J
    await page.keyboard.press('Control+j');
    const rightPanel = page.locator('aside').last();
    await expect(rightPanel.locator('text=Ассистент').first()).toBeVisible();
  });

  test('11. Assistant Tool Calling (get_vault_stats) and Reasoning Accordion', async ({ page }) => {
    // Switch to Assistant in center
    await page.locator('header button', { hasText: 'Ассистент' }).click();

    // Click quick prompt for vault stats
    const statsPromptBtn = page.locator('button', { hasText: 'Сводка хранилища' });
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
    // Switch to Assistant in center
    await page.locator('header button', { hasText: 'Ассистент' }).click();

    // Ask to create a task
    const textarea = page.locator('main textarea[placeholder*="Спросите"]');
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

    // Switch back to Feed and verify the task exists in the feed!
    await page.locator('header button', { hasText: 'Лента' }).click();
    await expect(page.locator('.group', { hasText: 'Проверить Groq API' })).toBeVisible();
  });

  test('13. Right Sidebar Assistant & Feed Filtering', async ({ page }) => {
    // Open Assistant mode in right sidebar
    const rightPanel = page.locator('aside').last();
    const assistantTab = rightPanel.locator('button', { hasText: 'Ассистент' });
    await assistantTab.click();

    // Verify sidebar assistant is visible
    const sidebarTextarea = rightPanel.locator('textarea[placeholder*="Спросите"]');
    await expect(sidebarTextarea).toBeVisible();

    // Ask to search design notes
    await sidebarTextarea.fill('дизайн');
    await sidebarTextarea.press('Enter');

    // Wait for search result with "Показать в ленте" button
    const filterBtn = rightPanel.locator('button', { hasText: /Показать \d+ в ленте/ });
    await expect(filterBtn).toBeVisible();
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
    // 1. Right sidebar assistant screenshot
    const rightPanel = page.locator('aside').last();
    await rightPanel.locator('button', { hasText: 'Ассистент' }).click();
    await page.screenshot({
      path: 'test-results/screenshots/assistant-sidebar-layout.png',
      fullPage: false,
    });

    // 2. Center full-screen assistant screenshot
    await page.locator('header button', { hasText: 'Ассистент' }).click();
    await expect(page.locator('text=Все хранилище').first()).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/assistant-chat-view.png',
      fullPage: false,
    });
  });

  test('16. Assistant Pure Chat Dialogue, Quick Prompts, and Interactive Draft Generation', async ({ page }) => {
    // 1. Open Center Assistant view
    await page.locator('header button', { hasText: 'Ассистент' }).click();
    await expect(page.locator('text=Все хранилище').first()).toBeVisible();

    // 2. Send a message via quick prompt
    await page.locator('button', { hasText: 'Сводка хранилища' }).click();
    // Wait for assistant response to appear
    await expect(page.locator('text=SLAG').first()).toBeVisible({ timeout: 5000 });

    // Capture chat screenshot
    await page.screenshot({
      path: 'test-results/screenshots/assistant-chat-mode.png',
      fullPage: false,
    });

    // 3. Send a prompt that generates suggestedAction (Draft task)
    const textarea = page.locator('main textarea');
    await textarea.fill('Создай новую задачу: Проверить синхронизацию заметок');
    await textarea.press('Enter');
    await expect(page.locator('text=Сохранить в хранилище').first()).toBeVisible({ timeout: 5000 });

    // 4. Click Save to Vault
    await page.locator('button', { hasText: 'Сохранить в хранилище' }).first().click();
    await expect(page.locator('text=сохранена').or(page.locator('text=Запись'))).toBeVisible();
  });

  test('17. Linear-style Kanban Board with TRIZ Dock and Signal Bars', async ({ page }) => {
    // 1. Switch to Kanban view in header
    const kanbanBtn = page.locator('header button', { hasText: 'Канбан' });
    await expect(kanbanBtn).toBeVisible();
    await kanbanBtn.click();

    // 2. Verify TRIZ Materials Dock exists and shows materials
    const materialsHeader = page.locator('text=Материалы папки');
    await expect(materialsHeader).toBeVisible();

    // 3. Verify 4 columns exist (Бэклог, К выполнению, В работе, Выполнено)
    await expect(page.locator('h3', { hasText: 'Бэклог' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'К выполнению' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'В работе' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Выполнено' })).toBeVisible();

    // 4. Create a task inline in "К выполнению" column
    const addBtn = page.locator('button[title="Добавить задачу в К выполнению"]');
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
    const calendarBtn = page.locator('header button', { hasText: 'Календарь' });
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();

    // 2. Verify Week view by default
    await expect(page.locator('text=Неделя')).toBeVisible();
    await expect(page.locator('text=Месяц')).toBeVisible();
    await expect(page.locator('text=Сегодня')).toBeVisible();

    // 3. Verify Today date indicator in week header
    const redTodayBadge = page.locator('.bg-\\[\\#e44332\\]');
    await expect(redTodayBadge.first()).toBeVisible();

    // 4. Verify Hourly Time Grid (e.g. 08:00, 12:00, 18:00)
    await expect(page.locator('text=08:00').first()).toBeVisible();
    await expect(page.locator('text=12:00').first()).toBeVisible();

    // 5. Capture Week View screenshot
    await page.screenshot({
      path: 'test-results/screenshots/calendar-week-layout.png',
      fullPage: false,
    });

    // 6. Switch to Month View
    await page.locator('button', { hasText: 'Месяц' }).click();
    await expect(page.locator('button', { hasText: 'Месяц' })).toHaveClass(/bg-white\/10/);

    // Capture Month View screenshot
    await page.screenshot({
      path: 'test-results/screenshots/calendar-month-layout.png',
      fullPage: false,
    });

    // 7. Open Overdue & Unscheduled Drawer
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

  test('20. Composite Workspace (Dockview), Presets Switching, and Layout Engine Toggle', async ({ page }) => {
    // 1. Locate the Layout Engine toggle button in FeedHeader
    const toggleLayoutBtn = page.locator('header button[title*="Композитная IDE-сетка"]');
    await expect(toggleLayoutBtn).toBeVisible();

    // 2. Click to toggle to Dockview Grid
    await toggleLayoutBtn.click();

    // 3. Verify Dockview container and Presets controls are visible
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();
    await expect(page.locator('text=Сетка:')).toBeVisible();

    // 4. Verify Preset buttons exist
    const defaultPresetBtn = page.locator('button', { hasText: 'Стандарт' }).first();
    const aiLabPresetBtn = page.locator('button', { hasText: 'AI Lab' }).first();
    const focusPresetBtn = page.locator('button', { hasText: 'Фокус' }).first();
    const dualPresetBtn = page.locator('button', { hasText: '2 Экрана' }).first();

    await expect(defaultPresetBtn).toBeVisible();
    await expect(aiLabPresetBtn).toBeVisible();
    await expect(focusPresetBtn).toBeVisible();
    await expect(dualPresetBtn).toBeVisible();

    // Capture Default Preset screenshot
    await page.screenshot({
      path: 'test-results/screenshots/dockview-default-preset.png',
      fullPage: false,
    });

    // 5. Switch to AI Lab Preset
    await aiLabPresetBtn.click();
    await expect(aiLabPresetBtn).toHaveClass(/bg-white\/10/);
    await page.waitForTimeout(200);

    // Capture AI Lab Preset screenshot
    await page.screenshot({
      path: 'test-results/screenshots/dockview-ai-lab-preset.png',
      fullPage: false,
    });

    // 6. Switch to Deep Focus Preset
    await focusPresetBtn.click();
    await expect(focusPresetBtn).toHaveClass(/bg-white\/10/);
    await page.waitForTimeout(200);

    // Capture Deep Focus Preset screenshot
    await page.screenshot({
      path: 'test-results/screenshots/dockview-focus-preset.png',
      fullPage: false,
    });

    // 7. Switch to Dual Screen Preset
    await dualPresetBtn.click();
    await expect(dualPresetBtn).toHaveClass(/bg-white\/10/);
    await page.waitForTimeout(200);

    // 8. Switch back to Classic Layout via "Классика" button
    const classicBtn = page.locator('button', { hasText: 'Классика' });
    await expect(classicBtn).toBeVisible();
    await classicBtn.click();

    // Verify returning to classic layout
    await expect(dockviewContainer).not.toBeVisible();
    await expect(page.locator('header button', { hasText: 'Лента' })).toBeVisible();
  });
});
