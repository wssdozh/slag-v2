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
    test.setTimeout(60_000);

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
    await expect(page.locator('[data-testid="tab-accounts"]')).toHaveClass(/bg-white\/10/);
    await expect(page.locator('span', { hasText: 'acc_7a8b9c0d1e2f34567890abcd' })).toBeVisible();
    const lockBtn = page.locator('button[title="заблокировать"]').first();
    await lockBtn.click();
    await expect(page.locator('span', { hasText: 'blocked' }).first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_accounts.png' });

    // 2. Billing Tab
    await page.locator('[data-testid="tab-billing"]').click();
    await expect(page.locator('[data-testid="tab-billing"]')).toHaveClass(/bg-white\/10/);
    await expect(page.locator('text=MRR (выручка/мес)')).toBeVisible();
    await expect(page.locator('text=680 ₽')).toBeVisible();
    await expect(page.locator('text=33.3%')).toBeVisible();

    // Grant subscription form
    await page.locator('button[type="submit"]', { hasText: 'начислить' }).click();
    await expect(page.locator('[role="status"]', { hasText: 'подписка smile начислена' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/tab_billing.png' });

    // 3. AI Gateway Tab
    await page.locator('[data-testid="tab-ai"]').click();
    await expect(page.locator('[data-testid="tab-ai"]')).toHaveClass(/bg-white\/10/);
    await expect(page.locator('text=operational')).toBeVisible();
    await expect(page.locator('text=357 000')).toBeVisible();

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
