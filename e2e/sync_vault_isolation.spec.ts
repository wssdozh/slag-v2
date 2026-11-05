import { test, expect } from './support/selfhostFixture';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Sync Vault Isolation and Merge Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));
    await page.route('**/api/rooms/**', route => route.fulfill({ json: { bundles: [] } }));
    await page.routeWebSocket(/\/ws\//, socket => {
      socket.send(JSON.stringify({ type: 'welcome', connectedDevices: 1 }));
    });
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('creates an isolated vault when receiving a new vaultId, and merges when vaultId matches', async ({ page }) => {
    // 1. Open app
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial vault is 'main'
    await expect(page.locator('text=main').first()).toBeVisible({ timeout: 10000 });

    // Mock relay endpoints for pairing as Guest
    const validSeed = 'apple banana cherry dog elephant fox grape horse ice jaguar kite lemon';
    const testVaultId = 'vault_remote_projects';
    const testVaultName = 'Удалённые проекты 🔒';

    await page.route('**/api/pair/claim', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'sess_test_guest_123',
          sasCode: '4921',
          status: 'pending_approval',
        }),
      });
    });

    await page.route('**/api/pair/poll*', async (route) => {
      const exchangeData = {
        seedPhrase: validSeed,
        vaultId: testVaultId,
        vaultName: testVaultName,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'sess_test_guest_123',
          status: 'approved',
          sasCode: '4921',
          // base64-encoded payload text as expected by pairing.ts
          exchangePayload: Buffer.from(JSON.stringify(exchangeData)).toString('base64'),
          expiresIn: 250,
        }),
      });
    });

    // 2. Open Settings -> Sync tab
    const sidebarSyncBtn = page.locator('[data-testid="sidebar-sync-btn"]');
    await expect(sidebarSyncBtn).toBeVisible({ timeout: 10000 });
    await sidebarSyncBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // 3. Open Pair Device Modal (pairing lives on the "Устройства" tab)
    await settingsModal.getByTestId('settings-tab-devices').click();
    const pairBtn = settingsModal.getByTestId('btn-open-pair-modal');
    await expect(pairBtn).toBeVisible();
    await pairBtn.click();

    const pairModal = page.locator('[data-testid="pair-device-modal"]');
    await expect(pairModal).toBeVisible({ timeout: 5000 });

    // 4. Switch to Guest tab (Ввести PIN)
    const guestTabBtn = pairModal.locator('[data-testid="pair-modal-tab-guest"]');
    await guestTabBtn.click();

    const pinInput = pairModal.locator('input[placeholder="123-456"]');
    await expect(pinInput).toBeVisible();
    await pinInput.fill('789-012');

    const connectBtn = pairModal.locator('button', { hasText: 'Подключить устройство' });
    await connectBtn.click();

    // 5. Verify isolated vault creation
    // Toast should report creation of separate vault
    await expect(page.getByText('Хранилище «Удалённые проекты 🔒» подключено', { exact: true })).toBeVisible({ timeout: 10000 });

    // Modal should be closed
    await expect(pairModal).not.toBeVisible();

    // Close settings modal to inspect sidebar
    const closeSettingsBtn = settingsModal.locator('button').first();
    await closeSettingsBtn.click();

    // Verify current vault name in sidebar is now 'Удалённые проекты 🔒'
    await expect(page.locator('text=Удалённые проекты 🔒').first()).toBeVisible({ timeout: 5000 });

    // Take screenshot of isolated vault in sidebar
    await page.screenshot({
      path: 'test-results/screenshots/sync_isolated_vault_created.png',
      fullPage: false,
    });

    // 6. Test Scenario 2: Repeat pairing with the SAME vaultId (should MERGE, not create a 3rd vault)
    await sidebarSyncBtn.click();
    await expect(settingsModal).toBeVisible({ timeout: 5000 });
    await settingsModal.getByTestId('settings-tab-devices').click();
    await pairBtn.click();
    await expect(pairModal).toBeVisible({ timeout: 5000 });

    await guestTabBtn.click();
    await pinInput.fill('789-012');
    await connectBtn.click();

    // Toast should now say "Слияние с хранилищем «Удалённые проекты 🔒»"
    await expect(page.getByText('Хранилище «Удалённые проекты 🔒» подключено', { exact: true })).toBeVisible({ timeout: 10000 });

    // Verify total vaults in storage: should still be 2 (main + Удалённые проекты 🔒)
    const vaultsCount = await page.evaluate(() => {
      const raw = localStorage.getItem('slag_vaults_v2');
      return raw ? JSON.parse(raw).length : 1;
    });
    expect(vaultsCount).toBe(2);

    // Take screenshot of merged state
    await page.screenshot({
      path: 'test-results/screenshots/sync_vault_merged_dedup.png',
      fullPage: false,
    });
  });

  test('host approves pairing with serialized PairingExchangePayload containing vaultId', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    let approvedPayload: any = null;

    await page.route('**/api/pair/create', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pin: '333-777',
          sessionId: 'sess_host_test_888',
          expiresIn: 300,
          hostDeviceId: 'host_dev_1',
          hostPublicKey: 'pk_host_1',
          qrPayload: 'slag://pair?pin=333-777',
        }),
      });
    });

    let polledTimes = 0;
    await page.route('**/api/pair/poll?*', async (route) => {
      polledTimes++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'sess_host_test_888',
          status: polledTimes >= 2 ? 'pending_approval' : 'pending_guest',
          sasCode: '9182',
          expiresIn: 280,
        }),
      });
    });

    await page.route('**/api/pair/approve', async (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() || '{}');
      if (body.encryptedPayload) {
        try {
          const decodedText = Buffer.from(body.encryptedPayload, 'base64').toString('utf8');
          approvedPayload = JSON.parse(decodedText);
        } catch {
          approvedPayload = body.encryptedPayload;
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 'approved' }),
      });
    });

    // Open settings, switch to the "Устройства" tab and open the pair modal
    const sidebarSyncBtn = page.locator('[data-testid="sidebar-sync-btn"]');
    await sidebarSyncBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await settingsModal.getByTestId('settings-tab-devices').click();
    const pairBtn = settingsModal.getByTestId('btn-open-pair-modal');
    await pairBtn.click();

    const pairModal = page.locator('[data-testid="pair-device-modal"]');
    await expect(pairModal).toBeVisible();

    // Wait for approval card to show SAS code
    const approvalCard = pairModal.locator('text=Запрос на подключение');
    await expect(approvalCard).toBeVisible({ timeout: 15000 });
    await expect(pairModal.locator('strong:has-text("9182")')).toBeVisible();

    // Click approve
    const approveBtn = pairModal.locator('button', { hasText: 'Разрешить доступ' });
    await approveBtn.click();

    // Verify approved payload on host contains vaultId and vaultName
    await expect.poll(() => approvedPayload).not.toBeNull();
    expect(approvedPayload).toHaveProperty('vaultId');
    expect(approvedPayload).toHaveProperty('vaultName');
    expect(approvedPayload).toHaveProperty('seedPhrase');
    expect(approvedPayload.vaultId).toBe('default_vault');
    expect(approvedPayload.vaultName).toBe('main');
  });
});
