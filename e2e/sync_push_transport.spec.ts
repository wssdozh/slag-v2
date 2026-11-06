import { test, expect } from './support/selfhostFixture';

test('sync harness restores browser state when initialization fails', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const realFetch = window.fetch;
    const realImport = storage.importSyncedVaultData;
    const methods = ['getToken', 'getSession', 'refresh', 'getState', 'subscribe'] as const;
    const originals = methods.map((method) => accountClient[method]);
    let disconnected = false;
    let error = '';
    try {
      await withSyncHarness(async ({ engine, storage, init }) => {
        const disconnect = engine.disconnect.bind(engine);
        engine.disconnect = () => { disconnected = true; disconnect(); };
        engine.init = async () => { throw new Error('setup failed'); };
        window.fetch = async () => new Response('{}');
        storage.importSyncedVaultData = async () => {};
        await init('synthetic failing seed');
      });
    } catch (caught) {
      error = (caught as Error).message;
    }
    return {
      error, disconnected,
      fetchRestored: window.fetch === realFetch,
      importRestored: storage.importSyncedVaultData === realImport,
      accountRestored: methods.every((method, index) => accountClient[method] === originals[index]),
    };
  });
  expect(result).toEqual({ error: 'setup failed', disconnected: true, fetchRestored: true, importRestored: true, accountRestored: true });
});

test('push always goes over HTTP POST and 409 replay counts as delivered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    return withSyncHarness(async ({ engine, push, init }) => {
      await init('synthetic push seed');
      let wsSends = 0;
      engine.ws = { readyState: 1, send: () => { wsSends++; }, close: () => {} };
      const posts: number[] = [];
      let status = 200;
      window.fetch = async (_url, opts) => {
        if (!opts || opts.method !== 'POST') return Response.json({ bundles: [] });
        posts.push(status);
        return new Response('{}', { status });
      };
      await push();
      const firstPushOverHttp = posts.length === 1 && wsSends === 0;
      localStorage.removeItem(engine.getStateHashKey());
      localStorage.removeItem('slag_sync_last_state_hash');
      // A full resend also means forgetting which entity hashes the room already has.
      Object.keys(localStorage)
        .filter((key) => key.startsWith('slag_sync_sent_hashes_'))
        .forEach((key) => localStorage.removeItem(key));
      status = 409;
      await push();
      const replayAccepted = posts.length === 2 && wsSends === 0 && engine.status.error === null && localStorage.getItem(engine.getStateHashKey()) !== null;
      return { firstPushOverHttp, replayAccepted, posts };
    });
  });
  expect(result).toEqual({ firstPushOverHttp: true, replayAccepted: true, posts: [200, 409] });
});

test('a re-delivered bundleId applies only once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    return withSyncHarness(async ({ engine, storage, init }) => {
      let applies = 0;
      const origImport = storage.importSyncedVaultData.bind(storage);
      storage.importSyncedVaultData = async (data) => { applies++; return origImport(data); };
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic dedup seed');
      const bundle = {
        bundleId: 'dup-bundle', roomId: engine.activeRoomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(),
        changes: [{ id: 'dup-note', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { id: 'dup-note', title: 'dup', folder: 'Входящие', type: 'note', content: 'dedup' } }],
      };
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { applies };
    });
  });
  expect(result).toEqual({ applies: 1 });
});
