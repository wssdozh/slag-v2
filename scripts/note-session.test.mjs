import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openNoteSession } from '../src/lib/sync/notes/session.ts';

import { deriveNoteKeys, opaqueNoteId, sealNote } from '../src/lib/sync/notes/wire.ts';
import { sealRegistryMedia } from '../src/lib/sync/notes/mediaWire.ts';

const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

test('media enrollment enables ordered local read, upload and CAS, then forbids downgrade', async (t) => {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const room = 'room';
  let enabled = true;
  let saved;
  let id;
  let record;
  const steps = [];
  const { createHash } = await import('node:crypto');
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const action = new URL(url).pathname.split('/').at(-1);
    if (action === 'note-status') return Response.json({ mode: 'registry', generation: 1, head: 0, floor: 0, ...(enabled ? { registryMedia: true } : {}) });
    if (action === 'note-events') return Response.json({ generation: 1, head: 0, floor: 0, events: [] });
    if (action === 'note-media') {
      assert.equal(init.method, 'PUT');
      assert.equal(saved.journal.pending[0].attempt, undefined);
      id = createHash('sha256').update(Buffer.from(JSON.parse(init.body).ciphertext, 'base64')).digest('hex');
      steps.push('upload');
      return Response.json({ id });
    }
    assert.equal(action, 'note-ops');
    const { ops: [op], requestId } = JSON.parse(init.body);
    assert.deepEqual(op.mediaIds, [id]);
    assert.deepEqual(saved.journal.pending[0].attempt.op, op);
    steps.push('cas');
    return Response.json({ type: 'note_results', generation: 1, requestId, results: [{ opId: op.opId, status: 'rejected', code: 'fixture_stop' }] });
  });
  const done = Promise.withResolvers();
  const options = { key, signal: controller.signal, roomId: room, vaultId: 'vault', serverUrl: 'http://127.0.0.1',
    readOnly: false, headers: () => ({}), onProgress: () => {}, onError: done.resolve,
    hasPendingLegacyNotes: () => false, sendLive: () => false,
    port: { getCurrentVault: () => ({ id: 'local' }), isHydrated: () => true, readNoteRegistry: async () => saved,
      writeNoteRegistry: async (value) => { saved = value; }, subscribeNoteIntents: (listener) => { record = listener; return () => {}; },
      readRegistryAttachment: async () => { steps.push('read'); return Uint8Array.of(4); },
      writeAcceptedAttachment: async () => assert.fail('not accepted'), applyAcceptedNote: async () => assert.fail('not accepted'),
    },
  };
  const session = await openNoteSession(options);
  assert.equal(saved.registryMedia, true);
  await session.replica.catchUp();
  const item = { id: 'note', type: 'note', title: '', content: '', folder: 'Inbox', createdAt: 1, updatedAt: 1, tags: [],
    attachments: [{ id: 'file', name: 'file', type: 'file', mimeType: 'application/octet-stream', relativePath: '.attachments/file', size: 1 }] };
  await record([{ id: item.id, kind: 'create', item }]);
  assert.match(String(await done.promise), /fixture_stop/);
  assert.deepEqual(steps, ['read', 'upload', 'cas']);
  enabled = false;
  await assert.rejects(session.verifyEnrollment(false), /поколение реестра изменились/);
  await assert.rejects(openNoteSession(options), /отключил реестр вложений/);
});

test('accepted attachment write failure blocks note projection and the cursor until replay', async (t) => {
  const keys = await deriveNoteKeys(key, 'room');
  const bytes = Uint8Array.of(1, 2, 3);
  const media = await sealRegistryMedia(keys, 'room', 1, bytes);
  const attachment = { id: 'file', name: 'file', type: 'file', mimeType: 'application/octet-stream',
    relativePath: '.attachments/file', size: bytes.length, registryBlobId: media.id };
  const item = { id: 'note', type: 'note', title: '', content: '', folder: 'Inbox', createdAt: 1, updatedAt: 1, tags: [], attachments: [attachment] };
  const op = await sealNote(keys, 'room', 1, { opId: crypto.randomUUID(), noteId: await opaqueNoteId(keys, item.id),
    kind: 'create', baseRevision: 0, mediaIds: [media.id] }, item.id, item);
  const controller = new AbortController();
  t.after(() => controller.abort());
  let saved;
  let fail = true;
  const steps = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/note-status')) return Response.json({ mode: 'registry', generation: 1, head: 1, floor: 0, registryMedia: true });
    if (parsed.pathname.endsWith('/note-events')) return Response.json({ generation: 1, head: 1, floor: 0, events: [{ ...op, revision: 1 }] });
    assert.ok(parsed.pathname.endsWith('/note-media'));
    assert.equal(parsed.searchParams.get('id'), media.id);
    return Response.json({ ciphertext: Buffer.from(media.bytes).toString('base64') });
  });
  const session = await openNoteSession({ key, signal: controller.signal, roomId: 'room', vaultId: 'vault',
    serverUrl: 'http://127.0.0.1', headers: () => ({}), readOnly: true,
    onProgress: () => {}, onError: () => {}, onApplied: () => {},
    port: { getCurrentVault: () => ({ id: 'local' }), isHydrated: () => true, readNoteRegistry: async () => saved,
      writeNoteRegistry: async (value) => { saved = value; }, subscribeNoteIntents: () => () => {},
      readRegistryAttachment: async () => assert.fail('read-only client must not upload'),
      writeAcceptedAttachment: async (selected, received) => {
        assert.equal(session.progress.media, 'applying');
        if (fail) throw new Error('disk full');
        assert.deepEqual(selected, attachment);
        assert.deepEqual(received, bytes);
        steps.push('bytes');
      }, applyAcceptedNote: async () => { steps.push('note'); },
    },
  });
  assert.deepEqual(session.progress, { relayHead: 1, appliedThrough: 0, application: 'catching-up', media: 'waiting' });
  await assert.rejects(session.replica.catchUp(), /disk full/);
  assert.deepEqual(session.progress, { relayHead: 1, appliedThrough: 0, application: 'error', media: 'error' });
  assert.equal(saved.journal.cursor, 0);
  assert.deepEqual(steps, []);
  fail = false;
  await session.replica.catchUp();
  assert.deepEqual(session.progress, { relayHead: 1, appliedThrough: 1, application: 'current', media: 'applied-through-cursor' });
  assert.deepEqual(steps, ['bytes', 'note']);
  assert.equal(saved.journal.cursor, 1);
});

test('registry startup refuses an unreviewed legacy note queue before installing a replica', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(url.includes('/note-status?'));
    return Response.json({ mode: 'registry', generation: 1, head: 25, floor: 25 });
  });
  const controller = new AbortController();
  let subscribed = false;
  let dirty = true;
  let saved;
  const options = {
    key, signal: controller.signal, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'vault',
    readOnly: false, headers: () => ({}), hasPendingLegacyNotes: () => dirty,
    port: {
      getCurrentVault: () => ({ id: 'local-vault' }),
      isHydrated: () => true, readNoteRegistry: async () => saved,
      writeNoteRegistry: async (value) => { saved = value; },
      applyAcceptedNote: async () => assert.fail('negotiation must not overwrite local files'),
      subscribeNoteIntents: () => { subscribed = true; return () => { subscribed = false; }; },
    },
  };
  await assert.rejects(openNoteSession(options), /старой очереди остались неподтверждённые правки/);
  assert.equal(subscribed, false);
  assert.equal(saved, undefined);
  dirty = false;
  assert.equal((await openNoteSession(options)).generation, 1);
  assert.equal(subscribed, true);
  controller.abort();
  assert.equal(subscribed, false);
});

test('an enrolled registry never falls back to legacy if the relay loses its enrollment', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ mode: 'legacy', generation: 0, head: 0, floor: 0 }));
  const stored = { version: 1, room: 'room', generation: 1, journal: { cursor: 0, pending: [], confirmed: {} } };
  const options = {
    key, signal: new AbortController().signal, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'vault',
    headers: () => ({}), port: { getCurrentVault: () => ({ id: 'vault' }), readNoteRegistry: async () => stored },
  };
  await assert.rejects(openNoteSession(options), /Релей переключил комнату обратно/);
  assert.equal(await openNoteSession({ ...options, roomId: 'unenrolled' }), null);
});

test('shared enrollment requires both storage hooks and preserves the queue on capability loss', async (t) => {
  let advertised = true;
  let failWrite = false;
  let stored;
  let record;
  const requests = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(url.includes('/note-status?'));
    return Response.json({ mode: 'registry', generation: 1, head: 0, floor: 0, ...(advertised ? { sharedRecords: true } : {}) });
  });
  const options = {
    key, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'vault', headers: () => ({}),
    readOnly: false, onError: () => {}, onProgress: () => {},
    hasPendingLegacyNotes: (_, shared) => { assert.equal(shared, true); return false; },
    port: {
      getCurrentVault: () => ({ id: 'local' }), isHydrated: () => true,
      readNoteRegistry: async () => stored, writeNoteRegistry: async (value) => {
        if (failWrite) throw new Error('disk full');
        stored = value;
      },
      applyAcceptedNote: async () => assert.fail('unexpected apply'), subscribeNoteIntents: () => () => {},
      applyAcceptedShared: async () => assert.fail('unexpected projection'),
    },
  };
  await assert.rejects(openNoteSession({ ...options, signal: new AbortController().signal }), /не поддерживает общие записи/);
  assert.equal(new URL(requests.mock.calls[0].arguments[0]).searchParams.get('sharedRecords'), null);
  options.port.subscribeSharedIntents = (listener) => { record = listener; return () => { record = undefined; }; };
  const connected = new AbortController();
  const offline = new AbortController();
  t.after(() => { connected.abort(); offline.abort(); });
  assert.equal((await openNoteSession({ ...options, signal: connected.signal })).sharedRecords, true);
  assert.equal(new URL(requests.mock.calls[1].arguments[0]).searchParams.get('sharedRecords'), '1');
  assert.equal(stored.sharedRecords, true);
  connected.abort();
  assert.equal(record, undefined);
  const session = await openNoteSession({ ...options, signal: offline.signal }, true);
  const change = { id: 'slag:shared:v1:memory:fact', value: { id: 'fact', text: 'offline' }, previous: null };
  let projections = 0;
  const applyLocal = async () => {
    projections++;
    assert.equal(stored.journal.pending.length, 1);
  };
  await assert.rejects(record(() => [change, { ...change, id: 'invalid' }], applyLocal));
  assert.equal(stored.journal.pending.length, 0);
  assert.equal(projections, 0);
  failWrite = true;
  await assert.rejects(record(() => [change], applyLocal), /disk full/);
  assert.equal(stored.journal.pending.length, 0);
  assert.equal(projections, 0);
  failWrite = false;
  await assert.rejects(record(() => [change], async () => {
    await applyLocal();
    throw new Error('projection failed');
  }), /projection failed/);
  assert.equal(projections, 1);
  assert.equal(stored.journal.pending[0].id, change.id);
  assert.equal(session.replica.syncHealth, 'error');
  advertised = false;
  await assert.rejects(session.verifyEnrollment(false), /поколение реестра изменились/);
  await assert.rejects(openNoteSession({ ...options, signal: offline.signal }), /отключил общие записи/);
  assert.equal(stored.journal.pending.length, 1);
  let localValue = stored.journal.pending[0].item.shared;
  const edited = { ...localValue, text: 'edit before delete' };
  // Queue both before either callback runs. The delete's base must come from the
  // just-projected update, not the snapshot at the time the UI queued it.
  await Promise.all([
    record(() => [{ id: change.id, value: edited, previous: localValue }], async () => { localValue = edited; }),
    record(() => [{ id: change.id, value: null, previous: localValue }], async () => {}),
  ]);
  assert.equal(stored.journal.pending.at(-1).item, null);
  const pendingCount = stored.journal.pending.length;
  assert.ok(pendingCount > 1);
  // Reopen from the durable journal with no relay request. Capture must not be installed if the
  // projection still fails; a retry must replay from the same journal.
  offline.abort();
  const restarted = new AbortController();
  t.after(() => restarted.abort());
  options.port.applyAcceptedShared = async () => { throw new Error('disk still unavailable'); };
  await assert.rejects(openNoteSession({ ...options, signal: restarted.signal }, true), /disk still unavailable/);
  assert.equal(record, undefined);
  assert.equal(stored.journal.pending.length, pendingCount);
  const projected = [];
  options.port.applyAcceptedShared = async (body) => {
    assert.equal(record, undefined);
    projected.push(body);
  };
  const calls = requests.mock.callCount();
  await openNoteSession({ ...options, signal: restarted.signal }, true);
  assert.equal(requests.mock.callCount(), calls);
  assert.deepEqual(projected, [{ id: change.id, shared: null }]);
  assert.equal(typeof record, 'function');
});

test('a room bound to the former vault cannot write into the new vault', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ mode: 'registry', generation: 1, head: 0, floor: 0 }));
  const controller = new AbortController();
  t.after(() => controller.abort());
  let currentId = 'old';
  let writes = 0;
  const session = await openNoteSession({
    key, signal: controller.signal, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'remote-vault',
    readOnly: false, headers: () => ({}), hasPendingLegacyNotes: () => false, onError: () => {},
    port: {
      getCurrentVault: () => ({ id: currentId }),
      isHydrated: () => true, readNoteRegistry: async () => undefined,
      writeNoteRegistry: async () => { writes++; },
      applyAcceptedNote: async () => assert.fail('unexpected apply'),
      subscribeNoteIntents: () => () => {},
    },
  });
  const item = { id: 'one', type: 'note', title: 'one', folder: 'inbox', content: 'test', updatedAt: 1, createdAt: 1, tags: [], attachments: [] };
  assert.equal(writes, 1); // Initial enrollment, before the relay goes offline.
  writes = 0;
  currentId = 'other';
  await assert.rejects(session.replica.record([{ id: item.id, kind: 'create', item }]), /Vault changed/);
  assert.equal(writes, 0);
  currentId = 'old';
  await session.replica.record([{ id: item.id, kind: 'create', item }]);
  assert.equal(writes, 1);
});

test('folder writes are captured only after enrollment and on cold offline restart', async (t) => {
  let enabled = false;
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).searchParams.get('folderTree'), '1');
    return Response.json({ mode: 'registry', generation: 1, head: 0, floor: 0, ...(enabled ? { folderTree: true } : {}) });
  });
  let saved;
  let record;
  const projections = [];
  const options = {
    key, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'remote-vault', readOnly: false,
    headers: () => ({}), hasPendingLegacyNotes: () => false, onError: (error) => { throw error; },
    port: {
      getCurrentVault: () => ({ id: 'local' }), isHydrated: () => true,
      readNoteRegistry: async () => saved, writeNoteRegistry: async (value) => { saved = value; },
      applyAcceptedNote: async () => assert.fail('unexpected apply'), subscribeNoteIntents: () => () => {},
      applyAcceptedFolderTree: async (tree) => { projections.push(tree); },
      subscribeFolderTreeIntents: (listener) => { record = listener; return () => { record = undefined; }; },
    },
  };
  const start = async (offline = false) => {
    const controller = new AbortController();
    t.after(() => controller.abort());
    return [await openNoteSession({ ...options, signal: controller.signal }, offline), controller];
  };
  const [legacy, old] = await start();
  assert.equal(legacy.folderTree, false);
  assert.equal(record, undefined);
  old.abort();
  enabled = true;
  const [enrolled, online] = await start();
  assert.equal(enrolled.folderTree, true);
  online.abort();
  assert.equal(record, undefined);
  const [offline, offlineController] = await start(true);
  assert.equal(offline.folderTree, true);
  const tree = [{ path: 'Projects', name: 'Projects', description: '', order: 0 }];
  await record(tree, []);
  assert.deepEqual(saved.journal.pending[0].item, tree);
  const intentId = saved.journal.pending[0].intentId;
  offlineController.abort();
  // Simulate the process dying immediately after journal commit: the folder projection
  // has never happened despite the intent being durable.
  assert.deepEqual(projections, []);
  await start(true);
  assert.deepEqual(projections, [tree]);
  assert.equal(saved.journal.pending[0].intentId, intentId);
  assert.equal(fetch.mock.callCount(), 2);
});

test('atomic enrollment restores capture offline and never projects a pending cascade tree', async (t) => {
  let atomicGroups = true;
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).searchParams.get('atomicGroups'), '1');
    return Response.json({ mode: 'registry', generation: 1, head: 0, floor: 0, folderTree: true,
      ...(atomicGroups ? { atomicGroups: true } : {}) });
  });
  let saved;
  let capture;
  const projections = [];
  const options = {
    key, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'vault', readOnly: false,
    headers: () => ({}), hasPendingLegacyNotes: () => false, onError: (error) => { throw error; },
    port: {
      getCurrentVault: () => ({ id: 'local' }), isHydrated: () => true,
      readNoteRegistry: async () => saved, writeNoteRegistry: async (value) => { saved = value; },
      applyAcceptedNote: async () => assert.fail('unexpected note apply'), subscribeNoteIntents: () => () => {},
      applyAcceptedFolderTree: async (tree) => projections.push(tree),
      applyAcceptedFolderGroup: async () => assert.fail('unexpected group apply'),
      subscribeFolderTreeIntents: (_tree, group) => { capture = group; return () => { capture = undefined; }; },
    },
  };
  const online = new AbortController();
  assert.equal((await openNoteSession({ ...options, signal: online.signal })).atomicGroups, true);
  assert.equal(saved.atomicGroups, true);
  online.abort();
  const offline = new AbortController();
  t.after(() => offline.abort());
  const session = await openNoteSession({ ...options, signal: offline.signal }, true);
  const item = { id: 'one', type: 'note', title: 'one', folder: 'Old', content: '', updatedAt: 1, createdAt: 1, tags: [], attachments: [] };
  await capture([{ id: item.id, kind: 'update', item: { ...item, folder: 'New' }, previous: item }], [{ path: 'New', name: 'New', description: '' }], [{ path: 'Old', name: 'Old', description: '' }]);
  offline.abort();
  const reopened = new AbortController();
  t.after(() => reopened.abort());
  assert.equal((await openNoteSession({ ...options, signal: reopened.signal }, true)).replica.pendingCount, 2);
  assert.equal(session.replica.pendingCount, 2);
  assert.deepEqual(projections, []);
  assert.equal(fetch.mock.callCount(), 1);
  saved.journal.confirmed['slag:folder-tree:v1'] = { revision: 1, item: [{ path: 'Old', name: 'Old', description: '' }] };
  options.port.hasIncompleteFolderProjection = async () => true;
  const interrupted = new AbortController();
  t.after(() => interrupted.abort());
  await openNoteSession({ ...options, signal: interrupted.signal }, true);
  assert.deepEqual(projections, [], 'an interrupted group forbids restoring the older tree on startup');
  atomicGroups = false;
  await assert.rejects(openNoteSession({ ...options, signal: reopened.signal }), /отключил атомарные/);
  assert.equal(saved.journal.pending.length, 2);
});

test('cold offline capture persists an edit without talking to the relay', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ mode: 'registry', generation: 2, head: 0, floor: 0 }));
  const controller = new AbortController();
  t.after(() => controller.abort());
  let saved = { version: 1, room: 'room', generation: 1, journal: { cursor: 0, confirmed: {}, pending: [] } };
  let record;
  const options = {
    key, signal: controller.signal, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'remote-vault',
    readOnly: false, headers: () => ({}), hasPendingLegacyNotes: () => false, onError: () => {},
    port: {
      getCurrentVault: () => ({ id: 'local' }),
      isHydrated: () => true, readNoteRegistry: async () => saved,
      writeNoteRegistry: async (value) => { saved = value; },
      applyAcceptedNote: async () => assert.fail('unexpected apply'),
      subscribeNoteIntents: (listener) => { record = listener; return () => {}; },
    },
  };
  assert.equal(await openNoteSession({ ...options, roomId: 'other' }, true), null);
  const capture = await openNoteSession(options, true);
  const item = { id: 'one', type: 'note', title: 'one', folder: 'inbox', content: 'test', updatedAt: 1, createdAt: 1, tags: [], attachments: [] };
  await record([{ id: item.id, kind: 'create', item }]);
  assert.equal(saved.journal.pending[0].item.content, 'test');
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(capture.verifyEnrollment(false), /поколение/);
  assert.equal(saved.journal.pending.length, 1);
});
