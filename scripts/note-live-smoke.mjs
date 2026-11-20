// Two actual replicas and an authenticated Python relay, on loopback with temporary SQLite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { createServer, connect } from 'node:net';
import { NoteChannel } from '../src/lib/sync/notes/channel.ts';
import { NoteReplica } from '../src/lib/sync/notes/replica.ts';
import { deriveNoteKeys } from '../src/lib/sync/notes/wire.ts';

const relay = spawn('python', ['-u', '-c', `import asyncio, json, sys
from test_note_registry import TestNoteRegistry, ROOM, VAULT, QUOTA
async def main():
    test = TestNoteRegistry()
    await test.asyncSetUp()
    try:
        tokens = await test.setup_room()
        test.db.activate_note_room(ROOM, test.generation, [], test.account_id, QUOTA)
        print(json.dumps(dict(url=test.base, room=ROOM, vault=VAULT, generation=test.generation, tokens=tokens)), flush=True)
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
  const keys = await deriveNoteKeys(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']), room);
  async function device(i, initial, local = new Map()) {
    const controller = new AbortController();
    const signal = AbortSignal.any([stop.signal, controller.signal]);
    const channel = new NoteChannel({ serverUrl: url, roomId: room, vaultId: vault, signal,
      headers: (json) => ({ Authorization: `Bearer ${tokens[i]}`, ...(json && { 'Content-Type': 'application/json' }) }) });
    let reads = 0;
    let posts = 0;
    let pushes = 0;
    let ignoreReply = false;
    const attempts = [];
    let saved;
    const errors = [];
    const ws = new WebSocket(`${url.replace('http:', 'ws:')}/ws/${room}?${new URLSearchParams({ vault, token: tokens[i], device: `device-${i + 1}`, noteGeneration: generation, backlog: 'http' })}`);
    sockets.add(ws);
    const replica = new NoteReplica({ room, generation, keys, signal, readOnly: false, channel: {
      events: (...args) => { reads++; return channel.events(...args); }, heads: (...args) => { reads++; return channel.heads(...args); },
      send: (...args) => { posts++; attempts.push(args[2]); return channel.send(...args); },
    }, sendLive: (text) => {
      if (ws.readyState !== WebSocket.OPEN) return false;
      pushes++;
      attempts.push(JSON.parse(text).ops);
      ws.send(text);
      return true;
    },
    apply: async ({ id, item }) => local.set(id, item), save: async (state) => { saved = structuredClone(state); },
    storeConflict: async () => assert.fail('unexpected conflict'), onProgress() {}, onError: (error) => errors.push(error.message) }, initial);
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!ignoreReply && (message.type === 'note_events' || message.type === 'note_results')) replica.handleMessage(message);
    });
    await once(ws, 'open', { signal: AbortSignal.timeout(5_000) });
    await replica.catchUp();
    return { replica, local, errors, attempts, ignoreReply: (value = true) => { ignoreReply = value; },
      stats: () => ({ reads, posts, pushes }), saved: () => saved, close: () => { controller.abort(); ws.close(); } };
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
  const author = await device(0);
  let reader = await device(1);
  const timings = [];
  for (let i = 0; i < 30; i++) {
    const id = `measured-${i}`;
    const start = performance.now();
    await save(author, [note(id)]);
    await until(() => reader.local.has(id) && author.replica.pendingCount === 0);
    timings.push(performance.now() - start);
  }
  const start = performance.now();
  await save(author, Array.from({ length: 10 }, (_, i) => note(`burst-${i}`)));
  await until(() => reader.local.size === 40 && author.replica.pendingCount === 0);
  const burstMs = performance.now() - start;
  const idle = [author.stats(), reader.stats()];
  await sleep(500);
  assert.deepEqual([author.stats(), reader.stats()], idle);
  assert.deepEqual(idle, [{ reads: 1, posts: 0, pushes: 31 }, { reads: 1, posts: 0, pushes: 0 }]);
  reader.close();
  await save(author, [note('while-offline', 'missed over websocket')]);
  await until(() => author.replica.pendingCount === 0);
  reader = await device(1, reader.saved(), reader.local);
  assert.equal(reader.local.get('while-offline').content, 'missed over websocket');
  assert.equal(reader.saved().cursor, 41);
  const id = 'while-offline';
  const edited = note(id, 'updated before deletion');
  await author.replica.record([{ id, kind: 'update', item: edited }]);
  await until(() => reader.local.get(id)?.content === edited.content && author.replica.pendingCount === 0);
  await author.replica.record([{ id, kind: 'delete', item: null }]);
  await until(() => reader.local.get(id) === null && author.replica.pendingCount === 0);
  await reader.replica.record([{ id, kind: 'restore', item: edited }]);
  await until(() => author.local.get(id)?.content === edited.content && reader.replica.pendingCount === 0);
  assert.equal(reader.saved().cursor, 44);
  author.ignoreReply();
  await save(author, [note('lost-reply', 'same immutable operation over HTTP')]);
  await until(() => reader.local.has('lost-reply') && author.replica.pendingCount === 0);
  assert.equal(author.stats().posts, 1);
  assert.deepEqual(author.attempts.at(-1), author.attempts.at(-2));
  await reader.replica.catchUp();
  assert.equal(reader.saved().cursor, 45, 'a replay must not create another event');
  author.ignoreReply(false);
  await author.replica.catchUp();
  const pushesBefore = reader.stats().pushes;
  const readsBefore = reader.stats().reads + author.stats().reads;
  await save(reader, Array.from({ length: 100 }, (_, i) => note(`small-${i}`, 'small change')));
  await until(() => author.local.has('small-99') && reader.replica.pendingCount === 0);
  assert.equal(reader.stats().pushes - pushesBefore, 1);
  assert.equal(reader.stats().reads + author.stats().reads, readsBefore);
  assert.deepEqual([...author.errors, ...reader.errors], []);
  const p95Ms = Math.round(timings.sort((a, b) => a - b)[Math.ceil(timings.length * 0.95) - 1]);
  assert.ok(p95Ms <= 1000, `loopback p95 ${p95Ms}ms`);
  process.stdout.write(`${JSON.stringify({ samples: timings.length, injectedRttMs: rttMs, p95Ms, burstMs: Math.round(burstMs), burstSize: 10, idle, offlineCatchUp: true, httpReplayWithoutDuplicate: true })}\n`);
} finally {
  stop.abort();
  for (const ws of sockets) ws.close();
  for (const connection of proxyConnections) connection.destroy();
  proxy?.close();
  relay.stdin.end();
  await exit;
}
