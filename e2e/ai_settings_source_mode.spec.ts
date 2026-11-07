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

  test('locks subscription AI without a paid account and allows BYOK keys', async ({ page }) => {
    test.setTimeout(120_000);
    // 1. Open app (cold vite transform can exceed the default goto timeout on first load)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // 2. Open Settings modal
    const settingsBtn = page.locator('[data-testid="sidebar-settings-btn"]');
    await expect(settingsBtn).toBeVisible({ timeout: 10000 });
    await settingsBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });

    // 3. Switch to "ИИ & Провайдеры" tab
    const aiTabBtn = settingsModal.locator('button', { hasText: 'ИИ & Провайдеры' });
    await aiTabBtn.click();

    // 4. Without a paid account the subscription AI gateway is locked (server-authoritative).
    const sourceSelect = settingsModal.locator('[data-testid="ai-source-mode"]');
    await expect(sourceSelect).toBeVisible();
    await expect(settingsModal.locator('text=На тарифе Free доступны только свои ключи.')).toBeVisible();

    await sourceSelect.click();
    const subOption = page.locator('[data-testid="ai-source-subscription"]');
    await expect(subOption).toBeVisible();
    await expect(subOption).toBeDisabled();
    await expect(subOption).toContainText('Подписка — недоступна');

    // Capture screenshot of locked Subscription AI Mode
    await page.screenshot({
      path: 'test-results/screenshots/ai_settings_free_tier_lock.png',
      fullPage: false,
    });

    // 5. BYOK is available and reveals key fields.
    await page.locator('[data-testid="ai-source-byok"]').click();

    await expect(settingsModal.locator('input[placeholder*="gsk_"]')).toBeVisible();
    await expect(settingsModal.locator('text=Groq Cloud API')).toBeVisible();
  });
});
