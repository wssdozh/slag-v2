import { test, expect } from '@playwright/test';
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

    // 1. Open app
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Open Settings modal
    const settingsBtn = page.locator('button[title*="Настройки"]').first();
    await expect(settingsBtn).toBeVisible({ timeout: 10000 });
    await settingsBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // 3. Switch to "Синхронизация" tab
    const syncTabBtn = settingsModal.locator('button[data-testid="settings-tab-sync"]');
    await expect(syncTabBtn).toBeVisible();
    await syncTabBtn.click();

    // 4. Verify Subscription Banner with Smile Tier & Cache Quota
    await expect(settingsModal.locator('text=SLAG Smile')).toBeVisible();
    await expect(settingsModal.locator('text=активен до 12 ноября 2027')).toBeVisible();
    await expect(settingsModal.locator('text=кеш')).toBeVisible();
    await expect(settingsModal.locator('text=Управление')).toBeVisible();

    // 5. Verify Relay status & current device
    await expect(settingsModal.locator('text=Синхронизация активна')).toBeVisible({ timeout: 10000 });
    await expect(settingsModal.locator('text=текущее')).toBeVisible();

    // Screenshot of Subscription Banner & Clean Sync Tab with Cache
    await page.screenshot({
      path: 'test-results/screenshots/sync_settings_subscription_banner.png',
      fullPage: false,
    });

    // 6. Test Background Sync Interval (Battery Saver)
    const interval30Btn = settingsModal.locator('[data-testid="sync-interval-30"]');
    await expect(interval30Btn).toBeVisible();
    await interval30Btn.scrollIntoViewIfNeeded();
    await interval30Btn.click();
    await expect(settingsModal.locator('span', { hasText: '30 мин' })).toBeVisible();

    const intervalRealtimeBtn = settingsModal.locator('[data-testid="sync-interval-0"]');
    await intervalRealtimeBtn.click();
    await expect(settingsModal.locator('span', { hasText: 'в реальном времени' })).toBeVisible();

    // Screenshot of Battery Saver & Server section
    await page.screenshot({
      path: 'test-results/screenshots/sync_settings_cache_and_battery.png',
      fullPage: false,
    });

    // 7. Test PIN Generation
    const genPinBtn = settingsModal.locator('button', { hasText: 'Сгенерировать PIN' });
    await expect(genPinBtn).toBeVisible();
    await genPinBtn.click();

    const pinDisplay = settingsModal.locator('.font-mono.text-base.font-semibold');
    await expect(pinDisplay).toBeVisible({ timeout: 15000 });
    const pinText = (await pinDisplay.textContent())?.trim();
    expect(pinText).toMatch(/^\d{3}-\d{3}$/);

    // 7. Simulate guest claiming PIN over relay API (without sending device name or OS)
    const claimRes = await fetch('http://152.53.199.71:8320/api/pair/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: pinText,
        publicKey: 'pk_eph_guest_test_99',
      }),
    });
    expect(claimRes.ok).toBe(true);
    const claimData = await claimRes.json();
    expect(claimData.status).toBe('pending_approval');
    expect(claimData.sasCode).toMatch(/^\d{4}$/);

    // 8. Host should detect the claim and show Approval Card with matching SAS code
    const approvalCard = settingsModal.locator('text=Запрос на подключение устройства');
    await expect(approvalCard).toBeVisible({ timeout: 10000 });

    const sasBadge = settingsModal.locator(`strong:has-text("${claimData.sasCode}")`);
    await expect(sasBadge).toBeVisible();

    const approveBtn = settingsModal.locator('button', { hasText: 'Разрешить доступ' });
    const rejectBtn = settingsModal.locator('button', { hasText: 'Отклонить' });
    await expect(approveBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();

    // Screenshot of Human-in-the-Loop Consent Request Card
    await page.screenshot({
      path: 'test-results/screenshots/sync_approval_request.png',
      fullPage: false,
    });

    // 9. Approve pairing
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    await approveBtn.click();

    // Verify approval completed and new device is added to trusted devices
    await expect(settingsModal.locator(`text=Устройство ${claimData.sasCode}`)).toBeVisible({ timeout: 5000 });

    // Screenshot of approved device in list
    await page.screenshot({
      path: 'test-results/screenshots/sync_device_approved.png',
      fullPage: false,
    });
  });
});
