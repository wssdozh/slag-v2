import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { NoteReplica } from '../src/lib/sync/notes/replica.ts';
import { deriveNoteKeys, FOLDER_TREE_ID, opaqueNoteId, sealFolderTree, sealNote } from '../src/lib/sync/notes/wire.ts';
import { loadNoteJournal } from '../src/lib/sync/notes/persistence.ts';
import { noteReviewKind } from '../src/lib/sync/notes/review.ts';
import { LEGACY_CUTOVER } from '../src/lib/sync/notes/legacyCutover.ts';
import { noteDiskProjection } from '../src/lib/storage/noteDiskProjection.ts';

const room = 'test-room';
const generation = 1;
const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
const keys = await deriveNoteKeys(key, room);
const note = (id, changes = {}) => ({ id, type: 'note', title: 'title', content: 'base', folder: 'Inbox', attachments: [], tags: [], createdAt: 1, updatedAt: 1, ...changes });

function relay() {
  const events = [];
  const revisions = new Map();
  const receipts = new Map();
  const clients = new Set();
  let sends = 0;
  let drop = false;
  let paused = false;
  let floor = 0;
  const view = {
    events: async (_generation, since) => ({ generation, floor, head: events.length, events: events.filter((event) => event.revision > Math.max(since, floor)) }),
    heads: async (_generation, after, since, through) => ({ generation, floor, head: events.length, next: null,
      heads: [...revisions.values()].filter((head) => head.noteId > after && head.revision > since && head.revision <= through).sort((a, b) => a.noteId.localeCompare(b.noteId)) }),
    send: async (_generation, requestId, ops) => {
      sends++;
      const fresh = [];
      const results = ops.map((op) => {
        const current = revisions.get(op.noteId);
        if (receipts.has(op.opId)) return receipts.get(op.opId);
        if (op.baseRevision !== (current?.revision ?? 0)) return { opId: op.opId, status: 'stale', current: current ?? null };
        const head = { ...op, revision: events.length + 1 };
        events.push(head);
        revisions.set(op.noteId, head);
        fresh.push(head);
        const result = { opId: op.opId, status: 'accepted', revision: head.revision };
        receipts.set(op.opId, result);
        return result;
      });
      if (drop) { drop = false; throw new Error('lost response'); }
      if (!paused && fresh.length) for (const replica of clients) replica.handleMessage({ type: 'note_events', generation, events: fresh });
      return { type: 'note_results', requestId, generation, results };
    },
  };
  return { view, clients, events, sends: () => sends, lose: () => { drop = true; }, pause: () => { paused = true; }, prune: () => { floor = events.length; } };
}

function device(t, server, options = {}) {
  const controller = new AbortController();
  const local = new Map();
  const errors = [];
  let saved;
  const replica = new NoteReplica({ channel: server.view, room, generation, keys, signal: controller.signal, readOnly: false,
    sendLive: () => false, save: async (state) => { saved = structuredClone(state); },
    apply: async ({ id, item }) => { local.set(id, item); },
    onProgress: () => undefined, onError: (error) => errors.push(error), ...options,
  }, options.state);
  server.clients.add(replica);
  const stop = () => { controller.abort(); server.clients.delete(replica); };
  t.after(stop);
  return { replica, local, get conflicts() { return replica.conflicts; }, errors, stop, saved: () => saved };
}

async function until(predicate) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition did not settle');
    await wait(10);
  }
}

// Mocked timers never advance by themselves; let the promise chains behind a send finish.
async function pump(predicate, message = 'condition did not settle') {
  for (let i = 0; i < 5_000 && !predicate(); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(predicate(), message);
}

// When the assertion is that nothing will happen, still give every pending promise chain a turn.
async function settle() {
  for (let i = 0; i < 200; i++) await new Promise((resolve) => setImmediate(resolve));
}

const change = (kind, item, id = item.id) => ({ kind, id, item });

test('cold disk edits use the last durable base, never a newer relay revision', async (t) => {
  const expectCapture = async (stale) => {
    const server = relay();
    const source = device(t, server);
    await source.replica.catchUp();
    for (const id of ['edited', 'duplicate', 'missing']) await source.replica.record([change('create', note(id))]);
    await until(() => source.saved()?.cursor === 3 && !source.replica.pendingCount);
    const before = source.saved();
    if (stale) {
      await source.replica.record([change('update', note('edited', { content: 'newer relay' }))]);
      await until(() => source.saved().cursor === 4);
    }
    const cold = device(t, server, { state: before });
    await cold.replica.captureColdNoteEdits(async (ids) => {
      assert.deepEqual([...ids].sort(), ['duplicate', 'edited', 'missing']);
      return [note('edited', { content: 'external body', updatedAt: 900 }),
        note('duplicate', { content: 'ambiguous' }), note('duplicate'), note('unknown')].map((item) => ({ item }));
    });
    const [intent] = cold.saved().pending;
    assert.equal(cold.saved().pending.length, 1);
    assert.equal(intent.kind, 'update');
    const { revision, item } = before.confirmed.edited;
    assert.deepEqual(intent.base, { revision, item });
    await cold.replica.catchUp();
    await until(() => !cold.replica.pendingCount && cold.saved().cursor === 4);
    assert.equal(server.events.length, 4);
    assert.equal(cold.saved().confirmed.edited.item.content, stale ? 'newer relay' : 'external body');
    assert.equal(cold.conflicts.length, stale ? 1 : 0);
    if (stale) assert.equal(cold.conflicts[0].item.content, 'external body');
  };
  await expectCapture(false);
  await expectCapture(true);
});

test('cold capture distinguishes an uncheckpointed projection from a changed or restored file', async (t) => {
  const server = relay();
  let projected;
  const receiver = device(t, server, { trackDiskProjection: true, apply: async (value) => { projected = value; } });
  const source = device(t, server);
  await Promise.all([source.replica.catchUp(), receiver.replica.catchUp()]);
  await source.replica.record([change('create', note('one'))]);
  await until(() => receiver.saved()?.cursor === 1);
  const before = receiver.saved();
  await source.replica.record([change('update', note('one', { content: 'intermediate' }))]);
  await until(() => receiver.saved()?.cursor === 2);
  const { item, registryBodyMarker: marker } = projected;
  assert.match(marker, /^2:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(item, 'registryBodyMarker'), false);
  await source.replica.record([change('update', note('one', { content: 'new head' }))]);
  await until(() => receiver.saved()?.cursor === 3);
  const after = receiver.saved();
  const cold = device(t, server, { state: before });
  await cold.replica.captureColdNoteEdits(async () => [{ item, marker }]);
  assert.equal(cold.replica.pendingCount, 0);
  await cold.replica.catchUp();
  assert.equal(cold.conflicts.length, 0);
  assert.equal(cold.saved().confirmed.one.item.content, 'new head');
  const changed = device(t, server, { state: before });
  await changed.replica.captureColdNoteEdits(async () => [{ item: { ...item, content: 'outside editor' }, marker }]);
  assert.equal(changed.saved().pending[0].item.content, 'outside editor');
  const restored = device(t, server, { state: after });
  await restored.replica.captureColdNoteEdits(async () => [{ item, marker }]);
  assert.equal(restored.saved().pending[0].item.content, 'intermediate');
});

test('cold capture preserves edited YAML fields without publishing metadata from an uncheckpointed newer file', async (t) => {
  const server = relay();
  const source = device(t, server);
  const projections = new Map();
  const receiver = device(t, server, { trackDiskProjection: true, apply: async (value) => { projections.set(value.id, value); } });
  const task = note('cold-task-properties', { type: 'task', status: 'todo', priority: 'low', dueDate: '2026-11-20', recurrence: { freq: 'daily' } });
  const article = note('cold-article-properties', { type: 'article', summary: 'Original summary', readingTimeMinutes: 2 });
  await Promise.all([source.replica.catchUp(), receiver.replica.catchUp()]);
  await source.replica.record([change('create', task), change('create', article)]);
  await until(() => receiver.saved()?.cursor === 2);
  const before = receiver.saved();
  const taskProjection = projections.get(task.id);
  const taskEdit = { ...noteDiskProjection(taskProjection.item), dueDate: '2026-11-23', priority: 'high', title: 'Edited on disk' };
  const articleHead = { ...article, summary: 'Accepted remote summary', isPinned: true };
  await source.replica.record([change('update', articleHead)]);
  await until(() => receiver.saved()?.cursor === 3);
  const articleProjection = projections.get(article.id);
  const reader = device(t, server, { state: before });
  await reader.replica.captureColdNoteEdits(async () => [
    { item: taskEdit, marker: taskProjection.registryBodyMarker },
    { item: noteDiskProjection(articleProjection.item), marker: articleProjection.registryBodyMarker },
  ]);
  assert.deepEqual(reader.saved()?.pending.map(({ item }) => [item.id, item.title, item.priority, item.dueDate]),
    [[task.id, taskEdit.title, 'high', '2026-11-23']]);
  assert.deepEqual(reader.saved().pending[0].item.recurrence, task.recurrence);
  await reader.replica.catchUp();
  await until(() => reader.saved()?.cursor === 4 && !reader.replica.pendingCount);
  assert.equal(reader.conflicts.length, 0);
  assert.equal(reader.local.get(article.id).summary, articleHead.summary);
  assert.equal(reader.local.get(task.id).dueDate, '2026-11-23');
  assert.equal(server.events.length, 4);
});

test('an external attachment-only edit creates one revision on both replicas', async (t) => {
  const server = relay();
  const attachment = { id: 'asset', name: 'asset', type: 'file', mimeType: 'application/octet-stream', size: 4, relativePath: '.attachments/asset' };
  const blob = 'b'.repeat(64);
  const source = device(t, server, { uploadAttachment: async (selected) => {
    assert.deepEqual(selected, attachment);
    return blob;
  } });
  const receiver = device(t, server);
  const item = note('external-media');
  await Promise.all([source.replica.catchUp(), receiver.replica.catchUp()]);
  await source.replica.record([change('create', item)]);
  await until(() => source.saved()?.confirmed[item.id]?.revision === 1 && receiver.saved()?.cursor === 1);
  await source.replica.recordExternal({ id: item.id, action: 'upsert', previous: item, payload: { ...item, attachments: [attachment] } });
  await until(() => source.saved()?.confirmed[item.id]?.revision === 2 && receiver.saved()?.cursor === 2);
  assert.deepEqual(receiver.local.get(item.id), { ...item, attachments: [{ ...attachment, registryBlobId: blob }] });
  assert.equal(server.events.length, 2);
  assert.deepEqual(server.events[1].mediaIds, [blob]);
  assert.equal(source.replica.pendingCount, 0);
  assert.deepEqual([...source.errors, ...receiver.errors], []);
});

test('attachment upload must succeed before a durable attempt or revision is created', async (t) => {
  const server = relay();
  const attachment = { id: 'asset', name: 'asset', type: 'file', mimeType: 'application/octet-stream', size: 4, relativePath: '.attachments/asset' };
  const item = note('photo', { attachments: [attachment] });
  const failed = device(t, server, { uploadAttachment: async () => { throw new Error('upload failed'); } });
  await failed.replica.catchUp();
  await failed.replica.record([{ ...change('create', item), intentId: 'add-attachment' }]);
  await until(() => failed.errors.length);
  assert.equal(server.sends(), 0);
  assert.equal(failed.saved().pending[0].attempt, undefined);
  const state = loadNoteJournal({ version: 1, room, generation, journal: failed.saved() }, room, generation);
  failed.stop();

  const blob = 'd'.repeat(64);
  const resumed = device(t, server, { state, uploadAttachment: async (selected) => {
    assert.deepEqual(selected, selected.registryBlobId ? { ...attachment, registryBlobId: blob } : attachment);
    return blob;
  }, channel: { ...server.view, send: async (...args) => {
    const [{ attempt }] = resumed.saved().pending;
    assert.deepEqual(attempt.op.mediaIds, [blob]);
    assert.equal(attempt.item.attachments[0].registryBlobId, blob);
    if (attempt.op.kind === 'create') await resumed.replica.record([{ ...change('update', { ...item, content: 'dependent edit' }),
      previous: item, origin: { intentId: 'add-attachment' } }]);
    return server.view.send(...args);
  } } });
  await resumed.replica.catchUp();
  await until(() => resumed.saved()?.cursor === 2 && resumed.replica.pendingCount === 0);
  assert.equal(resumed.local.get(item.id).attachments[0].registryBlobId, blob);
  assert.equal(resumed.local.get(item.id).content, 'dependent edit');
});

test('shared facts use the same durable CAS journal, conflict handling and tombstones', async (t) => {
  const { sharedRegistryId } = await import('../src/lib/sync/notes/sharedBody.ts');
  const server = relay();
  const id = sharedRegistryId('memory', 'fact');
  const authorValues = new Map();
  const readerValues = new Map();
  const projection = (values) => ({ applyShared: async ({ id, shared }) => values.set(id, shared),
    apply: async () => assert.fail('shared record was projected as a note') });
  const author = device(t, server, projection(authorValues));
  const reader = device(t, server, projection(readerValues));
  await Promise.all([author.replica.catchUp(), reader.replica.catchUp()]);
  await author.replica.recordShared(id, { id: 'fact', text: 'initial' }, null);
  await until(() => readerValues.has(id) && author.replica.pendingCount === 0);
  const initial = readerValues.get(id);
  const saved = loadNoteJournal({ version: 1, room, generation, journal: reader.saved() }, room, generation);
  reader.stop();
  await author.replica.recordShared(id, { ...initial, text: 'canonical' }, initial);
  await until(() => authorValues.get(id)?.text === 'canonical');
  const resumed = device(t, server, { ...projection(readerValues), state: saved });
  await resumed.replica.recordShared(id, { ...initial, text: 'offline draft' }, initial);
  await resumed.replica.catchUp();
  await until(() => resumed.replica.conflicts.length === 1);
  assert.equal(readerValues.get(id).text, 'canonical');
  assert.equal(resumed.replica.conflicts[0].item.shared.text, 'offline draft');
  await author.replica.recordShared(id, null, authorValues.get(id));
  await until(() => readerValues.get(id) === null && author.replica.pendingCount === 0);
  assert.equal(resumed.saved().confirmed[id].item, null);
});

test('an overtaken editor snapshot survives restart without a relay write', async (t) => {
  const { sharedRegistryId } = await import('../src/lib/sync/notes/sharedBody.ts');
  const server = relay();
  const id = sharedRegistryId('composer', 'Inbox');
  let shown;
  const deviceOne = device(t, server, { applyShared: async ({ shared }) => { shown = shared; } });
  const draft = (content) => ({ content, updatedAt: 1 });
  await deviceOne.replica.catchUp();
  await deviceOne.replica.recordShared(id, draft('canonical'), null);
  await until(() => shown?.content === 'canonical' && deviceOne.replica.pendingCount === 0);
  await deviceOne.replica.recordSharedBatch(() => [{ id, previous: null, value: draft('unsaved input'), keepAlternative: true }]);
  const state = loadNoteJournal({ version: 1, room, generation, journal: deviceOne.saved() }, room, generation);
  deviceOne.stop();
  const resumed = device(t, server, { state, applyShared: async ({ shared }) => { shown = shared; } });
  await resumed.replica.catchUp();
  assert.equal(server.sends(), 1);
  assert.equal(shown.content, 'canonical');
  assert.equal(resumed.conflicts[0].item.shared.content, 'unsaved input');
  await resumed.replica.resolveConflict(resumed.conflicts[0].intentId, 'retry', 1);
  await until(() => shown?.content === 'unsaved input' && resumed.replica.pendingCount === 0);
  assert.equal(server.sends(), 2);
});

test('a repeated editor clear already queued for a shared draft does not archive an empty conflict', async (t) => {
  const { sharedRegistryId } = await import('../src/lib/sync/notes/sharedBody.ts');
  const server = relay();
  const id = sharedRegistryId('composer', 'Inbox');
  const applyShared = async () => {};
  const author = device(t, server, { applyShared });
  const draft = { content: 'confirmed draft', updatedAt: 1 };
  await author.replica.catchUp();
  await author.replica.recordShared(id, draft, null);
  await until(() => author.replica.pendingCount === 0);
  const state = author.saved();
  author.stop();
  const offline = device(t, server, { state, applyShared });
  await offline.replica.recordShared(id, null, draft);
  const [clear] = offline.saved().pending;
  await offline.replica.recordSharedBatch(() => [{ id, value: null, previous: null, keepAlternative: true }]);
  assert.deepEqual(offline.saved().pending, [clear]);
  assert.deepEqual(offline.conflicts, []);
  const restarted = loadNoteJournal({ version: 1, room, generation, journal: offline.saved() }, room, generation);
  offline.stop();
  const resumed = device(t, server, { state: restarted, applyShared });
  await resumed.replica.catchUp();
  await until(() => resumed.replica.pendingCount === 0);
  assert.equal(resumed.saved().confirmed[id].item, null);
  assert.equal(server.sends(), 2);
  assert.deepEqual(resumed.conflicts, []);
});

test('concurrent fact edits collect against the preceding durable local projection', async (t) => {
  const { sharedRegistryId } = await import('../src/lib/sync/notes/sharedBody.ts');
  const { memorySharedMutations } = await import('../src/lib/storage/sharedProjection.ts');
  const server = relay();
  let facts = [];
  const { replica, saved } = device(t, server, { applyShared: async ({ id, shared }) => {
    facts = facts.filter((fact) => sharedRegistryId('memory', fact.id) !== id);
    if (shared) facts.push(shared);
  } });
  const edit = (id, text) => {
    let next;
    return replica.recordSharedBatch(() => {
      next = [...facts.filter((fact) => fact.id !== id), { id, text }];
      return memorySharedMutations(facts, next);
    }, async () => {
      assert.ok(saved().pending.some((entry) => entry.id === sharedRegistryId('memory', id)));
      facts = next;
    });
  };
  await Promise.all([edit('one', 'first'), edit('two', 'second'), edit('one', 'updated')]);
  assert.deepEqual(facts.map(({ text }) => text), ['second', 'updated']);
  await replica.catchUp();
  await until(() => replica.pendingCount === 0);
  assert.equal(saved().confirmed[sharedRegistryId('memory', 'one')].item.shared.text, 'updated');
  assert.equal(saved().confirmed[sharedRegistryId('memory', 'two')].item.shared.text, 'second');
});

test('a confirmed task missing from a disk watch is not an explicit deletion', async (t) => {
  const server = relay();
  const { replica, saved } = device(t, server);
  const task = note('task', { type: 'task' });
  await replica.catchUp();
  await replica.record([change('create', task)]);
  await until(() => saved().cursor === 1 && replica.pendingCount === 0);
  await replica.recordExternal({ id: task.id, action: 'delete', previous: task });
  assert.equal(replica.pendingCount, 0);
  assert.equal(saved().confirmed[task.id].item.type, 'task');
  assert.equal(server.sends(), 1);
});

test('the indicator and journal distinguish equivalent versions, queue, transport and failure', async (t) => {
  const server = relay();
  const send = server.view.send;
  const logs = [];
  const { replica, errors } = device(t, server, { log: (event, data) => logs.push({ event, data }) });
  const item = note('card', { title: 'private diagnostic fixture', subtasks: [] });
  assert.equal(replica.deliveryStatus(item), 'unconfirmed');
  await replica.catchUp();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  server.view.send = async (...args) => { await gate; return send(...args); };
  await replica.record([change('create', item)]);
  assert.equal(replica.deliveryStatus(item), 'pending');
  await until(() => replica.deliveryStatus(item) === 'sending');
  release();
  await until(() => replica.deliveryStatus(item) === 'accepted');
  const equivalent = { ...item, isPinned: false, isArchived: false, replyToId: undefined };
  delete equivalent.subtasks; // Ordinary notes lose the empty checklist on a Markdown round trip.
  assert.equal(replica.deliveryStatus(equivalent), 'accepted');
  assert.equal(replica.deliveryStatus({ ...equivalent, subtasks: [{ id: 'sub', text: 'real change', done: false }] }), 'unconfirmed');
  await replica.record([change('update', equivalent)]);
  assert.equal(replica.pendingCount, 0);
  assert.equal(replica.conflicts.length, 0);
  const edit = { ...item, content: 'second version' };
  assert.equal(replica.deliveryStatus(edit), 'unconfirmed');
  server.view.send = async () => { throw new Error('offline'); };
  await replica.record([change('update', edit)]);
  await until(() => errors.length === 1);
  assert.equal(replica.deliveryStatus(edit), 'error');
  assert.equal(replica.pendingCount, 1);
  const dispatched = logs.find(({ event }) => event === 'Note attempt dispatched');
  assert.ok(dispatched?.data.opId);
  assert.ok(logs.some(({ event, data }) => event === 'Note accepted' && data.intentId === dispatched.data.intentId));
  assert.doesNotMatch(JSON.stringify(logs), /private diagnostic fixture|second version/);
});

test('read-only folder writes cannot be mistaken for durable intent capture', async (t) => {
  const server = relay();
  const { replica, saved } = device(t, server, { readOnly: true, applyFolderTree: async () => assert.fail('unexpected apply') });
  await assert.rejects(replica.recordFolderTree([], []), /недоступен для записи/);
  assert.equal(saved(), undefined);
  assert.equal(server.sends(), 0);
});

async function folderGroup() {
  const item = note('moved', { folder: 'Projects' });
  const folders = [{ path: 'Projects', name: 'Projects', description: '', order: 0 }];
  const group = { id: 'rename', index: 0, size: 2 };
  const move = await sealNote(keys, room, generation, { opId: group.id, noteId: await opaqueNoteId(keys, item.id),
    kind: 'update', baseRevision: 1, group }, item.id, item);
  const tree = await sealFolderTree(keys, room, generation, { opId: 'tree', noteId: await opaqueNoteId(keys, FOLDER_TREE_ID),
    kind: 'update', baseRevision: 2, group: { ...group, index: 1 } }, folders);
  return { item, folders, events: [{ ...move, revision: 3 }, { ...tree, revision: 4 }] };
}

test('a note arriving before a pending cascade stops the incomplete cascade', async (t) => {
  const server = relay();
  const { item, folders } = await folderGroup();
  const previous = { ...item, folder: 'Old' };
  const oldTree = [{ path: 'Old', name: 'Old', description: '' }];
  const state = { cursor: 2, pending: [], confirmed: {
    [item.id]: { revision: 1, item: previous }, [FOLDER_TREE_ID]: { revision: 2, item: oldTree },
  } };
  const arrived = note('arrived', { folder: 'Old' });
  const operation = await sealNote(keys, room, generation, { opId: 'arrived', noteId: await opaqueNoteId(keys, arrived.id),
    kind: 'create', baseRevision: 0 }, arrived.id, arrived);
  let sends = 0;
  const events = async (_generation, since) => ({ generation, floor: 0, head: sends ? 3 : 2,
    events: sends && since < 3 ? [{ ...operation, revision: 3 }] : [] });
  const send = async (_generation, requestId, ops, observedHead) => {
    assert.equal(++sends, 1, 'must not send the incomplete cascade after fetching the winner');
    assert.equal(observedHead, 2);
    return { generation, requestId, results: ops.map(({ opId }) => ({ opId, status: 'rejected', code: 'note_head_changed' })) };
  };
  const { replica, saved, local } = device(t, server, { state, channel: { ...server.view, events, send }, atomicGroups: true,
    applyFolderGroup: async (_notes, tree) => assert.deepEqual(tree, oldTree) });
  await replica.recordFolderGroup([{ ...change('update', item), previous }], folders, oldTree);
  await replica.catchUp();
  await until(() => replica.conflicts.length === 2);
  assert.equal(sends, 1);
  assert.equal(saved().cursor, 3);
  assert.equal(local.get(arrived.id).folder, 'Old');
  await assert.rejects(replica.resolveFolderConflict(replica.conflicts[0].folderGroup.id, 'retry',
    { [item.id]: 1, [FOLDER_TREE_ID]: 2 }), /появились другие записи/);
  assert.equal(replica.conflicts.length, 2);
});

test('a rejected create does not recreate the folder when the concurrent cascade won', async (t) => {
  const server = relay();
  const { folders, events } = await folderGroup();
  const state = { cursor: 2, pending: [], confirmed: { [FOLDER_TREE_ID]: { revision: 2, item: [{ path: 'Old', name: 'Old' }] } } };
  let sends = 0;
  server.view.events = async (_generation, since) => ({ generation, floor: 0, head: sends ? 4 : 2,
    events: sends && since < 4 ? events : [] });
  server.view.send = async (_generation, requestId, ops, observedHead) => {
    assert.equal(++sends, 1, 'must not resend into a deleted folder');
    assert.equal(observedHead, 2);
    return { generation, requestId, results: ops.map(({ opId }) => ({ opId, status: 'rejected', code: 'note_head_changed' })) };
  };
  const { replica, local, saved } = device(t, server, { state, atomicGroups: true,
    applyFolderTree: async () => assert.fail('tree must apply with its group'),
    applyFolderGroup: async (_notes, tree) => assert.deepEqual(tree, folders),
  });
  const item = note('draft-in-old', { folder: 'Old' });
  await replica.record([change('create', item)]);
  await replica.catchUp();
  await until(() => replica.conflicts.length === 1);
  assert.equal(sends, 1);
  assert.equal(local.get(item.id), null);
  assert.deepEqual(replica.conflicts[0].fields, ['folder']);
  assert.equal(saved().conflicts[0].item.content, item.content);
});

test('an outgoing folder group is saved together, reopened and never sent by the ordinary sender', async (t) => {
  const server = relay();
  const { item, folders, events } = await folderGroup();
  const previous = { ...item, folder: 'Old' };
  const oldTree = [{ path: 'Old', name: 'Old', description: '' }];
  const state = { cursor: 2, pending: [], confirmed: {
    [item.id]: { revision: 1, item: previous }, [FOLDER_TREE_ID]: { revision: 2, item: oldTree },
  } };
  const applyFolderGroup = async () => assert.fail('no group has been accepted');
  const writes = [];
  const first = device(t, server, { state, applyFolderGroup, save: async (journal) => writes.push(journal) });
  await first.replica.recordFolderGroup([{ id: item.id, kind: 'update', item, previous }], folders, oldTree);
  assert.equal(writes.length, 1);
  const reopen = (pending) => loadNoteJournal({ version: 1, room, generation, journal: { ...writes[0], pending } }, room, generation);
  const { pending } = writes[0];
  assert.equal(pending.length, 2);
  assert.equal(pending[0].folderGroup.id, pending[1].folderGroup.id);
  assert.equal(pending[1].id, FOLDER_TREE_ID);
  assert.throws(() => reopen(pending.slice(1)), /Incomplete persisted folder group/);
  const sealed = await Promise.all(pending.map(async (intent, index) => {
    const { revision: _revision, sealed: _, ...meta } = events[index];
    const group = intent.folderGroup;
    const opMeta = { ...meta, group, opId: index === 0 ? group.id : meta.opId };
    const op = index === 0 ? await sealNote(keys, room, generation, opMeta, intent.id, intent.item)
      : await sealFolderTree(keys, room, generation, opMeta, intent.item);
    return { ...intent, attempt: { op, item: intent.item, conflicts: [] } };
  }));
  assert.deepEqual(reopen(sealed).pending, sealed);
  assert.throws(() => reopen([sealed[0], pending[1]]), /Incomplete persisted folder group/);
  first.stop();
  server.view.events = async () => ({ generation, head: 2, floor: 0, events: [] });
  let sends = 0;
  server.view.send = async () => { sends++; throw new Error('unexpected send'); };
  const reopened = device(t, server, { state: reopen(pending), applyFolderGroup });
  await reopened.replica.catchUp();
  const later = note('independent');
  const sent = new Promise((resolve) => { server.view.send = async (_generation, _requestId, ops) => {
    sends++;
    resolve(ops);
    throw new Error('stop after observing batch');
  }; });
  await reopened.replica.record([{ id: later.id, kind: 'create', item: later }]);
  const ops = await sent;
  assert.equal(sends, 1);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].noteId, await opaqueNoteId(keys, later.id));
});

test('a lost group receipt survives restart and replays the same sealed request', async (t) => {
  const server = relay();
  const { item, folders } = await folderGroup();
  const previous = { ...item, folder: 'Old' };
  const oldTree = [{ path: 'Old', name: 'Old', description: '' }];
  const state = { cursor: 2, pending: [], confirmed: {
    [item.id]: { revision: 1, item: previous }, [FOLDER_TREE_ID]: { revision: 2, item: oldTree },
  } };
  server.view.events = async () => ({ generation, head: 2, floor: 0, events: [] });
  const projections = [];
  const options = { atomicGroups: true, applyFolderGroup: async (notes, tree) => projections.push({ notes, tree }) };
  const first = device(t, server, { ...options, state });
  let transmitted;
  server.view.send = async (_generation, _requestId, ops) => {
    transmitted = ops;
    assert.deepEqual(first.saved().pending.map(({ attempt }) => attempt.op), ops);
    throw new Error('receipt lost');
  };
  await first.replica.catchUp();
  await first.replica.recordFolderGroup([{ id: item.id, kind: 'update', item, previous }], folders, oldTree);
  await until(() => first.errors.length === 1);
  assert.equal(transmitted.length, 2);
  assert.equal(transmitted[0].opId, transmitted[1].group.id);
  assert.equal(transmitted[1].group.index, 1);
  assert.deepEqual(projections, []);
  const saved = loadNoteJournal({ version: 1, room, generation, journal: first.saved() }, room, generation);
  first.stop();
  let validReceipt = false;
  server.view.send = async (_generation, requestId, ops) => {
    assert.deepEqual(ops, transmitted);
    return { type: 'note_results', requestId, generation,
      results: ops.map(({ opId }, index) => ({ opId, status: 'accepted', revision: index === 0 ? 3 : validReceipt ? 4 : 5 })) };
  };
  const broken = device(t, server, { ...options, state: saved });
  await broken.replica.catchUp();
  await until(() => broken.errors.length === 1);
  assert.match(String(broken.errors[0]), /Invalid folder group receipt/);
  assert.equal(broken.replica.pendingCount, 2);
  assert.deepEqual(projections, []);
  broken.stop();
  validReceipt = true;
  const resumed = device(t, server, { ...options, state: saved });
  await resumed.replica.catchUp();
  await until(() => resumed.replica.pendingCount === 0);
  assert.deepEqual(projections, [{ notes: [{ id: item.id, item, revision: 3 }], tree: folders }]);
  assert.equal(resumed.saved().confirmed[item.id].revision, 3);
  assert.equal(resumed.saved().confirmed[FOLDER_TREE_ID].revision, 4);
  assert.equal(resumed.saved().cursor, 2, 'receipt is not the ordered feed');
});

test('a stale member preserves the whole proposal until all reviewed revisions match', async (t) => {
  const server = relay();
  const { item, folders } = await folderGroup();
  const previous = { ...item, folder: 'Old' };
  const oldTree = [{ path: 'Old', name: 'Old', description: '' }];
  const remote = { ...previous, content: 'new remote text' };
  const state = { cursor: 2, pending: [], confirmed: {
    [item.id]: { revision: 1, item: previous }, [FOLDER_TREE_ID]: { revision: 2, item: oldTree },
  } };
  const canonical = await sealNote(keys, room, generation, { opId: 'remote', noteId: await opaqueNoteId(keys, item.id),
    baseRevision: 1, kind: 'update' }, item.id, remote);
  server.view.events = async (_generation, since) => ({ generation, head: since, floor: 0, events: [] });
  const requests = [];
  server.view.send = async (_generation, requestId, ops) => {
    requests.push(ops);
    const results = requests.length === 1 ? [
      { opId: ops[0].opId, status: 'stale', current: { ...canonical, revision: 3 } },
      { opId: ops[1].opId, status: 'rejected', code: 'note_group_aborted' },
    ] : ops.map(({ opId }, index) => ({ opId, status: 'accepted', revision: 4 + index }));
    return { type: 'note_results', requestId, generation, results };
  };
  const projections = [];
  const options = { atomicGroups: true, applyFolderGroup: async (notes, tree) => projections.push({ notes, tree }) };
  const first = device(t, server, { ...options, state });
  await first.replica.catchUp();
  await first.replica.recordFolderGroup([{ id: item.id, kind: 'update', item, previous }], folders, oldTree);
  await until(() => first.replica.conflicts.length === 2);
  assert.equal(first.replica.pendingCount, 0);
  assert.deepEqual(projections, [{ notes: [{ id: item.id, item: remote, revision: 3 }], tree: oldTree }]);
  const envelope = { version: 1, room, generation, journal: first.saved() };
  const saved = loadNoteJournal(envelope, room, generation);
  assert.throws(() => loadNoteJournal({ ...envelope, journal: { ...saved, conflicts: saved.conflicts.slice(1) } }, room, generation), /Incomplete persisted folder conflict/);
  first.stop();
  const resumed = device(t, server, { ...options, state: saved });
  const [member] = resumed.replica.conflicts;
  const groupId = member.folderGroup.id;
  await resumed.replica.catchUp();
  await assert.rejects(resumed.replica.resolveConflict(member.intentId, 'keep', 3), /целиком/);
  await assert.rejects(resumed.replica.resolveFolderConflict(groupId, 'retry', { [item.id]: 1, [FOLDER_TREE_ID]: 2 }), /изменились/);
  assert.equal(requests.length, 1);
  await resumed.replica.resolveFolderConflict(groupId, 'retry', { [item.id]: 3, [FOLDER_TREE_ID]: 2 });
  await until(() => resumed.replica.pendingCount === 0);
  assert.equal(resumed.replica.conflicts.length, 0);
  assert.notEqual(requests[1][0].opId, requests[0][0].opId);
  assert.deepEqual(requests[1].map(({ baseRevision }) => baseRevision), [3, 2]);
  assert.deepEqual(projections[1], { notes: [{ id: item.id, item, revision: 4 }], tree: folders });
});

test('a folder group is validated in full before any projection or cursor change', async (t) => {
  const { item, folders, events } = await folderGroup();
  let feed = events.slice(0, 1);
  const projections = [];
  const server = relay();
  server.view.events = async (_generation, since) => ({ generation, head: 4, floor: 2, events: feed.filter((head) => head.revision > since) });
  const { replica, saved } = device(t, server, {
    state: { cursor: 2, pending: [], confirmed: {} },
    apply: async () => assert.fail('group cannot project via the note path'),
    applyFolderTree: async () => assert.fail('group cannot project via the tree path'),
    applyFolderGroup: async (notes, tree) => projections.push({ notes, tree }),
  });
  await assert.rejects(replica.catchUp(), /Incomplete or invalid folder group/);
  feed = [events[0], { ...events[1], baseRevision: 0 }];
  await assert.rejects(replica.catchUp());
  assert.deepEqual(projections, []);
  assert.equal(saved(), undefined);
  assert.equal(replica.confirmedValue(item.id), undefined);
  feed = events;
  await replica.catchUp();
  assert.deepEqual(projections, [{ notes: [{ id: item.id, item, revision: 3 }], tree: folders }]);
  assert.equal(saved().cursor, 4);
});

test('apply or checkpoint failure replays a full folder group without publishing a partial cursor', async (t) => {
  const { item, events } = await folderGroup();
  const server = relay();
  const reads = [];
  server.view.events = async (_generation, since) => {
    reads.push(since);
    return { generation, head: 4, floor: 2, events: events.filter((head) => head.revision > since) };
  };
  let applies = 0;
  const writes = [];
  const { replica } = device(t, server, {
    state: { cursor: 2, pending: [], confirmed: {} },
    applyFolderGroup: async () => { if (++applies === 1) throw new Error('projection failed'); },
    save: async (state) => { writes.push(state.cursor); if (writes.length === 1) throw new Error('checkpoint failed'); },
  });
  await assert.rejects(replica.catchUp(), /projection failed/);
  assert.equal(replica.confirmedValue(item.id), undefined);
  await assert.rejects(replica.catchUp(), /checkpoint failed/);
  assert.equal(replica.confirmedValue(item.id), undefined);
  await replica.catchUp();
  assert.deepEqual(reads, [2, 2, 2]);
  assert.deepEqual(writes, [4, 4]);
  assert.equal(applies, 3);
  assert.equal(replica.confirmedValue(item.id).revision, 3);
});

test('folder tree shares the journal, survives restart, and never overwrites a conflicting revision', async (t) => {
  const server = relay();
  const inbox = { path: 'Inbox', name: 'Inbox', description: '', order: 0 };
  const projects = { path: 'Projects', name: 'Projects', description: '', order: 1 };
  const base = [inbox, projects];
  const reordered = [{ ...inbox, order: 1 }, { ...projects, order: 0 }];
  const offlineChange = [inbox];
  const aTrees = [];
  const bTrees = [];
  const a = device(t, server, { applyFolderTree: async (tree) => aTrees.push(tree) });
  const b = device(t, server, { applyFolderTree: async (tree) => bTrees.push(tree) });
  await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
  await a.replica.recordFolderTree(base, []);
  await until(() => bTrees.length === 1 && !a.replica.pendingCount);
  server.pause();
  await b.replica.recordFolderTree(offlineChange, base);
  const journal = loadNoteJournal({ version: 1, room, generation, journal: b.saved() }, room, generation);
  b.stop();
  await a.replica.recordFolderTree(reordered, base);
  await until(() => aTrees.length === 2 && !a.replica.pendingCount);
  const resumed = device(t, server, { state: journal, applyFolderTree: async (tree) => bTrees.push(tree) });
  await resumed.replica.catchUp();
  await until(() => !resumed.replica.pendingCount);
  assert.deepEqual(resumed.conflicts.map(({ item, fields }) => ({ item, fields })), [{ item: offlineChange, fields: ['folders'] }]);
  assert.deepEqual(bTrees.at(-1), reordered);
  assert.equal(server.events.length, 2);
  assert.equal(new Set(server.events.map((event) => event.noteId)).size, 1);
  assert.equal(a.local.size + b.local.size + resumed.local.size, 0);
});

test('identical offline folder and profile updates settle without a review or a second revision', async (t) => {
  const { sharedRegistryId } = await import('../src/lib/sync/notes/sharedBody.ts');
  const server = relay();
  const profile = sharedRegistryId('workspace', 'profile');
  const previous = { name: 'Before' }, next = { name: 'After' };
  const inbox = [{ path: 'Inbox', name: 'Inbox', description: '' }];
  const tree = [...inbox, { path: 'Trip', name: 'Trip', description: '' }];
  const projection = () => {
    const values = {};
    return { values, applyShared: async ({ shared }) => { values.profile = shared; },
      applyFolderTree: async (folders) => { values.folders = folders; } };
  };
  const a = device(t, server, projection());
  const c = device(t, server, projection());
  await Promise.all([a.replica.catchUp(), c.replica.catchUp()]);
  await a.replica.recordFolderTree(inbox, []);
  await a.replica.recordShared(profile, previous, null);
  await until(() => c.saved()?.cursor === 2 && !a.replica.pendingCount);
  const b = device(t, server, { ...projection(), state: c.saved() });
  await b.replica.recordFolderTree(tree, inbox);
  await b.replica.recordShared(profile, next, previous);
  const envelope = JSON.parse(JSON.stringify({ version: 1, room, generation, journal: b.saved() }));
  b.stop();
  await a.replica.recordFolderTree(tree, inbox);
  await a.replica.recordShared(profile, next, previous);
  await until(() => c.saved()?.cursor === 4 && !a.replica.pendingCount);
  const sends = server.sends();
  const disk = projection();
  const back = device(t, server, { ...disk, state: loadNoteJournal(envelope, room, generation) });
  await back.replica.catchUp();
  await until(() => !back.replica.pendingCount);
  assert.deepEqual(back.conflicts, []);
  assert.deepEqual(back.saved().pending, []);
  assert.deepEqual(disk.values, { folders: tree, profile: next });
  assert.equal(server.sends(), sends);
  assert.equal(server.events.length, 4);
});

test('batches immediate edits and catches up without further requests when idle', async (t) => {
  const server = relay();
  const a = device(t, server);
  const b = device(t, server);
  await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
  await a.replica.record(Array.from({ length: 30 }, (_, i) => change('create', note(`n-${i}`))));
  await until(() => b.local.size === 30 && a.replica.pendingCount === 0);
  await wait(80);
  assert.equal(server.sends(), 1);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});

test('a stale independent edit merges, but its dependent delete cannot remove the merged result', async (t) => {
  const server = relay();
  const a = device(t, server);
  const b = device(t, server);
  await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
  const base = note('one');
  await a.replica.record([change('create', base)]);
  await until(() => b.local.has(base.id));
  server.pause();
  const accepted = { ...base, title: 'relay' };
  await a.replica.record([change('update', accepted)]);
  await until(() => a.replica.pendingCount === 0);
  const local = { ...base, tags: ['local'], updatedAt: 9_000_000 };
  await b.replica.record([change('update', local), change('delete', null, base.id)]);
  await until(() => b.replica.pendingCount === 0);
  assert.equal(server.events.length, 3);
  assert.equal(server.sends(), 4);
  assert.equal(b.local.get(base.id).title, 'relay');
  assert.deepEqual(b.local.get(base.id).tags, ['local']);
  assert.deepEqual(b.conflicts.map(({ fields }) => fields), [['delete']]);
});

test('a stale delete cannot remove a restored note with the same content', async (t) => {
  const server = relay();
  const a = device(t, server);
  const b = device(t, server);
  await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
  const base = note('recreated');
  await a.replica.record([change('create', base)]);
  await until(() => b.local.has(base.id));
  server.pause();
  await a.replica.record([change('delete', null, base.id), change('restore', base)]);
  await until(() => a.replica.pendingCount === 0);
  await b.replica.record([change('delete', null, base.id)]);
  await until(() => b.replica.pendingCount === 0);
  assert.deepEqual(server.events.map(({ kind }) => kind), ['create', 'delete', 'restore']);
  assert.deepEqual(b.local.get(base.id), base);
  assert.deepEqual(b.conflicts[0].fields, ['delete']);
});

test('relay deletion stays authoritative until an explicit conflict retry after restart', async (t) => {
  const server = relay();
  const author = device(t, server);
  const writes = [];
  const peer = device(t, server, { apply: async (entry) => { writes.push(entry); } });
  await Promise.all([author.replica.catchUp(), peer.replica.catchUp()]);
  const base = note('deleted');
  await author.replica.record([change('create', base)]);
  await until(() => writes.length === 1);
  server.pause();
  await author.replica.record([change('delete', null, base.id)]);
  await until(() => author.replica.pendingCount === 0);
  const local = { ...base, content: 'local rejected copy' };
  await peer.replica.record([change('update', local)]);
  await until(() => peer.replica.pendingCount === 0);
  assert.deepEqual(writes.at(-1), { id: base.id, item: null, revision: 2, discardLiveCopy: true });
  assert.equal(server.events.length, 2);
  const snapshot = { version: 1, room, generation, journal: peer.saved() };
  peer.stop();
  assert.throws(() => loadNoteJournal(snapshot, room, generation + 1));
  const reopened = device(t, server, { state: loadNoteJournal(snapshot, room, generation) });
  const [conflict] = reopened.conflicts;
  assert.deepEqual(conflict.item, local);
  await reopened.replica.catchUp();
  const content = 'manually combined text';
  await assert.rejects(reopened.replica.resolveConflict(conflict.intentId, 'retry', 1, content));
  assert.deepEqual(reopened.conflicts[0].item, local);
  await reopened.replica.resolveConflict(conflict.intentId, 'retry', 2, content);
  assert.equal(reopened.saved().pending[0].kind, 'restore');
  assert.deepEqual(reopened.saved().conflicts, []);
  await until(() => reopened.replica.pendingCount === 0);
  assert.equal(server.events.at(-1).kind, 'restore');
  assert.deepEqual(reopened.local.get(base.id), { ...local, content });
});

test('failed conflict resolution keeps the alternative and never submits the retry', async (t) => {
  const server = relay();
  const base = note('existing');
  const alternative = { intentId: 'conflict', noteId: base.id, kind: 'update', revision: 1,
    item: { ...base, title: 'local' }, fields: ['update'], at: 1 };
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: base } }, pending: [], conflicts: [alternative] },
    save: async () => { throw new Error('disk full'); },
  });
  for (const resolution of ['retry', 'keep']) {
    await assert.rejects(peer.replica.resolveConflict(alternative.intentId, resolution, 1), /disk full/);
    assert.deepEqual(peer.conflicts, [alternative]);
    assert.equal(peer.replica.pendingCount, 0);
    assert.equal(server.sends(), 0);
  }
});

test('a live gap arriving during an older HTTP response is caught up without another event', async (t) => {
  const server = relay();
  const writer = device(t, server);
  await writer.replica.catchUp();
  server.pause();
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  let reads = 0;
  const reader = device(t, server, { channel: { ...server.view, events: async (...args) => {
    const snapshot = await server.view.events(...args);
    if (++reads === 1) {
      started.resolve();
      await release.promise;
    }
    return snapshot;
  } } });
  const catchUp = reader.replica.catchUp();
  await started.promise;
  await writer.replica.record(['first', 'last'].map((id) => change('create', note(id))));
  await until(() => server.events.length === 2);
  reader.replica.handleMessage({ type: 'note_events', generation, events: [server.events[1]] });
  release.resolve();
  await catchUp;
  assert.deepEqual([...reader.local.keys()], ['first', 'last']);
  assert.equal(reader.saved().cursor, 2);
  assert.equal(reads, 2);
});

test('a receipt is not an applied feed checkpoint', async (t) => {
  const server = relay();
  server.pause();
  const feed = Promise.withResolvers();
  const { replica, saved } = device(t, server, { channel: { ...server.view, events: async (...args) => {
    if (server.events.length) await feed.promise;
    return server.view.events(...args);
  } } });
  await replica.catchUp();
  await replica.record([change('create', note('receipt-first'))]);
  await until(() => replica.pendingCount === 0);
  assert.equal(saved().cursor, 0);
  assert.equal(replica.syncHealth, 'syncing');
  feed.resolve();
  await until(() => replica.syncHealth === 'current');
  assert.equal(saved().cursor, 1);
});

test('reconnect requires a feed response from the new connection epoch', async (t) => {
  const server = relay();
  const oldResponse = Promise.withResolvers();
  const newResponse = Promise.withResolvers();
  let reads = 0;
  const { replica } = device(t, server, { channel: { ...server.view, events: async () => {
    const read = ++reads;
    if (read === 2) await oldResponse.promise;
    if (read === 3) await newResponse.promise;
    return { generation, head: 0, floor: 0, events: [] };
  } } });
  await replica.catchUp();
  assert.equal(replica.syncHealth, 'current');
  const pull = replica.catchUp();
  replica.requireCatchUp();
  assert.equal(replica.syncHealth, 'syncing');
  oldResponse.resolve();
  await until(() => reads === 3);
  assert.equal(replica.syncHealth, 'syncing');
  newResponse.resolve();
  await pull;
  assert.equal(replica.syncHealth, 'current');
});

test('a failed local apply does not advance the durable cursor and can replay', async (t) => {
  const server = relay();
  const a = device(t, server);
  await a.replica.catchUp();
  await a.replica.record([change('create', note('disk'))]);
  await until(() => server.events.length === 1);
  let diskFailed = true;
  const applied = [];
  const b = device(t, server, { apply: async (entry) => {
    if (diskFailed) throw new Error('disk full');
    applied.push(entry);
  } });
  await assert.rejects(b.replica.catchUp(), /disk full/);
  assert.equal(b.saved(), undefined);
  assert.equal(b.replica.syncHealth, 'error');
  diskFailed = false;
  await b.replica.catchUp();
  assert.equal(b.saved().cursor, 1);
  assert.equal(b.replica.syncHealth, 'current');
  assert.equal(applied[0].id, 'disk');
});

test('cursor write failure replays the entire applied page after restart', async (t) => {
  const server = relay();
  const a = device(t, server);
  await a.replica.catchUp();
  server.pause();
  await a.replica.record(['one', 'two'].map((id) => change('create', note(id))));
  await until(() => server.events.length === 2);
  const disk = new Map();
  let failed = false;
  const reader = device(t, server, {
    apply: async ({ id, item }) => { disk.set(id, item); },
    save: async () => { failed = true; throw new Error('cursor rename failed'); },
  });
  await assert.rejects(reader.replica.catchUp(), /cursor rename failed/);
  assert.equal(failed, true);
  assert.deepEqual([...disk.keys()], ['one', 'two']);
  reader.stop();
  const restarted = device(t, server);
  await restarted.replica.catchUp();
  assert.deepEqual([...restarted.local], [...disk]);
  assert.equal(restarted.saved().cursor, 2);
});

test('acceptance with lost reply survives restart and expired feed', async (t) => {
  const server = relay();
  const a = device(t, server);
  await a.replica.catchUp();
  server.lose();
  await a.replica.record([change('create', note('persist'))]);
  await until(() => a.errors.length === 1);
  assert.equal(a.saved().pending.length, 1);
  const saved = a.saved();
  a.stop();
  server.prune();
  const b = device(t, server, { state: saved });
  await b.replica.catchUp();
  assert.equal(b.replica.pendingCount, 0);
  assert.equal(b.local.get('persist').content, 'base');
  assert.equal(server.events.length, 1);
});

test('retained heads prove only direct update continuity after the feed expires', async (t) => {
  const server = relay();
  const a = device(t, server), offline = device(t, server);
  await Promise.all([a.replica.catchUp(), offline.replica.catchUp()]);
  const direct = note('direct'), missing = note('missing-edge');
  await a.replica.record([direct, missing].map((item) => change('create', item)));
  await until(() => offline.saved()?.cursor === 2);
  const before = offline.saved();
  offline.stop();
  const local = (item) => ({ ...item, content: `offline ${item.id}` });
  const sleeping = device(t, server, { state: before });
  await sleeping.replica.record([direct, missing].map((item) => ({ ...change('update', local(item)), previous: item,
    origin: { revision: before.confirmed[item.id].revision } })));
  const pending = sleeping.saved();
  sleeping.stop();
  await a.replica.record([direct, missing].map((item) => change('update', { ...item, title: 'remote title' })));
  await until(() => a.saved()?.cursor === 4);
  await a.replica.record([change('update', { ...missing, title: 'newest title' }), change('create', note('unrelated'))]);
  await until(() => a.saved()?.cursor === 6);
  server.prune();
  const back = device(t, server, { state: pending });
  await back.replica.catchUp();
  await until(() => !back.replica.pendingCount);
  assert.equal(back.local.get(direct.id).title, 'remote title');
  assert.equal(back.local.get(direct.id).content, local(direct).content);
  assert.equal(back.local.get(missing.id).title, 'newest title');
  assert.equal(back.local.get(missing.id).content, missing.content);
  assert.deepEqual(back.conflicts.map(({ noteId, fields, item }) => ({ noteId, fields, item })), [
    { noteId: missing.id, fields: ['lifecycle'], item: local(missing) },
  ]);
});

for (const prune of [false, true]) {
  test(`a restored note rejects an older edit even after another update (pruned=${prune})`, async (t) => {
    const server = relay();
    const a = device(t, server), b = device(t, server);
    await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
    const base = note('new-lifetime');
    await a.replica.record([change('create', base)]);
    await until(() => b.saved()?.cursor === 1);
    server.pause();
    await a.replica.record([change('delete', null, base.id), change('restore', base)]);
    await until(() => a.saved().cursor === 3);
    await a.replica.record([change('update', { ...base, title: 'restored' })]);
    await until(() => a.saved().cursor === 4);
    if (prune) server.prune();
    const local = { ...base, content: 'unfinished local text' };
    await b.replica.record([{ ...change('update', local), previous: base, origin: { revision: 1 } }]);
    await until(() => b.saved().cursor === 4 && !b.replica.pendingCount);
    assert.equal(server.events.length, 4);
    assert.equal(b.local.get(base.id).content, base.content);
    assert.deepEqual(b.conflicts.map(({ fields, item }) => ({ fields, item })), [{ fields: ['lifecycle'], item: local }]);
  });
}

for (const reversed of [false, true]) {
  test(`adjacent lines, paragraphs and tags converge after restart (reverse=${reversed})`, async (t) => {
    const server = relay();
    const a = device(t, server), offline = device(t, server);
    await Promise.all([a.replica.catchUp(), offline.replica.catchUp()]);
    const base = note('adjacent', { content: 'Alpha\nBeta', tags: ['project', 'old'] });
    const paragraphs = note('paragraphs', { content: 'First\n\nLast', tags: ['base'] });
    const unsafe = note('unsafe', { content: 'Before\nParagraph\nExample\nAfter' });
    const left = [{ ...base, content: 'New Alpha\nBeta', tags: ['project'] },
      { ...paragraphs, content: 'New First\nSecond line\n\nLast', tags: ['base', 'z'] },
      { ...unsafe, content: 'Before\n```\nParagraph\nExample\n```\nAfter' }];
    const right = [{ ...base, content: 'Alpha\nNew Beta', tags: ['project', 'old', 'new'] },
      { ...paragraphs, content: 'First\n\nNew Last', tags: ['base', 'a'] },
      { ...unsafe, content: 'Before\nParagraph\n# Heading\nExample\nAfter' }];
    const originals = [base, paragraphs, unsafe];
    await a.replica.record(originals.map((item) => change('create', item)));
    await until(() => offline.saved()?.cursor === 3);
    const journal = offline.saved();
    offline.stop();
    const edits = (items) => items.map((item, index) => ({ ...change('update', item), previous: originals[index],
      origin: { revision: journal.confirmed[item.id].revision } }));
    const [winner, stale] = reversed ? [right, left] : [left, right];
    await a.replica.record(edits(winner));
    await until(() => a.saved()?.cursor === 6 && !a.replica.pendingCount);
    const resumed = device(t, server, { state: journal });
    await resumed.replica.catchUp();
    await resumed.replica.record(edits(stale));
    await until(() => server.events.length === 8 && !resumed.replica.pendingCount && resumed.saved().cursor === 8 && a.saved().cursor === 8);
    for (const d of [a, resumed]) {
      assert.deepEqual(d.errors, []);
      assert.equal(d.local.get(base.id).content, 'New Alpha\nNew Beta');
      assert.deepEqual(d.local.get(base.id).tags, ['project', 'new']);
      assert.equal(d.local.get(paragraphs.id).content, 'New First\nSecond line\n\nNew Last');
      assert.deepEqual(d.local.get(paragraphs.id).tags, ['base', 'a', 'z']);
      assert.equal(d.local.get(unsafe.id).content, winner[2].content);
    }
    assert.deepEqual(a.conflicts, []);
    assert.deepEqual(resumed.conflicts.map(({ fields, item }) => ({ fields, item })), [{ fields: ['content'], item: stale[2] }]);
  });
}

test('a queued successor can undo its own preceding edit without undoing the remote edit', async (t) => {
  const server = relay();
  const send = server.view.send;
  let release, entered;
  const paused = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const a = device(t, server), b = device(t, server);
  await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
  const base = note('successive');
  await a.replica.record([change('create', base)]);
  await until(() => b.saved()?.cursor === 1);
  await a.replica.record([change('update', { ...base, title: 'remote title' })]);
  await until(() => b.saved().cursor === 2);
  server.view.send = async (...args) => { entered(); await gate; return send(...args); };
  const edited = { ...base, content: 'typing' };
  await b.replica.record([{ ...change('update', edited), previous: base, origin: { revision: 1 }, intentId: 'first-edit' }]);
  await paused;
  await b.replica.record([{ ...change('update', base), previous: edited, origin: { intentId: 'first-edit' } }]);
  release();
  await until(() => b.saved().cursor === 4 && !b.replica.pendingCount);
  assert.deepEqual(b.conflicts, []);
  assert.equal(b.local.get(base.id).title, 'remote title');
  assert.equal(b.local.get(base.id).content, base.content);
  assert.equal(server.events.length, 4);
});

function liveDevice(t, server, options = {}) {
  const delivered = [];
  let replica;
  const d = device(t, server, {
    isLiveOpen: () => true,
    sendLive: (text) => {
      // A live send must never leave before the sealed attempt is on disk.
      const data = JSON.parse(text);
      assert.deepEqual(d.saved().pending.map(({ attempt }) => attempt?.op), data.ops);
      delivered.push(data.ops);
      void server.view.send(generation, data.requestId, data.ops).then((response) => replica.handleMessage(response));
      return true;
    },
    ...options,
  });
  replica = d.replica;
  return { ...d, delivered };
}

test('the first fresh text note leaves at once on an idle confirmed socket', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const server = relay();
  const d = liveDevice(t, server);
  await d.replica.catchUp();
  const item = note('first-live');
  await d.replica.record([change('create', item)]);
  assert.equal(d.delivered.length, 0, 'the journal turn must not send before its timer');
  t.mock.timers.tick(0);
  await pump(() => d.delivered.length === 1, 'the first note waited for the batch window');
  await pump(() => d.replica.pendingCount === 0);
  assert.equal(d.delivered.length, 1);
  assert.equal(d.delivered[0].length, 1);
  assert.deepEqual(d.errors, []);
});

test('a same-tick burst keeps one batched send', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const server = relay();
  const d = liveDevice(t, server);
  await d.replica.catchUp();
  await Promise.all(Array.from({ length: 10 }, (_, i) => d.replica.record([change('create', note(`burst-${i}`))])));
  t.mock.timers.tick(0);
  await settle();
  assert.equal(d.delivered.length, 0, 'a burst is not hot-dispatched');
  t.mock.timers.tick(49);
  await settle();
  assert.equal(d.delivered.length, 0);
  t.mock.timers.tick(1);
  await pump(() => d.delivered.length === 1 && d.replica.pendingCount === 0);
  assert.equal(d.delivered[0].length, 10);
  assert.deepEqual(d.errors, []);
});

test('media, an HTTP-only socket and a failed journal write keep the old window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const server = relay();
  const attachment = { id: 'asset', name: 'asset', type: 'file', mimeType: 'application/octet-stream', size: 4, relativePath: '.attachments/asset' };
  let uploads = 0;
  const media = liveDevice(t, server, { uploadAttachment: async () => {
    uploads++;
    return 'a'.repeat(64);
  } });
  await media.replica.catchUp();
  await media.replica.record([change('create', note('media', { attachments: [attachment] }))]);
  t.mock.timers.tick(0);
  await settle();
  assert.equal(uploads + media.delivered.length, 0, 'a media note is neither sealed nor sent on the hot turn');
  t.mock.timers.tick(50);
  await pump(() => media.delivered.length === 1);
  assert.equal(uploads, 1);
  assert.deepEqual(media.delivered[0][0].mediaIds, ['a'.repeat(64)]);
  await pump(() => media.replica.pendingCount === 0);
  media.stop();

  const http = device(t, server, { isLiveOpen: () => false, sendLive: () => false });
  await http.replica.catchUp();
  const sends = server.sends();
  await http.replica.record([change('create', note('http-only'))]);
  t.mock.timers.tick(0);
  await settle();
  assert.equal(server.sends(), sends, 'HTTP-only must wait for the batch window');
  t.mock.timers.tick(50);
  await pump(() => http.replica.pendingCount === 0);
  assert.equal(server.sends(), sends + 1);

  let journalBroken = false;
  const broken = device(t, server, { isLiveOpen: () => true, sendLive: () => { throw new Error('sent without a journal'); },
    save: async () => { if (journalBroken) throw new Error('disk full'); } });
  await broken.replica.catchUp();
  journalBroken = true;
  await assert.rejects(broken.replica.record([change('create', note('lost-journal'))]), /disk full/);
  t.mock.timers.tick(0);
  t.mock.timers.tick(50);
  await settle();
  assert.equal(broken.replica.pendingCount, 0);
});

test('a read-only switch, a required catch-up or a pending feed falls back without losing the note', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const server = relay();
  const d = liveDevice(t, server);
  await d.replica.catchUp();

  await d.replica.record([change('create', note('read-only-switch'))]);
  d.replica.setReadOnly(true);
  t.mock.timers.tick(0);
  await settle();
  assert.equal(d.delivered.length, 0, 'read-only must not send on the hot turn');
  assert.equal(d.replica.pendingCount, 1, 'the note stays in the journal');
  d.replica.setReadOnly(false);
  await d.replica.catchUp();
  t.mock.timers.tick(50);
  await pump(() => d.replica.pendingCount === 0);
  assert.equal(d.delivered.length, 1);

  await d.replica.record([change('create', note('reconnect'))]);
  d.replica.requireCatchUp();
  t.mock.timers.tick(0);
  await settle();
  assert.equal(d.delivered.length, 1, 'a required catch-up must not send on the hot turn');
  assert.equal(d.replica.pendingCount, 1);
  await d.replica.catchUp();
  t.mock.timers.tick(50);
  await pump(() => d.replica.pendingCount === 0);
  assert.equal(d.delivered.length, 2);

  d.replica.noteRelayHead(d.replica.progress.relayHead + 1);
  await d.replica.record([change('create', note('behind-feed'))]);
  t.mock.timers.tick(0);
  await settle();
  assert.equal(d.delivered.length, 2, 'a pending feed gap must not send on the hot turn');
  t.mock.timers.tick(49);
  await settle();
  assert.equal(d.delivered.length, 2);
  t.mock.timers.tick(1);
  await pump(() => d.replica.pendingCount === 0);
  assert.equal(d.delivered.length, 3);
  assert.deepEqual(d.errors, []);
});

test('a failed send keeps its saved attempt and only retries after the backoff', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const server = relay();
  const transmitted = [];
  const d = device(t, server, { isLiveOpen: () => false, sendLive: () => false,
    channel: { ...server.view, send: async (gen, requestId, ops) => {
      transmitted.push(ops);
      if (transmitted.length === 1) throw new Error('offline');
      return server.view.send(gen, requestId, ops);
    } } });
  await d.replica.catchUp();
  await d.replica.record([change('create', note('retried'))]);
  t.mock.timers.tick(0);
  await settle();
  assert.deepEqual(transmitted, [], 'an offline note is never hot-dispatched');
  t.mock.timers.tick(50);
  await pump(() => d.errors.length === 1);
  assert.equal(transmitted.length, 1);
  const attempt = d.saved().pending[0].attempt;
  assert.ok(attempt, 'the sealed attempt is durable before the send');
  t.mock.timers.tick(9_999);
  await settle();
  assert.equal(transmitted.length, 1, 'a failed send waits out its backoff');
  t.mock.timers.tick(1);
  await pump(() => d.replica.pendingCount === 0);
  assert.equal(transmitted.length, 2);
  assert.equal(transmitted[1][0].opId, attempt.op.opId);
  assert.deepEqual(d.errors.map(String), ['Error: offline']);
});

// --- noteReviewKind tests ---

test('noteReviewKind classifies per contract: legacy only on marker, others by proof level', () => {
  // Only LEGACY_CUTOVER marker → legacy
  assert.equal(noteReviewKind([LEGACY_CUTOVER]), 'legacy');
  assert.equal(noteReviewKind([LEGACY_CUTOVER, 'update']), 'legacy');
  // No-proof fields → review (not proven conflict)
  assert.equal(noteReviewKind(['base']), 'review');
  assert.equal(noteReviewKind(['predecessor']), 'review');
  assert.equal(noteReviewKind(['lifecycle']), 'review');
  assert.equal(noteReviewKind(['recovered-disk']), 'review');
  // Structural markers → conflict
  assert.equal(noteReviewKind(['folder']), 'conflict');
  assert.equal(noteReviewKind(['folders']), 'conflict');
  assert.equal(noteReviewKind(['delete']), 'conflict');
  // Ordinary data fields → conflict (real overlapping edits)
  assert.equal(noteReviewKind(['dueDate', 'content']), 'conflict');
  assert.equal(noteReviewKind(['tags']), 'conflict');
  // Empty or bare 'update' without evidence → review
  assert.equal(noteReviewKind([]), 'review');
  assert.equal(noteReviewKind(['update']), 'review');
});

// --- resolveConflict with selectedFields tests ---

test('selecting dueDate does not overwrite unrelated tag and priority on retry', async (t) => {
  const server = relay();
  // Local has dueDate changed from head; tags/priority differ too but we select only dueDate
  const base = note('conflict-due', { type: 'task', content: 'keep this', folder: 'Inbox', tags: ['red'], priority: 'high' });
  const local = { ...base, dueDate: '2026-06-06', tags: ['green'] };
  const head = { ...base, dueDate: '2025-01-01', tags: ['blue'], priority: 'low' };
  const conflictEntry = { intentId: 'pick-due', noteId: base.id, kind: 'update', revision: 1,
    item: local, fields: ['dueDate', 'tags'], at: Date.now() };
  // Skip catchUp; test resolveConflict directly against the prepared state like existing tests do
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: head } }, pending: [], conflicts: [conflictEntry] },
    save: async (state) => { peer.savedState = state; },
  });
  peer.savedState = undefined;
  await peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, undefined, ['dueDate']);
  assert.ok(peer.savedState);
  assert.equal(peer.savedState.pending.length, 1);
  const retryItem = peer.savedState.pending[0].item;
  assert.ok(retryItem && typeof retryItem === 'object' && !Array.isArray(retryItem));
  // Chosen field carries our value; other differing fields come from head
  assert.equal(retryItem.dueDate, '2026-06-06');
  assert.deepEqual(retryItem.tags, ['blue'], 'relay tags preserved — not selected');
  assert.equal(retryItem.priority, 'low', 'relay priority preserved — not selected');
  assert.equal(peer.errors.length, 0);
});

test('stale reviewedRevision is rejected when using selectedFields', async (t) => {
  const server = relay();
  const base = note('stale-fields', { content: 'local' });
  const head = { ...base, content: 'head', title: 'head-title' };
  const conflictEntry = { intentId: 'stale-sel', noteId: base.id, kind: 'update', revision: 1,
    item: base, fields: ['content'], at: Date.now() };
  // Server has head at revision 2, but we try to resolve against revision 1
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: head } }, pending: [], conflicts: [conflictEntry] },
    save: async () => {},
  });
  // current.revision is 1 matches reviewedRevision 1 — should work
  await peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, undefined, ['content']);
  assert.equal(peer.errors.length, 0);
  // Now test with mismatched revision: head was updated to revision 2 outside
  const staleConflict = { intentId: 'stale-sel-2', noteId: base.id, kind: 'update', revision: 1,
    item: { ...base, content: 'old local' }, fields: ['content'], at: Date.now() };
  const stalePeer = device(t, server, {
    state: { cursor: 2, confirmed: { [base.id]: { revision: 2, item: { ...base, title: 'newer' } } }, pending: [], conflicts: [staleConflict] },
    save: async () => {},
  });
  await assert.rejects(stalePeer.replica.resolveConflict(staleConflict.intentId, 'retry', 1, undefined, ['content']), /Версия изменилась/);
  assert.equal(stalePeer.replica.conflicts.length, 1, 'conflict must remain unresolved');
});

test('invalid linkedItemIds values are not committed via selectedFields', async (t) => {
  const server = relay();
  // Local tried a different content + linking; head has different content too
  const base = note('bad-links', { content: 'local text' });
  const head = { ...base, content: 'remote text', tags: ['shared'] };
  const conflictEntry = { intentId: 'bad-link-id', noteId: base.id, kind: 'update', revision: 1,
    item: { ...base }, fields: ['content'], at: Date.now() };
  let savedJournal;
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: head } }, pending: [], conflicts: [conflictEntry] },
    save: async (state) => { savedJournal = state; },
  });
  // linkedItemIds wasn't changed in local → not applicable → rejected
  await assert.rejects(peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, undefined, ['linkedItemIds']), /Неприменимые поля/);
  assert.equal(savedJournal?.pendingCount ?? savedJournal?.pending?.length ?? 0, 0);
  // Select content — it IS a diff between local and head, so it applies
  await peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, undefined, ['content']);
  assert.ok(savedJournal);
  assert.equal(savedJournal.pending.length, 1);
  const mergedItem = savedJournal.pending[0].item;
  assert.ok(mergedItem && typeof mergedItem === 'object' && !Array.isArray(mergedItem));
  assert.equal(mergedItem.content, 'local text');
});

test('saved legacy review does not block independent delivery or repaint health', async (t) => {
  const server = relay();
  const base = note('health-test', { type: 'task', content: 'initial', tags: ['a'], priority: 'medium' });
  // Head has different dueDate — making it the differing field for the retry
  const head = { ...base, content: 'head-text', tags: ['b'], priority: 'low' };
  // Conflict entry: local tried to update with a dueDate
  const conflictEntry = { intentId: 'legacy-inv', noteId: base.id, kind: 'update', revision: 1,
    item: { ...base, dueDate: '2025-12-31' }, fields: ['update'], at: Date.now() };
  let savedJournal;
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: head } }, pending: [], conflicts: [conflictEntry] },
    save: async (state) => { savedJournal = state; },
  });
  savedJournal = undefined;
  // Resolve the conflict — no longer causes syncHealth to report 'error' just from conflicts.length
  await peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, undefined, ['dueDate']);
  assert.ok(savedJournal);
  assert.equal(savedJournal.conflicts.length, 0);
  assert.equal(savedJournal.pending.length, 1);
  const resultItem = savedJournal.pending[0].item;
  assert.ok(resultItem && typeof resultItem === 'object' && !Array.isArray(resultItem));
  assert.equal(resultItem.dueDate, '2025-12-31');
  // Tags and priority from head should survive since we only selected dueDate
  assert.deepEqual(resultItem.tags, ['b']);
  assert.equal(resultItem.priority, 'low');
  // Health must not be 'error' — conflicts.length alone doesn't trigger error anymore.
  // With pending retry it's 'syncing'; without journal/projection/failedIntents it cannot be 'error'.
  assert.notEqual(peer.replica.syncHealth, 'error', 'health must not be error after selecting fields on retry');
});

test('an accepted folder deletion clears the matching recovered review on live delivery without a pull', async (t) => {
  const server = relay();
  const folders = [{ path: 'Inbox', name: 'Inbox', description: '' }, { path: 'Archive', name: 'Archive', description: '' }];
  const author = device(t, server, { applyFolderTree: async () => {} });
  const reader = device(t, server, { applyFolderTree: async () => {} });
  await Promise.all([author.replica.catchUp(), reader.replica.catchUp()]);
  await author.replica.recordFolderTree(folders, []);
  await until(() => reader.saved()?.cursor === 1 && author.saved()?.cursor === 1);
  const expected = folders.slice(0, 1);
  const review = { intentId: 'old-delete', noteId: FOLDER_TREE_ID, kind: 'update', revision: 1, item: expected, fields: ['recovered-disk'], at: 1 };
  const different = { ...review, intentId: 'different-tree', item: [...expected, { path: 'Other', name: 'Other', description: '' }] };
  for (const client of [author, reader]) await client.replica.preserveLegacyAlternatives([review, different]);
  await author.replica.recordFolderTree(expected, folders);
  await until(() => reader.saved()?.cursor === 2 && author.saved()?.cursor === 2);
  for (const client of [author, reader]) {
    assert.deepEqual(client.saved().confirmed[FOLDER_TREE_ID].item, expected);
    assert.deepEqual(client.saved().conflicts.map(({ intentId }) => intentId), ['different-tree']);
  }
});

test('a legacy snapshot of a superseded daily deadline closes after catch-up without a send', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 24, 12) });
  const server = relay();
  const author = device(t, server);
  const base = note('legacy-daily', { type: 'task', status: 'todo', dueDate: '2026-11-20', streak: 0, recurrence: { freq: 'daily', interval: 1, resetSubtasks: true } });
  const old = { ...base, dueDate: '2026-11-23', updatedAt: Date.parse('2026-11-23T09:00:00Z') };
  const current = { ...base, dueDate: '2026-11-24', updatedAt: Date.parse('2026-11-24T09:00:00Z') };
  await author.replica.catchUp();
  await author.replica.record([change('create', base)]);
  await until(() => author.saved()?.cursor === 1);
  const saved = author.saved();
  const review = { intentId: 'old-rollover', noteId: base.id, kind: 'update', revision: 0, item: old, fields: [LEGACY_CUTOVER], at: old.updatedAt };
  const controls = [
    { ...review, intentId: 'different-body', item: { ...old, content: 'independent edit' } },
    { ...review, intentId: 'different-reminder', item: { ...old, reminder: '09:00' } },
    { ...review, intentId: 'pre-edit-timestamp', at: old.updatedAt - 1 },
    { ...review, intentId: 'newer-manual', at: current.updatedAt + 1 },
    { ...review, intentId: 'different-rule', item: { ...old, recurrence: { ...old.recurrence, interval: 2 } } },
    { ...review, intentId: 'future-deadline', item: { ...old, dueDate: '2026-11-25' } },
    { ...review, intentId: 'recovered-from-disk', fields: ['recovered-disk'] },
  ];
  const peer = device(t, server, { state: saved });
  await peer.replica.preserveLegacyAlternatives([review, ...controls]);
  assert.equal(peer.conflicts.length, 1 + controls.length, 'do not discard on an unverified cached head');
  await author.replica.record([change('update', current)]);
  await until(() => author.saved().cursor === 2);
  await peer.replica.catchUp();
  assert.deepEqual(peer.conflicts.map(({ intentId }) => intentId), controls.map(({ intentId }) => intentId));
  const journal = loadNoteJournal({ version: 1, room, generation, journal: peer.saved() }, room, generation);
  assert.equal(journal.confirmed[base.id].item.dueDate, current.dueDate);
  assert.equal(journal.pending.length, 0);
  assert.equal(server.sends(), 2);
});

test('recorded overdue rollovers are not conflicting manual deadline edits after restart', async (t) => {
  const server = relay();
  const author = device(t, server);
  const base = note('daily-rollover', { type: 'task', status: 'todo', dueDate: '2026-11-20', streak: 0, recurrence: { freq: 'daily' } });
  const manual = { ...base, id: 'manual-deadline' };
  await author.replica.catchUp();
  await author.replica.record([change('create', base), change('create', manual)]);
  await until(() => author.saved()?.cursor === 2);
  const offline = device(t, server, { state: author.saved() });
  const yesterday = '2026-11-23', today = '2026-11-24';
  await offline.replica.record([
    { ...change('update', { ...base, dueDate: yesterday }), previous: base, rollover: true },
    { ...change('update', { ...manual, dueDate: yesterday }), previous: manual, origin: { revision: 2 } },
  ]);
  const journal = loadNoteJournal(JSON.parse(JSON.stringify({ version: 1, room, generation, journal: offline.saved() })), room, generation);
  assert.deepEqual(journal.pending.map(({ rollover }) => rollover), [true, undefined]);
  assert.equal(journal.pending[0].provenBase, true, 'a cold snapshot exactly matching the journal is a valid rollover base');
  offline.stop();
  await author.replica.record([
    change('update', { ...base, dueDate: today, content: 'independent online edit' }),
    change('update', { ...manual, dueDate: today }),
  ]);
  await until(() => author.saved()?.cursor === 4);
  server.prune();
  const peer = device(t, server, { state: journal });
  await peer.replica.catchUp();
  await until(() => !peer.replica.pendingCount);
  assert.deepEqual(peer.conflicts.map(({ noteId, fields }) => [noteId, fields]), [[manual.id, ['dueDate']]]);
  assert.equal(peer.local.get(base.id).dueDate, today);
  assert.equal(peer.local.get(base.id).content, 'independent online edit');
  assert.equal(server.events.length, 4);
});

test('a user edit queued behind a rollover still merges after the relay advances the deadline', async (t) => {
  const server = relay();
  const author = device(t, server);
  const base = note('rollover-with-edit', { type: 'task', status: 'todo', dueDate: '2026-11-20', streak: 0, recurrence: { freq: 'daily' } });
  await author.replica.catchUp();
  await author.replica.record([change('create', base)]);
  await until(() => author.saved()?.cursor === 1);
  const offline = device(t, server, { state: author.saved() });
  const rolled = { ...base, dueDate: '2026-11-23' };
  await offline.replica.record([
    { ...change('update', rolled), intentId: 'rollover', previous: base, rollover: true },
    { ...change('update', { ...rolled, title: 'my independent edit' }), previous: rolled, origin: { intentId: 'rollover' } },
  ]);
  const journal = offline.saved();
  offline.stop();
  await author.replica.record([change('update', { ...base, dueDate: '2026-11-24', tags: ['other device'] })]);
  await until(() => author.saved().cursor === 2);
  const receiver = device(t, server, { state: journal });
  await receiver.replica.catchUp();
  await until(() => !receiver.replica.pendingCount && receiver.saved()?.cursor === 3);
  assert.deepEqual(receiver.conflicts, []);
  assert.equal(receiver.local.get(base.id).dueDate, '2026-11-24');
  assert.equal(receiver.local.get(base.id).title, 'my independent edit');
  assert.deepEqual(receiver.local.get(base.id).tags, ['other device']);
});

test('a cold disk edit already present at a continuous relay head does not archive a duplicate', async (t) => {
  const server = relay();
  const author = device(t, server);
  const base = note('cold-same');
  const edited = { ...base, content: 'already present on both devices' };
  await author.replica.catchUp();
  await author.replica.record([change('create', base)]);
  await until(() => author.saved()?.cursor === 1);
  const reader = device(t, server, { state: author.saved() });
  await reader.replica.captureColdNoteEdits(async () => [{ item: edited }]);
  assert.equal(reader.saved().pending[0].source, 'cold-recovery');
  await author.replica.record([change('update', edited)]);
  await until(() => author.saved().cursor === 2);
  await reader.replica.catchUp();
  await until(() => !reader.replica.pendingCount);
  assert.deepEqual(reader.conflicts, []);
  assert.equal(reader.local.get(base.id).content, edited.content);
  assert.equal(server.sends(), 2);
});

test('a restored identical note does not clear an older cold disk intent', async (t) => {
  const server = relay();
  const author = device(t, server);
  const base = note('cold-restored');
  const edited = { ...base, content: 'same text in a different lifecycle' };
  await author.replica.catchUp();
  await author.replica.record([change('create', base)]);
  await until(() => author.saved()?.cursor === 1);
  const reader = device(t, server, { state: author.saved() });
  await reader.replica.captureColdNoteEdits(async () => [{ item: edited }]);
  await author.replica.record([{ id: base.id, kind: 'delete', item: null }]);
  await until(() => author.saved().cursor === 2);
  await author.replica.record([change('restore', edited)]);
  await until(() => author.saved().cursor === 3);
  await reader.replica.catchUp();
  await until(() => !reader.replica.pendingCount);
  assert.deepEqual(reader.conflicts.map(({ item, fields }) => [item.content, fields]), [[edited.content, ['update']]]);
  assert.equal(server.sends(), 3);
});

test('empty selectedFields without content is rejected', async (t) => {
  const server = relay();
  const base = note('empty-fields-test');
  const conflictEntry = { intentId: 'emp', noteId: base.id, kind: 'create', revision: 0,
    item: base, fields: ['update'], at: Date.now() };
  const peer = device(t, server, {
    state: { cursor: 0, confirmed: {}, pending: [], conflicts: [conflictEntry] },
    save: async () => {},
  });
  await assert.rejects(peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 0, undefined, []), /нельзя выбрать отдельные поля/);
});

test('selectedFields with explicit content and empty array works', async (t) => {
  const server = relay();
  const base = note('content-plus');
  const head = { ...base, content: 'relay text' };
  const conflictEntry = { intentId: 'cp', noteId: base.id, kind: 'update', revision: 1,
    item: { ...base, title: 'local title' }, fields: ['title', 'content'], at: Date.now() };
  let savedJournal;
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: head } }, pending: [], conflicts: [conflictEntry] },
    save: async (state) => { savedJournal = state; },
  });
  // Empty fields + content — content replaces, no field-level merge needed
  await peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, 'my new text', []);
  assert.ok(savedJournal);
  assert.equal(savedJournal.pending.length, 1);
  const item = savedJournal.pending[0].item;
  assert.ok(item && typeof item === 'object' && !Array.isArray(item));
  assert.equal(item.content, 'my new text');
});

test('structurally blocked field (type) requires full item replacement', async (t) => {
  const server = relay();
  const base = note('type-block');
  const head = { ...base, type: 'article' };
  const conflictEntry = { intentId: 'type-blk', noteId: base.id, kind: 'update', revision: 1,
    item: { ...base, type: 'task' }, fields: ['type'], at: Date.now() };
  const peer = device(t, server, {
    state: { cursor: 1, confirmed: { [base.id]: { revision: 1, item: head } }, pending: [], conflicts: [conflictEntry] },
    save: async () => {},
  });
  // Type is in rejectable set — can't change type via selectedFields alone
  await assert.rejects(peer.replica.resolveConflict(conflictEntry.intentId, 'retry', 1, undefined, ['type']), /Неприменимые поля/);
});
