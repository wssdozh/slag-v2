import { test, expect } from '@playwright/test';

test('latest init owns both key and room when earlier derivation finishes last', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('slag_sync_config_v2_default_vault', JSON.stringify({ enabled: false }));
  });
  await page.goto('/');
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
