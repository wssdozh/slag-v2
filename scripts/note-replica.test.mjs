import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { NoteReplica } from '../src/lib/sync/notes/replica.ts';
import { deriveNoteKeys, FOLDER_TREE_ID, opaqueNoteId, sealFolderTree, sealNote } from '../src/lib/sync/notes/wire.ts';
import { loadNoteJournal } from '../src/lib/sync/notes/persistence.ts';

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
