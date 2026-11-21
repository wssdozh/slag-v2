import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planBootstrap, sealBootstrap } from '../src/lib/sync/notes/bootstrap.ts';
import { sharedRegistryId } from '../src/lib/sync/notes/sharedBody.ts';
import { deriveNoteKeys, openAnyRegistryBody, openNote } from '../src/lib/sync/notes/wire.ts';

const snapshot = (deviceId, extras) => ({ deviceId, hydrated: true, pendingIds: [], live: [], tombstones: [], trash: [], ...extras });
const note = (id, content = 'copy') => ({ id, type: 'note', title: 'title', folder: 'Inbox', content, createdAt: 1, updatedAt: 1, tags: [], attachments: [] });

test('migration refuses empty writer lists and duplicate IDs within a snapshot', () => {
  assert.deepEqual(planBootstrap([], []).blockers, [{ reason: 'invalid_writer_list', id: '' }]);
  const live = [note('duplicate'), note('duplicate')];
  assert.deepEqual(planBootstrap(['pc'], [snapshot('pc', { live })]).blockers, [
    { reason: 'duplicate_live_id', id: 'duplicate' },
  ]);
});

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

test('reviewed shared seed preserves explicit tombstones and never infers a missing record', async () => {
  const plan = planBootstrap(['pc'], [snapshot('pc')]);
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(vaultKey, 'shared-seed');
  const removed = { id: sharedRegistryId('memory', 'removed'), shared: null };
  const prompt = { id: sharedRegistryId('workspace', 'aiPrompt'), shared: '' };
  const ops = await sealBootstrap(keys, 'shared-seed', 1, plan, [removed, prompt]);
  assert.deepEqual(await Promise.all(ops.map((op, index) => openAnyRegistryBody(keys, 'shared-seed', 1, { ...op, revision: index + 1 }))), [removed, prompt]);
  await assert.rejects(sealBootstrap(keys, 'shared-seed', 1, plan, [removed, removed]), /duplicate/);
  await assert.rejects(sealBootstrap(keys, 'shared-seed', 1, plan, [{
    id: sharedRegistryId('composer', 'Inbox'), shared: { content: 'photo', attachments: [{ id: 'photo' }] },
  }]), /require a reviewed media seed/);
  await assert.rejects(sealBootstrap(keys, 'shared-seed', 1, plan, [{ id: sharedRegistryId('workspace', 'currentFolder'), shared: 'private' }]), /workspace field/);
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

test('archive is local-only; a different live body needs a provenance decision', () => {
  const restored = note('restored', 'edited after explicit restore');
  const archived = note('archive');
  const inputs = [snapshot('pc', { live: [restored] }), snapshot('phone', {
    tombstones: [restored.id], trash: [archived, archived, note(restored.id)],
  })];
  const plan = (decisions) => planBootstrap(['pc', 'phone'], inputs, new Map(decisions));
  assert.deepEqual(plan().blockers, [
    { reason: 'unproven_deletion', id: archived.id }, { reason: 'delete_vs_live', id: restored.id },
  ]);
  assert.equal(plan([[restored.id, 'delete']]).candidates.get(restored.id), null);
  assert.ok(plan([[restored.id, 'archive']]).blockers.some(({ reason }) => reason === 'invalid_decision'));
  const decisions = [[restored.id, 'keep'], [archived.id, 'archive']];
  const reviewed = plan(decisions);
  assert.deepEqual(reviewed.blockers, []);
  assert.deepEqual(reviewed.candidates.get(restored.id), restored);
  assert.equal(reviewed.candidates.has(archived.id), false);
  inputs[0].live.push(archived);
  inputs[1].live.push(note(restored.id));
  assert.deepEqual(new Set(plan(decisions).blockers.map(({ reason }) => reason)),
    new Set(['divergent_live', 'unproven_deletion', 'invalid_decision']));
});
