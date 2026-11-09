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

    // The app boots as "self-hosted" until the relay /health check reports authRequired,
    // so wait for the authoritative free plan before opening settings.
    await page.waitForFunction(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const pick = (modulePath: string) =>
        loaded.find((name) => name.split('?')[0].endsWith(modulePath)) || modulePath;
      const { syncEngine } = await import(pick('/src/lib/sync/syncEngine.ts'));
      return (syncEngine.getStatus() as any).subscription?.plan === 'free';
    }, undefined, { timeout: 20_000 });

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

  test('subscription mode still exposes the Groq key for images and audio', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Force a paid plan so the modal renders the subscription branch.
    await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const pick = (modulePath: string) =>
        loaded.find((name) => name.split('?')[0].endsWith(modulePath)) || modulePath;

      const { accountClient } = await import(pick('/src/lib/sync/account.ts'));
      const client = accountClient as unknown as {
        session: unknown;
        state: Record<string, unknown>;
        getState: () => Record<string, unknown>;
      };
      client.session = {
        token: 'test-token',
        accountId: 'acc_test',
        deviceId: 'device-test',
        serverUrl: 'http://152.53.199.71:8320',
      };
      client.state = {
        ...client.getState(),
        account: {
          plan: 'smile', planLabel: 'Smile', expiresAt: null, maxDevices: 5, activeDevices: 1,
          maxCacheMb: 10240, usedCacheMb: 0, allowAttachments: true, hasAiLease: true, isExpiringSoon: false,
        },
      };

      const { syncEngine } = await import(pick('/src/lib/sync/syncEngine.ts'));
      (syncEngine as unknown as { saveConfig: (config: Record<string, unknown>) => void }).saveConfig({});
    });

    await page.locator('[data-testid="sidebar-settings-btn"]').click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5000 });
    await settingsModal.locator('button', { hasText: 'ИИ & Провайдеры' }).click();

    await expect(settingsModal.locator('text=Картинки и аудио тоже идут через подписку')).toBeVisible();
    await expect(settingsModal.locator('input[placeholder*="gsk_"]')).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/screenshots/ai_settings_subscription_media.png',
      fullPage: false,
    });
  });
});
