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

  test('admin authentication, stats, accounts, device revocation, maintenance and tauri isolation', async ({ page }) => {
    test.setTimeout(60_000);

    let currentPlan = 'free';
    let deviceStatus = 'active';

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
              {
                roomId: 'room_aabbccddeeff',
                vaultId: 'v_sync_99',
                lastActiveAt: '2026-11-05T09:10:00Z',
                createdAt: '2026-11-03T18:40:00Z',
                bundlesCount: 72,
                cacheBytes: 17309696,
              },
            ],
          }),
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

    // 1. Open ?page=admin in browser mode
    await page.goto('/?page=admin', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1', { hasText: 'вход в админ-панель' })).toBeVisible();

    await page.screenshot({
      path: 'screenshots/admin_login.png',
      fullPage: false,
    });

    // 2. Test login
    const tokenInput = page.locator('#admin-token');
    await tokenInput.fill('secret-admin-token');
    await page.locator('button[type="submit"]', { hasText: 'войти' }).click();

    // Verify dashboard metrics and navigation tabs
    await expect(page.locator('header', { hasText: 'SLAG Relay Admin' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'аккаунты' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'обслуживание' })).toBeVisible();

    // Verify accounts list
    await expect(page.locator('span', { hasText: 'acc_7a8b9c0d1e2f34567890abcd' })).toBeVisible();
    await expect(page.locator('text=Рабочее')).toBeVisible();
    await expect(page.locator('text=Личное')).toBeVisible();

    // 3. Test plan change: click 'angry' on first account
    const angryBtn = page.locator('button', { hasText: 'angry' }).first();
    await angryBtn.click();
    await expect(angryBtn).toHaveClass(/bg-white text-black/);

    // 4. Test device revocation
    const revokeBtn = page.locator('button[title="отозвать доступ"]').first();
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.click();
    await expect(page.locator('span', { hasText: 'revoked' }).first()).toBeVisible();

    // Capture screenshot of accounts tab
    await page.screenshot({
      path: 'screenshots/admin_panel.png',
      fullPage: false,
    });

    // 5. Switch to Maintenance tab
    await page.locator('button', { hasText: 'обслуживание' }).click();
    await expect(page.locator('text=размер базы')).toBeVisible();
    await expect(page.locator('text=12.0 MB')).toBeVisible();
    await expect(page.locator('text=комнаты синхронизации')).toBeVisible();

    // Run Vacuum
    await page.locator('button', { hasText: 'сжать базу (vacuum)' }).click();
    await expect(page.locator('[role="status"]', { hasText: 'база сжата' })).toBeVisible();

    // Capture screenshot of maintenance tab
    await page.screenshot({
      path: 'screenshots/admin_maintenance.png',
      fullPage: false,
    });

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
