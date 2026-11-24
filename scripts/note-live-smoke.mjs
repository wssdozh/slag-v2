// Two actual replicas and an authenticated Python relay, on loopback with temporary SQLite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { createServer, connect } from 'node:net';
import { NoteChannel } from '../src/lib/sync/notes/channel.ts';
import { openNoteSession } from '../src/lib/sync/notes/session.ts';
import { sealRegistryMedia } from '../src/lib/sync/notes/mediaWire.ts';
import { NoteReplica } from '../src/lib/sync/notes/replica.ts';
import { deriveNoteKeys, FOLDER_TREE_ID, opaqueNoteId, sealFolderTree, sealNote } from '../src/lib/sync/notes/wire.ts';

const relay = spawn('python', ['-u', '-c', `import asyncio, json, sys
from test_note_registry import TestNoteRegistry, ROOM, VAULT, QUOTA
async def main():
    test = TestNoteRegistry()
    await test.asyncSetUp()
    try:
        identity, owner, _, laptop = await test.two_devices()
        with test.server.db.conn:
            test.server.db.conn.execute("UPDATE accounts SET plan = 'smile' WHERE account_id = ?", (identity['accountId'],))
        _, phone = await test.add_active_device(identity, owner, 'device-3')
        await test.accepted_vault(owner, laptop)
        await test.accepted_vault(owner, phone, 'device-3')
        test.db = test.server.db
        test.db.touch_room(ROOM, VAULT)
        test.generation = test.db.freeze_note_room(ROOM)
        tokens = [owner, laptop, phone]
        print(json.dumps(dict(url=test.base, room=ROOM, vault=VAULT, generation=test.generation, tokens=tokens)), flush=True)
        seed = json.loads(await asyncio.to_thread(sys.stdin.readline))
        test.db.activate_note_room(ROOM, test.generation, [seed], identity['accountId'], QUOTA, seed['noteId'], atomic_groups=True, registry_media=True)
        print('active', flush=True)
        await asyncio.to_thread(sys.stdin.readline)
    finally:
        await test.asyncTearDown()
asyncio.run(main())`], { cwd: resolve(process.argv[2] ?? '../slag-relay/.worktrees/note-registry'), stdio: ['pipe', 'pipe', 'inherit'] });
const rttMs = Number(process.env.SLAG_SMOKE_RTT_MS ?? 0);
assert.ok(Number.isInteger(rttMs) && rttMs >= 0 && rttMs <= 100);
const sockets = new Set();
const proxyConnections = new Set();
let proxy;
const stop = new AbortController();
const exit = once(relay, 'exit');
try {
  const lines = createInterface({ input: relay.stdout });
  const [text] = await once(lines, 'line', { signal: AbortSignal.timeout(10_000) });
  const { url: upstream, room, vault, generation, tokens } = JSON.parse(text);
  const endpoint = new URL(upstream);
  assert.equal(endpoint.hostname, '127.0.0.1');
  let url = upstream;
  if (rttMs) {
    // Delay packets in each direction equally, without serializing the delays of packets in a batch.
    proxy = createServer({ allowHalfOpen: true }, (client) => {
      const server = connect({ port: Number(endpoint.port), host: endpoint.hostname, allowHalfOpen: true });
      for (const [from, to] of [[client, server], [server, client]]) {
        proxyConnections.add(from);
        const timers = new Set();
        from.on('data', (bytes) => {
          const timer = setTimeout(() => { timers.delete(timer); if (!to.destroyed) to.write(bytes); }, rttMs / 2);
          timers.add(timer);
        });
        from.on('end', () => {
          const timer = setTimeout(() => { timers.delete(timer); if (!to.destroyed) to.end(); }, rttMs / 2);
          timers.add(timer);
        });
        from.on('error', () => { from.destroy(); to.destroy(); });
        from.on('close', () => {
          proxyConnections.delete(from);
          for (const timer of timers) clearTimeout(timer);
        });
      }
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    url = `http://127.0.0.1:${proxy.address().port}`;
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(key, room);
  const tree = [{ path: 'Inbox', name: 'Inbox', description: '' }];
  const seed = await sealFolderTree(keys, room, generation, { opId: crypto.randomUUID(),
    noteId: await opaqueNoteId(keys, FOLDER_TREE_ID), baseRevision: 0, kind: 'create' }, tree);
  const activated = once(lines, 'line', { signal: AbortSignal.timeout(10_000) });
  relay.stdin.write(`${JSON.stringify(seed)}\n`);
  assert.deepEqual(await activated, ['active']);
  async function device(i, initial, local = new Map(), onApplied) {
    const controller = new AbortController();
    const signal = AbortSignal.any([stop.signal, controller.signal]);
    const channel = new NoteChannel({ serverUrl: url, roomId: room, vaultId: vault, signal, atomicGroups: true, registryMedia: true,
      headers: (json) => ({ Authorization: `Bearer ${tokens[i]}`, ...(json && { 'Content-Type': 'application/json' }) }) });
    let reads = 0;
    let posts = 0;
    let pushes = 0;
    let ignoreReply = false;
    let interceptPush;
    const attempts = [];
    let saved;
    const errors = [];
    assert.equal((await channel.status()).atomicGroups, true);
    let folders = initial?.confirmed[FOLDER_TREE_ID]?.item;
    const groups = [];
    const ws = new WebSocket(`${url.replace('http:', 'ws:')}/ws/${room}?${new URLSearchParams({ vault, token: tokens[i], device: `device-${i + 1}`, noteGeneration: generation, backlog: 'http', folderTree: '1', atomicGroups: '1', registryMedia: '1' })}`);
    sockets.add(ws);
    const replica = new NoteReplica({ room, generation, keys, signal, readOnly: false, atomicGroups: true, channel: {
      events: (...args) => { reads++; return channel.events(...args); }, heads: (...args) => { reads++; return channel.heads(...args); },
      send: (...args) => { posts++; attempts.push(args[2]); return channel.send(...args); },
    }, sendLive: (text) => {
      if (ws.readyState !== WebSocket.OPEN) return false;
      pushes++;
      attempts.push(JSON.parse(text).ops);
      if (interceptPush) {
        const intercept = interceptPush;
        interceptPush = undefined;
        intercept(() => ws.send(text));
      } else ws.send(text);
      return true;
    },
    isLiveOpen: () => ws.readyState === WebSocket.OPEN,
    apply: async ({ id, item }) => {
      local.set(id, item);
      onApplied?.(id);
    },
    applyFolderTree: async (tree) => { folders = tree; },
    applyFolderGroup: async (notes, tree) => {
      for (const { id, item } of notes) local.set(id, item);
      if (tree) folders = tree;
      groups.push({ notes, tree });
    },
    save: async (state) => { saved = structuredClone(state); },
    onProgress() {}, onError: (error) => errors.push(error.message) }, initial);
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!ignoreReply && (message.type === 'note_events' || message.type === 'note_results')) replica.handleMessage(message);
    });
    await once(ws, 'open', { signal: AbortSignal.timeout(5_000) });
    await replica.catchUp();
    return { replica, local, errors, attempts, ignoreReply: (value = true) => { ignoreReply = value; },
      holdNextPush: () => new Promise((resolve) => { interceptPush = resolve; }),
      folders: () => folders, groups, stats: () => ({ reads, posts, pushes }), saved: () => saved,
      close: () => { controller.abort(); ws.close(); } };
  }
  async function until(matches) {
    const deadline = performance.now() + 5000;
    while (!matches()) {
      assert.ok(performance.now() < deadline, 'replication timeout');
      await sleep(5);
    }
  }
  const note = (id, content = 'x'.repeat(64 * 1024)) => ({ id, type: 'note', title: id, content, folder: 'Inbox', attachments: [], tags: [], createdAt: 1, updatedAt: 1 });
  const save = (device, items) => device.replica.record(items.map((item) => ({ id: item.id, kind: 'create', item })));
  const appliedAt = new Map();
  const author = await device(0);
  let reader = await device(1, undefined, undefined, (id) => appliedAt.set(id, performance.now()));
  const base = author.saved().cursor;
  const initialReads = [author.stats().reads, reader.stats().reads];
  assert.equal(base, 1);
  assert.deepEqual(reader.folders(), tree);
  const timings = [];
  const appliedTimings = [];
  for (let i = 0; i < 30; i++) {
    const id = `measured-${i}`;
    const start = performance.now();
    await save(author, [note(id)]);
    await until(() => reader.local.has(id) && author.replica.pendingCount === 0);
    appliedTimings.push(appliedAt.get(id) - start);
    timings.push(performance.now() - start);
  }
  assert.ok(appliedTimings.every((ms, i) => Number.isFinite(ms) && ms >= 0 && ms <= timings[i]));
  const start = performance.now();
  await save(author, Array.from({ length: 10 }, (_, i) => note(`burst-${i}`)));
  await until(() => reader.local.size === 40 && author.replica.pendingCount === 0);
  const burstMs = performance.now() - start;
  const idle = [author.stats(), reader.stats()];
  await sleep(500);
  assert.deepEqual([author.stats(), reader.stats()], idle);
  assert.deepEqual(idle, [{ reads: initialReads[0], posts: 0, pushes: 31 }, { reads: initialReads[1], posts: 0, pushes: 0 }]);
  reader.close();
  await save(author, [note('while-offline', 'missed over websocket')]);
  await until(() => author.replica.pendingCount === 0);
  reader = await device(1, reader.saved(), reader.local);
  assert.equal(reader.local.get('while-offline').content, 'missed over websocket');
  assert.equal(reader.saved().cursor, base + 41);
  const id = 'while-offline';
  const edited = note(id, 'updated before deletion');
  await author.replica.record([{ id, kind: 'update', item: edited }]);
  await until(() => reader.local.get(id)?.content === edited.content && author.replica.pendingCount === 0);
  const phone = await device(2);
  assert.equal(phone.local.get(id)?.content, edited.content);
  const phoneChannel = new NoteChannel({ serverUrl: url, roomId: room, vaultId: vault, signal: stop.signal, atomicGroups: true, registryMedia: true,
    headers: (json) => ({ Authorization: `Bearer ${tokens[2]}`, ...(json && { 'Content-Type': 'application/json' }) }) });
  const phoneHead = (await phoneChannel.events(generation, base + 41)).events[0];
  const stale = await sealNote(keys, room, generation, { noteId: phoneHead.noteId, opId: crypto.randomUUID(),
    baseRevision: phoneHead.revision, kind: 'update' }, id, { ...edited, content: 'offline phone copy' });
  phone.close();
  await author.replica.record([{ id, kind: 'delete', item: null }]);
  await until(() => reader.local.get(id) === null && author.replica.pendingCount === 0);
  const answer = await phoneChannel.send(generation, 'stale-phone', [stale], base + 43);
  assert.equal(answer.results[0].status, 'stale');
  assert.equal(answer.results[0].current.kind, 'delete');
  assert.deepEqual((await phoneChannel.events(generation, base + 43)).events, []);
  const freshPhone = await device(2);
  assert.equal(freshPhone.local.get(id), null);
  freshPhone.close();
  await reader.replica.record([{ id, kind: 'restore', item: edited }]);
  await until(() => author.local.get(id)?.content === edited.content && reader.replica.pendingCount === 0);
  assert.equal(reader.saved().cursor, base + 44);
  author.ignoreReply();
  await save(author, [note('lost-reply', 'same immutable operation over HTTP')]);
  await until(() => reader.local.has('lost-reply') && author.replica.pendingCount === 0);
  assert.equal(author.stats().posts, 1);
  assert.deepEqual(author.attempts.at(-1), author.attempts.at(-2));
  await reader.replica.catchUp();
  assert.equal(reader.saved().cursor, base + 45, 'a replay must not create another event');
  author.ignoreReply(false);
  await author.replica.catchUp();
  const pushesBefore = reader.stats().pushes;
  const readsBefore = reader.stats().reads + author.stats().reads;
  await save(reader, Array.from({ length: 100 }, (_, i) => note(`small-${i}`, 'small change')));
  await until(() => author.local.has('small-99') && reader.replica.pendingCount === 0);
  assert.equal(reader.stats().pushes - pushesBefore, 1);
  assert.equal(reader.stats().reads + author.stats().reads, readsBefore);
  // Both peers capture the same actual base before the first remote event arrives.
  const shared = reader.local.get(id);
  const revision = reader.saved().confirmed[id].revision;
  const beforeMerge = (await phoneChannel.status()).head;
  const parallelTitle = { ...shared, title: 'title from first writer' };
  const parallelContent = { ...shared, content: 'first paragraph\n\nlast paragraph' };
  const update = (peer, item, previous, baseRevision) => peer.replica.record([
    { id: item.id, kind: 'update', item, previous, origin: { revision: baseRevision } },
  ]);
  await Promise.all([update(author, parallelTitle, shared, revision), update(reader, parallelContent, shared, revision)]);
  const combined = { ...parallelTitle, content: parallelContent.content };
  await until(() => [author, reader].every((peer) => peer.replica.pendingCount === 0 && peer.saved().cursor === beforeMerge + 2));
  assert.equal(author.local.get(id).title, combined.title);
  assert.equal(author.local.get(id).content, combined.content);
  assert.deepEqual(reader.local.get(id), author.local.get(id));
  assert.deepEqual([...author.replica.conflicts, ...reader.replica.conflicts], []);
  assert.deepEqual([...author.errors, ...reader.errors], []);

  const third = await device(2);
  const beforeRace = reader.saved().cursor;
  const raceBase = reader.local.get(id);
  const raceRevision = reader.saved().confirmed[id].revision;
  const restartState = reader.saved();
  reader.close();
  await update(author, { ...raceBase, content: 'remote paragraph\n\nlast paragraph', tags: ['other device'] }, raceBase, raceRevision);
  await until(() => third.saved().cursor === beforeRace + 1 && author.replica.pendingCount === 0);
  reader = await device(1, restartState, reader.local);
  const held = reader.holdNextPush();
  await update(reader, { ...raceBase, content: 'first paragraph\n\noffline edit in the reopened editor', tags: ['offline'] }, raceBase, raceRevision);
  const send = await held;
  const thirdBase = third.local.get(id);
  await update(third, { ...thirdBase, isPinned: true }, thirdBase, third.saved().confirmed[id].revision);
  await until(() => reader.saved().cursor === beforeRace + 2 && third.replica.pendingCount === 0);
  send();
  await until(() => reader.saved().cursor === beforeRace + 3 && reader.replica.pendingCount === 0);
  const [obsolete, retried] = reader.attempts.slice(-2).map(([op]) => op);
  assert.notEqual(retried.opId, obsolete.opId);
  assert.equal(retried.baseRevision, beforeRace + 2);
  const raceResult = reader.local.get(id);
  assert.deepEqual(raceResult.tags, ['offline', 'other device']);
  assert.equal(raceResult.content, 'remote paragraph\n\noffline edit in the reopened editor');
  assert.equal(raceResult.isPinned, true);
  assert.deepEqual(reader.replica.conflicts, []);
  const requestsBeforeNoop = reader.stats();
  await update(reader, { ...raceResult, updatedAt: Date.now() }, raceResult, beforeRace + 3);
  assert.equal(reader.replica.pendingCount, 0);
  assert.deepEqual(reader.stats(), requestsBeforeNoop);
  third.close();

  const beforeGroup = (await phoneChannel.status()).head;
  const folderTree = [...tree, { path: 'Projects', name: 'Projects', description: '' }];
  const original = author.local.get(id);
  const moved = { ...original, folder: 'Projects' };
  author.ignoreReply();
  await author.replica.recordFolderGroup([{ id, kind: 'update', item: moved, previous: original }], folderTree, tree);
  await until(() => author.replica.pendingCount === 0 && reader.saved().cursor === beforeGroup + 2);
  assert.deepEqual(author.attempts.at(-1), author.attempts.at(-2));
  assert.deepEqual(reader.groups, [{ notes: [{ id, item: moved, revision: beforeGroup + 1 }], tree: folderTree }]);
  assert.deepEqual(author.local.get(id), moved);
  assert.deepEqual(author.folders(), folderTree);
  const accepted = await phoneChannel.events(generation, beforeGroup);
  assert.deepEqual(accepted.events.map(({ group }) => group.index), [0, 1]);
  assert.equal(accepted.head, beforeGroup + 2);
  author.ignoreReply(false);
  await author.replica.catchUp();
  const staleGroup = author.attempts.at(-1);
  const groupId = crypto.randomUUID();
  const staleMove = await sealNote(keys, room, generation, { noteId: staleGroup[0].noteId, opId: groupId,
    baseRevision: staleGroup[0].baseRevision, kind: 'update', group: { id: groupId, index: 0, size: 2 } }, id, original);
  const undoTree = await sealFolderTree(keys, room, generation, { noteId: seed.noteId, opId: crypto.randomUUID(),
    baseRevision: accepted.head, kind: 'update', group: { id: groupId, index: 1, size: 2 } }, tree);
  const rejected = await phoneChannel.send(generation, 'stale-group', [staleMove, undoTree], accepted.head);
  assert.deepEqual(rejected.results.map(({ status }) => status), ['stale', 'rejected']);
  assert.equal(rejected.results[1].code, 'note_group_aborted');
  const after = await phoneChannel.events(generation, accepted.head);
  assert.equal(after.head, accepted.head);
  assert.deepEqual(after.events, []);
  const asset = new TextEncoder().encode('temporary relay attachment fixture');
  const assetNoteId = 'media-fixture';
  const attachment = { id: 'asset', name: 'asset', type: 'file', mimeType: 'application/octet-stream', relativePath: '.attachments/asset', size: asset.length };
  const assetNote = { ...original, id: assetNoteId, attachments: [attachment] };
  async function mediaDevice(i, readOnly, initial, scope = stop.signal) {
    let stored = initial;
    let record;
    let blob;
    let applied;
    const errors = [];
    const session = await openNoteSession({ key, signal: scope, roomId: room, vaultId: vault, serverUrl: url, readOnly,
      headers: (json) => ({ Authorization: `Bearer ${tokens[i]}`, ...(json && { 'Content-Type': 'application/json' }) }),
      migrateLegacy: async () => {}, sendLive: () => false, onError: (error) => errors.push(error), onProgress: () => {}, onApplied: () => {},
      port: { getCurrentVault: () => ({ id: vault }), isHydrated: () => true, readNoteRegistry: async () => stored,
        writeNoteRegistry: async (value) => { stored = value; }, subscribeNoteIntents: (listener) => { record = listener; return () => {}; },
        subscribeFolderTreeIntents: () => () => {}, applyAcceptedFolderTree: async () => {}, applyAcceptedFolderGroup: async () => {},
        readRegistryAttachment: async (requested) => { assert.equal(readOnly, false); assert.deepEqual(requested, attachment); return asset; },
        writeAcceptedAttachment: async (selected, bytes) => { assert.deepEqual(bytes, asset); blob = selected.registryBlobId; },
        applyAcceptedNote: async ({ id, item }) => {
          if (id === assetNoteId) {
            assert.ok(blob);
            assert.equal(item.attachments[0].registryBlobId, blob);
            applied = item;
          }
        },
      },
    });
    assert.equal(session.registryMedia, true);
    await session.verifyEnrollment(readOnly);
    await session.replica.catchUp();
    return { session, record, stored: () => stored, applied: () => applied, errors };
  }
  const writerScope = new AbortController();
  const firstWriter = await mediaDevice(2, false, undefined, AbortSignal.any([stop.signal, writerScope.signal]));
  const fetchReal = globalThis.fetch;
  const mediaPuts = [];
  let mediaWriter;
  try {
    globalThis.fetch = async (url, init) => {
      const response = await fetchReal(url, init);
      if (init?.method === 'PUT' && new URL(url).pathname.endsWith('/note-media')) {
        assert.equal(response.status, 200);
        mediaPuts.push({ id: new URL(url).searchParams.get('id'), body: init.body });
        if (mediaPuts.length === 1) writerScope.abort();
      }
      return response;
    };
    await firstWriter.record([{ id: assetNoteId, kind: 'create', item: assetNote }]);
    await until(() => writerScope.signal.aborted);
    assert.equal(firstWriter.stored().journal.pending[0].attempt, undefined);
    assert.equal((await phoneChannel.events(generation, accepted.head)).head, accepted.head);
    mediaWriter = await mediaDevice(2, false, structuredClone(firstWriter.stored()));
    await until(() => mediaWriter.applied() || mediaWriter.errors.length);
    assert.deepEqual(mediaWriter.errors, []);
    assert.equal(mediaPuts.length, 2);
    assert.deepEqual(mediaPuts[1], mediaPuts[0]);
    assert.equal(mediaPuts[0].id, (await sealRegistryMedia(keys, room, generation, asset)).id);
  } finally {
    globalThis.fetch = fetchReal;
  }
  const mediaReader = await mediaDevice(1, true);
  assert.deepEqual(mediaReader.applied(), mediaWriter.applied());
  const mediaFeed = await phoneChannel.events(generation, accepted.head);
  assert.deepEqual(mediaFeed.events[0].mediaIds, [mediaReader.applied().attachments[0].registryBlobId]);
  assert.equal(mediaReader.stored().journal.cursor, mediaFeed.head);
  // Two independently authenticated senders start from one reviewed cursor. Whichever
  // transaction lands second must lose even though its individual records are untouched.
  const authorChannel = new NoteChannel({ serverUrl: url, roomId: room, vaultId: vault, signal: stop.signal, atomicGroups: true, registryMedia: true,
    headers: (json) => ({ Authorization: `Bearer ${tokens[0]}`, ...(json && { 'Content-Type': 'application/json' }) }) });
  const raceHead = mediaFeed.head;
  const raceGroupId = crypto.randomUUID();
  const cascade = [
    await sealNote(keys, room, generation, { noteId: staleGroup[0].noteId, opId: raceGroupId,
      baseRevision: accepted.head - 1, kind: 'update', group: { id: raceGroupId, index: 0, size: 2 } }, id, original),
    await sealFolderTree(keys, room, generation, { noteId: seed.noteId, opId: crypto.randomUUID(),
      baseRevision: accepted.head, kind: 'update', group: { id: raceGroupId, index: 1, size: 2 } }, tree),
  ];
  const arrival = { ...note('new-in-projects', 'preserve me'), folder: 'Projects' };
  const create = await sealNote(keys, room, generation, { noteId: await opaqueNoteId(keys, arrival.id), opId: crypto.randomUUID(),
    baseRevision: 0, kind: 'create' }, arrival.id, arrival);
  const raced = await Promise.all([
    authorChannel.send(generation, 'race-cascade', cascade, raceHead),
    phoneChannel.send(generation, 'race-create', [create], raceHead),
  ]);
  const cascadeWon = raced[0].results[0].status === 'accepted';
  const winner = raced[cascadeWon ? 0 : 1];
  const raceLoser = raced[cascadeWon ? 1 : 0];
  assert.ok(winner.results.every(({ status }) => status === 'accepted'));
  assert.ok(raceLoser.results.every(({ status, code }) => status === 'rejected' && code === 'note_head_changed'));
  assert.equal((await phoneChannel.status()).head, raceHead + (cascadeWon ? 2 : 1));
  const replay = cascadeWon ? await authorChannel.send(generation, 'race-replay', cascade, raceHead)
    : await phoneChannel.send(generation, 'race-replay', [create], raceHead);
  assert.deepEqual(replay.results, winner.results);
  await Promise.all([author.replica.catchUp(), reader.replica.catchUp()]);
  const alternatives = [{ intentId: 'legacy-review-measured', noteId: id, kind: 'update', revision: 0,
    item: { ...author.local.get(id), title: 'Legacy snapshot for review' }, fields: ['legacy-cutover'], at: 1 }];
  await author.replica.preserveLegacyAlternatives(alternatives);
  assert.equal(author.replica.syncHealth, 'current');
  const measured = { ...note('roundtrip-with-review', 'delivery probe'), type: 'task', dueDate: '2026-11-24', priority: 'low' };
  const firstAt = performance.now();
  await save(author, [measured]);
  await until(() => reader.saved()?.confirmed[measured.id]?.item?.dueDate === measured.dueDate && author.replica.pendingCount === 0);
  const outboundMs = Math.round(performance.now() - firstAt);
  const measuredBase = reader.saved().confirmed[measured.id];
  const backAt = performance.now();
  await reader.replica.record([{ id: measured.id, kind: 'update', previous: measuredBase.item, origin: { revision: measuredBase.revision },
    item: { ...measuredBase.item, priority: 'high' } }]);
  await until(() => author.saved()?.confirmed[measured.id]?.item?.priority === 'high' && reader.replica.pendingCount === 0);
  const inboundMs = Math.round(performance.now() - backAt);
  assert.equal(author.local.get(measured.id).dueDate, measured.dueDate);
  assert.ok(author.replica.conflicts.some(({ intentId }) => intentId === alternatives[0].intentId));
  assert.equal(author.replica.syncHealth, 'current');
  const stats = (values) => {
    const sorted = values.toSorted((a, b) => a - b);
    const at = (p) => Math.round(sorted[Math.ceil(sorted.length * p) - 1]);
    return { p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
  };
  const settled = stats(timings);
  assert.ok(settled.p95Ms <= 1000, `loopback p95 ${settled.p95Ms}ms`);
  process.stdout.write(`${JSON.stringify({ samples: timings.length, injectedRttMs: rttMs, ...settled, appliedInMemory: stats(appliedTimings), burstMs: Math.round(burstMs), burstSize: 10, idle, offlineCatchUp: true, httpReplayWithoutDuplicate: true, roundTripWithReview: { outboundMs, inboundMs } })}\n`);
} finally {
  stop.abort();
  for (const ws of sockets) ws.close();
  for (const connection of proxyConnections) connection.destroy();
  proxy?.close();
  relay.stdin.end();
  await exit;
}
