import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRecoveryRegistry, planRecoveredJournal } from '../src/lib/sync/notes/recoveryJournal.ts';
import { FOLDER_TREE_ID } from '../src/lib/sync/notes/wire.ts';
import { noteDiskProjection } from '../src/lib/storage/noteDiskProjection.ts';

const tree = [{ path: 'Inbox', name: 'Inbox', description: '' }, { path: 'Project', name: 'Project', description: '' }];
const note = { id: 'n1', type: 'task', title: 'Task', content: 'Body', folder: 'Inbox', tags: [], attachments: [],
  createdAt: 1, updatedAt: 2, dueDate: '2026-11-23' };
const head = { revision: 10, item: note };
const treeHead = { revision: 5, item: tree };
const pending = [
  { id: note.id, intentId: 'pending-note', kind: 'update', source: 'app', base: head, item: { ...note, dueDate: '2026-11-24' } },
  { id: FOLDER_TREE_ID, intentId: 'pending-tree', kind: 'update', source: 'app', base: treeHead, item: tree.slice(0, 1) },
];
const stored = { room: 'room', version: 1, generation: 1, folderTree: true, registryMedia: true, atomicGroups: true,
  journal: { cursor: 10, confirmed: { [note.id]: head, [FOLDER_TREE_ID]: treeHead }, pending } };
const live = { mode: 'registry', generation: 1, folderTree: true, registryMedia: true, atomicGroups: true, head: 10, floor: 3 };

test('new copy replays from zero, preserves proven intents and keeps a folder removal for review', () => {
  const source = readRecoveryRegistry(stored, 'room');
  const local = [noteDiskProjection(pending[0].item), { ...note, id: 'disk-only', content: 'Local copy' }];
  const plan = planRecoveredJournal(source, live, local);
  assert.equal(plan.cursor, 0);
  assert.deepEqual(plan.confirmed, {});
  assert.deepEqual(plan.pending, [pending[0]]);
  assert.deepEqual(plan.conflicts.map(({ intentId, fields }) => [intentId, fields]), [
    ['pending-tree', ['recovered-disk']], ['recovery-disk:disk-only', ['recovered-disk']],
  ]);
  assert.deepEqual(plan, planRecoveredJournal(source, live, local));
  assert.deepEqual(stored.journal.pending, pending);
});

test('wrong room, generation, features or duplicate physical IDs do not provision a replacement', () => {
  assert.throws(() => readRecoveryRegistry(stored, 'other'), /не относится к этой комнате/);
  const source = readRecoveryRegistry(stored, 'room');
  for (const wrong of [{ ...live, generation: 2 }, { ...live, registryMedia: false }, { ...live, head: 9 }]) {
    assert.throws(() => planRecoveredJournal(source, wrong, []), /не подтвердил/);
  }
  assert.throws(() => planRecoveredJournal(source, live, [note, note]), /несколько копий/);
});
