import { test, expect } from './support/selfhostFixture';

test('received bundles wait for persistence, serialize, and never ACK failed writes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const source = await (await fetch(path)).text();
    const storagePath = source.match(/from ["']([^"']*\/storage\.ts[^"']*)["']/)![1];
    const { storage } = await import(/* @vite-ignore */ storagePath);
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    const sent: string[] = [];
    engine.activeVaultKey = {};
    engine.activeRoomId = 'room_durability_test';
    engine.status.authRequired = false;
    engine.ws = { readyState: WebSocket.OPEN, send: (value: string) => sent.push(value) };
    const original = storage.importSyncedVaultData;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    storage.importSyncedVaultData = async () => { if (++calls === 1) await gate; };
    const bundle = (id: string) => ({ bundleId: id, roomId: 'room_durability_test', fromDeviceId: 'other', changes: [{ type: 'item', action: 'upsert', id, payload: { id, title: id } }] });
    try {
      const first = engine.applyIncomingBundle(bundle('one'));
      const second = engine.applyIncomingBundle(bundle('two'));
      await Promise.resolve();
      const before = { calls, acks: sent.length };
      release();
      await Promise.all([first, second]);
      const after = sent.map(value => JSON.parse(value).bundleId);
      storage.importSyncedVaultData = async () => { throw new Error('disk full'); };
      let failure = '';
      try {
        await engine.applyIncomingBundle(bundle('failed'));
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      return { before, after, finalAcks: sent.length, state: engine.getStatus().state, failure };
    } finally { storage.importSyncedVaultData = original; }
  });
  expect(result).toEqual({ before: { calls: 1, acks: 0 }, after: ['one', 'two'], finalAcks: 2, state: 'error', failure: 'disk full' });
});
