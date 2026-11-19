import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * The rail's sync glyph is the first place a person looks for "is it fine".
 *
 * One arrow for every state used to answer that with a colour nobody has memorised. These checks
 * pin the shape, not the class: `data-icon` is the registry name, so a rewritten palette does not
 * silently turn a divergence into a check mark.
 */
test('the sidebar glyph names the sync state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  const button = page.locator('[data-testid="sidebar-sync-btn"]');
  await expect(button).toBeVisible();

  const apply = async (patch: Record<string, unknown>) => {
    await page.evaluate(async (next) => {
      const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      Object.assign(syncEngine.status, next);
      syncEngine.notify();
    }, patch);
  };

  // Connecting: the only state that spins.
  await apply({ state: 'syncing', manifest: undefined });
  await expect(button).toHaveAttribute('data-sync-state', 'syncing');
  await expect(button.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.sync');

  // Both copies agree.
  await apply({ state: 'connected', manifest: undefined });
  await expect(button.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.syncOk');
  await expect(button).toHaveAttribute('title', /Синхронизировано/);

  // Connected, yet the last comparison says the vaults differ — the case a spinner cannot show.
  await apply({
    state: 'connected',
    manifest: {
      at: new Date().toISOString(),
      root: 'aaaa1111',
      remoteRoot: 'bbbb2222',
      inSync: false,
      folders: [],
      extra: ['item_left_behind'],
      missing: [],
      action: 'report',
      trigger: 'push',
    },
  });
  await expect(button.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.syncDiverged');
  await expect(button).toHaveAttribute('title', /Копии разошлись/);
  await expect(button.locator('[data-icon]')).toHaveClass(/text-danger/);

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sidebar-sync-diverged.png`, clip: { x: 0, y: 860, width: 260, height: 140 } });

  // No relay at all.
  await apply({ state: 'offline', manifest: undefined, authRequired: false, isAuthenticated: false });
  await expect(button.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.syncOffline');
  await expect(button).toHaveAttribute('title', /офлайн/);

  // Broken, not merely absent.
  await apply({ state: 'error', error: 'Сервер не ответил' });
  await expect(button.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.syncError');
  await expect(button).toHaveAttribute('title', /Ошибка синхронизации: Сервер не ответил/);

  // Switched off.
  await apply({ state: 'idle', error: null, manifest: undefined });
  await expect(button.locator('[data-icon]')).toHaveAttribute('data-icon', 'system.syncIdle');
  await expect(button).toHaveAttribute('title', /выключена/);
});
