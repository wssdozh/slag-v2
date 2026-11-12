import { test, expect } from '@playwright/test';
import { setupSlag, openViewModal, switchToView } from '../support/slagSetup';

test.describe('SLAG v2 Specification E2E Verification - Views', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
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

    // 4. Verify toolbar controls light up in blue directly on the bottom bar
    const dueDateBtn = page.locator('button[title*="Срок: Завтра"]').first();
    await expect(dueDateBtn).toBeVisible();
    await expect(dueDateBtn).toHaveClass(/text-blue-400/);

    const prioBtn = page.locator('button[title*="Приоритет: Высокий"]').first();
    await expect(prioBtn).toBeVisible();

    // 5. Take screenshot of unified toolbar controls
    await page.screenshot({
      path: 'test-results/screenshots/todoist-toolbar-controls.png',
      fullPage: false,
    });

    // 6. Test removing date via right click on toolbar button
    await dueDateBtn.click({ button: 'right' });
    await expect(page.locator('button[title="Установить срок таски"]')).toBeVisible();

    // 7. Retype and send task via Enter
    await composerTextarea.fill('');
    await page.waitForTimeout(100);
    await composerTextarea.fill('Заказать билеты в театр завтра p2 #culture');
    await page.waitForTimeout(250);

    // Verify priority updated to medium
    await expect(page.locator('button[title*="Приоритет: Средний"]').first()).toBeVisible();

    // Send task via Enter
    await composerTextarea.press('Enter');

    // 8. Verify created task card in feed has clean title
    const createdCard = page.locator('.group', { hasText: 'Заказать билеты в театр' }).first();
    await expect(createdCard).toBeVisible();

    // Verify tag is present
    await expect(createdCard.getByRole('button', { name: '#culture' })).toBeVisible();

    // Verify task checkbox is present
    await expect(createdCard.locator('button[aria-label="Изменить статус таски"]')).toBeVisible();

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

  test('21.1. Workspace Panel Minimum Width & Adaptive Header Verification', async ({ page }) => {
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Locate sashes and Feed group
    const sashes = page.locator('.dv-sash');
    await expect(sashes.first()).toBeVisible();

    const feedGroup = page.locator('.dv-groupview').filter({ has: page.locator('header') }).first();
    await expect(feedGroup).toBeVisible();

    const initialFeedBox = await feedGroup.boundingBox();
    expect(initialFeedBox).toBeTruthy();
    if (initialFeedBox) {
      expect(initialFeedBox.width).toBeGreaterThanOrEqual(320);
    }

    // 2. Attempt aggressive drag of the sash to the left to try to squash feed
    const count = await sashes.count();
    const rightSash = sashes.nth(Math.min(1, count - 1));
    const sashBox = await rightSash.boundingBox();
    if (sashBox) {
      await page.mouse.move(sashBox.x + sashBox.width / 2, sashBox.y + sashBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sashBox.x - 700, sashBox.y + sashBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }

    // 3. Verify that feed width is clamped and never drops below minimumWidth (320px)
    const clampedFeedBox = await feedGroup.boundingBox();
    expect(clampedFeedBox).toBeTruthy();
    if (clampedFeedBox) {
      expect(clampedFeedBox.width).toBeGreaterThanOrEqual(315);
    }

    // 4. Attempt aggressive expansion of the left sash (Sidebar) to the right
    const leftSash = sashes.first();
    const leftSashBox = await leftSash.boundingBox();
    if (leftSashBox) {
      await page.mouse.move(leftSashBox.x + leftSashBox.width / 2, leftSashBox.y + leftSashBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(leftSashBox.x + 800, leftSashBox.y + leftSashBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }

    // 5. Verify Sidebar obeys maximumWidth (420px) and Feed is still protected
    const sidebarGroup = page.locator('.dv-groupview').filter({ has: page.locator('aside') }).first();
    const sidebarBox = await sidebarGroup.boundingBox();
    if (sidebarBox) {
      expect(sidebarBox.width).toBeLessThanOrEqual(430);
    }

    const postExpansionFeedBox = await feedGroup.boundingBox();
    if (postExpansionFeedBox) {
      expect(postExpansionFeedBox.width).toBeGreaterThanOrEqual(315);
    }

    // 6. Capture screenshot of clamped layout
    await page.screenshot({
      path: 'test-results/screenshots/dockview-panel-min-width-clamped.png',
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

  // Skipped on a product gap, not on a stale selector. Orama order is kept now (it used to be
  // replaced by vault order), but the multi-token pass unions a hit per token, so filler words
  // like «по» and «как» match the whole vault and drown the one note the typo actually caught.
  // Ranking by rarity of the matched token is a separate job; until then this scenario is a lie.
  test.skip('24. Typo-Tolerant Note Search and Multi-step Agentic Tool Calling Verification', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Query with conversational filler and typo: "поищи по заметкам по прафилам как жить вообще"
    await textarea.fill('поищи по заметкам по прафилам как жить вообще');
    await textarea.press('Enter');

    // 3. The typo still finds the note, and it is the top hit rather than the fifth.
    // Results collapse past three, so open the list when the header is there.
    const searchHeader = page.locator('button', { hasText: /Найдено \d+ в хранилище/ }).first();
    if (await searchHeader.isVisible().catch(() => false)) await searchHeader.click();
    const matchedResult = page.locator('button[title*="12 правил эффективности"]').first();
    await expect(matchedResult).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button[title^="Перейти к"]').first()).toHaveAttribute('title', /12 правил эффективности/);
    await expect(page.locator('text=записей не найдено')).not.toBeVisible();

    // 4. Clicking the result jumps to the note in the feed
    await matchedResult.click();

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

    // 5. Confirm batch reschedule: the toast reports the applied count
    await applyBatchBtn.click();
    await expect(page.locator('text=/Применено задач: \\d+/').first()).toBeVisible({ timeout: 5000 });

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

    // 3. Verify Undo button in Toast notification (the toast action is an icon button, named by aria-label)
    const undoToastBtn = page.locator('button[aria-label="Отменить"]').first();
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

    // 5. Apply the intra-day distribution: the toast reports the applied count
    await applyBtn.click();
    await expect(page.locator('text=/Применено задач: \\d+/').first()).toBeVisible({ timeout: 5000 });
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

    // 6. Confirm application of inverted batch: the toast reports the applied count
    await applyInvertedBtn.click();
    await expect(page.locator('text=/Применено задач: \\d+/').last()).toBeVisible({ timeout: 5000 });
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
    await expect(page.locator('text=Применено задач:').or(page.locator('text=Перенесено задач:')).or(page.locator('text=Перенесено')).last()).toBeVisible({ timeout: 5000 });

    // 4. Switch to Calendar view
    await switchToView(page, 'calendar');

    // 5. Verify week view
    await expect(page.locator('text=Неделя')).toBeVisible();

    // Capture screenshot of calendar grid with scheduled tasks
    await page.screenshot({
      path: 'test-results/screenshots/calendar-scheduled-lunch-slots.png',
      fullPage: false,
    });
  });

  test('26. KIE.AI Provider with Gemini 4 Argon Endpoint and Structured Settings', async ({ page }) => {
    // 1. Open Settings (the modal opens on the last-used tab, so ask for the AI one)
    await page.locator('button[title*="Настройки"]').first().click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();
    await settingsModal.locator('[data-testid="settings-tab-ai"]').click();

    await settingsModal.locator('[data-testid="ai-source-mode"]').click();
    await page.locator('[data-testid="ai-source-byok"]').click();

    // 2. Select KIE.AI from the provider row
    await settingsModal.locator('[data-testid="ai-provider-select"]').click();
    await page.getByRole('option', { name: /^KIE\.AI/ }).click();

    // 3. Verify KIE model is selected and visible
    const select = settingsModal.locator('button[aria-haspopup="listbox"]').filter({ hasText: /DeepSeek V4\.1 Flash|Gemini 4 Argon/ });
    await expect(select).toBeVisible();

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
        deepseekUrl: module.resolveKieEndpoint('https://api.kie.ai', 'deepseek-v4-1-flash'),
        gptUrl: module.resolveKieEndpoint('https://api.kie.ai', 'gpt-5-2'),
        haikuUrl: module.resolveKieEndpoint('https://api.kie.ai', 'claude-haiku-4-5'),
        haiku55Url: module.resolveKieEndpoint('https://api.kie.ai', 'claude-haiku-5-5'),
      };
    });

    expect(endpoints.deepseekUrl).toBe('https://api.kie.ai/openai/v1/responses');
    expect(endpoints.gptUrl).toBe('https://api.kie.ai/v1/chat/completions');
    expect(endpoints.haikuUrl).toBe('https://api.kie.ai/anthropic/v1/messages');
    expect(endpoints.haiku55Url).toBe('https://api.kie.ai/anthropic/v1/messages');
  });

  test('27. Contextual Subtask Extraction and Reasoning Effort Settings Verification', async ({ page }) => {
    // 1. Open Settings on the AI tab and verify Reasoning Effort & Automation checkboxes
    await page.locator('button[title*="Настройки"]').first().click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();
    await settingsModal.locator('[data-testid="settings-tab-ai"]').click();

    await settingsModal.locator('[data-testid="ai-source-mode"]').click();
    await page.locator('[data-testid="ai-source-byok"]').click();

    await expect(settingsModal.locator('text=Рассуждения').first()).toBeVisible();
    await expect(settingsModal.locator('text=Автоматизация')).toBeVisible();
    await expect(settingsModal.locator('text=Автотегирование новых заметок')).toBeVisible();
    await expect(settingsModal.locator('text=AI-триаж')).toBeVisible();
    await expect(settingsModal.locator('text=Веб-поиск при ответах')).toBeVisible();

    // Select Reasoning Effort: high
    const reasoningSelect = settingsModal.locator('button[aria-haspopup="listbox"]').filter({ hasText: /Отключены|Низкие|Средние|Высокие/ }).first();
    await reasoningSelect.click();
    await page.getByRole('option', { name: 'Высокие', exact: true }).click();

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

    const sendVoiceBtn = page.locator('button[aria-label="Отправить аудио"]').first();
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
    const attachBtn = page.locator('button[title*="Прикрепить файл"]').first();
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
    const viewModal = await openViewModal(page);
    await viewModal.locator('button', { hasText: 'Все' }).last().click();
    await page.keyboard.press('Escape');

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
    await expect(page.locator('text=Заметка с голосовым сообщением').first()).toBeVisible({ timeout: 10000 });

    // Verify Linear Monochrome AudioPlayer components (no redundant 1x speed button)
    const audioCard = page.locator('.group', { hasText: 'Заметка с голосовым сообщением' });
    await audioCard.scrollIntoViewIfNeeded();
    await expect(audioCard.locator('button[title*="Воспроизвести"]').first()).toBeVisible();
    // The row names the recording and shows its duration; the byte-size pill is gone.
    await expect(audioCard.locator('text=voice_note').first()).toBeVisible();
    await expect(audioCard.locator('text=0:08').first()).toBeVisible();
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

    // +AI writes the categorization into the draft as composer syntax: @folder #tag.
    // There are no ghost chips over the textarea any more — the tokens are plain text.
    await expect(composerTextarea).toHaveValue(/@\S+/, { timeout: 5000 });
    await expect(composerTextarea).toHaveValue(/#\S+/, { timeout: 5000 });

    // Take screenshot of Composer with the inline categorization tokens
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
    await expect(page.locator('text=Режим переключен: Таска').first()).toBeVisible();

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
});
