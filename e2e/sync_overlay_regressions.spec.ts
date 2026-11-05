import { test, expect } from './support/selfhostFixture';

for (const caller of ['direct', 'debounce', 'interval'] as const) {
  test(`failed pre-push pull is handled for ${caller} callers and can retry`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
    const result = await page.evaluate(async (caller) => {
      const { SyncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const engine = new SyncEngine();
      engine.activeRoomId = 'room_failed_pre_push';
      engine.activeVaultKey = {};
      const originalFetch = window.fetch;
      const originalInterval = window.setInterval;
      const unhandled: string[] = [];
      const onUnhandled = (event: PromiseRejectionEvent) => { unhandled.push(String(event.reason)); event.preventDefault(); };
      window.addEventListener('unhandledrejection', onUnhandled);
      let intervalCallback: (() => void) | undefined;
      let requests = 0;
      window.fetch = async () => { requests++; return new Response('unavailable', { status: 503 }); };
      let rejected = false;
      try {
        if (caller === 'direct') {
          try { await engine.pushLocalChanges(); } catch { rejected = true; }
        } else if (caller === 'debounce') {
          engine.scheduleDebouncedPush(0);
        } else {
          window.setInterval = ((callback: () => void, delay: number) => {
            if (delay === 15000) intervalCallback = callback;
            return originalInterval(() => {}, 60_000);
          }) as typeof window.setInterval;
          engine.config.autoSync = true;
          engine.config.bgSyncIntervalMinutes = 0;
          engine.startIntervals();
          intervalCallback!();
        }
        await new Promise<void>(resolve => {
          const timer = originalInterval(() => { if (requests) { clearInterval(timer); resolve(); } }, 20);
        });
        const failed = { state: engine.status.state, error: engine.status.error, processing: engine.isProcessingSync };
        window.fetch = async () => { requests++; return Response.json({ bundles: [] }); };
        engine.config.localSyncMode = 'receive-only';
        await engine.pushLocalChanges();
        return { rejected, unhandled, failed, requests };
      } finally {
        window.fetch = originalFetch;
        window.setInterval = originalInterval;
        window.removeEventListener('unhandledrejection', onUnhandled);
        engine.disconnect();
      }
    }, caller);
    expect(result).toEqual({ rejected: false, unhandled: [], failed: { state: 'error', error: 'Sync pull failed: HTTP 503', processing: false }, requests: 2 });
  });
}

for (const overlay of ['pair', 'access'] as const) {
  test(`escape closes only the ${overlay} overlay above settings`, async ({ page }, testInfo) => {
    await page.route('**/api/pair/create', route => route.fulfill({ json: { pin: '123-456', sessionId: 'escape-test', expiresIn: 300, hostDeviceId: 'host', hostPublicKey: 'key', qrPayload: 'slag://pair?pin=123-456' } }));
    await page.goto('/');
    await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
    await page.evaluate(async () => {
      const { syncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      syncEngine.addTrustedDevice({ id: 'escape-peer', name: 'escape peer', platform: 'desktop', isCurrent: false, pairedAt: '', lastSeenAt: '', allowedVaults: [] });
    });
    await page.getByTestId('sidebar-settings-btn').click();
    await page.locator('button[data-tab="devices"]').click();
    const settings = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Настройки', exact: true }) });
    await expect(settings).toBeVisible();
    if (overlay === 'pair') await page.getByTestId('btn-open-pair-modal').click();
    else await page.getByRole('button', { name: 'Доступ escape peer к хранилищам' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(settings).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`escape-${overlay}-settings-preserved.png`) });
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
  });
}
