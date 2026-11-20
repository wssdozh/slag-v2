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
  const options = {
    key, signal: controller.signal, serverUrl: 'http://127.0.0.1', roomId: 'room', vaultId: 'vault',
    readOnly: false, headers: () => ({}), hasPendingLegacyNotes: () => dirty,
    port: {
      getCurrentVault: () => ({ id: 'local-vault' }),
      isHydrated: () => true, readNoteRegistry: async () => undefined,
      writeNoteRegistry: async () => assert.fail('negotiation must not replace the journal'),
      applyAcceptedNote: async () => assert.fail('negotiation must not overwrite local files'),
      subscribeNoteIntents: () => { subscribed = true; return () => { subscribed = false; }; },
    },
  };
  await assert.rejects(openNoteSession(options), /старой очереди остались правки/);
  assert.equal(subscribed, false);
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
  currentId = 'other';
  await assert.rejects(session.replica.record([{ id: item.id, kind: 'create', item }]), /Vault changed/);
  assert.equal(writes, 0);
  currentId = 'old';
  await session.replica.record([{ id: item.id, kind: 'create', item }]);
  assert.equal(writes, 1);
});
