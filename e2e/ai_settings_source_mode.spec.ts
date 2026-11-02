import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('AI Source Mode & Subscription Gateway Verification', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('verifies AI subscription gateway mode for Smile tier and lock for Free tier', async ({ page }) => {
    // 1. Open app
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Open Settings modal
    const settingsBtn = page.locator('[data-testid="sidebar-settings-btn"]');
    await expect(settingsBtn).toBeVisible({ timeout: 10000 });
    await settingsBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // 3. Switch to "ИИ & Провайдеры" tab (default active tab is AI)
    const aiTabBtn = settingsModal.locator('button', { hasText: 'ИИ & Провайдеры' });
    await aiTabBtn.click();

    // 4. Verify that default Smile subscriber sees 'Подписка SLAG' active
    const subAiBtn = settingsModal.locator('[data-testid="ai-source-subscription"]');
    await expect(subAiBtn).toBeVisible();
    await expect(subAiBtn).toHaveClass(/border-white/);

    // Verify key inputs are hidden in subscription mode (clean UI)
    await expect(settingsModal.locator('text=Режим обработки')).toBeVisible();
    await expect(settingsModal.locator('button', { hasText: 'Flash (быстрый)' })).toBeVisible();
    await expect(settingsModal.locator('input[placeholder="gsk_..."]')).not.toBeVisible();
    await expect(settingsModal.locator('input[placeholder*="sk-kie-..."]')).not.toBeVisible();

    // Capture screenshot of clean Subscription AI Mode
    await page.screenshot({
      path: 'test-results/screenshots/ai_settings_subscription_mode.png',
      fullPage: false,
    });

    // 5. Test switching to BYOK (Bring Your Own Key) mode
    const byokBtn = settingsModal.locator('[data-testid="ai-source-byok"]');
    await expect(byokBtn).toBeVisible();
    await byokBtn.click();

    // Verify BYOK key fields appear
    await expect(settingsModal.locator('input[placeholder="gsk_..."]')).toBeVisible();
    await expect(settingsModal.locator('text=Groq Cloud API')).toBeVisible();

    // 6. Switch to "Синхронизация" tab and change plan to Free to verify locking
    const syncTabBtn = settingsModal.locator('button[data-testid="settings-tab-sync"]');
    await syncTabBtn.click();
    await expect(settingsModal.locator('text=SLAG Smile')).toBeVisible();

    // Close settings modal to navigate to account cabinet
    await page.keyboard.press('Escape');

    // 7. Go to Account cabinet and switch to Free plan
    await page.goto('/?page=account');
    await page.waitForLoadState('domcontentloaded');

    const freeTierBtn = page.locator('[data-testid="tier-btn-free"]');
    await expect(freeTierBtn).toBeVisible();
    await freeTierBtn.click();
    await expect(page.locator('text=SLAG Free')).toBeVisible();

    // 8. Return to main app and open Settings -> AI
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await settingsBtn.click();
    await aiTabBtn.click();

    // 9. Verify that on Free plan, 'Подписка SLAG' is disabled and locked
    const lockedSubAiBtn = settingsModal.locator('[data-testid="ai-source-subscription"]');
    await expect(lockedSubAiBtn).toBeDisabled();
    await expect(lockedSubAiBtn).toContainText('(заблокировано)');
    await expect(settingsModal.locator('text=На бесплатном тарифе доступен ввод личных ключей')).toBeVisible();

    // Capture screenshot of Free Tier Locked AI Gate
    await page.screenshot({
      path: 'test-results/screenshots/ai_settings_free_tier_lock.png',
      fullPage: false,
    });
  });
});
