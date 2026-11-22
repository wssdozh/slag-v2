import { build } from 'vite';
import { test, expect } from '../support/selfhostFixture';

// Bundle only these modules. The dev server's cold dependency optimizer stalls on this graph
// before the test enters syncManifest; neither the app shell nor its CSS are needed here.
let moduleCode: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false, logLevel: 'error',
    build: { write: false, lib: { entry: 'e2e/support/manifestEntry.ts', formats: ['es'], fileName: 'manifest-test' },
      rolldownOptions: { output: { codeSplitting: false } } },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap((entry) => 'output' in entry ? entry.output : []).filter((entry) => entry.type === 'chunk');
  expect(chunks).toHaveLength(1);
  moduleCode = chunks[0].code;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/manifest-regression', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.route('**/manifest-regression.mjs', (route) => route.fulfill({ contentType: 'text/javascript', body: moduleCode }));
  await page.goto('/manifest-regression');
});

test('legacy restore applies on a peer despite the old trash timestamp', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { recoverFromTrash, persistIncomingBundle, loadTombstones, saveTombstones, vault, setVaultPort } = await import('/manifest-regression.mjs');
    const port = vault();
    const old = { id: 'item_restore-test', type: 'task', title: 'task', folder: 'Inbox', updatedAt: 10 };
    const saved = { ...old, updatedAt: 30 };
    const changes = [];
    const restored = recoverFromTrash({
      attachments: { hydrate: (items) => items }, readTrashIndex: () => [old], cacheTrash: () => {},
      saveItem: () => {
        changes.push({ id: saved.id, type: 'item', action: 'upsert', payload: saved });
        return saved;
      },
      emitChange: (event) => changes.push({ ...event, type: event.kind }),
    }, old.id);
    const scope = { roomId: 'restore-test-room', vaultId: 'restore-test-vault', accountSync: false };
    saveTombstones(scope, { [old.id]: 20 });
    const acked = [];
    let items = [];
    const bundleId = 'restore-test-bundle';
    const engine = {
      activeVaultKey: {}, initGeneration: 1, activeRoomId: scope.roomId, currentVaultId: scope.vaultId,
      bookkeeping: scope, config: { deviceId: 'local', trustedDevices: [{ id: 'sender' }] },
      status: { initialSync: {} }, appliedBundleIds: new Set(),
      usesAccountSync: () => false, notify: () => {}, saveConfig: () => {},
      sendAck: async (id) => { acked.push(id); },
      stageImport: (incoming, _folders, _removed, _workspace, _detail, id) => {
        items = incoming;
        acked.push(id); // Simulate a successful import flush.
      },
    };
    setVaultPort(Object.assign(Object.create(port), { getItems: () => [], getFolders: () => [] }));
    try {
      await persistIncomingBundle(engine, { bundleId, roomId: scope.roomId, fromDeviceId: 'sender', changes });
      return { acked, items, restored, tombstones: loadTombstones(scope) };
    } finally {
      setVaultPort(null);
    }
  });
  expect(result.acked).toEqual(['restore-test-bundle']);
  expect(result.items).toEqual([result.restored]);
  expect(result.restored.updatedAt).toBe(30);
  expect(result.tombstones).toEqual({});
});

test('a legacy import staged before a local save keeps the new note in the live index', async ({ page }) => {
  const ids = await page.evaluate(async () => {
    const { StorageService } = await import('/manifest-regression.mjs');
    const storage = new StorageService();
    await storage.saveItem({ id: 'legacy-incoming', title: 'Incoming', type: 'note', folder: 'Входящие' });
    const staged = storage.getItems();
    const created = await storage.saveItem({ id: 'legacy-local', title: 'Saved here', type: 'note', folder: 'Входящие' });
    await storage.importSyncedVaultData({ items: staged });
    const pickId = ({ id }: { id: string }) => id;
    return { surviving: storage.getItems().map(pickId), expected: [...staged.map(pickId), created.id] };
  });
  expect(ids.surviving).toEqual(ids.expected);
});

test('manual registry catch-up waits for startup and read-only notes use the receipt ledger', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SyncEngine } = await import('/manifest-regression.mjs');
    const engine = Object.create(SyncEngine.prototype);
    let pulls = 0;
    engine.config = { enabled: true, localSyncMode: 'receive-only' };
    engine.noteSession = { replica: { catchUp: async () => { pulls++; }, deliveryStatus: (item: { id: string }) => item.id === 'accepted' ? 'accepted' : 'unconfirmed' } };
    engine.requestManifestCheck();
    const before = pulls;
    engine.activeRoomId = 'ready-test-room';
    engine.requestManifestCheck();
    return { before, after: pulls, accepted: engine.getItemDeliveryStatus({ id: 'accepted' }), unknown: engine.getItemDeliveryStatus({ id: 'unknown' }) };
  });
  expect(result).toEqual({ before: 0, after: 1, accepted: 'accepted', unknown: 'unconfirmed' });
});

test('Markdown preserves projection provenance outside of the note model', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { parseMarkdownToItem, serializeItemToMarkdown } = await import('/manifest-regression.mjs');
    const original = parseMarkdownToItem('local body', 'valid-id');
    const marker = '2:' + 'a'.repeat(64);
    const markdown = serializeItemToMarkdown(original, marker);
    let recorded;
    const reloaded = parseMarkdownToItem(markdown, '', undefined, (value: string) => { recorded = value; });
    return { marker: recorded, body: reloaded.content, survivesOrdinaryRewrite: serializeItemToMarkdown(reloaded).includes(marker), leakedIntoModel: Object.values(reloaded).includes(marker) };
  });
  expect(result).toEqual({ marker: '2:' + 'a'.repeat(64), body: 'local body', survivesOrdinaryRewrite: false, leakedIntoModel: false });
});

test('folder projection publishes nothing on partial write and replays the complete group', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { StorageService, rememberFolders } = await import('/manifest-regression.mjs');
    const store = new StorageService();
    store.currentVault = { id: 'folder-projection-test', name: 'Folder projection test' };
    const oldTree = [{ path: 'Old', name: 'Old' }];
    const tree = [{ path: 'New', name: 'New' }];
    rememberFolders(store, oldTree);
    const notes = ['one', 'two'].map((id) => ({ id, item: { id, type: 'note', title: id, folder: 'New', content: '', tags: [], createdAt: 1, updatedAt: 2 } }));
    store.cacheItems(store.getItemsKey(), notes.map(({ item }) => ({ ...item, folder: 'Old' })));
    const visible = () => [store.getItems().map(({ folder }) => folder), store.getFolders().map(({ path }) => path)];
    const events = [];
    store.subscribeChanges(() => events.push(visible()));
    const writes = [];
    let fail = true;
    let fence = {};
    store.files.writeStateSection = async (name, patch) => {
      if (name !== 'pendingFolderProjection') throw new Error(`Unexpected section ${name}`);
      fence = JSON.parse(JSON.stringify(patch(fence)));
    };
    store.files.flushItemToDisk = async ({ id }) => {
      writes.push(id);
      if (fail && id === 'two') throw new Error('injected disk failure');
    };
    store.files.removeFolderFromDisk = async (path) => { writes.push(`remove:${path}`); };
    let failure;
    try { await store.applyAcceptedFolderGroup(notes, tree); } catch (error) { failure = String(error); }
    const afterFailure = visible();
    const prematureEvents = events.length;
    const afterCrash = fence;
    fail = false;
    const reopened = new StorageService();
    reopened.currentVault = store.currentVault;
    rememberFolders(reopened, oldTree);
    reopened.files.writeStateSection = store.files.writeStateSection;
    reopened.files.flushItemToDisk = store.files.flushItemToDisk;
    reopened.files.removeFolderFromDisk = store.files.removeFolderFromDisk;
    reopened.subscribeChanges(() => events.push([reopened.getItems().map(({ folder }) => folder), reopened.getFolders().map(({ path }) => path)]));
    await reopened.applyAcceptedFolderGroup(notes, tree);
    return { failure, afterFailure, prematureEvents, afterCrash, afterReplay: fence, events, writes };
  });
  expect(result.failure).toContain('injected disk failure');
  expect(result.afterFailure).toEqual([['Old', 'Old'], ['Old']]);
  expect(result.prematureEvents).toBe(0);
  expect(result.afterCrash).toEqual({ one: true, two: true });
  expect(result.afterReplay).toEqual({});
  expect(result.events).toEqual(Array(2).fill([['New', 'New'], ['New']]));
  expect(result.writes).toEqual(['one', 'two', 'one', 'two', 'remove:Old']);
});

test('folder replay removes both physical copies left by an interrupted move', async ({ page }) => {
  const remaining = await page.evaluate(async () => {
    const { StorageService, rememberFolders } = await import('/manifest-regression.mjs');
    const store = new StorageService();
    store.currentVault = { id: 'projection-duplicate-test', name: 'Projection duplicate test' };
    rememberFolders(store, [{ path: 'Old', name: 'Old' }, { path: 'New', name: 'New' }]);
    window.isTauri = true;
    const item = { id: 'one', type: 'note', title: 'one', folder: 'New', content: '', tags: [], createdAt: 1, updatedAt: 2 };
    const copies = new Map([['New/one.md', { ...item, filename: 'one.md' }],
      ['Old/one.md', { ...item, folder: 'Old', filename: 'one.md', updatedAt: 1 }]]);
    try {
      store.files.readStateSection = async () => ({ one: true });
      store.files.writeStateSection = async () => {};
      store.files.readProjectionCopies = async () => [...copies.values()];
      store.files.flushItemToDisk = async (value) => { copies.set(`${value.folder}/${value.filename}`, value); };
      store.files.removeProjectionCopy = async (value) => { copies.delete(`${value.folder}/${value.filename}`); };
      // Old remains in the tree, so removing the whole folder cannot mask the duplicate.
      await store.applyAcceptedFolderGroup([{ id: item.id, item }], undefined);
      return [...copies.keys()];
    } finally { delete window.isTauri; }
  });
  expect(remaining).toEqual(['New/one.md']);
});

test('an enrolled folder action journals its cascade without optimistic writes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { StorageService, rememberFolders } = await import('/manifest-regression.mjs');
    const store = new StorageService();
    store.currentVault = { id: 'folder-cascade-test', name: 'Folder cascade test' };
    const tree = [{ path: 'Old', name: 'Old' }];
    rememberFolders(store, tree);
    store.cacheItems(store.getItemsKey(), [{ id: 'one', type: 'note', title: 'one', folder: 'Old', content: '', tags: [], createdAt: 1, updatedAt: 1 }]);
    const captured = [];
    let fallback = 0;
    const unsubscribe = store.subscribeFolderTreeIntents(async () => { fallback++; }, async (notes, next, previous) => {
      captured.push([notes.map(({ previous, item }) => [previous.folder, item.folder]), next.map(({ path }) => path), previous.map(({ path }) => path)]);
    });
    store.subscribeNoteIntents(async () => { fallback++; });
    store.subscribeChanges(() => { fallback++; });
    await store.renameFolder('Old', { path: 'New', name: 'New' });
    await store.deleteFolder('Old');
    unsubscribe();
    let fenced = false;
    try { await store.deleteFolder('Old'); } catch { fenced = true; }
    return { captured, fallback, fenced, item: store.getItemById('one').folder, tree: store.getFolders().map(({ path }) => path) };
  });
  expect(result.captured).toEqual([[[['Old', 'New']], ['New'], ['Old']], [[['Old', 'Входящие']], [], ['Old']]]);
  expect(result).toMatchObject({ fallback: 0, fenced: true, item: 'Old', tree: ['Old'] });
});

test('one cross-parent drag captures one complete folder tree', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { moveFolderTree, rememberFolders, readFolders } = await import('/manifest-regression.mjs');
    const writes = [];
    const host = {
      currentVault: { id: 'drag-vault' }, getItems: () => [], getItemsKey: () => 'items',
      persistNoteIntents: () => {}, cacheItems: () => {}, emitChange: () => {},
      persistFolders: (folders) => { writes.push(folders); rememberFolders(host, folders); },
    };
    rememberFolders(host, ['A', 'A/child', 'B', 'C'].map((path, order) => ({ path, name: path.split('/').at(-1), description: '', order })));
    const result = moveFolderTree(host, 'A/child', 'B', 'into');
    return { result, writes: writes.length, paths: readFolders(host).map(({ path }) => path) };
  });
  expect(result).toEqual({ result: { ok: true, path: 'B/child' }, writes: 1, paths: ['A', 'B', 'B/child', 'C'] });
});

test('a peer manifest missing a local task only reports and pulls', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { logger, syncManifest, vault, setVaultPort } = await import('/manifest-regression.mjs');
    const port = vault();
    const originalFetch = window.fetch;
    const trashed: string[] = [];
    let pulls = 0;
    let pushes = 0;
    const task = { id: 'item_local-task', type: 'task', title: 'private-title', content: 'private-body', updatedAt: 1, folder: 'private-folder' };
    const peer = { deviceId: 'peer', root: 'peer-root', at: 1_700_000_000_000, folders: {}, leaves: {} };
    const oldPeer = { deviceId: 'old-peer', root: 'old-root', folders: {} };
    const engine = {
      initGeneration: 1, activeRoomId: 'test-room', currentVaultId: 'test-vault',
      config: { deviceId: 'local', serverUrl: 'https://relay.invalid', localSyncMode: 'read-write' },
      status: { manifest: null },
      fetchPendingBundlesHttp: async () => { pulls++; },
      scheduleDebouncedPush: () => { pushes++; },
      usesAccountSync: () => false, notify: () => undefined,
    };
    setVaultPort(Object.assign(Object.create(port), {
      getItems: () => [task], getFolders: () => [], moveToTrash: (id: string) => trashed.push(id),
    }));
    window.fetch = async (_input, init) => init?.method === 'POST'
      ? new Response(null, { status: 204 })
      : Response.json({ v: 1, manifests: [peer, oldPeer] });
    try {
      await syncManifest(engine);
      const log = logger.getEntries().find((entry) => entry.message === 'Манифест: сводки устройств различаются');
      return { trashed, pulls, pushes, manifest: engine.status.manifest, log: log?.data };
    } finally {
      window.fetch = originalFetch;
      setVaultPort(null);
    }
  });
  expect(result.manifest).toMatchObject({ action: 'report', extra: ['item_local-task'] });
  expect(result.log).toMatchObject({
    action: 'pull-retained', divergedCount: 2,
    peers: [
      { deviceId: 'peer', snapshotAtMs: 1_700_000_000_000, onlyLocal: 1, onlyLocalIds: ['item_local-task'], onlyPeer: 0 },
      { deviceId: 'old-peer', snapshotAtMs: null, onlyLocal: null, onlyPeer: null, changedNotes: null },
    ],
  });
  expect(JSON.stringify(result.log)).not.toMatch(/private-|peer-root|old-root/);
  expect(result.trashed).toEqual([]);
  expect(result.pulls).toBe(1);
  expect(result.pushes).toBe(0);
});

/**
 * The room answers with one manifest per device now, so a check is "my root against every peer's
 * root", not "my root against the room's single row".
 *
 * `decideManifest` reports divergence without resending. The room's old anonymous row
 * cannot outrank a named peer. The answer
 * formats are pinned beside it, because a relay older than this app answers one row for the room.
 */
test('a manifest check decides per peer, not against one room row', async ({ page }) => {
  const outcomes = await page.evaluate(async () => {
    const { decideManifest, parsePeerManifests } = await import('/manifest-regression.mjs');

    type Row = {
      deviceId: string | null;
      at: number | null;
      root: string;
      folders: Record<string, string>;
      leaves?: Record<string, string>;
    };
    const local = { root: 'root-local', folders: {}, leaves: { item_old: 'leaf-a' } };
    const peer = (
      deviceId: string | null,
      root: string,
      overrides: Partial<Pick<Row, 'at' | 'leaves'>> = {},
    ): Row => ({ deviceId, at: null, root, folders: {}, leaves: {}, ...overrides });
    // Two peers, the second one behind; the first already agrees and must not win the verdict.
    const split = [peer('dev-a', 'root-local'), peer('dev-b', 'root-other')];
    return {
      split: decideManifest(local, split),
      agreed: decideManifest(local, [peer('dev-a', 'root-local'), peer('dev-b', 'root-local')]),
      empty: decideManifest(local, []),
      anonymousOnly: decideManifest(local, [peer('dev-a', 'root-local'), peer(null, 'root-old')]),
      anonymousAndReal: decideManifest(local, [peer(null, 'root-old'), peer('dev-b', 'root-other')]),
      perDevice: parsePeerManifests({
        v: 1,
        manifests: [
          { deviceId: 'dev-a', at: 1_700_000_000_000, root: 'root-a', folders: {}, leaves: {}, syncId: 7 },
          { deviceId: 'dev-b', root: 'root-b', folders: { Проекты: 'f' }, syncId: 8 },
        ],
        anonymous: { root: 'root-old', folders: {}, syncId: 3 },
      }),
      oldRelay: parsePeerManifests({ v: 1, root: 'root-room', folders: {}, syncId: 3 }),
    };
  });

  // Two peers, one behind: the diverged one is named.
  expect(outcomes.split.action).toBe('report');
  expect(outcomes.split.peer?.deviceId).toBe('dev-b');
  // Every peer agrees with the local root: nothing to do, and the row is still named for the panel.
  expect(outcomes.agreed.action).toBe('none');
  expect(outcomes.agreed.drift?.rootMatch).toBe(true);
  expect(outcomes.empty).toEqual({ action: 'none', peer: null, drift: null });

  // The old room-wide row disagrees, every named peer agrees: "no data", never a resend.
  expect(outcomes.anonymousOnly.action).toBe('none');
  expect(outcomes.anonymousOnly.peer?.deviceId).toBeNull();
  expect(outcomes.anonymousOnly.peer?.root).toBe('root-old');
  expect(outcomes.anonymousOnly.drift?.rootMatch).toBe(false);
  // A named peer that disagrees outranks the anonymous one: the real divergence is the verdict.
  expect(outcomes.anonymousAndReal.action).toBe('report');
  expect(outcomes.anonymousAndReal.peer?.deviceId).toBe('dev-b');

  // Both relay answers become peers: rows by device (with the row's own date), plus the old row.
  expect(outcomes.perDevice.map((entry: { deviceId: string | null }) => entry.deviceId))
    .toEqual(['dev-a', 'dev-b', null]);
  expect(outcomes.perDevice[1].folders).toEqual({ Проекты: 'f' });
  expect(outcomes.perDevice[0].at).toBe(1_700_000_000_000);
  // A row from a relay that does not date its rows carries no date at all.
  expect(outcomes.perDevice[1].at).toBeNull();
  // An old relay answers one row for the whole room: one anonymous peer, no leaves, no date.
  expect(outcomes.oldRelay.length).toBe(1);
  expect(outcomes.oldRelay[0].deviceId).toBeNull();
  expect(outcomes.oldRelay[0].root).toBe('root-room');
  expect(outcomes.oldRelay[0].at).toBeNull();
  expect(outcomes.oldRelay[0].leaves).toBeUndefined();

});
