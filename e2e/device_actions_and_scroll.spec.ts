import { test, expect } from './support/selfhostFixture';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Landing Scroll & Device Actions with Panic Re-keying', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('verifies landing scroll, sync mode toggle, and key rotation', async ({ page }) => {
    // 1. Verify Landing Page Scroll
    await page.goto('/?page=landing');
    await page.waitForLoadState('domcontentloaded');

    // Container should exist and scroll smoothly
    const scrollContainer = page.locator('.fixed.inset-0.overflow-y-auto');
    await expect(scrollContainer).toBeVisible();

    // Scroll to footer
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();

    // Verify scrolled position
    const scrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(400);

    await page.screenshot({
      path: 'test-results/screenshots/landing_scroll_verified.png',
      fullPage: false,
    });

    // 2. Open Main App and go to Settings -> Sync
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const settingsBtn = page.locator('button[title*="Настройки"]').first();
    await expect(settingsBtn).toBeVisible({ timeout: 10000 });
    await settingsBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();

    const syncTabBtn = settingsModal.locator('button[data-testid="settings-tab-sync"]');
    await syncTabBtn.click();
    await expect(settingsModal.getByText('Self-hosted', { exact: false }).first()).toBeVisible({ timeout: 10000 });
    await expect(settingsModal.locator('button', { hasText: 'Синхронизировать' })).toBeVisible();

    // 3. Test Sync Mode Toggle (Read-Write vs Receive-Only) on the current device
    const devicesTabBtn = settingsModal.locator('button[data-tab="devices"]');
    await devicesTabBtn.click();

    const syncModeBtn = settingsModal.locator('button', { hasText: /Чтение и запись|Полный доступ/ }).first();
    await expect(syncModeBtn).toBeVisible();
    await syncModeBtn.click();
    await page.getByRole('option', { name: 'Только чтение', exact: true }).click();
    await expect(settingsModal.getByRole('button', { name: 'Локальная синхронизация' })).toContainText('Только чтение');

    // Toggle back to Read-Write through the shared dropdown.
    await settingsModal.getByRole('button', { name: 'Локальная синхронизация' }).click();
    await page.getByRole('option', { name: 'Чтение и запись', exact: true }).click();
    await expect(settingsModal.locator('button', { hasText: /Чтение и запись|Полный доступ/ }).first()).toBeVisible();

    // Take screenshot of Device Actions UI
    await page.screenshot({
      path: 'test-results/screenshots/device_actions_inline.png',
      fullPage: false,
    });

    // 4. Test Panic Re-keying (Key Rotation)
    await syncTabBtn.click();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Сменить ключ хранилища');
      await dialog.accept();
    });

    const rotateKeyBtn = settingsModal.locator('button', { hasText: 'Сменить ключ' });
    await expect(rotateKeyBtn).toBeVisible();
    await rotateKeyBtn.click();

    // Wait for toast confirmation
    await expect(page.locator('text=Ключ хранилища изменён')).toBeVisible({ timeout: 8000 });
  });
});
