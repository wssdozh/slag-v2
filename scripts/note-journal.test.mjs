import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameNote } from '../src/lib/sync/notes/merge.ts';
import { hasSharedRegistryEnrollment } from '../src/lib/sync/notes/persistence.ts';

test('cold write fence reads enrollment without a relay, token, or decrypted journal', () => {
  const envelope = { version: 1, room: 'room', generation: 3 };
  assert.equal(hasSharedRegistryEnrollment(undefined), false);
  assert.equal(hasSharedRegistryEnrollment(envelope), false);
  assert.equal(hasSharedRegistryEnrollment({ ...envelope, sharedRecords: true }), true);
  assert.throws(() => hasSharedRegistryEnrollment({ ...envelope, sharedRecords: 'true' }), /capability/);
  assert.throws(() => hasSharedRegistryEnrollment({ ...envelope, generation: 0 }), /enrollment/);
  assert.throws(() => hasSharedRegistryEnrollment({ ...envelope, room: '' }), /room/);
});
import { emptyJournal, firstPerNote, recordNote, sameRegistryValue, setAttempt, setConfirmed, settleNote } from '../src/lib/sync/notes/journal.ts';

const note = { id: 'note', type: 'note', title: 'title', content: 'one\ntwo\nthree\nfour\nfive', folder: 'inbox', tags: [], attachments: [], createdAt: 1, updatedAt: 1 };

test('a folder base survives disk rehydration without masking a real reorder', () => {
  const a = { path: 'A', name: 'A', description: '', order: 1 };
  const b = { path: 'B', name: 'B', description: '', order: 0 };
  const rehydrated = [{ order: 0, path: 'B', name: 'B', description: '' }, a];
  assert.equal(sameRegistryValue([a, b], rehydrated), true);
  assert.equal(sameRegistryValue([a, b], [{ ...a, order: 0 }, { ...b, order: 1 }]), false);
  assert.equal(sameRegistryValue([a, b], [a]), false);
});

test('an edit queued during canonical application keeps the snapshot the editor saw', () => {
  const remote = { ...note, folder: 'remote-folder' };
  const state = setConfirmed(emptyJournal(), note.id, { revision: 2, item: remote });
  const local = { ...note, title: 'local-title' };
  const [intent] = recordNote(state, { id: note.id, intentId: 'late', kind: 'update', item: local, previous: note }).pending;
  assert.deepEqual(intent.base, { revision: 2, item: note });
  assert.notDeepEqual(intent.base.item, remote);
  assert.deepEqual(intent.item, local);
});

test('note equality ignores local file names and clock differences, not edits', () => {
  const local = { ...note, filename: 'mine.md', updatedAt: 999 };
  assert.ok(sameNote(local, { ...note, updatedAt: 333, filename: 'different.md' }));
  assert.ok(!sameNote(local, { ...note, content: 'other body' }));
});

test('immutable sent attempt is not compacted, and successor retains the optimistic base', () => {
  const first = { ...note, title: 'local first' };
  const second = { ...first, title: 'local second' };
  let journal = setConfirmed(emptyJournal(), note.id, { revision: 1, item: note });
  journal = recordNote(journal, { id: note.id, intentId: '1', kind: 'update', item: first });
  const attempt = { op: { opId: 'op-1', noteId: 'opaque', baseRevision: 2, kind: 'update', sealed: { iv: 'iv', ciphertext: 'body' } }, item: { ...first, folder: 'remote' }, conflicts: [] };
  journal = setAttempt(journal, '1', attempt);
  journal = recordNote(journal, { id: note.id, intentId: '2', kind: 'update', item: second });
  assert.equal(journal.pending.length, 2);
  assert.deepEqual(firstPerNote(journal)[0].attempt, attempt);
  journal = setConfirmed(journal, note.id, { revision: 3, item: attempt.item });
  journal = settleNote(journal, journal.pending[0], 3);
  assert.deepEqual(journal.pending[0].base, { revision: 3, item: first });
  assert.notDeepEqual(journal.pending[0].base.item, attempt.item);
});

test('an overdue rollover and a user edit stay separate regardless of order', () => {
  const base = { ...note, type: 'task', recurrence: { freq: 'daily' }, dueDate: '2026-11-20' };
  const state = setConfirmed(emptyJournal(), note.id, { revision: 1, item: base });
  for (const manualFirst of [true, false]) {
    const first = manualFirst ? { ...base, content: 'manual edit' } : { ...base, dueDate: '2026-11-23' };
    const second = { ...first, content: 'manual edit', dueDate: '2026-11-23' };
    const one = recordNote(state, { id: note.id, intentId: 'first', kind: 'update', item: first, previous: base,
      origin: { revision: 1 }, source: 'app', rollover: manualFirst ? undefined : true });
    const two = recordNote(one, { id: note.id, intentId: 'second', kind: 'update', item: second, previous: first,
      origin: { intentId: 'first' }, source: 'app', rollover: manualFirst ? true : undefined });
    assert.equal(two.pending.length, 2);
    assert.deepEqual(two.pending.map(({ rollover }) => rollover), manualFirst ? [undefined, true] : [true, undefined]);
    assert.equal(two.pending[1].predecessor, 'first');
    assert.equal(two.pending[1].item.content, 'manual edit');
  }
});

test('delete and restore retain distinct intents and no-op updates do not enter the queue', () => {
  let journal = setConfirmed(emptyJournal(), note.id, { revision: 1, item: note });
  assert.equal(recordNote(journal, { id: note.id, intentId: 'noop', kind: 'update', item: { ...note, updatedAt: 9 } }), journal);
  journal = recordNote(journal, { id: note.id, intentId: 'd', kind: 'delete', item: null });
  journal = recordNote(journal, { id: note.id, intentId: 'r', kind: 'restore', item: note });
  assert.deepEqual(journal.pending.map(({ kind }) => kind), ['delete', 'restore']);
  journal = settleNote(journal, journal.pending[0], 2);
  assert.deepEqual(journal.pending[0].base, { revision: 2, item: null });
});
