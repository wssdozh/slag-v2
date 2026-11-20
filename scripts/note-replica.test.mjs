import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { NoteReplica } from '../src/lib/sync/notes/replica.ts';
import { archiveNoteConflict, keepRelayOnConflict, setKeepRelayOnConflict } from '../src/lib/sync/notes/conflicts.ts';
import { deriveNoteKeys, FOLDER_TREE_ID } from '../src/lib/sync/notes/wire.ts';
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
  const conflicts = [];
  let saved;
  const replica = new NoteReplica({ channel: server.view, room, generation, keys, signal: controller.signal, readOnly: false,
    sendLive: () => false, save: async (state) => { saved = structuredClone(state); },
    apply: async ({ id, item }) => { local.set(id, item); }, storeConflict: async (entry) => { conflicts.push(entry); },
    onProgress: () => undefined, onError: (error) => errors.push(error), ...options,
  }, options.state);
  server.clients.add(replica);
  const stop = () => { controller.abort(); server.clients.delete(replica); };
  t.after(stop);
  return { replica, local, conflicts, errors, stop, saved: () => saved };
}

async function until(predicate) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition did not settle');
    await wait(10);
  }
}

const change = (kind, item, id = item.id) => ({ kind, id, item });

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

test('read-only folder writes cannot be mistaken for durable intent capture', async (t) => {
  const server = relay();
  const { replica, saved } = device(t, server, { readOnly: true, applyFolderTree: async () => assert.fail('unexpected apply') });
  await assert.rejects(replica.recordFolderTree([], []), /недоступен для записи/);
  assert.equal(saved(), undefined);
  assert.equal(server.sends(), 0);
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

test('stale operation merges independent fields; true conflict archives only the rejected local copy', async (t) => {
  const server = relay();
  const a = device(t, server);
  const resolutions = [];
  const b = device(t, server, { onResolution: (counts) => resolutions.push(counts) });
  await Promise.all([a.replica.catchUp(), b.replica.catchUp()]);
  const base = note('one');
  await a.replica.record([change('create', base)]);
  await until(() => b.local.has(base.id));
  server.pause();
  await a.replica.record([change('update', { ...base, title: 'relay', content: 'new' })]);
  await until(() => server.events.length === 2);
  await b.replica.record([change('update', { ...base, tags: ['local'] })]);
  await until(() => b.replica.pendingCount === 0 && resolutions.length === 1);
  assert.deepEqual(resolutions[0], { merged: 1, conflicts: 0 });
  assert.deepEqual(b.local.get(base.id).tags, ['local']);
  await b.replica.record([{ ...change('update', { ...base, title: 'rejected', folder: 'moved' }), previous: base }]);
  await until(() => b.conflicts.length === 1 && b.replica.pendingCount === 0);
  assert.equal(b.local.get(base.id).title, 'relay');
  assert.equal(b.local.get(base.id).content, 'new');
  assert.equal(b.local.get(base.id).folder, 'moved');
  assert.deepEqual(b.conflicts[0].fields, ['title']);
  assert.deepEqual(resolutions.at(-1), { merged: 1, conflicts: 1 });
  assert.equal(b.conflicts[0].item.title, 'rejected');
});

for (const keepRelay of [false, true]) test(`relay deletion wins against an edit (keep relay: ${keepRelay})`, async (t) => {
  const server = relay();
  const author = device(t, server);
  const writes = [];
  const archives = [];
  const vault = `delete-conflict-${keepRelay}`;
  setKeepRelayOnConflict(vault, keepRelay);
  const peer = device(t, server, {
    apply: async (entry) => { writes.push(entry); },
    storeConflict: (entry) => archiveNoteConflict(vault, entry, async (_id, conflict) => { archives.push(conflict); }),
  });
  await Promise.all([author.replica.catchUp(), peer.replica.catchUp()]);
  const base = note('deleted');
  await author.replica.record([change('create', base)]);
  await until(() => writes.length === 1);
  server.pause();
  await author.replica.record([change('delete', null, base.id)]);
  await until(() => server.events.length === 2);
  await peer.replica.record([change('update', { ...base, content: 'local rejected copy' })]);
  await until(() => peer.replica.pendingCount === 0);
  assert.deepEqual(writes.at(-1), { id: base.id, item: null, discardLiveCopy: true });
  assert.deepEqual(archives.map(({ item }) => item.content), keepRelay ? [] : ['local rejected copy']);
  assert.equal(server.events.length, 2);
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
  diskFailed = false;
  await b.replica.catchUp();
  assert.equal(b.saved().cursor, 1);
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

test('conflict policy defaults to archive and opting in is per vault', async () => {
  const archived = [];
  const write = async (...args) => { archived.push(args); };
  const entry = { intentId: 'intent', noteId: 'one', item: note('one'), fields: ['title'] };
  assert.equal(keepRelayOnConflict('vault-a'), false);
  await archiveNoteConflict('vault-a', entry, write);
  setKeepRelayOnConflict('vault-a', true);
  await archiveNoteConflict('vault-a', entry, write);
  assert.equal(keepRelayOnConflict('vault-b'), false);
  await archiveNoteConflict('vault-b', entry, write);
  const tree = { intentId: 'tree', noteId: FOLDER_TREE_ID, item: [{ path: 'Rejected' }], fields: ['folders'] };
  await archiveNoteConflict('vault-a', tree, write);
  assert.deepEqual(archived, [['intent', entry], ['intent', entry], ['tree', tree]]);
  await assert.rejects(archiveNoteConflict('vault-b', entry, async () => { throw new Error('disk full'); }), /disk full/);
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
