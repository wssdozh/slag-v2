import { test, expect } from './support/selfhostFixture';

test('push always goes over HTTP POST and 409 replay counts as delivered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const originals = {
      getToken: accountClient.getToken, getSession: accountClient.getSession,
      refresh: accountClient.refresh, getState: accountClient.getState, subscribe: accountClient.subscribe,
    };
    accountClient.getToken = () => null;
    accountClient.getSession = () => ({ deviceId: 'synthetic-device' });
    accountClient.refresh = async () => {};
    accountClient.getState = () => ({ devices: [], vaults: [] });
    accountClient.subscribe = () => () => {};
    const engine = new SyncEngine();
    engine.refreshServerAuth = async () => true;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    const push = engine.pushLocalChanges.bind(engine);
    engine.pushLocalChanges = async () => {};
    const realFetch = window.fetch;
    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'synthetic push seed', deviceId: 'synthetic-device' });
      await engine.init();
      let wsSends = 0;
      engine.ws = { readyState: 1, send: () => { wsSends++; }, close: () => {} };
      const posts: number[] = [];
      let status = 200;
      window.fetch = async () => { posts.push(status); return new Response('{}', { status }); };
      await push();
      const firstPushOverHttp = posts.length === 1 && wsSends === 0;
      localStorage.removeItem(engine.getStateHashKey());
      localStorage.removeItem('slag_sync_last_state_hash');
      status = 409;
      await push();
      const replayAccepted = posts.length === 2 && wsSends === 0 && engine.status.error === null && localStorage.getItem(engine.getStateHashKey()) !== null;
      return { firstPushOverHttp, replayAccepted, posts };
    } finally {
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });
  expect(result).toEqual({ firstPushOverHttp: true, replayAccepted: true, posts: [200, 409] });
});

test('a re-delivered bundleId applies only once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine, storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const originals = {
      getToken: accountClient.getToken, getSession: accountClient.getSession,
      refresh: accountClient.refresh, getState: accountClient.getState, subscribe: accountClient.subscribe,
    };
    accountClient.getToken = () => null;
    accountClient.getSession = () => ({ deviceId: 'synthetic-device' });
    accountClient.refresh = async () => {};
    accountClient.getState = () => ({ devices: [], vaults: [] });
    accountClient.subscribe = () => () => {};
    const engine = new SyncEngine();
    engine.refreshServerAuth = async () => true;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    engine.pushLocalChanges = async () => {};
    let applies = 0;
    const origImport = storage.importSyncedVaultData.bind(storage);
    storage.importSyncedVaultData = async (data) => { applies++; return origImport(data); };
    const realFetch = window.fetch;
    window.fetch = async () => new Response('{}', { status: 200 });
    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'synthetic dedup seed', deviceId: 'synthetic-device' });
      await engine.init();
      const bundle = {
        bundleId: 'dup-bundle', roomId: engine.activeRoomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(),
        changes: [{ id: 'dup-note', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { id: 'dup-note', title: 'dup', folder: 'Входящие', type: 'note', content: 'dedup' } }],
      };
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { applies };
    } finally {
      storage.importSyncedVaultData = origImport;
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });
  expect(result).toEqual({ applies: 1 });
});
