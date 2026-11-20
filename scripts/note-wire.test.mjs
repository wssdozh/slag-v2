import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveNoteKeys, opaqueNoteId, openNote, parseNoteEvents, parseNoteResults, parseNoteStatus, sealNote } from '../src/lib/sync/notes/wire.ts';

const item = { id: 'private-note', type: 'note', title: 'private title', content: 'private content', folder: 'inbox', tags: [], attachments: [], createdAt: 1, updatedAt: 2 };

test('a note envelope authenticates the room, generation, and operation metadata', async () => {
  const master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(master, 'room');
  const noteId = await opaqueNoteId(keys, item.id);
  assert.match(noteId, /^[a-f0-9]{64}$/);
  assert.notEqual(noteId, await opaqueNoteId(await deriveNoteKeys(master, 'other-room'), item.id));
  const op = await sealNote(keys, 'room', 1, { noteId, opId: 'op-1', baseRevision: 0, kind: 'create' }, item.id, item);
  const head = { ...op, revision: 1 };
  assert.deepEqual(await openNote(keys, 'room', 1, head), { id: item.id, item });
  assert.doesNotMatch(JSON.stringify(head), /private/);
  for (const changed of [{ opId: 'op-2' }, { kind: 'update' }, { baseRevision: 1 }, { noteId: 'a'.repeat(64) }]) {
    await assert.rejects(openNote(keys, 'room', 1, { ...head, ...changed }));
  }
  await assert.rejects(openNote(keys, 'room', 2, head));
  await assert.rejects(openNote(keys, 'other-room', 1, head));
  const deletion = await sealNote(keys, 'room', 1, { noteId, opId: 'op-2', baseRevision: 1, kind: 'delete' }, item.id, null);
  assert.deepEqual(await openNote(keys, 'room', 1, { ...deletion, revision: 2 }), { id: item.id, item: null });
});

test('invalid watermarks and malformed outcomes do not silently advance the cursor', () => {
  assert.deepEqual(parseNoteStatus({ mode: 'registry', generation: 1, floor: 2, head: 4 }), { mode: 'registry', generation: 1, floor: 2, head: 4 });
  assert.throws(() => parseNoteEvents({ generation: 1, floor: 5, head: 4, events: [] }));
  assert.throws(() => parseNoteEvents({ generation: 1, floor: 2, head: 4, events: Array(101).fill({}) }));
  assert.throws(() => parseNoteResults({ type: 'note_results', generation: 1, requestId: 'x', results: [{ opId: 'o', status: 'accepted', revision: -1 }] }));
});
