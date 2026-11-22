import { test, expect } from './support/selfhostFixture';

test('push says nothing about notes until one is actually deleted', async ({ page }) => {
  await page.goto('/');
  // Whichever test lands first pays the dev server's cold transform of the whole app, and on a
  // loaded machine that is a minute, not five seconds.
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const cryptoMod = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');
    const { stateHashKey, tombstonesKey } = await import(/* @vite-ignore */ '/src/lib/sync/localBookkeeping.ts');
    const { getPref, removePref } = await import(/* @vite-ignore */ '/src/lib/storage/prefs.ts');
    return withSyncHarness(async ({ engine, push, init }) => {
      await init('synthetic delete seed');
      const scope = engine.bookkeeping;
      const key = await cryptoMod.deriveVaultKey('synthetic delete seed');
      let captured: { changes?: Array<{ id: string; type: string; action: string }> } = {};
      window.fetch = async (_url, opts) => {
        if (!opts || opts.method !== 'POST') return Response.json({ bundles: [] });
        const encrypted = JSON.parse(opts.body);
        captured = await cryptoMod.decryptBundle(encrypted, key);
        return new Response('{}', { status: 200 });
      };
      const itemDeletes = () => (captured.changes || []).filter((c) => c.type === 'item' && c.action === 'delete');

      // The vault this device already sent everything from, read while the index was still empty:
      // no note was deleted, so the bundle must not claim one was. This is the run that emptied
      // three devices — the old push walked `syncedIds` minus the items it could see, and when it
      // could see nothing that difference was the whole vault.
      removePref(stateHashKey(scope));
      removePref('slag_sync_last_state_hash');
      await push();
      const quietRun = itemDeletes().length;

      // A note the person deleted leaves an op behind, and the push reads that op.
      engine.getOutbox().enqueue({
        opId: 'op_ghost', kind: 'item', id: 'ghost-note', action: 'delete', timestamp: Date.now(),
      });
      captured = {};
      removePref(stateHashKey(scope));
      await push();
      const deleteChanges = itemDeletes();
      return {
        quietRun,
        hasDelete: deleteChanges.some((c) => c.id === 'ghost-note'),
        tombstoneStored: Object.prototype.hasOwnProperty.call(JSON.parse(getPref(tombstonesKey(scope)) || '{}'), 'ghost-note'),
      };
    });
  });
  expect(result).toEqual({ quietRun: 0, hasDelete: true, tombstoneStored: true });
});

test('delete wins over stale upsert and restore wins over delete', async ({ page }) => {
  await page.goto('/');
  // Whichever test lands first pays the dev server's cold transform of the whole app, and on a
  // loaded machine that is a minute, not five seconds.
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    return withSyncHarness(async ({ engine, storage, init }) => {
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic lww seed');
      const roomId = engine.activeRoomId;
      const base = { id: 'n1', type: 'note' as const, title: 'n1', content: 'x', folder: 'Входящие', tags: [], attachments: [], createdAt: 1, updatedAt: 100 };
      await storage.importSyncedVaultData({ items: [base] });
      const makeBundle = (bundleId: string, changes: unknown[]) => ({
        bundleId, roomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(), changes,
      });
      // Bundles are merged into the import buffer and written once per burst on a 120 ms timer,
      // so the vault on disk only reflects a bundle after the flush.
      const deliver = async (bundle: unknown) => {
        await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
        await new Promise((resolve) => setTimeout(resolve, 250));
      };
      await deliver(makeBundle('b1', [
        { id: 'n1', type: 'item', action: 'delete', version: 1, hash: '200', payload: { deletedAt: 200 } },
      ]));
      const deleted = !storage.getItems().some((it) => it.id === 'n1');
      await deliver(makeBundle('b2', [
        { id: 'n1', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { ...base, updatedAt: 100 } },
      ]));
      const staleNotResurrected = !storage.getItems().some((it) => it.id === 'n1');
      await deliver(makeBundle('b3', [
        { id: 'n1', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { ...base, updatedAt: 300 } },
      ]));
      const newerSnapshotRejected = !storage.getItems().some((it) => it.id === 'n1');
      await deliver(makeBundle('b4', [
        { id: 'n1', type: 'trash', action: 'restore', version: 1, hash: 'r', payload: { ...base, updatedAt: 300 } },
      ]));
      const restored = storage.getItems().some((it) => it.id === 'n1');
      return { deleted, staleNotResurrected, newerSnapshotRejected, restored };
    });
  });
  expect(result).toEqual({ deleted: true, staleNotResurrected: true, newerSnapshotRejected: true, restored: true });
});

test('a delayed ACK cannot undo a subsequent deletion or explicit restore', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { loadTombstones, saveTombstones } = await import(/* @vite-ignore */ '/src/lib/sync/localBookkeeping.ts');
    return withSyncHarness(async ({ engine, init }) => {
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic delayed ack seed');
      const outbox = engine.getOutbox();
      outbox.enqueue({ opId: 'old-delete', id: 'restored', kind: 'item', action: 'delete', timestamp: 100 });
      const delayed = { bundleId: 'old-packet', settled: false, stateHash: 'old', packedHashes: {}, opIds: ['old-delete'], changes: 1,
        tombstones: { restored: 100 } }; // Old snapshot, deliberately ignored by commitPush.
      saveTombstones(engine.bookkeeping, { ...loadTombstones(engine.bookkeeping), incoming: 200 });
      outbox.enqueue({ opId: 'restore', id: 'restored', kind: 'trash', action: 'restore', timestamp: 300 });
      outbox.enqueue({ opId: 'new-delete', id: 'new', kind: 'item', action: 'delete', timestamp: 400 });
      engine.commitPush(delayed);
      return { tombstones: loadTombstones(engine.bookkeeping), pending: outbox.pending().map((op: { opId: string }) => op.opId) };
    });
  });
  expect(result).toEqual({ tombstones: { incoming: 200, new: 400 }, pending: ['restore', 'new-delete'] });
});

test('folder rename and deletion propagate to folders, nested items, and outbox', async ({ page }) => {
  await page.goto('/');
  // Whichever test lands first pays the dev server's cold transform of the whole app, and on a
  // loaded machine that is a minute, not five seconds.
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    return withSyncHarness(async ({ engine, storage, init }) => {
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic folder seed');
      const roomId = engine.activeRoomId;

      // 1. Initial seed: folder "Тест" and item in "Тест"
      const folderInitial = { path: 'Тест', name: 'Тест', icon: 'Folder' };
      const noteInFolder = { id: 'note-folder-1', type: 'note' as const, title: 'In folder', content: 'test', folder: 'Тест', tags: [], attachments: [], createdAt: 1, updatedAt: 100 };
      await storage.importSyncedVaultData({ folders: [...storage.getFolders(), folderInitial], items: [noteInFolder] });

      const makeBundle = (bundleId: string, changes: unknown[]) => ({
        bundleId, roomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(), changes,
      });
      // Bundles land in the import buffer and reach the vault on the 120 ms flush.
      const deliver = async (bundle: unknown) => {
        await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
        await new Promise((resolve) => setTimeout(resolve, 250));
      };

      // 2. Incoming folder rename: "Тест" -> "НовыйТест"
      await deliver(makeBundle('b-rename', [
        {
          id: 'НовыйТест',
          type: 'folder',
          action: 'rename',
          version: 1,
          hash: '1',
          payload: { oldPath: 'Тест', folder: { path: 'НовыйТест', name: 'НовыйТест', icon: 'Folder' } },
        },
      ]));

      const renamedFolderExists = storage.getFolders().some((f) => f.path === 'НовыйТест');
      const itemFolderRenamed = storage.getItemById('note-folder-1')?.folder === 'НовыйТест';

      // 3. Incoming folder delete: "НовыйТест"
      await deliver(makeBundle('b-del', [
        { id: 'НовыйТест', type: 'folder', action: 'delete', version: 1, hash: '2', payload: { path: 'НовыйТест' } },
      ]));

      const deletedFolderGone = !storage.getFolders().some((f) => f.path === 'НовыйТест');
      const itemReroutedToInbox = storage.getItemById('note-folder-1')?.folder === 'Входящие';

      // 4. Test Outbox integration via storage.deleteFolder (automatic EventBus -> Outbox)
      storage.saveFolder({ path: 'Локальная', name: 'Локальная', icon: 'Folder' });
      storage.deleteFolder('Локальная');
      const pendingFolderDeletes = engine.getOutbox().pending().filter((op) => op.kind === 'folder' && op.action === 'delete');
      const outboxCapturedDelete = pendingFolderDeletes.some((op) => op.id === 'Локальная');

      return {
        renamedFolderExists,
        itemFolderRenamed,
        deletedFolderGone,
        itemReroutedToInbox,
        outboxCapturedDelete,
      };
    });
  });
  expect(result).toEqual({
    renamedFolderExists: true,
    itemFolderRenamed: true,
    deletedFolderGone: true,
    itemReroutedToInbox: true,
    outboxCapturedDelete: true,
  });
});
