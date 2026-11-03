import { test as base, expect } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:18321';

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript((url) => {
      const config = { enabled: false, serverUrl: url, autoSync: false };
      localStorage.setItem('slag_sync_config_v2', JSON.stringify(config));
      localStorage.setItem('slag_sync_config_v2_default_vault', JSON.stringify(config));
    }, serverUrl);
    await page.route(`${serverUrl}/health`, (route) => route.fulfill({ json: { authRequired: false, service: 'slag-test-selfhost' } }));
    await page.route(`${serverUrl}/api/rooms/**`, (route) => route.fulfill({ json: { bundles: [] } }));
    await page.routeWebSocket(/127\.0\.0\.1:18321\/ws\//, (socket) => {
      socket.send(JSON.stringify({ type: 'welcome', connectedDevices: 1 }));
    });
    await provide(page);
  },
});

export { expect, serverUrl };
