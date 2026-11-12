import { test, expect } from './support/selfhostFixture';

for (const caller of ['direct', 'debounce'] as const) {
  test(`${caller} push never pulls before it pushes`, async ({ page }) => {
    await page.goto('/');
    // The first page load in a cold run pays Vite's transform of the whole module graph.
    await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120000 });
    const result = await page.evaluate(async (caller) => {
      const { SyncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const engine = new SyncEngine();
      engine.activeRoomId = 'room_no_pre_pull';
      engine.activeVaultKey = {};
      const originalFetch = window.fetch;
      const originalInterval = window.setInterval;
      const methods: string[] = [];
      window.fetch = async (_url, opts) => {
        methods.push((opts && opts.method) || 'GET');
        return new Response('{}', { status: 503 });
      };
      try {
        if (caller === 'direct') {
          await engine.pushLocalChanges();
        } else {
          engine.scheduleDebouncedPush(0);
          await new Promise<void>((resolve) => originalInterval(() => resolve(), 120));
        }
        return { methods };
      } finally {
        window.fetch = originalFetch;
        window.setInterval = originalInterval;
        engine.disconnect();
      }
    }, caller);
    expect(result).toEqual({ methods: [] });
  });
}

test('idle tick polls nothing while the socket is open', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const engine = new SyncEngine();
    engine.activeRoomId = 'room_idle_tick';
    engine.activeVaultKey = {};
    const originalFetch = window.fetch;
    const originalInterval = window.setInterval;
    const methods: string[] = [];
    let tick: (() => void) | undefined;
    window.fetch = async (_url, opts) => {
      methods.push((opts && opts.method) || 'GET');
      return Response.json({ bundles: [], head: 0, oldest: 0 });
    };
    try {
      window.setInterval = ((callback: () => void, delay: number) => {
        if (delay === 15000) tick = callback;
        return originalInterval(() => {}, 60_000);
      }) as typeof window.setInterval;
      engine.config.autoSync = true;
      engine.config.bgSyncIntervalMinutes = 0;
      engine.ws = { readyState: 1, send: () => {}, close: () => {} };
      engine.startIntervals();
      tick!();
      await new Promise<void>((resolve) => originalInterval(() => resolve(), 120));
      const withSocket = methods.length;
      window.setInterval = originalInterval;
      engine.ws = null;
      engine.startIntervals();
      tick!();
      await new Promise<void>((resolve) => originalInterval(() => resolve(), 120));
      const withoutSocket = methods.length - withSocket;
      return { withSocket, withoutSocket };
    } finally {
      window.fetch = originalFetch;
      window.setInterval = originalInterval;
      engine.disconnect();
    }
  });
  // A live socket already delivers and drains, so the tick must stay off the network.
  // A dead socket still needs its catch-up pull (the push path itself never pulls).
  expect(result).toEqual({ withSocket: 0, withoutSocket: 1 });
});

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

test('a slow draft throttle never delays a note push', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const engine = new SyncEngine();
    // The debounce timer calls the push module directly, not the engine's own method, so a
    // stub on `engine.pushLocalChanges` never fires. A ready engine is what makes the timer
    // observable: every real push attempt announces itself by entering the `syncing` state.
    engine.activeRoomId = 'room_draft_throttle';
    engine.activeVaultKey = {};
    let fires = 0;
    const unsubscribe = engine.subscribe((status) => {
      if (status.state === 'syncing') fires++;
    });
    engine.scheduleDebouncedPush(1000, true); // a draft keystroke: slow and trailing
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    engine.scheduleDebouncedPush(50); // a note edit: the faster deadline has to win
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    const early = fires;
    await new Promise<void>((resolve) => setTimeout(resolve, 900));
    const afterDraftWindow = fires;
    unsubscribe();
    engine.disconnect();
    return { early, afterDraftWindow };
  });
  // The note's 50 ms deadline wins; the 1 s draft timer must not fire a second time.
  expect(result).toEqual({ early: 1, afterDraftWindow: 1 });
});
