import { test, expect } from './support/selfhostFixture';
import * as fs from 'fs';
import * as path from 'path';

test.describe('E2EE Synchronization & Non-Telemetry SAS Pairing Flow', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('verifies subscription banner, PIN generation, and SAS consent approval flow', async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

    let claimed = false;
    let approved = false;
    await page.route('**/api/pair/create', route => route.fulfill({ json: {
      pin: '123-456', sessionId: 'isolated-settings-pair', expiresIn: 300,
      hostDeviceId: 'test-host', hostPublicKey: 'test-host-public-key', qrPayload: 'slag://pair?pin=123-456',
    } }));
    await page.route('**/api/pair/poll*', route => route.fulfill({ json: {
      sessionId: 'isolated-settings-pair', status: claimed ? 'pending_approval' : 'pending_guest',
      sasCode: '4921', expiresIn: 280,
    } }));
    await page.route('**/api/pair/approve', route => {
      approved = true;
      return route.fulfill({ json: { status: 'approved' } });
    });
    // All relay traffic is fulfilled locally; no production account or PIN is used.
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Verify sidebar footer live sync status button (next to main vault, terminal, settings)
    const sidebarSyncBtn = page.locator('[data-testid="sidebar-sync-btn"]');
    await expect(sidebarSyncBtn).toBeVisible({ timeout: 10000 });

    // Capture screenshot of sidebar footer with live sync indicator
    await page.screenshot({
      path: 'test-results/screenshots/sidebar_footer_sync_indicator.png',
      fullPage: false,
    });

    // 3. The status panel links to the sync tab.
    await sidebarSyncBtn.click();
    await page.getByTestId('sidebar-sync-open-settings').click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // 4. Verify the account card (plan, expiry, cache) lives in the "Аккаунт" tab
    await settingsModal.getByTestId('settings-tab-account').click();
    await expect(settingsModal.getByText('Self-hosted', { exact: false }).first()).toBeVisible();
    await expect(settingsModal.getByText('Свой сервер', { exact: true })).toBeVisible();
    await expect(settingsModal.getByText('Кеш', { exact: true })).toBeVisible();

    // 5. Back to sync: the status and the server address share one refresh control.
    await settingsModal.getByTestId('settings-tab-sync').click();
    await expect(settingsModal.getByTestId('sync-refresh-btn')).toBeVisible();
    await expect(settingsModal.getByRole('button', { name: 'Синхронизировать', exact: true })).toHaveCount(0);
    await expect(settingsModal.getByRole('button', { name: 'Проверить', exact: true })).toHaveCount(0);
    // The key rotation row keeps its title and button; the consequences live in the confirm dialog.
    await expect(settingsModal.getByText('Все устройства потребуют нового приглашения.')).toHaveCount(0);

    // One refresh button for the whole card.
    await page.screenshot({
      path: 'test-results/screenshots/sync-single-refresh.png',
      fullPage: false,
    });

    // Screenshot of Unified Header Card & Clean Sync Tab
    await page.screenshot({
      path: 'test-results/screenshots/sync_settings_unified_header_card.png',
      fullPage: false,
    });

    const conflictSwitch = settingsModal.getByRole('switch', { name: 'В конфликте оставлять версию релея' });
    await expect(conflictSwitch).not.toBeChecked();
    await conflictSwitch.click();
    await expect(page.getByText('Не сохранять отклонённые правки?', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Оставлять версию релея', exact: true }).click();
    await expect(conflictSwitch).toBeChecked();
    await conflictSwitch.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/sync-note-conflicts.png' });
    await conflictSwitch.click();
    await expect(conflictSwitch).not.toBeChecked();

    // 6. Test Background Sync Interval (Battery Saver)
    const intervalSelect = settingsModal.locator('[data-testid="sync-interval-select"]');
    await expect(intervalSelect).toBeVisible();
    await intervalSelect.scrollIntoViewIfNeeded();
    await intervalSelect.click();
    await page.locator('[data-testid="sync-interval-30"]').click();
    await expect(intervalSelect).toContainText('30 мин');

    await intervalSelect.click();
    await page.locator('[data-testid="sync-interval-0"]').click();
    await expect(intervalSelect).toContainText('Мгновенно');

    // Screenshot of Battery Saver & Server section
    await page.screenshot({
      path: 'test-results/screenshots/sync_settings_cache_and_battery.png',
      fullPage: false,
    });

    // 7. Switch to "Устройства" tab
    await settingsModal.locator('button[data-tab="devices"]').click();
    await expect(settingsModal.getByTestId('btn-open-pair-modal')).toBeEnabled();

    // Test Pairing Modal & PIN Display
    const pairBtn = settingsModal.locator('button', { hasText: 'Привязать устройство' });
    await expect(pairBtn).toBeVisible();
    await pairBtn.click();

    const pairModal = page.locator('[data-testid="pair-device-modal"]');
    await expect(pairModal).toBeVisible({ timeout: 5000 });

    const pinDisplay = pairModal.locator('.font-mono.text-2xl.font-bold');
    await expect(pinDisplay).toBeVisible({ timeout: 15000 });
    await expect(pinDisplay).toHaveText(/^\d{3}-\d{3}$/, { timeout: 15000 });
    const pinText = (await pinDisplay.textContent())?.trim();
    expect(pinText).toMatch(/^\d{3}-\d{3}$/);

    // Capture screenshot of clean pair device modal with ready PIN
    await page.screenshot({
      path: 'test-results/screenshots/pair_device_modal_clean.png',
      fullPage: false,
    });

    // 8. Simulate guest claiming PIN over relay API (without sending device name or OS)
    claimed = true;
    const claimData = { sasCode: '4921' };

    // 9. Host should detect the claim and show Approval Card with matching SAS code
    const approvalCard = pairModal.locator('text=Запрос на подключение');
    await expect(approvalCard).toBeVisible({ timeout: 10000 });

    const sasBadge = pairModal.locator(`strong:has-text("${claimData.sasCode}")`);
    await expect(sasBadge).toBeVisible();

    const approveBtn = pairModal.locator('button', { hasText: 'Разрешить доступ' });
    const rejectBtn = pairModal.locator('button', { hasText: 'Отклонить' });
    await expect(approveBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();

    // Screenshot of Human-in-the-Loop Consent Request Card inside modal
    await page.screenshot({
      path: 'test-results/screenshots/sync_approval_request.png',
      fullPage: false,
    });

    // 9. Approve pairing
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    await approveBtn.click();
    await expect.poll(() => approved).toBe(true);

    // Verify approval completed and new device is added to trusted devices
    await expect(settingsModal.locator(`text=Устройство ${claimData.sasCode}`)).toBeVisible({ timeout: 5000 });

    // Screenshot of approved device in list
    await page.screenshot({
      path: 'test-results/screenshots/sync_device_approved.png',
      fullPage: false,
    });
  });
});
