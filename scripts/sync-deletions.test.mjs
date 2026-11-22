// A note is deleted because something said so, and these tests are that sentence in code.
//
// 2026-11-18: the app read "the note is not in the list I have right now" as "the note is deleted".
// For the first second of a start the index is empty, so that reading sent "eighty-four notes
// deleted" to the relay, and every device obeyed. Twice. These are the cases that used to pass.
import assert from 'node:assert/strict';
import test from 'node:test';
import { deletionsFromOutbox } from '../src/lib/sync/itemDeletions.ts';
import { notesRemovedByImport } from '../src/lib/storage/noteRemoval.ts';
import { reconcileSyncedVault } from '../src/lib/storage/syncReconcile.ts';

const op = (kind, action, id, timestamp = 1_700_000_000_000) => ({ opId: `op_${id}`, kind, action, id, timestamp });

test('deletions: a note is gone only when the outbox says it is', () => {
  const ops = [op('item', 'delete', 'note_a'), op('item', 'upsert', 'note_b'), op('folder', 'delete', 'Проекты')];
  assert.deepEqual(deletionsFromOutbox(ops), [{ id: 'note_a', deletedAt: 1_700_000_000_000 }]);
});

test('deletions: an empty index asks for nothing — the whole point', () => {
  // What the push used to do: every id this device had ever sent, minus the notes it can list.
  // With the vault still loading that difference is the entire vault, and it went out as deletes.
  const syncedIds = Array.from({ length: 84 }, (_, i) => `note_${i}`);
  const itemsWhenStillLoading = [];
  const currentIds = new Set(itemsWhenStillLoading.map((item) => item.id));

  const inferred = syncedIds.filter((id) => !currentIds.has(id));
  assert.equal(inferred.length, 84, 'the old subtraction is why the vault emptied');

  assert.deepEqual(deletionsFromOutbox([]), [], 'nothing happened, so nothing is deleted');
});

test('deletions: the same note twice keeps the later stamp', () => {
  const ops = [op('item', 'delete', 'note_a', 100), op('item', 'delete', 'note_a', 900)];
  assert.deepEqual(deletionsFromOutbox(ops), [{ id: 'note_a', deletedAt: 900 }]);
});

test('deletions: a restore, a folder delete and a draft are not note deletions', () => {
  const ops = [
    { opId: 'op_1', kind: 'trash', id: 'note_a', action: 'restore', timestamp: 5 },
    { opId: 'op_2', kind: 'draft', id: 'Входящие', action: 'delete', timestamp: 6 },
    { opId: 'op_3', kind: 'attachment', id: 'att_1', action: 'purge', timestamp: 7 },
  ];
  assert.deepEqual(deletionsFromOutbox(ops), []);
});

test('import: a bundle that deletes nothing takes no file off the disk', () => {
  const previous = [{ id: 'note_a' }, { id: 'note_b' }, { id: 'note_c' }];
  assert.deepEqual(notesRemovedByImport(previous, new Set(['note_a']), []), [],
    'the two notes the payload does not list are untouched notes, not deleted ones');
});

test('import: only the named ids leave, and only when they are still absent', () => {
  const previous = [{ id: 'note_a' }, { id: 'note_b' }, { id: 'note_c' }];
  assert.deepEqual(notesRemovedByImport(previous, new Set(['note_b', 'note_c']), ['note_a']), [{ id: 'note_a' }],
    'the sender said note_a is gone, so note_a goes');
  assert.deepEqual(notesRemovedByImport(previous, new Set(['note_a']), ['note_a']), [],
    'a delete followed by the same note in the payload means it came back');
  assert.deepEqual(notesRemovedByImport(previous, new Set(), ['note_zzz']), [],
    'an id this device never had is nothing to remove');
});

test('import: a snapshot staged before a local save cannot hide the new note', () => {
  const existing = { id: 'existing', updatedAt: 1 };
  const created = { id: 'created-during-staging', updatedAt: 2 };
  const deleted = { id: 'explicitly-deleted', updatedAt: 1 };
  // The disk import sampled its baseline after the save, so there is no drift during persistence.
  const base = { items: [existing, created, deleted], folders: [], workspace: {} };
  const result = reconcileSyncedVault({
    base, current: base,
    incoming: { items: [existing], folders: [], removedIds: [deleted.id] },
  });
  assert.deepEqual(result.items, [existing, created]);
});

test('import: an explicit remote delete survives unrelated drift without hiding unmentioned notes', () => {
  const deleted = { id: 'deleted', updatedAt: 1 };
  const restored = { id: 'restored', updatedAt: 3 };
  const untouched = { id: 'untouched', updatedAt: 1 };
  const created = { id: 'created', updatedAt: 2 };
  const base = { items: [deleted, restored, untouched], folders: [], workspace: {} };
  const result = reconcileSyncedVault({
    base,
    current: { ...base, items: [...base.items, created] },
    incoming: { items: [restored], folders: [], removedIds: ['deleted', 'restored'] },
  });
  assert.deepEqual(result.items, [restored, untouched, created]);
});
