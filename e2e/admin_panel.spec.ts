import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('SLAG Relay Admin Panel (?page=admin)', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('admin authentication, stats, accounts list, plan switching and tauri isolation', async ({ page }) => {
    test.setTimeout(60_000);

    let currentPlan = 'free';

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
                maxDevices: currentPlan === 'free' ? 2 : currentPlan === 'smile' ? 5 : 15,
                maxCacheMb: currentPlan === 'free' ? 1024 : currentPlan === 'smile' ? 10240 : 51200,
                usedCacheMb: 40.5,
                devices: [
                  {
                    id: 'dev_pc_11223344',
                    name: 'Workstation ThinkPad',
                    platform: 'desktop',
                    status: 'active',
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
                maxDevices: 5,
                maxCacheMb: 10240,
                usedCacheMb: 120.0,
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

      if (url.includes('/api/admin/accounts/') && method === 'PATCH') {
        const postData = JSON.parse(route.request().postData() || '{}');
        currentPlan = postData.plan;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        });
      }

      return route.fulfill({ status: 404, body: JSON.stringify({ error: 'not_found' }) });
    });

    // 1. Open ?page=admin in browser mode
    await page.goto('/?page=admin', { waitUntil: 'domcontentloaded' });

    // Verify login form is visible
    await expect(page.locator('h1', { hasText: 'вход в админ-панель' })).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/admin_login.png',
      fullPage: false,
    });

    // 2. Test invalid token
    const tokenInput = page.locator('#admin-token');
    await tokenInput.fill('wrong-token');
    await page.locator('button[type="submit"]', { hasText: 'войти' }).click();
    await expect(page.locator('[role="status"]', { hasText: 'неверный админ-токен' })).toBeVisible();

    // 3. Test successful login
    await tokenInput.fill('secret-admin-token');
    await page.locator('button[type="submit"]', { hasText: 'войти' }).click();

    // Verify dashboard metrics are loaded
    await expect(page.locator('header', { hasText: 'SLAG Relay Admin' })).toBeVisible();
    await expect(page.locator('text=2д 0ч')).toBeVisible();
    await expect(page.locator('text=40.5 MB')).toBeVisible();

    // Verify accounts
    const firstAccountId = page.locator('span', { hasText: 'acc_7a8b9c0d1e2f34567890abcd' });
    await expect(firstAccountId).toBeVisible();
    await expect(page.locator('text=Workstation ThinkPad')).toBeVisible();
    await expect(page.locator('text=Pixel 8 Pro')).toBeVisible();

    // 4. Test plan change: click 'angry' on first account
    const angryBtn = page.locator('button', { hasText: 'angry' }).first();
    await angryBtn.click();
    await expect(angryBtn).toHaveClass(/bg-white text-black/);

    // Capture screenshot of authenticated admin panel
    await page.screenshot({
      path: 'test-results/screenshots/admin_panel.png',
      fullPage: false,
    });

    // 5. Test search filter
    const searchInput = page.locator('input[placeholder="поиск по id аккаунта"]');
    await searchInput.fill('9988');
    await expect(page.locator('text=acc_99887766554433221100aabb')).toBeVisible();
    await expect(page.locator('text=acc_7a8b9c0d1e2f34567890abcd')).not.toBeVisible();

    // 6. Test Tauri app isolation
    const tauriContext = await page.context().browser()!.newContext();
    const tauriPage = await tauriContext.newPage();
    await tauriPage.addInitScript(() => {
      (window as any).isTauri = true;
    });
    await tauriPage.goto('/?page=admin', { waitUntil: 'domcontentloaded' });
    await expect(tauriPage.locator('text=доступно только в веб-версии')).toBeVisible();
    await expect(tauriPage.locator('button', { hasText: 'вернуться в приложение' })).toBeVisible();
    await tauriContext.close();
  });
});
