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
    // Cold tree: the first load pays Vite's transform of the whole module graph.
    test.setTimeout(180_000);

    // The lock is server-authoritative: the relay's /health says the gateway needs an account,
    // and `computeSubscription` turns that into `plan: 'free'`. Left to the real relay this test
    // asserted whatever the network answered — and with a relay that is not answering, the plan
    // only lands after the 5s health timeout, so a run could look at the tab before it settled.
    // Pin the hosted answer on the host the app calls, then assert the plan it produced.
    await page.route(
      (url) => url.pathname === '/health',
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ authRequired: true, service: 'slag-test-hosted' }),
      }),
    );

    // 1. Open app (cold vite transform can exceed the default goto timeout on first load)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    /** What the engine reports right now — the same source the settings tab renders from. */
    const planState = () => page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const pick = (modulePath: string) =>
        loaded.find((name) => name.split('?')[0].endsWith(modulePath)) || modulePath;
      const { syncEngine } = await import(pick('/src/lib/sync/syncEngine.ts'));
      const status = syncEngine.getStatus() as unknown as {
        subscription?: { plan?: string };
        isAuthenticated: boolean;
      };
      return { plan: status.subscription?.plan ?? null, isAuthenticated: status.isAuthenticated };
    });

    // The engine boots as "self-hosted" until the health check lands, so wait for the plan
    // itself — not for a moment that merely happens to be early enough.
    await expect.poll(async () => (await planState()).plan, {
      timeout: 90_000,
      message: 'syncEngine must settle on the free plan of a hosted relay',
    }).toBe('free');
    // Free is a *gateway* plan, not a paid account: the lock exists because nobody is signed in.
    expect((await planState()).isAuthenticated).toBe(false);

    // 2. Open Settings modal
    const settingsBtn = page.locator('[data-testid="sidebar-settings-btn"]');
    await expect(settingsBtn).toBeVisible({ timeout: 10_000 });
    await settingsBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible({ timeout: 5_000 });

    // 3. Settings are a rail of tabs now; the AI tab has its own testid.
    const aiTab = settingsModal.locator('[data-testid="settings-tab-ai"]');
    await expect(aiTab).toBeVisible();
    await aiTab.click();

    // 4. Without a paid account the subscription AI gateway is locked.
    const sourceSelect = settingsModal.locator('[data-testid="ai-source-mode"]');
    await expect(sourceSelect).toBeVisible();
    await expect(settingsModal.getByText('На тарифе Free доступны только свои ключи.')).toBeVisible();

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

    // 5. BYOK is available and reveals the connection list.
    await page.locator('[data-testid="ai-source-byok"]').click();

    await expect(settingsModal.getByText('Подключения')).toBeVisible();
    const groqRow = settingsModal.locator('[data-testid="ai-connection-groq"]');
    await expect(groqRow).toBeVisible();
    await expect(groqRow).toContainText('Groq');

    // The key lives inside the connection editor, one click away.
    await groqRow.click();
    await expect(settingsModal.locator('input[placeholder*="gsk_"]')).toBeVisible();
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
      // Settle the engine first: saveConfig() recomputes the subscription from the real account
      // and would wipe the fake below. The modal mounts on open now, so it reads the plan later
      // than it used to and a stale recompute became visible.
      const { syncEngine } = await import(pick('/src/lib/sync/syncEngine.ts'));
      (syncEngine as unknown as { saveConfig: (config: Record<string, unknown>) => void }).saveConfig({});

      client.state = {
        ...client.getState(),
        account: {
          plan: 'smile', planLabel: 'Smile', expiresAt: null, maxDevices: 5, activeDevices: 1,
          maxCacheMb: 10240, usedCacheMb: 0, allowAttachments: true, hasAiLease: true, isExpiringSoon: false,
        },
      };
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
