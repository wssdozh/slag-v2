import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeNote, sameNote } from '../src/lib/sync/notes/merge.ts';
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
  const result = mergeNote(intent.base.item, intent.item, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.item.folder, remote.folder);
  assert.equal(result.item.title, local.title);
});

test('can merge disjoint ranges and fields while keeping only the conflicting remote range', () => {
  const local = { ...note, title: 'mine', content: 'ONE\ntwo\nlocal three\nfour\nfive', tags: ['one'] };
  const remote = { ...note, folder: 'moved', content: 'one\ntwo\nremote three\nfour\nFIVE', tags: ['two'] };
  const { item, conflicts } = mergeNote(note, local, remote);
  assert.deepEqual(conflicts, ['content']);
  assert.equal(item.content, 'ONE\ntwo\nremote three\nfour\nFIVE');
  assert.equal(item.title, 'mine');
  assert.equal(item.folder, 'moved');
  assert.deepEqual(item.tags, ['two', 'one']);
});

test('overlapping insertion is a conflict; identical edits and local disk fields are not', () => {
  const local = { ...note, content: 'start\n' + note.content, filename: 'mine.md', updatedAt: 999 };
  const remote = { ...note, content: 'remote\n' + note.content };
  assert.deepEqual(mergeNote(note, local, remote).conflicts, ['content']);
  assert.deepEqual(mergeNote(note, local, { ...local, filename: 'different.md' }).conflicts, []);
  assert.ok(sameNote(local, { ...local, updatedAt: 333, filename: 'different.md' }));
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
  assert.equal(mergeNote(first, second, attempt.item).item.folder, 'remote');
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
