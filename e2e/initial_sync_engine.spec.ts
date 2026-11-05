import { test, expect } from './support/selfhostFixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { syncEngine } = await import(/* @vite-ignore */ path);
    syncEngine.disconnect();
  });
});

for (const scenario of ['storage failure', 'ACK retry', 'restart', 'rejected sender', 'empty queue']) {
  test(`initial sync handles ${scenario}`, async ({ page }) => {
    const result = await page.evaluate(async (scenario) => {
      const path = '/src/lib/sync/syncEngine.ts';
      const { SyncEngine, storage } = await import(/* @vite-ignore */ path);
      const originalFetch = window.fetch;
      const originalImport = storage.importSyncedVaultData;
      let engine = new SyncEngine();
      const id = engine.getCurrentVaultId();
      const markerKey = `slag_initial_sync_${id}`;
      let writes = 0;
      let ackAttempts = 0;
      let acks = 0;
      let pushes = 0;
      let publications = 0;
      let failAck = scenario === 'ACK retry';
      const configure = () => {
        engine.config.enabled = true;
        engine.refreshServerAuth = async () => true;
        engine.usesAccountSync = () => false;
        engine.connectWebSocket = () => {};
        engine.startIntervals = () => {};
        engine.pushLocalChanges = async () => { pushes++; };
        if (scenario === 'rejected sender') {
          engine.config.trustedDevices = [{ id: 'source', syncMode: 'receive-only' }];
        }
      };
      const snapshot = () => ({
        initial: { ...engine.getStatus().initialSync }, marker: localStorage.getItem(markerKey),
        state: engine.getStatus().state, writes, ackAttempts, acks, pushes, publications,
      });
      const onUpdate = () => { publications++; };
      window.addEventListener('slag-sync-updated', onUpdate);
      storage.importSyncedVaultData = async () => {
        writes++;
        if (scenario === 'storage failure') throw new Error('disk full');
      };
      window.fetch = async (input) => {
        if (new URL(String(input)).pathname.endsWith('/ack')) {
          ackAttempts++;
          if (failAck) return new Response('unavailable', { status: 503 });
          acks++;
          return Response.json({});
        }
        return Response.json({ bundles: scenario === 'empty queue' ? [] : [{ syncId: 1, payload: {
          bundleId: 'initial-scenario', roomId: engine.activeRoomId, fromDeviceId: 'source',
          changes: [{ id: 'scenario-item', type: 'item', action: 'upsert', payload: { id: 'scenario-item', title: 'remote' } }],
        } }] });
      };
      try {
        engine.beginInitialSync(id);
        configure();
        if (scenario === 'restart') {
          engine.disconnect();
          engine = new SyncEngine();
          configure();
        }
        await engine.init();
        const first = snapshot();
        if (scenario === 'ACK retry') {
          failAck = false;
          await engine.retryInitialSync();
        }
        return { first, final: snapshot() };
      } finally {
        window.fetch = originalFetch;
        storage.importSyncedVaultData = originalImport;
        window.removeEventListener('slag-sync-updated', onUpdate);
        engine.disconnect();
      }
    }, scenario);
    if (scenario === 'storage failure') {
      expect(result.final).toMatchObject({ initial: { state: 'error', processed: 0 }, marker: 'pending', state: 'error', writes: 1, ackAttempts: 0, acks: 0, pushes: 0, publications: 0 });
    } else if (scenario === 'ACK retry') {
      expect(result.first).toMatchObject({ initial: { state: 'error' }, marker: 'pending', writes: 1, ackAttempts: 1, acks: 0, pushes: 0, publications: 0 });
      expect(result.final).toMatchObject({ initial: { state: 'ready', processed: 1, rejected: 0 }, marker: null, writes: 2, ackAttempts: 2, acks: 1, pushes: 1, publications: 1 });
    } else if (scenario === 'rejected sender') {
      expect(result.final).toMatchObject({ initial: { state: 'ready', processed: 0, rejected: 1 }, marker: null, writes: 0, ackAttempts: 0, acks: 0, pushes: 1, publications: 1 });
    } else if (scenario === 'empty queue') {
      expect(result.final).toMatchObject({ initial: { state: 'ready', processed: 0, rejected: 0 }, marker: null, writes: 0, ackAttempts: 0, pushes: 1, publications: 1 });
    } else {
      expect(result.final).toMatchObject({ initial: { state: 'ready', processed: 1, rejected: 0 }, marker: null, writes: 1, acks: 1, pushes: 1, publications: 1 });
    }
  });
}


test('initial sync saves all bundles before publishing once and clears durable pending marker', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine, storage } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    const id = engine.getCurrentVaultId();
    engine.beginInitialSync(id);
    engine.config.enabled = true;
    engine.refreshServerAuth = async () => true;
    engine.usesAccountSync = () => false;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    engine.pushLocalChanges = async () => {};
    const originalFetch = window.fetch;
    const originalImport = storage.importSyncedVaultData;
    let writes = 0;
    const publications: number[] = [];
    const onUpdate = () => publications.push(writes);
    window.addEventListener('slag-sync-updated', onUpdate);
    storage.importSyncedVaultData = async () => { writes++; };
    window.fetch = async (input) => {
      if (new URL(String(input)).pathname.endsWith('/ack')) return Response.json({});
      return Response.json({ bundles: [1, 2, 3].map((n) => ({ syncId: n, payload: {
        bundleId: `initial-${n}`, roomId: engine.activeRoomId, fromDeviceId: 'source',
        changes: [{ id: `item-${n}`, type: 'item', action: 'upsert', payload: { id: `item-${n}`, title: `note ${n}` } }],
      } })) });
    };
    try {
      await engine.init();
      return { writes, publications, initial: engine.getStatus().initialSync, marker: localStorage.getItem(`slag_initial_sync_${id}`) };
    } finally {
      window.fetch = originalFetch;
      storage.importSyncedVaultData = originalImport;
      window.removeEventListener('slag-sync-updated', onUpdate);
      engine.disconnect();
    }
  });
  expect(result.writes).toBe(3);
  expect(result.publications).toEqual([3]);
  expect(result.initial).toMatchObject({ state: 'ready', processed: 3, rejected: 0 });
  expect(result.marker).toBeNull();
});
