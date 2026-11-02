import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Landing Scroll & Device Actions with Panic Re-keying', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('verifies landing scroll, inline device rename, sync mode toggle, and key rotation', async ({ page }) => {
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
    await expect(settingsModal.locator('text=Синхронизация активна')).toBeVisible({ timeout: 10000 });

    // 3. Test Inline Device Renaming
    const deviceNameBtn = settingsModal.locator('button[title*="Кликните для переименования"]').first();
    await expect(deviceNameBtn).toBeVisible();
    await deviceNameBtn.click();

    const renameInput = settingsModal.locator('input[type="text"]:focus');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Рабочий ThinkPad');
    await renameInput.press('Enter');

    await expect(settingsModal.locator('text=Рабочий ThinkPad')).toBeVisible();

    // 4. Test Sync Mode Toggle (Read-Write vs Receive-Only)
    const syncModeBtn = settingsModal.locator('button[title*="Переключить режим синхронизации"]').first();
    await expect(syncModeBtn).toContainText('Полный доступ');
    await syncModeBtn.click();
    await expect(syncModeBtn).toContainText('Только чтение');

    // Toggle back to Read-Write
    await syncModeBtn.click();
    await expect(syncModeBtn).toContainText('Полный доступ');

    // 5. Test AI-Worker Toggle
    const aiWorkerBtn = settingsModal.locator('button[title*="AI-воркер"]').first();
    await expect(aiWorkerBtn).toBeVisible();
    await aiWorkerBtn.click();

    // Take screenshot of Device Actions UI
    await page.screenshot({
      path: 'test-results/screenshots/device_actions_inline.png',
      fullPage: false,
    });

    // 6. Test Panic Re-keying (Key Rotation)
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('ротацию ключа');
      await dialog.accept();
    });

    const rotateKeyBtn = settingsModal.locator('button', { hasText: 'Сменить ключ' });
    await expect(rotateKeyBtn).toBeVisible();
    await rotateKeyBtn.click();

    // Wait for toast confirmation
    await expect(page.locator('text=Ключ хранилища ротирован')).toBeVisible({ timeout: 8000 });
  });
});
