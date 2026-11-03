import { test, expect } from './support/selfhostFixture';

test('push emits delete tombstones for removed ids', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { SyncEngine, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const cryptoMod = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');
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
      engine.saveConfig({ enabled: true, seedPhrase: 'synthetic delete seed', deviceId: 'synthetic-device' });
      await engine.init();
      localStorage.setItem(engine.getSyncedIdsKey(), JSON.stringify(['ghost-note']));
      const key = await cryptoMod.deriveVaultKey('synthetic delete seed');
      let captured: { changes?: Array<{ id: string; type: string; action: string }> } = {};
      window.fetch = async (_url, opts) => {
        const encrypted = JSON.parse(opts.body);
        captured = await cryptoMod.decryptBundle(encrypted, key);
        return new Response('{}', { status: 200 });
      };
      await push();
      const deleteChanges = (captured.changes || []).filter((c) => c.type === 'item' && c.action === 'delete');
      return {
        hasDelete: deleteChanges.some((c) => c.id === 'ghost-note'),
        syncedIdsUpdated: !JSON.parse(localStorage.getItem(engine.getSyncedIdsKey()) || '[]').includes('ghost-note'),
        tombstoneStored: Object.prototype.hasOwnProperty.call(JSON.parse(localStorage.getItem(engine.getTombstonesKey()) || '{}'), 'ghost-note'),
      };
    } finally {
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });
  expect(result).toEqual({ hasDelete: true, syncedIdsUpdated: true, tombstoneStored: true });
});

test('delete wins over stale upsert and restore wins over delete', async ({ page }) => {
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
    const realFetch = window.fetch;
    window.fetch = async () => new Response('{}', { status: 200 });
    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'synthetic lww seed', deviceId: 'synthetic-device' });
      await engine.init();
      const roomId = engine.activeRoomId;
      const base = { id: 'n1', type: 'note' as const, title: 'n1', content: 'x', folder: 'Входящие', tags: [], attachments: [], createdAt: 1, updatedAt: 100 };
      await storage.importSyncedVaultData({ items: [base] });
      const makeBundle = (bundleId: string, changes: unknown[]) => ({
        bundleId, roomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(), changes,
      });
      await engine.applyIncomingBundle(makeBundle('b1', [
        { id: 'n1', type: 'item', action: 'delete', version: 1, hash: '200', payload: { deletedAt: 200 } },
      ]));
      const deleted = !storage.getItems().some((it) => it.id === 'n1');
      await engine.applyIncomingBundle(makeBundle('b2', [
        { id: 'n1', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { ...base, updatedAt: 100 } },
      ]));
      const staleNotResurrected = !storage.getItems().some((it) => it.id === 'n1');
      await engine.applyIncomingBundle(makeBundle('b3', [
        { id: 'n1', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { ...base, updatedAt: 300 } },
      ]));
      const restored = storage.getItems().some((it) => it.id === 'n1');
      return { deleted, staleNotResurrected, restored };
    } finally {
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });
  expect(result).toEqual({ deleted: true, staleNotResurrected: true, restored: true });
});

test('folder rename and deletion propagate to folders, nested items, and outbox', async ({ page }) => {
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
    const realFetch = window.fetch;
    window.fetch = async () => new Response('{}', { status: 200 });
    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'synthetic folder seed', deviceId: 'synthetic-device' });
      await engine.init();
      const roomId = engine.activeRoomId;

      // 1. Initial seed: folder "Тест" and item in "Тест"
      const folderInitial = { path: 'Тест', name: 'Тест', icon: 'Folder' };
      const noteInFolder = { id: 'note-folder-1', type: 'note' as const, title: 'In folder', content: 'test', folder: 'Тест', tags: [], attachments: [], createdAt: 1, updatedAt: 100 };
      await storage.importSyncedVaultData({ folders: [...storage.getFolders(), folderInitial], items: [noteInFolder] });

      const makeBundle = (bundleId: string, changes: unknown[]) => ({
        bundleId, roomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(), changes,
      });

      // 2. Incoming folder rename: "Тест" -> "НовыйТест"
      await engine.applyIncomingBundle(makeBundle('b-rename', [
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
      await engine.applyIncomingBundle(makeBundle('b-del', [
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
    } finally {
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });
  expect(result).toEqual({
    renamedFolderExists: true,
    itemFolderRenamed: true,
    deletedFolderGone: true,
    itemReroutedToInbox: true,
    outboxCapturedDelete: true,
  });
});
