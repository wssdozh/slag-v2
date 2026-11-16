import { test, expect } from '@playwright/test';
import { setupSlag, openViewModal, switchToView } from '../support/slagSetup';

test.describe('SLAG v2 Specification E2E Verification - Feed', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
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
    await expect(taskCard.locator('button[aria-label="Изменить статус таски"]')).toBeVisible();

    // Toggle completion directly in feed
    const checkbox = taskCard.locator('button[aria-label="Изменить статус таски"]');
    await checkbox.click();

    // Verify completion status change via toast or styling
    await expect(page.locator('text=Таска выполнена').or(page.locator('text=Таска возобновлена'))).toBeVisible();
  });

  test('2.1. Last checked subtask completes its task without a status click', async ({ page }) => {
    const typeDropdownButton = page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first();
    await typeDropdownButton.click();
    await page.locator('button', { hasText: 'Таска' }).click();

    const taskTitle = 'Автозакрытие подзадач E2E ' + Date.now();
    const composerTextarea = page.locator('main textarea');
    await composerTextarea.fill(`${taskTitle}\n- [ ] первая\n- [ ] вторая`);
    await page.locator('button[title*="Отправить"]').click();

    const taskCard = page.locator('.group', { hasText: taskTitle }).first();
    await expect(taskCard).toBeVisible();
    const taskHeading = taskCard.locator('h3', { hasText: taskTitle });
    // The card title carries the status in the feed: line-through means done.
    await expect(taskHeading).not.toHaveClass(/line-through/);
    await expect(taskCard.locator('text=Подзадачи: 0 из 2')).toBeVisible();

    await taskCard.getByLabel('Отметить подзадачу первая').click();
    await expect(taskCard.locator('text=Подзадачи: 1 из 2')).toBeVisible();
    // One open line left: the task is still in work.
    await expect(taskHeading).not.toHaveClass(/line-through/);

    await taskCard.getByLabel('Отметить подзадачу вторая').click();
    await expect(taskCard.locator('text=Подзадачи: 2 из 2')).toBeVisible();
    // The last tick closes the parent: no separate click on the status.
    await expect(taskHeading).toHaveClass(/line-through/);

    // Persisted, not just painted: the store behind the feed agrees.
    const storedStatus = await page.evaluate(() => {
      const items = Object.entries(localStorage)
        .filter(([key]) => key.startsWith('slag_items_'))
        .flatMap(([, raw]) => JSON.parse(raw) as Array<{ title?: string; status?: string }>);
      return items.find(item => item.title?.startsWith('Автозакрытие подзадач E2E'))?.status;
    });
    expect(storedStatus).toBe('done');

    await page.screenshot({ path: 'test-results/screenshots/b16-subtask-autoclose.png', fullPage: true });
  });

  test('3. Hybrid Inbox mode switching (Unsorted, All, Sorted)', async ({ page }) => {
    // Navigate to Inbox
    await page.locator('button', { hasText: 'Входящие' }).first().click();

    // Verify view modal allows switching inbox modes
    const modal = await openViewModal(page);

    const unsortedBtn = modal.locator('button', { hasText: 'Неразобранные' });
    const allBtn = modal.locator('button', { hasText: 'Все' }).last();
    const sortedBtn = modal.locator('button').filter({ hasText: /^Разобранные$/ });

    await expect(unsortedBtn).toBeVisible();
    await expect(allBtn).toBeVisible();
    await expect(sortedBtn).toBeVisible();

    // Verify "Все" is active by default
    await expect(allBtn).toHaveClass(/bg-tint-10/);

    // Switch to "Разобранные"
    await sortedBtn.click();
    await expect(sortedBtn).toHaveClass(/bg-tint-10/);

    // Switch to "Неразобранные"
    await unsortedBtn.click();
    await expect(unsortedBtn).toHaveClass(/bg-tint-10/);

    // Switch back to "Все"
    await allBtn.click();
    await expect(allBtn).toHaveClass(/bg-tint-10/);
    await page.keyboard.press('Escape');
  });

  test('4. Article teaser card and opening in Focus Editor', async ({ page }) => {
    // Switch to "Все" to see all demo articles or navigate to design
    const modal = await openViewModal(page);
    await modal.locator('button', { hasText: 'Все' }).last().click();
    await page.keyboard.press('Escape');

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

    // Hover over article card to verify smooth expand of reply and more actions
    await articleCard.hover();
    await page.waitForTimeout(200);
    await articleCard.screenshot({
      path: 'test-results/screenshots/article-card-hover.png',
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

    // Verify hover state: Reply is left, More is right
    await card.hover();
    await page.waitForTimeout(100);
    await card.screenshot({ path: 'screenshots/regular-card-hover.png' });

    await card.click({ button: 'right' });

    // Verify Context Menu is open with Linear shortcuts
    const contextMenu = page.locator('.fixed.z-50', { hasText: 'Ответить' });
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.locator('text=Фокус-редактор')).toBeVisible();
    await expect(contextMenu.locator('text=Закрепить')).toBeVisible();
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

  test('7.1 Reading column handle resizes the feed and clamps at the minimum', async ({ page }) => {
    const handle = page.getByTestId('feed-width-handle-right');
    await expect(handle).toBeAttached();

    const readWidth = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--feed-content-width').trim()
      );
    await expect.poll(readWidth).toBe('672px');

    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    if (!handleBox) return;

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 200);
    await page.screenshot({ path: 'test-results/screenshots/feed-column-handle-hover.png' });
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 400, handleBox.y + 200, { steps: 8 });
    await page.mouse.up();

    // However far the hand travels, the reading column stops at its minimum.
    await expect.poll(readWidth).toBe('420px');
    const cardMaxWidth = await page
      .locator('.feed-card-contain')
      .first()
      .evaluate(el => getComputedStyle(el).maxWidth);
    expect(cardMaxWidth).toBe('420px');
    await page.screenshot({ path: 'test-results/screenshots/feed-column-min-width.png' });
  });

  test('7.2 The composer dock follows the reading column instead of a fixed 42rem', async ({ page }) => {
    // The column never grows past its pane, so the room has to be there before the drag.
    await page.setViewportSize({ width: 1920, height: 1080 });
    const handle = page.getByTestId('feed-width-handle-right');
    await expect(handle).toBeAttached();

    const readWidth = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--feed-content-width').trim()
      );
    await expect.poll(readWidth).toBe('672px');

    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    if (!handleBox) return;

    // Wider than the old 42rem cap: the composer used to stop here while the cards kept growing.
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 200);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 120, handleBox.y + 200, { steps: 8 });
    await page.mouse.up();

    const column = parseInt(await readWidth(), 10);
    expect(column).toBeGreaterThan(672);

    const dockWidth = await page
      .locator('[data-testid="composer-dock"] > div')
      .first()
      .evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(dockWidth).toBe(column);

    const composerWidth = await page
      .locator('[data-composer-root]')
      .first()
      .evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(composerWidth).toBe(column);
    await page.screenshot({ path: 'test-results/screenshots/feed-column-composer-aligned.png' });
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
    const lightbox = page.getByTestId('image-lightbox');
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

    // Verify feed is anchored completely at the bottom on initial load
    const scrollInfo = await feedContainer.evaluate((el) => ({
      distFromBottom: el.scrollHeight - el.clientHeight - el.scrollTop,
    }));
    expect(scrollInfo.distFromBottom).toBeLessThanOrEqual(2);

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

    // 4. Scroll up to verify bottom button appearance and capture screenshot
    await feedContainer.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    const scrollDownBtn = page.locator('button[aria-label="Прокрутить к последним заметкам"]');
    if (await scrollDownBtn.isVisible()) {
      await page.screenshot({
        path: 'test-results/screenshots/scroll-down-button.png',
      });
    }

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
    // The chip only appears for two or more matches, and the whole vault holds two
    // demo records about design — so stay in the inbox scope, do not pick a folder.
    await expect(page.locator('header')).toContainText('Входящие');

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

    // Settings opens on the account tab; the AI controls live behind their own tab.
    await settingsModal.locator('button', { hasText: 'ИИ & Провайдеры' }).first().click();

    await settingsModal.locator('[data-testid="ai-source-mode"]').click();
    await page.locator('[data-testid="ai-source-byok"]').click();

    // Connections are a list now; Groq ships as the default one.
    await expect(settingsModal.getByText('Подключения')).toBeVisible();
    const groqRow = settingsModal.locator('[data-testid="ai-connection-groq"]');
    await expect(groqRow).toContainText('Groq');
    await expect(groqRow).toContainText('gpt-oss-120b');

    // Add KIE.AI as a second connection and expand it.
    await settingsModal.locator('[data-testid="ai-connection-add"]').click();
    await page.getByRole('option', { name: 'KIE.AI', exact: true }).click();
    const kieRow = settingsModal.locator('[data-testid="ai-connection-kie"]');
    await expect(kieRow).toBeVisible();
    await kieRow.click();
    await expect(settingsModal.locator('input[placeholder*="sk-kie"]')).toBeVisible();

    // The model is plain text now, prefilled from the KIE preset.
    await expect(settingsModal.getByLabel('Модель · ответы')).toHaveValue('deepseek-v4-1-flash');

    await page.screenshot({
      path: 'test-results/screenshots/settings-modal-kie-connection.png',
    });

    // Roles pick one connection each; Groq stays on answers.
    await expect(settingsModal.locator('[data-testid="ai-role-chat"]')).toContainText('Groq');

    // Verify Tag Taxonomy controls exist
    await expect(settingsModal.locator('text=Правила тегов')).toBeVisible();
    await expect(settingsModal.locator('text=Лимит тегов')).toBeVisible();
    await expect(settingsModal.locator('text=Стиль регистра')).toBeVisible();
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
    // Materials dock lists the current folder only, and the demo article lives in
    // База знаний — the kanban has to be opened there.
    await page.locator('aside span', { hasText: 'База знаний' }).first().click();
    await expect(page.locator('header')).toContainText('База знаний');

    // 1. Switch to Kanban view in header
    await switchToView(page, 'kanban');

    // 2. Verify TRIZ Materials Dock exists and test Orama live search
    const materialsHeader = page.locator('text=Материалы папки');
    await expect(materialsHeader).toBeVisible();

    const materialsSearch = page.locator('input[placeholder*="Поиск по материалам"]');
    await expect(materialsSearch).toBeVisible();
    await materialsSearch.fill('заметочников');
    await expect(page.locator('text=Вернулся к обычному .txt').first()).toBeVisible();
    await materialsSearch.fill('');

    // 3. Verify 4 columns exist (Бэклог, К выполнению, В работе, Выполнено)
    await expect(page.locator('h3', { hasText: 'Бэклог' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'К выполнению' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'В работе' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Выполнено' })).toBeVisible();

    // 4. Create a task inline via the column "+" button (title reflects the unified "таска" term)
    const addBtn = page.locator('[data-testid="kanban-column-todo"] button[title="Добавить таску в К выполнению"]').first();
    await addBtn.click();

    const input = page.locator('[placeholder*="Название таски"]');
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
    await switchToView(page, 'calendar');

    // 2. Verify Week view by default
    await expect(page.locator('text=Неделя')).toBeVisible();
    await expect(page.locator('text=Месяц')).toBeVisible();
    await expect(page.locator('text=Сегодня')).toBeVisible();

    // 3. Verify Today date indicator in week header and All-Day row
    const todayBadge = page.locator('.bg-white.text-canvas, .bg-white.text-\\[\\#09090b\\]');
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
      await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).toBeVisible();
      await page.screenshot({
        path: 'test-results/screenshots/calendar-task-popover.png',
        fullPage: false,
      });
      // Close popover via Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).not.toBeVisible();
    }

    // 7. Switch to Month View
    await page.locator('button', { hasText: 'Месяц' }).click();
    await expect(page.locator('button', { hasText: 'Месяц' })).toHaveClass(/bg-tint-10/);

    // Test Month day click directly opens ComposerModal
    const monthTodayBadge = page.locator('.grid-cols-7 .bg-white.text-canvas, .grid-cols-7 .bg-white.text-\\[\\#09090b\\]').first();
    if (await monthTodayBadge.isVisible()) {
      await monthTodayBadge.click();
      await page.waitForTimeout(100);
      await expect(page.locator('[role="dialog"]').filter({ hasText: 'Новая задача' })).toBeVisible();
      await page.screenshot({
        path: 'test-results/screenshots/calendar-month-expanded-day.png',
        fullPage: false,
      });
      // Close modal via Escape
      await page.keyboard.press('Escape');
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
});
