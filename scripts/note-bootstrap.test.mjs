import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planBootstrap, sealBootstrap } from '../src/lib/sync/notes/bootstrap.ts';
import { deriveNoteKeys, openNote } from '../src/lib/sync/notes/wire.ts';

const snapshot = (deviceId, extras) => ({ deviceId, hydrated: true, pendingIds: [], live: [], tombstones: [], trash: [], ...extras });
const note = (id, content = 'copy') => ({ id, type: 'note', title: 'title', folder: 'Inbox', content, createdAt: 1, updatedAt: 1, tags: [], attachments: [] });

test('offline bootstrap collapses identical live notes and keeps explicit tombstones', async () => {
  const shared = note('same');
  const old = note('deleted');
  const plan = planBootstrap(['pc', 'laptop'], [
    snapshot('pc', { live: [shared, note('unique')] }),
    snapshot('laptop', { live: [{ ...shared, updatedAt: 900 }], tombstones: [old.id], trash: [old] }),
  ]);
  assert.deepEqual(plan.blockers, []);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(key, 'bootstrap');
  const ops = await sealBootstrap(keys, 'bootstrap', 3, plan);
  const opened = await Promise.all(ops.map((op, i) => openNote(keys, 'bootstrap', 3, { ...op, revision: i + 1 })));
  assert.deepEqual(opened.map(({ id, item }) => [id, !!item]), [['same', true], ['unique', true], ['deleted', false]]);
});

test('migration refuses missing devices, pending ops, and apparent stale copies without restore provenance', () => {
  const copies = Array.from({ length: 11 }, (_, i) => note(`stale-${i}`));
  const inputs = [
    snapshot('pc', { live: copies, pendingIds: ['unsent'] }),
    snapshot('laptop', { trash: copies, tombstones: copies.map(({ id }) => id) }),
  ];
  const plan = planBootstrap(['pc', 'laptop', 'phone'], inputs);
  assert.equal(plan.blockers.filter(({ reason }) => reason === 'review_restore_provenance').length, 11);
  assert.deepEqual(plan.blockers.filter(({ reason }) => reason !== 'review_restore_provenance').map(({ reason }) => reason), ['pending_intent', 'missing_device']);
  const reviewed = planBootstrap(['pc', 'laptop', 'phone'], inputs, new Map(copies.map(({ id }, i) => [id, i === 0 ? 'keep' : 'delete'])));
  assert.deepEqual(reviewed.blockers.map(({ reason }) => reason), ['pending_intent', 'missing_device']);
  assert.equal(reviewed.candidates.get('stale-0').id, 'stale-0');
  assert.equal(reviewed.candidates.get('stale-1'), null);
  assert.ok(planBootstrap(['pc'], inputs).blockers.some(({ reason, id }) => reason === 'invalid_snapshot' && id === 'laptop'));
});
