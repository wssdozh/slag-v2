import { test, expect } from '../support/selfhostFixture';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

test('mobile cloud opens a compact sync summary and its settings', async ({ page }) => {
  await page.goto('/');
  const cloud = page.getByTestId('mobile-sync-btn');
  await expect(cloud).toBeVisible({ timeout: 120_000 });
  await page.evaluate(async () => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    syncEngine.config.trustedDevices = [
      { id: 'laptop', name: 'ноут', platform: 'desktop', isCurrent: false, pairedAt: '', lastSeenAt: new Date().toISOString() },
      { id: 'pet', name: 'pet', platform: 'desktop', isCurrent: false, pairedAt: '', lastSeenAt: '2026-01-01T00:00:00Z' },
    ];
    Object.assign(syncEngine.status, {
      state: 'connected', authRequired: false, lastSyncTime: '16:12',
      manifest: {
        at: new Date().toISOString(), root: 'same', remoteRoot: 'same', inSync: true,
        action: 'none', trigger: 'push', folders: [], extra: [], missing: [],
        peers: [{ deviceId: 'laptop', anonymous: false, root: 'same', inSync: true, at: Date.now(), extra: [], missing: [] }],
      },
    });
    syncEngine.notify();
  });
  await expect(cloud.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.syncIdle');
  await page.screenshot({ path: 'test-results/screenshots/mobile-sync-header.png', animations: 'disabled' });
  await cloud.tap();
  const sheet = page.getByRole('dialog', { name: 'Синхронизация', exact: true });
  await expect(sheet.getByText('Совпало', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Нет сверки', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/mobile-sync-sheet.png', animations: 'disabled' });
  await sheet.getByTestId('mobile-sync-open-settings').tap();
  await expect(page.getByTestId('settings-tab-sync')).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('settings-tab-devices').tap();
  const current = page.getByTestId('device-row-current');
  await expect(current).toBeVisible();
  await expect(current.getByText(/это устройство/)).not.toContainText('онлайн');
  await page.screenshot({ path: 'test-results/screenshots/mobile-sync-devices.png', animations: 'disabled' });
});

test('mobile subfolders are flat navigation links', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('slag_registry_folders_default_vault', JSON.stringify([
      { path: 'Проекты', name: 'Проекты' },
      { path: 'Проекты/Дизайн', name: 'Дизайн' },
      { path: 'Проекты/Боты', name: 'Боты' },
    ]));
  });
  await page.goto('/');
  await expect(page.getByTestId('mobile-sync-btn')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Проекты', exact: true }).tap();
  const subfolder = page.getByRole('button', { name: 'Дизайн (0)', exact: true });
  await expect(subfolder).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/mobile-folder-tabs.png', animations: 'disabled' });
  await subfolder.tap();
  await expect(page.getByRole('button', { name: 'Информация о папке' })).toContainText('Проекты/Дизайн');
});
