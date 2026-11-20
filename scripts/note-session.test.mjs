import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openNoteSession } from '../src/lib/sync/notes/session.ts';

const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

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
  const options = {
    key, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'remote-vault', readOnly: false,
    headers: () => ({}), hasPendingLegacyNotes: () => false, onError: (error) => { throw error; },
    port: {
      getCurrentVault: () => ({ id: 'local' }), isHydrated: () => true,
      readNoteRegistry: async () => saved, writeNoteRegistry: async (value) => { saved = value; },
      applyAcceptedNote: async () => assert.fail('unexpected apply'), subscribeNoteIntents: () => () => {},
      applyAcceptedFolderTree: async () => assert.fail('unexpected apply'),
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
  const [offline] = await start(true);
  assert.equal(offline.folderTree, true);
  const tree = [{ path: 'Projects', name: 'Projects', description: '', order: 0 }];
  await record(tree, []);
  assert.deepEqual(saved.journal.pending[0].item, tree);
  assert.equal(fetch.mock.callCount(), 2);
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
