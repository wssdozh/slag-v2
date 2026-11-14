import { test, expect } from './support/selfhostFixture';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Device Actions with Panic Re-keying', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('verifies sync mode toggle and key rotation', async ({ page }) => {
    // 1. Open Main App and go to Settings -> Sync
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('sidebar-settings-btn').click();

    const settingsModal = page.getByRole('dialog').filter({ has: page.getByTestId('settings-tab-sync') });
    await expect(settingsModal).toBeVisible();

    const syncTabBtn = settingsModal.getByTestId('settings-tab-sync');
    await syncTabBtn.click();
    await expect(settingsModal.getByRole('button', { name: 'Синхронизировать', exact: true })).toBeVisible();

    // 3. Test Sync Mode Toggle (Read-Write vs Receive-Only) on the current device.
    // The mode is a select in the devices tab, not a pair of toggle buttons.
    await settingsModal.getByTestId('settings-tab-devices').click();

    const syncModeBtn = settingsModal.getByRole('button', { name: 'Локальная синхронизация', exact: true });
    await expect(syncModeBtn).toContainText('Чтение и запись');
    await syncModeBtn.click();
    await page.getByRole('option', { name: 'Только чтение', exact: true }).click();
    await expect(syncModeBtn).toContainText('Только чтение');

    // Toggle back to Read-Write through the shared dropdown.
    await syncModeBtn.click();
    await page.getByRole('option', { name: 'Чтение и запись', exact: true }).click();
    await expect(syncModeBtn).toContainText('Чтение и запись');

    // Take screenshot of Device Actions UI
    await page.screenshot({
      path: 'test-results/screenshots/device_actions_inline.png',
      fullPage: false,
    });

    // 4. Test Panic Re-keying (Key Rotation)
    await syncTabBtn.click();
    const rotateKeyBtn = settingsModal.getByRole('button', { name: 'Сменить ключ', exact: true });
    await expect(rotateKeyBtn).toBeVisible();
    await rotateKeyBtn.click();

    // Irreversible actions ask in the app's own confirm dialog, not window.confirm.
    const confirm = page.getByRole('alertdialog', { name: 'Сменить ключ хранилища?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Сменить ключ', exact: true }).click();

    // Wait for toast confirmation
    await expect(page.getByTestId('toast').filter({ hasText: 'Ключ хранилища изменён' })).toBeVisible({ timeout: 8000 });
  });
});
