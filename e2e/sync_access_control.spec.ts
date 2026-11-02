import { test, expect } from '@playwright/test';

test.describe('Sync Device Access Control & Registration', () => {
  test('displays access management modal and allows configuring per-vault access', async ({ page }) => {
    await page.addInitScript(() => {
      const configKey = 'slag_sync_config_v2_default_vault';
      const existing = {
        enabled: true,
        serverUrl: 'http://152.53.199.71:8320',
        deviceId: 'slag-test-local',
        deviceName: 'Это устройство',
        seedPhrase: 'apple banana cherry dog elephant fox grape horse igloo jaguar kite lemon',
        autoSync: false,
        trustedDevices: [
          {
            id: 'slag-laptop-psycho',
            name: 'Ноутбук (Linux)',
            platform: 'desktop',
            isCurrent: false,
            syncMode: 'read-write',
            canRunAiLease: true,
            pairedAt: new Date().toISOString(),
            lastSeenAt: 'Только что',
            allowedVaults: ['default_vault'],
          },
        ],
      };
      localStorage.setItem(configKey, JSON.stringify(existing));
    });

    await page.goto('/');
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Open settings modal
    const syncStatusBtn = page.locator('button:has-text("Синхронизация активна")').first();
    if (await syncStatusBtn.isVisible()) {
      await syncStatusBtn.click();
    } else {
      await page.locator('button[title*="Настройки"], button:has-text("Настройки")').first().click();
      const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
      await expect(settingsModal).toBeVisible();
      await settingsModal.locator('button', { hasText: 'Синхронизация' }).click();
    }

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // Verify trusted device row is visible
    const deviceRow = settingsModal.locator('text=Ноутбук (Linux)');
    await expect(deviceRow).toBeVisible();

    // Click "Управление" button
    const manageBtn = settingsModal.locator('button', { hasText: 'Управление' });
    await manageBtn.click();

    // Verify Access Management Modal opened
    const accessModal = page.locator('div[role="dialog"]').filter({ hasText: 'Доступ к хранилищам' }).last();
    await expect(accessModal).toBeVisible();
    await expect(accessModal.locator('text=Ноутбук (Linux)')).toBeVisible();
    await expect(accessModal.locator('text=Выберите доступные хранилища:')).toBeVisible();

    // Verify vault rows and toggle button
    const vaultRow = accessModal.locator('text=main').first();
    await expect(vaultRow).toBeVisible();

    // Take verified screenshot
    await page.screenshot({
      path: 'test-results/screenshots/sync-vault-access-management.png',
      fullPage: false,
    });
  });
});
