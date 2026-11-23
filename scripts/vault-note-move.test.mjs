// The recovery contract of a local note move, checked without a filesystem: the intent file, the
// digest checks that decide whether the source may leave, and the "stop with evidence" paths.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VAULT_NOTE_MOVE_INTENT_FILE,
  VAULT_NOTE_MOVE_VERSION,
  performVaultNoteMove,
  resumeVaultNoteMove,
} from '../src/lib/storage/vaultNoteMove.ts';

const encoder = new TextEncoder();

async function sha256(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function memoryIo(files = {}) {
  const store = new Map(Object.entries(files));
  return {
    store,
    async readText(path) {
      return store.has(path) ? store.get(path) : null;
    },
    async writeText(path, text) {
      store.set(path, text);
    },
    async removeFile(path) {
      if (!store.has(path)) throw new Error(`missing file ${path}`);
      store.delete(path);
    },
  };
}

/** The intent a crash would leave behind, written by the same shape `perform` uses. */
async function stagedIntent({ from, to, source, markdown, noteId = 'note-1', opId = 'op-1', withMarkdown = true }) {
  return JSON.stringify({
    version: VAULT_NOTE_MOVE_VERSION,
    opId,
    noteId,
    from,
    fromDigest: await sha256(source),
    to,
    toDigest: await sha256(markdown),
    ...(withMarkdown ? { newMarkdown: markdown } : {}),
    createdAt: '2026-11-23T00:00:00.000Z',
  }, null, 2);
}

const FROM = 'notes/Inbox/Old title.md';
const TO = 'notes/Projects/New title.md';

test('move: new bytes land, source leaves, intent ends as the terminal marker', async () => {
  const io = memoryIo({ [FROM]: 'old body' });
  const result = await performVaultNoteMove(io, { noteId: 'note-1', from: FROM, to: TO, markdown: 'new body' });

  assert.equal(result.status, 'completed');
  assert.equal(io.store.get(TO), 'new body');
  assert.equal(io.store.has(FROM), false);
  assert.equal(io.store.get(VAULT_NOTE_MOVE_INTENT_FILE), 'null');
});

test('move: replaying the same request after success is completed, not blocked', async () => {
  const io = memoryIo({ [FROM]: 'old body' });
  const request = { noteId: 'note-1', from: FROM, to: TO, markdown: 'new body' };
  assert.equal((await performVaultNoteMove(io, request)).status, 'completed');
  const replay = await performVaultNoteMove(io, request);
  assert.equal(replay.status, 'completed');
  assert.equal(io.store.get(TO), 'new body');
});

test('resume: crash after staging, before the target was written', async () => {
  const io = memoryIo({
    [FROM]: 'old body',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body' }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'completed');
  assert.equal(result.opId, 'op-1');
  assert.equal(io.store.get(TO), 'new body');
  assert.equal(io.store.has(FROM), false);
  assert.equal(io.store.get(VAULT_NOTE_MOVE_INTENT_FILE), 'null');
});

test('resume: crash after the target became durable, before the source was removed', async () => {
  const io = memoryIo({
    [FROM]: 'old body',
    [TO]: 'new body',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body' }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'completed');
  assert.equal(io.store.has(FROM), false);
  assert.equal(io.store.get(TO), 'new body');
  assert.equal(io.store.get(VAULT_NOTE_MOVE_INTENT_FILE), 'null');
});

test('resume: source edited while the app was down keeps the edit and writes nothing', async () => {
  const io = memoryIo({
    [FROM]: 'edited by a person',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body' }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'source-changed');
  assert.equal(io.store.get(FROM), 'edited by a person');
  assert.equal(io.store.has(TO), false);
  assert.match(io.store.get(VAULT_NOTE_MOVE_INTENT_FILE), /"opId"/, 'intent is kept as evidence');
});

test('resume: source edited after the target was durable keeps both files', async () => {
  const io = memoryIo({
    [FROM]: 'edited by a person',
    [TO]: 'new body',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body' }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'source-changed');
  assert.equal(io.store.get(FROM), 'edited by a person');
  assert.equal(io.store.get(TO), 'new body');
});

test('resume: a target occupied by other content is never overwritten', async () => {
  const io = memoryIo({
    [FROM]: 'old body',
    [TO]: 'a different note',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body' }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'target-occupied');
  assert.equal(io.store.get(TO), 'a different note');
  assert.equal(io.store.get(FROM), 'old body');
});

test('resume: both paths gone is a missing source, not a quiet success', async () => {
  const io = memoryIo({
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body' }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'source-missing');
});

test('resume: a staged rename without Markdown cannot recreate a missing target', async () => {
  const io = memoryIo({
    [FROM]: 'old body',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body', withMarkdown: false }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'target-missing');
  assert.equal(io.store.get(FROM), 'old body');
});

test('resume: unreadable intent is reported untouched', async () => {
  const raw = '{"version":1,broken';
  const io = memoryIo({ [VAULT_NOTE_MOVE_INTENT_FILE]: raw });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'invalid-intent');
  assert.equal(io.store.get(VAULT_NOTE_MOVE_INTENT_FILE), raw);
});

test('resume: an intent pointing outside notes/ is refused before any file is touched', async () => {
  const io = memoryIo({
    'state.json': '{"notes":[]}',
    [VAULT_NOTE_MOVE_INTENT_FILE]: await stagedIntent({
      from: 'state.json',
      to: TO,
      source: '{"notes":[]}',
      markdown: 'new body',
    }),
  });
  const result = await resumeVaultNoteMove(io);

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'invalid-paths');
  assert.equal(io.store.get('state.json'), '{"notes":[]}');
});

test('resume: no intent at all is idle', async () => {
  const io = memoryIo();
  assert.deepEqual(await resumeVaultNoteMove(io), { status: 'idle' });
});

test('move: unsafe request paths are rejected without writing the intent', async () => {
  const io = memoryIo({ [FROM]: 'old body' });
  const result = await performVaultNoteMove(io, { noteId: 'note-1', from: FROM, to: '../escape.md', markdown: 'new body' });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'invalid-paths');
  assert.equal(io.store.has(VAULT_NOTE_MOVE_INTENT_FILE), false);
  assert.equal(io.store.get(FROM), 'old body');
});

test('move: an unfinished move of another note is left alone', async () => {
  const pending = await stagedIntent({ from: FROM, to: TO, source: 'old body', markdown: 'new body', noteId: 'other-note' });
  const io = memoryIo({ [FROM]: 'old body', [VAULT_NOTE_MOVE_INTENT_FILE]: pending });
  const result = await performVaultNoteMove(io, {
    noteId: 'note-1',
    from: 'notes/Inbox/Another.md',
    to: 'notes/Projects/Another.md',
    markdown: 'x',
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'pending-intent');
  assert.equal(io.store.get(VAULT_NOTE_MOVE_INTENT_FILE), pending);
});
