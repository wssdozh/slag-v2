import { test, expect } from './support/selfhostFixture';

// Bundles no longer write per bundle: they are merged into the import buffer and written once
// per burst on a 120 ms timer, so "merged" and "on disk" are two different moments now.
test('received bundles are written once per burst, after the burst, and render only once the write lands', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine, storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const engine = new SyncEngine();
    const sent: string[] = [];
    engine.activeVaultKey = {};
    engine.activeRoomId = 'room_durability_test';
    engine.status.authRequired = false;
    engine.ws = { readyState: WebSocket.OPEN, send: (value: string) => sent.push(value), close: () => {} };
    const original = storage.importSyncedVaultData;
    const write = original.bind(storage);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    let rendered = 0;
    const onUpdate = () => { rendered++; };
    window.addEventListener('slag-sync-updated', onUpdate);
    // Only the burst write is gated: it must not resolve before we let it, so a render before
    // the release means the UI was told about state that is not on disk yet.
    storage.importSyncedVaultData = async (data) => { if (++writes === 1) await gate; return write(data); };
    const bundle = (id: string) => ({
      bundleId: id, roomId: 'room_durability_test', fromDeviceId: 'other',
      changes: [{ type: 'item', action: 'upsert', id, payload: { id, title: id, type: 'note', content: id, folder: 'Входящие' } }],
    });
    try {
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle: bundle('one') }));
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle: bundle('two') }));
      // Two bundles, nothing ACKed and nothing written yet: the burst is still being collected.
      const beforeFlush = { writes, rendered, acks: sent.length };
      await new Promise((resolve) => setTimeout(resolve, 200));
      const whileWriting = { writes, rendered, acks: sent.length };
      release();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const afterWrite = {
        writes,
        rendered,
        acks: sent.length,
        stored: ['one', 'two'].filter((id) => storage.getItems().some((it) => it.id === id)),
      };
      return { beforeFlush, whileWriting, afterWrite };
    } finally {
      window.removeEventListener('slag-sync-updated', onUpdate);
      storage.importSyncedVaultData = original;
      engine.disconnect();
    }
  });
  expect(result).toEqual({
    beforeFlush: { writes: 0, rendered: 0, acks: 0 },
    whileWriting: { writes: 1, rendered: 0, acks: 0 },
    afterWrite: { writes: 1, rendered: 1, acks: 2, stored: ['one', 'two'] },
  });
});

// The ACK belongs to the write, not to the merge: a staged bundle is confirmed to the relay only
// after the burst lands on disk. When that write fails, the relay keeps its copy (no ACK), the id
// leaves `appliedBundleIds` (a re-delivery applies again instead of being skipped) and the failure
// is visible in `status` — silent 'connected' over an empty disk was the data loss.
test('received bundles never ACK a write that failed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine, storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const engine = new SyncEngine();
    const sent: string[] = [];
    engine.activeVaultKey = {};
    engine.activeRoomId = 'room_durability_test';
    engine.status.authRequired = false;
    engine.ws = { readyState: WebSocket.OPEN, send: (value: string) => sent.push(value), close: () => {} };
    const original = storage.importSyncedVaultData;
    storage.importSyncedVaultData = async () => { throw new Error('disk full'); };
    const bundle = {
      bundleId: 'failed', roomId: 'room_durability_test', fromDeviceId: 'other',
      changes: [{ type: 'item', action: 'upsert', id: 'failed', payload: { id: 'failed', title: 'failed', type: 'note', content: 'x', folder: 'Входящие' } }],
    };
    try {
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      const afterFailure = {
        acks: sent.length,
        state: engine.status.state,
        error: engine.status.error,
        applied: engine.appliedBundleIds.has('failed'),
        stored: storage.getItems().some((it) => it.id === 'failed'),
      };
      // Disk back: the relay re-delivers the bundle it was never told about, and it lands.
      storage.importSyncedVaultData = original;
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      const afterRetry = {
        acks: sent.length,
        applied: engine.appliedBundleIds.has('failed'),
        stored: storage.getItems().some((it) => it.id === 'failed'),
      };
      return { afterFailure, afterRetry };
    } finally {
      storage.importSyncedVaultData = original;
      engine.disconnect();
    }
  });
  expect(result).toEqual({
    afterFailure: { acks: 0, state: 'error', error: 'disk full', applied: false, stored: false },
    afterRetry: { acks: 1, applied: true, stored: true },
  });
});
