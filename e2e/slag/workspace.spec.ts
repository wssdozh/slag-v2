import { test, expect } from '@playwright/test';
import { setupSlag, openViewModal, switchToView } from '../support/slagSetup';

test.describe('SLAG v2 Specification E2E Verification - Workspace', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
  });

  test('audio folder selects preserve pin scope and keyboard selection', async ({ page }) => {
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_RELEASE',
        sourceLabel: 'panel-audio-folder-select-e2e',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 150,
        screenY: window.screenY + 150,
      });
      channel.close();
    });
    await page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Аудиоплеер' }).first().click();

    const folderSelect = page.getByRole('button', { name: 'Выбрать папку аудио', exact: true });
    const pin = page.getByRole('button', { name: 'Закрепить папку', exact: true });
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await folderSelect.focus();
    await page.keyboard.press('Space');
    await expect(folderSelect).toHaveAttribute('aria-expanded', 'true');
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const triggerBounds = await folderSelect.boundingBox();
    const menuBounds = await listbox.boundingBox();
    expect(triggerBounds).not.toBeNull();
    expect(menuBounds).not.toBeNull();
    expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(triggerBounds!.y);
    await folderSelect.dispatchEvent('keydown', { key: 'п' });
    await folderSelect.dispatchEvent('keydown', { key: 'р' });
    await expect(listbox.getByRole('option', { name: 'Проекты', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(folderSelect).toHaveText('Проекты');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');

    await page.locator('aside span', { hasText: 'Личное' }).first().click();
    await expect(folderSelect).toHaveText('Проекты');
    await page.getByRole('button', { name: 'Очередь и фильтры', exact: true }).click();
    const pinnedSelect = page.getByRole('button', { name: 'Закреплённая папка аудио', exact: true });
    await pinnedSelect.click();
    await page.getByRole('option', { name: 'Входящие', exact: true }).click();
    await page.getByRole('button', { name: 'Закрыть список', exact: true }).click();
    await expect(folderSelect).toHaveText('Входящие');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await pin.click();
    await expect(folderSelect).toHaveText('Личное');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');

    await folderSelect.click();
    await page.keyboard.press('Escape');
    await expect(folderSelect).toHaveAttribute('aria-expanded', 'false');
    await folderSelect.click();
    await page.locator('aside').first().click({ position: { x: 8, y: 8 } });
    await expect(folderSelect).toHaveAttribute('aria-expanded', 'false');
    await folderSelect.click();
    await expect(listbox).toHaveCSS('opacity', '1');
    await page.screenshot({ path: 'test-results/screenshots/audio-folder-select.png', fullPage: false });
  });

  test('48. Full Logging for Workspace Detach, Cross-Window Docking, Folder Navigation, and Log Download / Open Folder', async ({ page }) => {
    test.setTimeout(60000);
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Open Log Viewer HUD via sidebar button
    const logsBtn = page.locator('button[data-testid="sidebar-logs-btn"]');
    await expect(logsBtn).toBeVisible();
    await logsBtn.click();

    const logViewer = page.locator('div[data-testid="log-viewer"]');
    await expect(logViewer).toBeVisible();

    // 2. Verify WORKSPACE scope button exists in filter row
    const workspaceFilter = logViewer.locator('button', { hasText: 'WORKSPACE' });
    await expect(workspaceFilter).toBeVisible();

    // 3. Verify Log Download (.log and .json) and Open Folder action buttons
    const downloadPlainBtn = logViewer.locator('button[data-testid="log-download-plain"]');
    const downloadJsonBtn = logViewer.locator('button[data-testid="log-download-json"]');
    const openFolderBtn = logViewer.locator('button[data-testid="log-open-folder"]');

    await expect(downloadPlainBtn).toBeVisible();
    await expect(downloadJsonBtn).toBeVisible();
    await expect(openFolderBtn).toBeVisible();

    // 4. Test downloading plain text .log file
    const downloadPromisePlain = page.waitForEvent('download');
    await downloadPlainBtn.click();
    const downloadPlain = await downloadPromisePlain;
    expect(downloadPlain.suggestedFilename()).toMatch(/^slag_logs_.*\.log$/);

    // 5. Test downloading JSON log file
    const downloadPromiseJson = page.waitForEvent('download');
    await downloadJsonBtn.click();
    const downloadJson = await downloadPromiseJson;
    expect(downloadJson.suggestedFilename()).toMatch(/^slag_logs_.*\.json$/);

    // 6. Test Open Folder button
    await openFolderBtn.click();
    const folderToast = page.locator('div[role="status"], .fixed').filter({ hasText: /Папка открыта|Прямое открытие папки/ }).first();
    await expect(folderToast).toBeVisible();

    // 7. Close modal to interact with workspace
    await page.keyboard.press('Escape');
    await expect(logViewer).not.toBeVisible();

    // 8. Test folder navigation and return to Inbox (logs UI events)
    const projectsFolder = page.locator('aside span', { hasText: 'Проекты' }).first();
    await projectsFolder.click();
    const inboxBtn = page.locator('aside button', { hasText: 'Входящие' }).first();
    await inboxBtn.click();

    // 9. Test Cross-Window tab docking & log generation
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_RELEASE',
        sourceLabel: 'panel-audio-e2e',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 150,
        screenY: window.screenY + 150,
      });
    });

    const audioTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Аудиоплеер' }).first();
    await expect(audioTab).toBeVisible();

    // 10. Test tab detachment to floating group via context menu (logs WORKSPACE detach)
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click({ button: 'right' });
    const contextMenu = page.locator('.dv-context-menu');
    await expect(contextMenu).toBeVisible();
    await contextMenu.locator('.dv-context-menu-item', { hasText: 'Сделать плавающим' }).click({ force: true });

    // 11. Reopen Log Viewer and verify WORKSPACE logs
    await page.keyboard.press('Control+`');
    await expect(logViewer).toBeVisible();

    const workspaceLogs = await page.evaluate(() => {
      const entries = (window as any).logger ? (window as any).logger.getEntries() : [];
      return entries.filter((e: any) => e.scope === 'WORKSPACE');
    });
    expect(workspaceLogs.length).toBeGreaterThan(0);

    // Filter to WORKSPACE logs
    await workspaceFilter.click();
    await expect(logViewer.locator('text=[WORKSPACE]').first()).toBeVisible();

    // 12. Capture screenshot of Log Viewer with WORKSPACE logs and download actions
    await page.screenshot({
      path: 'test-results/screenshots/workspace-logging-and-logviewer.png',
      fullPage: false,
    });

    // 13. Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(logViewer).not.toBeVisible();
  });

  test('49. Default Vault "main", Second Brain taxonomy, and dedicated Vault Creation Modal', async ({ page }) => {
    // 1. Verify default vault name is "main" in sidebar bottom trigger
    const vaultTrigger = page.locator('aside button', { hasText: 'main' });
    await expect(vaultTrigger).toBeVisible();

    // 2. Verify Second Brain taxonomy folders exist in sidebar
    await expect(page.locator('aside button', { hasText: 'Входящие' })).toBeVisible();
    await expect(page.locator('text=Проекты').first()).toBeVisible();
    await expect(page.locator('text=База знаний').first()).toBeVisible();
    await expect(page.locator('text=Личное').first()).toBeVisible();

    // 3. Verify onboarding welcome note exists in feed
    await expect(page.locator('text=Добро пожаловать в SLAG').first()).toBeVisible();

    // 4. Open Vault dropdown
    await vaultTrigger.click();
    const dropdown = page.locator('.absolute.bottom-full');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=Хранилища (Vaults)')).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/vault-dropdown.png',
      fullPage: false,
    });

    // 5. Click "Создать новое хранилище..."
    const createVaultBtn = dropdown.locator('button', { hasText: 'Создать новое хранилище...' });
    await expect(createVaultBtn).toBeVisible();
    await createVaultBtn.click();

    // 6. Verify VaultModal opens
    const vaultModal = page.locator('.fixed.z-50', { hasText: 'Новое хранилище' });
    await expect(vaultModal).toBeVisible();
    await expect(vaultModal.locator('text=Локальное')).toBeVisible();
    await expect(vaultModal.locator('text=Папка на диске')).toBeVisible();

    // 7. Capture screenshot for visual inspection
    await page.screenshot({
      path: 'test-results/screenshots/vault-modal-created.png',
      fullPage: false,
    });

    // 7.1. Inspect Disk mode
    await vaultModal.locator('button', { hasText: 'Папка на диске' }).click();
    await page.screenshot({
      path: 'test-results/screenshots/vault-modal-disk.png',
      fullPage: false,
    });
    await vaultModal.locator('button', { hasText: 'Локальное' }).click();

    // 8. Test Escape LIFO closing
    await page.keyboard.press('Escape');
    await expect(vaultModal).not.toBeVisible();

    // 9. Reopen and actually create a new test vault
    await vaultTrigger.click();
    await createVaultBtn.click();
    await expect(vaultModal).toBeVisible();

    const nameInput = vaultModal.locator('input[placeholder*="work"]');
    await nameInput.fill('secondary');
    const submitBtn = vaultModal.locator('button', { hasText: 'Создать хранилище' });
    await submitBtn.click();

    // 10. Verify active vault is now "secondary"
    const secondaryTrigger = page.locator('aside button', { hasText: 'secondary' });
    await expect(secondaryTrigger).toBeVisible();

    // 11. Switch back to "main"
    await secondaryTrigger.click();
    const mainOption = page.locator('.absolute.bottom-full button', { hasText: 'main' });
    await mainOption.click();
    await expect(page.locator('aside button', { hasText: 'main' })).toBeVisible();

    // 12. Delete "secondary" vault via trash icon in dropdown
    await vaultTrigger.click();
    await page.screenshot({ path: 'test-results/screenshots/vault-dropdown-with-secondary.png' });
    const deleteSecondaryBtn = page.locator('.group\\/v', { hasText: 'secondary' }).locator('button[title="Удалить хранилище"]');
    await deleteSecondaryBtn.click();
    await expect(page.locator('.group\\/v', { hasText: 'secondary' })).toHaveCount(0);
  });

  test('51. Responsive compact FeedHeader without background underlays and with anti-collision layout', async ({ page }) => {
    // 1. Set viewport to narrower width (e.g. 860px) so center feed panel is ~480px (narrow mode)
    await page.setViewportSize({ width: 860, height: 720 });
    await page.waitForTimeout(300);

    // 2. Locate FeedHeader
    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    // 3. Open FolderViewModal to set Type Filter to "Таски"
    const modal = await openViewModal(page);
    const taskOption = modal.locator('button', { hasText: 'Таски' });
    await expect(taskOption).toBeVisible();
    await taskOption.click();
    await page.keyboard.press('Escape');

    // 4. Verify the active type filter badge appears in the header
    const taskBadge = page.locator('header span', { hasText: 'Таски' }).first();
    await expect(taskBadge).toBeVisible();

    // 6. Verify Composer new layout: top-right expand button, icon-only type selectors, TG-style mic/circle
    const expandBtn = page.locator('button[title*="Раскрыть в полноэкранный редактор"]').first();
    await expect(expandBtn).toBeVisible();

    const typeBtnComposer = page.locator('button[aria-label="Сменить тип записи"]').first();
    await expect(typeBtnComposer).toBeVisible();
    await typeBtnComposer.click();
    const taskOptionComposer = page.locator('body > div button', { hasText: 'Таска' }).first();
    await expect(taskOptionComposer).toBeVisible();
    await taskOptionComposer.click();

    // Verify empty state has media button (Mic or Video)
    const mediaBtn = page.locator('button[aria-label*="Записать"]').first();
    await expect(mediaBtn).toBeVisible();

    // Capture screenshot of new composer layout
    await page.screenshot({
      path: 'test-results/screenshots/new-composer-layout.png',
      fullPage: false,
    });
  });

  test('72. AudioPlayer sync with hybrid Inbox mode: loads voice notes from other folders in "all" mode', async ({ page }) => {
    // 1. Seed voice note in 'Личное' folder
    await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          const personalVoiceNote = {
            id: 'test_voice_in_personal_folder',
            type: 'note',
            title: 'Голосовая заметка из папки Личное',
            content: 'Быстрый войс в личном',
            folder: 'Личное',
            tags: ['войс'],
            attachments: [
              {
                id: 'att_voice_personal_01',
                name: 'voice_18-05-22.webm',
                type: 'audio',
                mimeType: 'audio/webm',
                size: 45800,
                duration: 2,
                relativePath: '.attachments/voice_18-05-22.webm',
                dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          items.push(personalVoiceNote);
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
    });

    // 2. Reload to apply seeded data
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 3. Open AudioPlayer tab in Dockview
    const centerAddTabBtn = page.locator('.dv-groupview').nth(1).locator('button[title="Добавить вкладку в эту группу"]');
    await expect(centerAddTabBtn).toBeVisible();
    await centerAddTabBtn.click();

    const audioMenuOption = page.locator('button', { hasText: 'Аудиоплеер' });
    await expect(audioMenuOption).toBeVisible();
    await audioMenuOption.click();

    const audioTab = page.locator('.dv-tab, [role="tab"]').filter({ hasText: 'Аудиоплеер' }).first();
    await expect(audioTab).toBeVisible();

    // 4. Verify that AudioPlayer finds the voice note instead of showing "В папке нет аудиозаписей"
    await expect(page.locator('text=В папке нет аудиозаписей')).not.toBeVisible();
    await expect(page.locator('text=voice_18-05-22.webm')).toBeVisible();
    await expect(page.locator('text=Голосовая заметка из папки Личное')).toBeVisible();

    // 5. Take screenshot for visual audit
    await page.screenshot({
      path: 'test-results/screenshots/dockview-audioplayer-inbox-all-sync.png',
      fullPage: false,
    });
  });

  test('49. Calendar Week View timeline hour height resize ("опоп чутка") and Month View direct composer', async ({ page }) => {
    // 1. Switch to Calendar view
    await switchToView(page, 'calendar');
    await page.waitForTimeout(300);

    // 2. Ensure Week view is active
    const weekBtn = page.locator('button', { hasText: 'Неделя' }).first();
    await weekBtn.click();
    await page.waitForTimeout(200);

    // 3. Locate the time ruler column
    const timeRuler = page.locator('[data-testid="timeline-hour-ruler"]');
    await expect(timeRuler).toBeVisible();

    // 4. Check an hour marker (e.g. 10:00) has cursor-ns-resize and data-resize-handle
    const marker10 = page.locator('[data-testid="timeline-hour-ruler"] [data-hour="10"]');
    await marker10.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await expect(marker10).toBeVisible();
    await expect(marker10).toHaveClass(/cursor-ns-resize/);

    // Initial height of the marker should be 52px
    const initialBox = await marker10.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(Math.round(initialBox!.height)).toBe(52);

    // 5. Drag the marker down to resize the timeline
    const markerBox = (await marker10.boundingBox())!;
    await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
    await page.mouse.down();

    // Move down by 45px to trigger live tooltip and resize
    await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2 + 45, { steps: 5 });
    await page.waitForTimeout(150);

    // Verify live floating tooltip ("опоп чутка") appears
    const liveTooltip = page.locator('[data-testid="timeline-resize-tooltip"]');
    await expect(liveTooltip).toBeVisible();

    // Capture screenshot of interactive timeline resize with live tooltip badge
    await page.screenshot({
      path: 'test-results/screenshots/calendar-timeline-resize-live.png',
      fullPage: false,
    });

    // Release mouse
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Verify that the hour marker is now taller
    const resizedBox = await marker10.boundingBox();
    expect(resizedBox!.height).toBeGreaterThan(52);

    // Capture screenshot of expanded timeline in Week view
    await page.screenshot({
      path: 'test-results/screenshots/calendar-timeline-expanded-week.png',
      fullPage: false,
    });

    // Drag further down to test 15-minute division level ("приближение линии")
    const currentBox = (await marker10.boundingBox())!;
    await page.mouse.move(currentBox.x + currentBox.width / 2, currentBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(currentBox.x + currentBox.width / 2, currentBox.y + 110, { steps: 8 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Verify 15-minute sub-divisions appear
    const min15Slot = page.locator('[data-testid="timeline-hour-ruler"] [data-minute="15"]').first();
    await expect(min15Slot).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/calendar-timeline-15m-divisions.png',
      fullPage: false,
    });

    // 6. Double click marker to reset back to 52px
    await marker10.dblclick();
    await page.waitForTimeout(200);

    const resetBox = await marker10.boundingBox();
    expect(Math.round(resetBox!.height)).toBe(52);

    // 7. Switch to Month View and verify direct composer opening
    const monthBtn = page.locator('button', { hasText: 'Месяц' }).first();
    await monthBtn.click();
    await page.waitForTimeout(200);

    // Click on a month day cell
    const monthCell = page.locator('[data-drop-zone="calendar-month"]').nth(15);
    await expect(monthCell).toBeVisible();
    await monthCell.click();
    await page.waitForTimeout(200);

    // Verify that ComposerModal opened directly (no empty intermediate modal!)
    const composerDialog = page.locator('[role="dialog"]').filter({ hasText: 'Новая задача' });
    await expect(composerDialog).toBeVisible();

    // Capture screenshot of directly opened composer in Month view
    await page.screenshot({
      path: 'test-results/screenshots/calendar-month-direct-composer.png',
      fullPage: false,
    });

    await page.keyboard.press('Escape');
    await expect(composerDialog).not.toBeVisible();
  });

  test('53. Workspace Demo Seeding and Empty State Mini-Component', async ({ page }) => {
    // 1. Verify default vault trigger
    const vaultTrigger = page.locator('aside button', { hasText: 'main' });
    await expect(vaultTrigger).toBeVisible();

    // 2. Open VaultModal and create new vault "demo_check"
    await vaultTrigger.click();
    const dropdown = page.locator('.absolute.bottom-full');
    await expect(dropdown).toBeVisible();

    const createVaultBtn = dropdown.locator('button', { hasText: 'Создать новое хранилище...' });
    await createVaultBtn.click();

    const vaultModal = page.locator('.fixed.z-50', { hasText: 'Новое хранилище' });
    await expect(vaultModal).toBeVisible();

    const nameInput = vaultModal.locator('input[placeholder*="work"]');
    await nameInput.fill('demo_check');
    const submitBtn = vaultModal.locator('button', { hasText: 'Создать хранилище' });
    await submitBtn.click();

    // 3. Verify newly created vault "demo_check" is active
    const demoCheckTrigger = page.locator('aside button', { hasText: 'demo_check' });
    await expect(demoCheckTrigger).toBeVisible();

    // 4. Fresh vaults start clean (f239d6b) and offer the demo seeder in the empty state
    await expect(page.locator('text=Хранилище пустое')).toBeVisible();
    await page.locator('button', { hasText: 'Сгенерировать демо-заметки и папки' }).click();

    // 5. Verify demo note exists in Входящие
    await expect(page.locator('text=Добро пожаловать в SLAG').first()).toBeVisible();

    // 6. Navigate to Проекты and verify demo task exists
    const projectsBtn = page.locator('aside span', { hasText: 'Проекты' }).first();
    await projectsBtn.click();
    await expect(page.locator('text=План работы над проектом').first()).toBeVisible();

    // 7. Navigate to База знаний and verify demo note exists
    const kbBtn = page.locator('aside span', { hasText: 'База знаний' }).first();
    await kbBtn.click();
    await expect(page.locator('text=Горячие клавиши и разметка').first()).toBeVisible();

    // 7. Clear items in localStorage for this vault to test Empty State Mini-Component
    await page.evaluate(() => {
      const currentVaultRaw = localStorage.getItem('slag_current_vault_v2');
      if (currentVaultRaw) {
        const currentVault = JSON.parse(currentVaultRaw);
        localStorage.setItem(`slag_items_${currentVault.id}`, JSON.stringify([]));
        window.location.reload();
      }
    });

    // 8. Verify empty state mini-component appears
    const emptyHeading = page.locator('text=Хранилище пустое');
    await expect(emptyHeading).toBeVisible();

    const seedButton = page.locator('button', { hasText: 'Сгенерировать демо-заметки и папки' });
    await expect(seedButton).toBeVisible();

    // Capture visual screenshot of the empty vault mini-component
    await page.screenshot({
      path: 'test-results/screenshots/empty-vault-demo-seeder.png',
      fullPage: false,
    });

    // 9. Click seed button
    await seedButton.click();
    await expect(page.locator('text=Горячие клавиши и разметка').first()).toBeVisible();

    const inboxBtn = page.locator('aside button', { hasText: 'Входящие' }).first();
    await inboxBtn.click();
    await expect(page.locator('text=Добро пожаловать в SLAG').first()).toBeVisible();

    // 10. Switch back to "main" and delete "demo_check"
    const currentTrigger = page.locator('aside button', { hasText: 'demo_check' });
    await currentTrigger.click();
    const mainOption = page.locator('.absolute.bottom-full button', { hasText: 'main' });
    await mainOption.click();
    await expect(page.locator('aside button', { hasText: 'main' })).toBeVisible();

    await vaultTrigger.click();
    const deleteDemoCheckBtn = page.locator('.group\\/v', { hasText: 'demo_check' }).locator('button[title="Удалить хранилище"]');
    await deleteDemoCheckBtn.click();
    await expect(page.locator('.group\\/v', { hasText: 'demo_check' })).toHaveCount(0);
  });

  test('54. Migrated Obsidian Vault Structure, Subfolder Tree and Orama Search', async ({ page }) => {
    const fs = await import('fs');
    const path = await import('path');
    const appData = process.env.APPDATA || '';
    const mainDir = path.join(appData, 'com.slag.notes', 'vaults', 'main');
    const statePath = path.join(mainDir, 'state.json');
    const notesBase = path.join(mainDir, 'notes');

    if (fs.existsSync(statePath) && fs.existsSync(notesBase)) {
      const rawState = fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, '');
      const stateContent = JSON.parse(rawState);
      const scanFiles = (dir: string): any[] => {
        const results: any[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== '.trash' && entry.name !== '.attachments') {
              results.push(...scanFiles(full));
            }
          } else if (entry.name.endsWith('.md')) {
            const raw = fs.readFileSync(full, 'utf8');
            const fallbackId = entry.name.replace(/\.md$/, '');
            const folderPart = full.slice(notesBase.length + 1, full.lastIndexOf(path.sep)).replace(/\\/g, '/');
            const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
            let title = fallbackId;
            const tags: string[] = [];
            let type = 'note';
            let content = raw;
            if (fmMatch) {
              content = fmMatch[2].trim();
              const lines = fmMatch[1].split('\n');
              for (const l of lines) {
                if (l.startsWith('title:')) title = l.replace(/^title:\s*"?/, '').replace(/"?\s*$/, '');
                if (l.startsWith('type:')) type = l.replace(/^type:\s*/, '').trim();
              }
            }
            results.push({
              id: fallbackId,
              type,
              title,
              content,
              folder: folderPart || 'Входящие',
              tags,
              attachments: [],
              createdAt: Date.now() - 3600000,
              updatedAt: Date.now() - 3600000,
            });
          }
        }
        return results;
      };

      const scannedItems = scanFiles(notesBase);

      await page.evaluate(({ folders, items }) => {
        localStorage.setItem('slag_folders_default_vault', JSON.stringify(folders));
        localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
        window.location.reload();
      }, { folders: stateContent.folders, items: scannedItems });

      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

      const aside = page.locator('aside');
      await expect(aside.locator('span', { hasText: 'Проекты' }).first()).toBeVisible();
      await expect(aside.locator('span', { hasText: 'База знаний' }).first()).toBeVisible();
      await expect(aside.locator('span', { hasText: 'Личное' }).first()).toBeVisible();

      await aside.locator('span', { hasText: 'Проекты' }).first().click();
      await expect(aside.locator('span', { hasText: 'Игры' }).first()).toBeVisible();
      await expect(aside.locator('span', { hasText: 'Боты' }).first()).toBeVisible();

      await aside.locator('span', { hasText: 'Игры' }).first().click();
      await expect(page.locator('text=Киберпанк майнинг').or(page.locator('text=cyberpunk_mining')).or(page.locator('text=BlockSorting')).first()).toBeVisible();
      await expect(page.locator('text=Драматическая RPG').first()).toBeVisible();

      await page.screenshot({
        path: 'test-results/screenshots/migrated-games-folder.png',
        fullPage: false,
      });

      await aside.locator('span', { hasText: 'База знаний' }).first().click();
      await expect(aside.locator('span', { hasText: 'C# и Unity' }).first()).toBeVisible();
      await aside.locator('span', { hasText: 'C# и Unity' }).first().click();
      await expect(page.locator('text=C# / Unity / Designing Rules').first()).toBeVisible();

      // Verify "Статья" badge is visible on the card
      await expect(page.locator('.group', { hasText: 'C# / Unity / Designing Rules' }).locator('text=Статья')).toBeVisible();

      // Test type filter: select "Статьи"
      const mainPane = page.locator('main').first();
      await mainPane.locator('button[title="Только статьи"]').click();
      await expect(mainPane.locator('text=C# / Unity / Designing Rules').first()).toBeVisible();

      await page.screenshot({
        path: 'test-results/screenshots/migrated-articles-filter.png',
        fullPage: false,
      });

      // Reset filter back to "Все"
      await mainPane.locator('button[title="Все типы записей"]').click();

      await page.keyboard.press('Control+k');
      const searchModal = page.locator('.fixed.z-50');
      const searchInput = searchModal.locator('input[placeholder*="Поиск по заметкам"]');
      await expect(searchInput).toBeVisible();
      await searchInput.fill('BlockSorting');
      await expect(searchModal.locator('text=BlockSorting').first()).toBeVisible();

      await page.screenshot({
        path: 'test-results/screenshots/migrated-orama-search.png',
        fullPage: false,
      });

      await page.keyboard.press('Escape');
      await expect(searchModal).not.toBeVisible();
    }
  });

  test('55. Task and Subtask Inline Markdown Rendering and Link Click Isolation', async ({ page }) => {
    // 1. Inject a task with markdown links, bold text, and subtasks
    await page.evaluate(() => {
      const taskItem = {
        id: 'test_md_task_1',
        type: 'task',
        title: 'Тестовая задача с [ссылкой](https://example.com) и **жирным**',
        content:
          '- [ ] Книга о улучшении логики и памяти "[Быстрый ум](https://ozon.ru/test)"\n' +
          '- [ ] [видосик](https://youtube.com/watch) от автора\n' +
          '- [ ] Обычная подзадача без разметки',
        folder: 'Входящие',
        tags: ['тест'],
        status: 'todo',
        priority: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachments: [],
        subtasks: [
          { id: 'st_1', title: 'Книга о улучшении логики и памяти "[Быстрый ум](https://ozon.ru/test)"', completed: false },
          { id: 'st_2', title: '[видосик](https://youtube.com/watch) от автора', completed: false },
          { id: 'st_3', title: 'Обычная подзадача без разметки', completed: false },
        ]
      };

      const storageKey = 'slag_items_default_vault';
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      localStorage.setItem(storageKey, JSON.stringify([taskItem, ...existing]));
      window.location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 2. Locate the task card
    const card = page.locator('.group', { hasText: 'Тестовая задача с' }).first();
    await expect(card).toBeVisible();

    // 3. Verify task title markdown link rendered
    const titleLink = card.locator('h3 a', { hasText: 'ссылкой' });
    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveAttribute('href', 'https://example.com');

    // 4. Verify subtasks markdown links rendered as <a>, not raw markdown brackets
    const subtaskLink1 = card.locator('a', { hasText: 'Быстрый ум' });
    await expect(subtaskLink1).toBeVisible();
    await expect(subtaskLink1).toHaveAttribute('href', 'https://ozon.ru/test');

    const subtaskLink2 = card.locator('a', { hasText: 'видосик' });
    await expect(subtaskLink2).toBeVisible();
    await expect(subtaskLink2).toHaveAttribute('href', 'https://youtube.com/watch');

    // Verify raw markdown brackets are NOT in visible text
    const cardText = await card.innerText();
    expect(cardText).not.toContain('[Быстрый ум](');
    expect(cardText).not.toContain('[видосик](');

    // 5. Capture screenshot of rendered task with markdown subtasks
    await page.screenshot({
      path: 'test-results/screenshots/task-subtasks-markdown.png',
      fullPage: false,
    });
  });

  test('56. Note Markdown tight line spacing without extra whitespace in lists', async ({ page }) => {
    // 1. Inject note with numbered list and paragraphs
    await page.evaluate(() => {
      const noteItem = {
        id: 'test_tight_spacing_note',
        type: 'note',
        title: 'Контент: Идеи тем для роликов и блогов',
        content:
          '# идеи для роликов\n\n' +
          'Кратко: Список идей для роликов.\n\n' +
          '#идеи #блоггинг #видео #review\n\n' +
          'идеи для роликов:\n' +
          '1. Как привлечь твоё внимание\n' +
          '2. Соцсети это инструмент\n' +
          '3. Почему ты ребёнок в 25?\n' +
          '4. тикток идеальный наркотик (покрывает визуалов и аудиалов)',
        folder: 'Входящие',
        tags: ['контент', 'идеи'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachments: [],
      };

      const storageKey = 'slag_items_default_vault';
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      localStorage.setItem(storageKey, JSON.stringify([noteItem, ...existing]));
      window.location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const card = page.locator('.group', { hasText: 'идеи для роликов:' }).first();
    await expect(card).toBeVisible();

    // Verify list items exist and are compact
    const listItems = card.locator('ol li');
    await expect(listItems).toHaveCount(4);

    // Verify list height is compact (not blown up by whitespace-pre-wrap)
    const olBox = await card.locator('ol').boundingBox();
    expect(olBox).toBeTruthy();
    expect(olBox!.height).toBeLessThan(120);

    // Capture screenshot to visually verify tight spacing
    await page.screenshot({
      path: 'test-results/screenshots/note-tight-markdown-spacing.png',
      fullPage: false,
    });
  });

  test('57. Assistant Action Diff Modal (Side-by-side) and Batch Navigation & Truncation', async ({ page }) => {
    // 1. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await assistantTab.click();

    const textarea = page.locator('textarea[placeholder*="Спросите"]').first();
    await expect(textarea).toBeVisible();

    // 2. Trigger batch update action via local intent orchestrator
    await textarea.fill('можешь у всех сегодняшних задач сделать минимум приоритета');
    await textarea.press('Enter');

    // 3. Verify batch update action card appears
    const card = page.locator('[data-testid="action-card"], .max-w-xl').last();
    await expect(card).toBeVisible({ timeout: 5000 });

    // Verify the diff trigger (icon button in the card header) is visible in card
    const compareBtn = card.locator('button[title*="Сравнить изменения"]').first();
    await expect(compareBtn).toBeVisible();

    // Verify individual jump and diff icons exist on each row
    const rowDiffBtn = card.locator('button[title*="Посмотреть изменения"]').first();
    await expect(rowDiffBtn).toBeVisible();
    const rowJumpBtn = card.locator('button[title*="Перейти к"]').first();
    await expect(rowJumpBtn).toBeVisible();

    // 4. Click "Сравнить" to open Side-by-side DiffModal
    await compareBtn.click();
    const modal = page.locator('div[role="dialog"]').first();
    await expect(modal).toBeVisible();
    await expect(modal.locator('text=Сравнение').first()).toBeVisible();
    await expect(modal.locator('text=Было (Текущая версия)')).toBeVisible();
    await expect(modal.locator('text=Стало (Предлагаемая версия)')).toBeVisible();

    // Capture visual screenshot of Side-by-side DiffModal
    await page.screenshot({
      path: 'test-results/screenshots/assistant-diff-modal-side-by-side.png',
      fullPage: false,
    });

    // 5. Close modal
    await modal.locator('button', { hasText: 'Закрыть' }).click();
    await expect(modal).not.toBeVisible();

    // 6. Click Apply
    const applyBtn = card.locator('button', { hasText: /Применить/ }).first();
    await applyBtn.click();

    // 7. Verify applied state layout
    // Label is truncated and footer doesn't overflow
    await expect(card.locator('text=/Приоритет|Применено/').first()).toBeVisible({ timeout: 5000 });
    const appliedCompareBtn = card.locator('button', { hasText: 'Сравнить' }).last();
    await expect(appliedCompareBtn).toBeVisible();

    // Capture visual screenshot of applied batch card
    await page.screenshot({
      path: 'test-results/screenshots/assistant-batch-applied-no-overflow.png',
      fullPage: false,
    });

    // 8. Test content addition / line highlighting in DiffModal
    await textarea.fill('можешь добавить этой таске подробности: требуемые инструменты бритва и пена');
    await textarea.press('Enter');

    const updateCard = page.locator('[data-testid="action-card"], .max-w-xl').last();
    await expect(updateCard).toBeVisible({ timeout: 5000 });
    const contentCompareBtn = updateCard.locator('button[title*="Сравнить изменения"]').first();
    await expect(contentCompareBtn).toBeVisible();

    await contentCompareBtn.click();
    const contentModal = page.locator('div[role="dialog"]').first();
    await expect(contentModal).toBeVisible();
    await expect(contentModal.locator('.bg-emerald-500\\/30').first()).toBeVisible();

    // Capture visual screenshot of content diff with green added line highlighting
    await page.screenshot({
      path: 'test-results/screenshots/assistant-diff-modal-content-lines.png',
      fullPage: false,
    });

    await contentModal.locator('button', { hasText: 'Закрыть' }).click();
    await expect(contentModal).not.toBeVisible();
  });
});
