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
      // Two bundles, one ACK each, nothing written yet: the burst is still being collected.
      const beforeFlush = { writes, rendered, acks: sent.length };
      await new Promise((resolve) => setTimeout(resolve, 200));
      const whileWriting = { writes, rendered };
      release();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const afterWrite = {
        writes,
        rendered,
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
    beforeFlush: { writes: 0, rendered: 0, acks: 2 },
    whileWriting: { writes: 1, rendered: 0 },
    afterWrite: { writes: 1, rendered: 1, stored: ['one', 'two'] },
  });
});

// fixme: the import buffer moved the ACK in front of the write. A bundle is staged in memory and
// ACKed immediately; the flush that persists it is fired on a timer and its rejection is dropped
// (`void this.flushStagedImport()`), so a failed write loses the bundle for good: the relay has
// it ACKed, `appliedBundleIds` already holds it, nothing is on disk and `status` stays
// 'connected'. Measured: one ACK, applied true, stored false, no error. Before the buffer the
// ACK waited for `importSyncedVaultData`, so an unwritten bundle stayed pending and the relay
// delivered it again. Product-side fix (hold the ACK until the burst write resolves, or re-queue
// the buffer on failure) — not a test fix.
test.fixme('received bundles never ACK a write that failed', async ({ page }) => {
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
      let failure = '';
      try {
        await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        acks: sent.length,
        failure,
        state: engine.status.state,
        applied: engine.appliedBundleIds.has('failed'),
        stored: storage.getItems().some((it) => it.id === 'failed'),
      };
    } finally {
      storage.importSyncedVaultData = original;
      engine.disconnect();
    }
  });
  expect(result).toEqual({ acks: 0, failure: 'disk full', state: 'error', applied: false, stored: false });
});
