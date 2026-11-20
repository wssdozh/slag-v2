import { test, expect } from '../support/selfhostFixture';

test('the sidebar keeps ordinary exchange quiet and opens the last known device reports on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const button = page.getByTestId('sidebar-sync-btn');
  const panel = page.getByTestId('sidebar-sync-status');
  const icon = button.locator('[data-icon]');
  await expect(button).toBeVisible({ timeout: 120_000 });
  await page.evaluate(async () => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    syncEngine.config.trustedDevices = [
      { id: 'phone', name: 'телефон', platform: 'mobile', isCurrent: false, pairedAt: '', lastSeenAt: '' },
      { id: 'laptop', name: 'ноутбук', platform: 'desktop', isCurrent: false, pairedAt: '', lastSeenAt: '' },
    ];
    Object.assign(syncEngine.status, {
      state: 'connected', authRequired: false,
      manifest: { at: '2026-11-20T10:58:00Z', root: 'pc', remoteRoot: 'older', inSync: false, action: 'report', trigger: 'push', folders: [], extra: [], missing: [], peers: [
        { deviceId: 'phone', anonymous: false, root: 'older', inSync: false, at: Date.parse('2026-11-20T10:57:00Z'), extra: [], missing: [] },
        { deviceId: null, anonymous: true, root: 'legacy', inSync: false, extra: [], missing: [] },
      ] },
    });
    syncEngine.notify();
  });
  await expect(icon).toHaveAttribute('data-icon', 'system.sync');
  const normalClass = await icon.getAttribute('class');
  const changeState = (state: string) => page.evaluate(async (next) => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    Object.assign(syncEngine.status, { state: next });
    syncEngine.notify();
  }, state);
  await changeState('syncing');
  await expect(button).toHaveAttribute('data-sync-state', 'syncing');
  await expect(icon).toHaveClass(normalClass!);
  await expect(panel).toBeHidden();
  await button.hover();
  await expect(panel).toBeVisible();
  await expect(panel.getByText('телефон', { exact: true })).toBeVisible();
  await expect(panel.getByText('Копии различались')).toBeVisible();
  await expect(panel.getByText('Сводка:', { exact: false })).toBeVisible();
  await expect(panel.getByText('ноутбук', { exact: true })).toBeVisible();
  await expect(panel.getByText('Нет сохранённой сводки')).toBeVisible();
  await expect(panel.getByText('Есть старая сводка без имени устройства.')).toBeVisible();
  await panel.hover();
  await expect(panel).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/screenshots/sidebar-sync-status.png', clip: { x: 0, y: 585, width: 380, height: 315 } });
  await page.mouse.move(800, 400);
  await expect(panel).toBeHidden();
  await button.focus();
  await expect(panel).toBeVisible();
  await button.press('Escape');
  await expect(panel).toBeHidden();
  await button.press('Enter');
  await expect(panel).toBeVisible();
  await page.getByTestId('sidebar-sync-open-settings').click();
  await expect(page.getByTestId('settings-tab-sync')).toBeVisible();
  await changeState('error');
  await expect(icon).toHaveAttribute('data-icon', 'system.syncError');
});
