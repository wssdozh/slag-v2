import { test, expect } from './support/selfhostFixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120000 });
});

test('a failed pull retries itself and clears the error once the relay answers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.config.enabled = true;
    // Ten real seconds per attempt would make this spec a timeout, not a test.
    engine.retryDelayMs = 40;
    engine.activeRoomId = 'room_retry';
    // A real AES key: the retry ends in a push, and a fake key fails it on `encrypt`.
    engine.activeVaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    engine.applyIncomingBundle = async () => {};
    const originalFetch = window.fetch;
    let requests = 0;
    window.fetch = async () => {
      requests++;
      // WebKit's exact words for an `AbortSignal.timeout`: the panel used to show them verbatim.
      if (requests === 1) throw new DOMException('Fetch is aborted', 'AbortError');
      return Response.json({ bundles: [] });
    };
    try {
      await engine.fetchPendingBundlesHttp().catch(() => undefined);
      const failed = { state: engine.status.state, error: engine.status.error, requests };
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { failed, after: { state: engine.status.state, error: engine.status.error }, requests };
    } finally {
      window.fetch = originalFetch;
      engine.disconnect();
    }
  });
  expect(result.failed).toEqual({ state: 'error', error: 'Сервер не ответил за 30 с, повторяю', requests: 1 });
  expect(result.requests).toBeGreaterThan(1);
  expect(result.after.error).toBeNull();
  expect(result.after.state).not.toBe('error');
});

test('the refresh path drops a stale error even when there is nothing to send', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.config.enabled = true;
    engine.retryDelayMs = 40;
    engine.activeRoomId = 'room_stale_error';
    engine.activeVaultKey = {};
    engine.applyIncomingBundle = async () => {};
    engine.status.state = 'error';
    engine.status.error = 'Fetch is aborted';
    engine.activeVaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const originalFetch = window.fetch;
    let requests = 0;
    window.fetch = async () => {
      requests++;
      return Response.json({ bundles: [] });
    };
    try {
      await engine.retrySync();
      return { state: engine.status.state, error: engine.status.error, requests };
    } finally {
      window.fetch = originalFetch;
      engine.disconnect();
    }
  });
  // The health check said the relay is alive; a leftover error from before it must not survive.
  expect(result.requests).toBeGreaterThan(0);
  expect(result.error).toBeNull();
});

test('the panel reads the timeout as a retry, not as "Fetch is aborted"', async ({ page }) => {
  await page.getByTestId('sidebar-settings-btn').click();
  const settings = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="sync"]') });
  await settings.getByTestId('settings-tab-sync').click();
  await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { syncEngine } = await import(/* @vite-ignore */ path);
    syncEngine.status.state = 'error';
    syncEngine.status.error = 'Сервер не ответил за 30 с, повторяю';
    syncEngine.notify();
  });
  const status = settings.getByRole('status');
  await expect(status).toContainText('Ошибка');
  await expect(status).toContainText('Сервер не ответил за 30 с, повторяю');
  await page.screenshot({ path: 'test-results/screenshots/sync-retry-status.png' });
});
