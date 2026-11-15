import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('SLAG Relay Commercial Admin Panel (?page=admin)', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('admin authentication and all 5 commercial tabs verification', async ({ page }) => {
    // The admin route is a lazy branch of App.tsx, and the first load in a cold run pays Vite's
    // transform of the whole module graph on top of the mocked fetch dance below.
    test.setTimeout(180_000);

    let currentPlan = 'free';
    let deviceStatus = 'active';
    let accountStatus = 'active';

    // Mock relay admin endpoints
    await page.route('**/api/admin/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      const authHeader = route.request().headers()['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');

      if (token !== 'secret-admin-token') {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_admin_token' }),
        });
      }

      if (url.includes('/api/admin/stats') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            uptime: 172800,
            totalAccounts: 2,
            totalDevices: 3,
            activeRooms: 4,
            totalBundles: 156,
            totalCacheBytes: 42475520,
            activeSessions: 5,
            pendingPairings: 1,
            totalVaults: 3,
            dbSizeBytes: 12582912,
          }),
        });
      }

      if (url.includes('/api/admin/accounts') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            accounts: [
              {
                id: 'acc_7a8b9c0d1e2f34567890abcd',
                plan: currentPlan,
                planLabel: currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1),
                createdAt: '2026-11-01T12:00:00Z',
                expiresAt: '2026-12-01T12:00:00Z',
                status: accountStatus,
                maxDevices: currentPlan === 'free' ? 2 : currentPlan === 'smile' ? 5 : 15,
                maxCacheMb: currentPlan === 'free' ? 1024 : currentPlan === 'smile' ? 10240 : 51200,
                usedCacheMb: 40.5,
                vaults: [
                  { id: 'v_work_11', name: 'Рабочее', updatedAt: '2026-11-04T10:00:00Z', grantsCount: 2 },
                  { id: 'v_pers_22', name: 'Личное', updatedAt: '2026-11-03T14:20:00Z', grantsCount: 1 },
                ],
                devices: [
                  {
                    id: 'dev_pc_11223344',
                    name: 'Workstation ThinkPad',
                    platform: 'desktop',
                    status: deviceStatus,
                    lastSeenAt: '2026-11-05T09:30:00Z',
                  },
                  {
                    id: 'dev_mob_55667788',
                    name: 'Pixel 8 Pro',
                    platform: 'mobile',
                    status: 'active',
                    lastSeenAt: '2026-11-05T09:15:00Z',
                  },
                ],
              },
              {
                id: 'acc_99887766554433221100aabb',
                plan: 'smile',
                planLabel: 'Smile',
                createdAt: '2026-11-03T18:40:00Z',
                expiresAt: null,
                status: 'active',
                maxDevices: 5,
                maxCacheMb: 10240,
                usedCacheMb: 120.0,
                vaults: [{ id: 'v_sync_99', name: 'Проект X', updatedAt: '2026-11-05T08:00:00Z', grantsCount: 1 }],
                devices: [
                  {
                    id: 'dev_mac_33445566',
                    name: 'MacBook Air M2',
                    platform: 'desktop',
                    status: 'active',
                    lastSeenAt: '2026-11-05T11:00:00Z',
                  },
                ],
              },
            ],
          }),
        });
      }

      if (url.includes('/api/admin/billing/stats') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            mrr: 680,
            totalRevenue: 3420,
            paidAccounts: 2,
            freeAccounts: 4,
            conversionRate: 33.3,
          }),
        });
      }

      if (url.includes('/api/admin/billing/transactions') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            transactions: [
              {
                id: 'tx_aabb1122',
                accountId: 'acc_7a8b9c0d1e2f34567890abcd',
                amount: 490,
                currency: 'RUB',
                plan: 'angry',
                periodDays: 30,
                status: 'paid',
                createdAt: '2026-11-05T11:00:00Z',
              },
            ],
          }),
        });
      }

      if (url.includes('/api/admin/billing/grant') && method === 'POST') {
        currentPlan = 'angry';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', transactionId: 'tx_grant_123' }),
        });
      }

      if (url.includes('/api/admin/ai/stats') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            gatewayStatus: 'operational',
            totalRequests: 842,
            totalPromptTokens: 245000,
            totalCompletionTokens: 112000,
            totalTokens: 357000,
            activeModels: ['deepseek-v4-1-flash', 'claude-3-5-sonnet'],
          }),
        });
      }

      if (url.includes('/api/admin/ai/logs') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            logs: [
              {
                id: 'ai_log_1',
                accountId: 'acc_7a8b9c0d1e2f34567890abcd',
                model: 'deepseek-v4-1-flash',
                promptTokens: 420,
                completionTokens: 85,
                latencyMs: 124.5,
                createdAt: '2026-11-05T11:30:00Z',
              },
            ],
          }),
        });
      }

      if (url.includes('/api/admin/ai/ping') && method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', latencyMs: 64.2, model: 'deepseek-v4-1-flash' }),
        });
      }

      if (url.includes('/api/admin/audit') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            blockedAccountsCount: 0,
            revokedDevicesCount: 1,
            logs: [
              {
                id: 'aud_1',
                action: 'grant_subscription',
                targetType: 'account',
                targetId: 'acc_7a8b9c0d1e2f34567890abcd',
                details: 'plan=angry, days=30',
                createdAt: '2026-11-05T11:45:00Z',
              },
              {
                id: 'aud_2',
                action: 'revoke_device',
                targetType: 'device',
                targetId: 'dev_pc_11223344',
                details: 'account=acc_7a8b9c0d1e2f34567890abcd',
                createdAt: '2026-11-05T10:00:00Z',
              },
            ],
          }),
        });
      }

      if (url.includes('/api/admin/rooms') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            rooms: [
              {
                roomId: 'room_112233445566',
                vaultId: 'v_work_11',
                lastActiveAt: '2026-11-05T10:20:00Z',
                createdAt: '2026-11-01T12:00:00Z',
                bundlesCount: 84,
                cacheBytes: 25165824,
              },
            ],
          }),
        });
      }

      if (url.includes('/api/admin/rooms/') && (url.includes('/purge-unacked') || url.includes('/purge')) && method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', roomId: 'room_112233445566', deletedBundles: 8 }),
        });
      }

      if (url.includes('/api/admin/analytics/charts') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            period: '7d',
            dates: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'],
            userGrowth: [
              { date: '2026-10-30', free: 1, smile: 0, angry: 0, total: 1 },
              { date: '2026-10-31', free: 2, smile: 1, angry: 0, total: 3 },
              { date: '2026-11-01', free: 3, smile: 1, angry: 0, total: 4 },
              { date: '2026-11-02', free: 2, smile: 0, angry: 1, total: 3 },
              { date: '2026-11-03', free: 4, smile: 2, angry: 0, total: 6 },
              { date: '2026-11-04', free: 5, smile: 1, angry: 1, total: 7 },
              { date: '2026-11-05', free: 6, smile: 2, angry: 0, total: 8 },
            ],
            appLaunches: [
              { date: '2026-10-30', desktop: 10, mobile: 5, web: 2, total: 17 },
              { date: '2026-10-31', desktop: 14, mobile: 8, web: 4, total: 26 },
              { date: '2026-11-01', desktop: 18, mobile: 12, web: 5, total: 35 },
              { date: '2026-11-02', desktop: 15, mobile: 9, web: 3, total: 27 },
              { date: '2026-11-03', desktop: 22, mobile: 14, web: 6, total: 42 },
              { date: '2026-11-04', desktop: 28, mobile: 19, web: 7, total: 54 },
              { date: '2026-11-05', desktop: 32, mobile: 21, web: 9, total: 62 },
            ],
            revenue: [
              { date: '2026-10-30', amount: 0, count: 0 },
              { date: '2026-10-31', amount: 190, count: 1 },
              { date: '2026-11-01', amount: 0, count: 0 },
              { date: '2026-11-02', amount: 490, count: 1 },
              { date: '2026-11-03', amount: 190, count: 1 },
              { date: '2026-11-04', amount: 380, count: 2 },
              { date: '2026-11-05', amount: 490, count: 1 },
            ],
            traffic: [
              { date: '2026-10-30', bytes: 1048576, bundles: 14 },
              { date: '2026-10-31', bytes: 3145728, bundles: 28 },
              { date: '2026-11-01', bytes: 5242880, bundles: 45 },
              { date: '2026-11-02', bytes: 8388608, bundles: 62 },
              { date: '2026-11-03', bytes: 12582912, bundles: 89 },
              { date: '2026-11-04', bytes: 18874368, bundles: 120 },
              { date: '2026-11-05', bytes: 25165824, bundles: 156 },
            ],
            funnel: {
              landingViews: 1280,
              ctaClicks: 340,
              paywallViews: 140,
              checkoutStarts: 52,
              paidConversions: 18,
              dropOffRate: 65.4,
              steps: [
                { name: 'визиты', count: 1280, rate: 100 },
                { name: 'клик cta', count: 340, rate: 26.6 },
                { name: 'пейвол', count: 140, rate: 10.9 },
                { name: 'чекаут', count: 52, rate: 4.1 },
                { name: 'оплата', count: 18, rate: 1.4 },
              ],
            },
            aiDistribution: {
              meanTokens: 1420,
              medianTokens: 850,
              minTokens: 120,
              maxTokens: 12400,
              totalTokens: 357000,
              totalCostRub: 49.98,
              totalRevenueRub: 680,
              grossMarginPercent: 92.6,
              topUsers: [
                { accountId: 'acc_7a8b9c0d1e2f34567890abcd', tokens: 12400, costRub: 1.74, plan: 'smile', requests: 14 },
              ],
              dailyTokens: [
                { date: '2026-11-05', promptTokens: 245000, completionTokens: 112000, total: 357000 },
              ],
            },
            syncHealth: {
              totalBundles: 156,
              totalAcks: 148,
              successRatePercent: 98.4,
              stuckUnackedBundles: 8,
              topHeavyRooms: [
                { roomId: 'room_112233445566', vaultId: 'v_work_11', bundlesCount: 84, cacheBytes: 25165824 },
              ],
            },
          }),
        });
      }

      if (url.includes('/api/admin/accounts/') && url.includes('/toggle-status') && method === 'POST') {
        accountStatus = accountStatus === 'active' ? 'blocked' : 'active';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', account: { status: accountStatus } }),
        });
      }

      if (url.includes('/api/admin/accounts/') && url.includes('/devices/') && method === 'POST') {
        deviceStatus = 'revoked';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', accountStatus: 'revoked' }),
        });
      }

      if (url.includes('/api/admin/accounts/') && method === 'PATCH') {
        const postData = JSON.parse(route.request().postData() || '{}');
        currentPlan = postData.plan;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        });
      }

      if (url.includes('/api/admin/maintenance/cleanup') && method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', timestamp: 1793872000 }),
        });
      }

      if (url.includes('/api/admin/maintenance/vacuum') && method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', bytesBefore: 12582912, bytesAfter: 8388608, freedBytes: 4194304 }),
        });
      }

      return route.fulfill({ status: 404, body: JSON.stringify({ error: 'not_found' }) });
    });

    // 1. Login
    await page.goto('/?page=admin', { waitUntil: 'domcontentloaded' });
    const tokenInput = page.locator('#admin-token');
    await tokenInput.fill('secret-admin-token');
    await page.locator('button[type="submit"]', { hasText: 'войти' }).click();

    // 1. Accounts tab
    await expect(page.locator('[data-testid="tab-accounts"]')).toHaveClass(/bg-tint-10/);
    await expect(page.locator('span', { hasText: 'acc_7a8b9c0d1e2f34567890abcd' })).toBeVisible();
    await expect(page.locator('text=рост пользователей')).toBeVisible();
    await expect(page.locator('text=активность и заходы')).toBeVisible();

    // Inline renewal drawer check
    const quickGrantBtn = page.locator('button', { hasText: '+ подписка' }).first();
    await quickGrantBtn.click();
    await expect(page.locator('text=быстрое продление:')).toBeVisible();

    const lockBtn = page.locator('button[title="заблокировать"]').first();
    await lockBtn.click();
    await expect(page.locator('span', { hasText: 'blocked' }).first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_accounts.png' });

    // 2. Billing Tab
    await page.locator('[data-testid="tab-billing"]').click();
    await expect(page.locator('[data-testid="tab-billing"]')).toHaveClass(/bg-tint-10/);
    await expect(page.locator('text=MRR (выручка/мес)')).toBeVisible();
    await expect(page.locator('text=680 ₽')).toBeVisible();
    await expect(page.locator('text=33.3%')).toBeVisible();
    await expect(page.locator('text=динамика оплат и выручки')).toBeVisible();
    await expect(page.locator('text=воронка перехвата и оплат')).toBeVisible();

    // Autocomplete account search
    const accountSearchInput = page.locator('#grant-account-input');
    await accountSearchInput.click();
    await accountSearchInput.fill('ThinkPad');
    await page.locator('button', { hasText: 'Workstation ThinkPad' }).click();

    // Grant subscription form
    await page.locator('button[type="submit"]', { hasText: 'начислить' }).click();
    await expect(page.locator('[role="status"]', { hasText: 'подписка smile начислена' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_billing.png' });

    // 3. AI Gateway Tab
    await page.locator('[data-testid="tab-ai"]').click();
    await expect(page.locator('[data-testid="tab-ai"]')).toHaveClass(/bg-tint-10/);
    await expect(page.locator('text=operational')).toBeVisible();
    await expect(page.locator('text=357 000')).toBeVisible();
    await expect(page.locator('text=распределение расхода токенов на юзера')).toBeVisible();
    await expect(page.locator('text=unit-экономика ии-шлюза')).toBeVisible();
    await expect(page.locator('text=топ транжир токенов')).toBeVisible();

    // AI Ping
    await page.locator('button', { hasText: 'проверить пинг шлюза' }).click();
    await expect(page.locator('[role="status"]', { hasText: 'шлюз отвечает: пинг 64.2 мс' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_ai.png' });

    // 4. Relay Tab
    await page.locator('[data-testid="tab-relay"]').click();
    await page.waitForTimeout(100);
    const relayClasses = await page.locator('[data-testid="tab-relay"]').getAttribute('class');
    console.log('RELAY TAB CLASSES:', relayClasses);
    await expect(page.locator('text=комнаты синхронизации')).toBeVisible();
    await expect(page.locator('text=трафик синхронизации')).toBeVisible();
    await expect(page.locator('text=здоровье синхронизации')).toBeVisible();
    await expect(page.locator('text=инспектор хранилища')).toBeVisible();

    // Purge unacked bundles action
    const purgeBtn = page.locator('button', { hasText: 'сбросить зависшие пакеты' }).first();
    await purgeBtn.click();
    await expect(page.locator('[role="status"]', { hasText: 'сброшен' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_relay.png' });

    // 5. Security Tab
    await page.locator('[data-testid="tab-security"]').click();
    await page.waitForTimeout(100);
    const secClasses = await page.locator('[data-testid="tab-security"]').getAttribute('class');
    console.log('SECURITY TAB CLASSES:', secClasses);
    await expect(page.locator('text=P-256 E2EE (Zero-Knowledge)')).toBeVisible();
    await expect(page.locator('text=журнал аудита действий')).toBeVisible();
    await expect(page.locator('text=grant_subscription')).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_security.png' });
  });
});
