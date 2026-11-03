import { test, expect } from './support/selfhostFixture';

test('account rooms isolate legacy routing and checkpoints, and pending access stops sync', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const enginePath = '/src/lib/sync/syncEngine.ts';
    const cryptoPath = '/src/lib/sync/crypto.ts';
    const { SyncEngine, storage, accountClient } = await import(/* @vite-ignore */ enginePath);
    const { deriveRoomId, computeHash, computeStateRootHash } = await import(/* @vite-ignore */ cryptoPath);
    const originals = { getToken: accountClient.getToken, getSession: accountClient.getSession, refresh: accountClient.refresh, getState: accountClient.getState, subscribe: accountClient.subscribe };
    const vaultId = storage.ensureVaultSyncId(storage.getCurrentVault().id);
    const state = { ...accountClient.getState(), devices: [], vaults: [{ id: vaultId, grants: [{ deviceId: 'synthetic-account-device', mode: 'read-write', status: 'accepted' }] }] };
    let listener: (value: typeof state) => void = () => {};
    accountClient.getToken = () => 'synthetic-token';
    accountClient.getSession = () => ({ deviceId: 'synthetic-account-device' });
    accountClient.refresh = async () => {};
    accountClient.getState = () => state;
    accountClient.subscribe = (callback) => { listener = callback; return () => {}; };
    const engine = new SyncEngine();
    engine.refreshServerAuth = async () => true;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    const push = engine.pushLocalChanges.bind(engine);
    engine.pushLocalChanges = async () => {};
    const realFetch = window.fetch;
    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'synthetic account seed', deviceId: 'synthetic-account-device' });
      await engine.init();
      const legacyRoom = await deriveRoomId('synthetic account seed');
      const expectedRoom = `room_${(await computeHash(JSON.stringify(['slag-account-room-v1', vaultId, legacyRoom]))).slice(0, 32)}`;
      const roomMatches = engine.activeRoomId === expectedRoom && expectedRoom !== legacyRoom;
      const root = await computeStateRootHash(storage.getItems(), storage.getFolders());
      localStorage.setItem('slag_sync_last_state_hash', root);
      localStorage.setItem(`slag_sync_last_state_hash_${engine.getCurrentVaultId()}`, root);
      let posts = 0;
      window.fetch = async () => { posts++; return new Response('{}', { status: 200 }); };
      await push();
      await push();
      const fullResendOnce = posts === 1;
      state.vaults[0].grants[0].status = 'pending';
      listener(state);
      await push();
      const pendingStopped = engine.activeRoomId === null && engine.activeVaultKey === null && posts === 1;
      await engine.init();
      return { roomMatches, fullResendOnce, pendingStopped, pendingInitBlocked: engine.activeRoomId === null };
    } finally {
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });
  expect(result).toEqual({ roomMatches: true, fullResendOnce: true, pendingStopped: true, pendingInitBlocked: true });
});

test('latest init owns both key and room when earlier derivation finishes last', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/sync/syncEngine.ts';
    const cryptoPath = '/src/lib/sync/crypto.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ modulePath);
    const { deriveVaultKey, deriveRoomId } = await import(/* @vite-ignore */ cryptoPath);
    const realDeriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
    let releaseFirst: () => void;
    let startedFirst: () => void;
    const blocked = new Promise<void>(resolve => { releaseFirst = resolve; });
    const started = new Promise<void>(resolve => { startedFirst = resolve; });
    let calls = 0;
    crypto.subtle.deriveKey = async (...args) => {
      const key = await realDeriveKey(...args);
      if (++calls === 1) { startedFirst(); await blocked; }
      return key;
    };
    const engine = new SyncEngine();
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    engine.pushLocalChanges = async () => {};
    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'old synthetic seed' });
      const oldInit = engine.init();
      await started;
      localStorage.setItem('slag_sync_last_state_hash_default_vault', 'old-room-hash');
      localStorage.setItem('slag_sync_last_state_hash', 'old-room-hash');
      await engine.updateSeedPhrase('new synthetic seed');
      releaseFirst();
      await oldInit;
      const actual = await crypto.subtle.exportKey('raw', engine.activeVaultKey);
      const expected = await crypto.subtle.exportKey('raw', await deriveVaultKey('new synthetic seed'));
      return {
        keysMatch: [...new Uint8Array(actual)].join() === [...new Uint8Array(expected)].join(),
        roomMatches: engine.activeRoomId === await deriveRoomId('new synthetic seed'),
        oldRoomHashCleared: localStorage.getItem('slag_sync_last_state_hash_default_vault') === null && localStorage.getItem('slag_sync_last_state_hash') === null,
      };
    } finally {
      crypto.subtle.deriveKey = realDeriveKey;
      engine.disconnect();
    }
  });
  expect(result).toEqual({ keysMatch: true, roomMatches: true, oldRoomHashCleared: true });
});
