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

    // 2. Verify sidebar footer live sync status button (next to main vault, terminal, settings)
    const sidebarSyncBtn = page.locator('[data-testid="sidebar-sync-btn"]');
    await expect(sidebarSyncBtn).toBeVisible({ timeout: 10000 });

    // Capture screenshot of sidebar footer with live sync indicator
    await page.screenshot({
      path: 'test-results/screenshots/sidebar_footer_sync_indicator.png',
      fullPage: false,
    });

    // 3. Clicking sidebar-sync-btn directly opens Settings on "Синхронизация" tab
    await sidebarSyncBtn.click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // 4. Verify Unified Single Card (Subscription + Sync Status + Manual Sync button)
    await expect(settingsModal.locator('text=SLAG Smile')).toBeVisible();
    await expect(settingsModal.locator('text=активен до 12 ноября 2027')).toBeVisible();
    await expect(settingsModal.locator('text=кеш')).toBeVisible();
    await expect(settingsModal.locator('button', { hasText: 'Синхронизировать' })).toBeVisible();
    await expect(settingsModal.locator('text=Управление')).toBeVisible();

    // 5. Verify current device item
    await expect(settingsModal.locator('text=это устройство')).toBeVisible();

    // Screenshot of Unified Header Card & Clean Sync Tab
    await page.screenshot({
      path: 'test-results/screenshots/sync_settings_unified_header_card.png',
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

    // 7. Test Pairing Modal & PIN Display
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

    // Verify approval completed and new device is added to trusted devices
    await expect(settingsModal.locator(`text=Устройство ${claimData.sasCode}`)).toBeVisible({ timeout: 5000 });

    // Screenshot of approved device in list
    await page.screenshot({
      path: 'test-results/screenshots/sync_device_approved.png',
      fullPage: false,
    });
  });
});
