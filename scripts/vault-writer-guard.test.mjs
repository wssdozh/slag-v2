// The two headless writers are not allowed to race the app's durable store, and their own writes
// must not truncate a note. This file drives both conclusions against isolated temp directories:
// the guard/durable helpers directly, then McpVault and NodeVault themselves through the real
// modules (scripts/support/nodeTsHooks.mjs only teaches Node the bundler-style imports).
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import './support/nodeTsHooks.mjs';

const { enrolledMarker, enrolledMarkerSync, isEnrolledMarkerName } = await import('../src/node/vaultGuard.ts');
const { writeFileDurable, writeFileDurableSync } = await import('../src/node/durableWrite.ts');
const { McpVault } = await import('../src/mcp/vault.ts');
const { NodeVault } = await import('../src/node/vaultPort.ts');

const scratch = [];
after(async () => {
  for (const dir of scratch) await fsp.rm(dir, { recursive: true, force: true });
});

async function tempDir(label) {
  const dir = await fsp.mkdtemp(path.join(tmpdir(), `slag-${label}-`));
  scratch.push(dir);
  return dir;
}

function sensorItem(overrides = {}) {
  const now = Date.now();
  return {
    id: `note_${randomUUID()}`,
    type: 'note',
    title: 'Legacy fixture',
    content: 'Исходный текст',
    folder: 'Входящие',
    tags: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---- guard --------------------------------------------------------------------------------------

test('guard: a plain legacy directory is writable', async () => {
  const dir = await tempDir('guard-fresh');
  assert.equal(enrolledMarkerSync(dir), null);
  assert.equal(await enrolledMarker(dir), null);
});

test('guard: every enrolment, sync and recovery marker fences writes', async () => {
  const dir = await tempDir('guard-markers');
  for (const name of [
    'note-registry.json',
    'recovery-local-only.json',
    'sync-config.json',
    'sync-ledger.json',
    'recovery-note-op.json',
    'state.json.commit.json',
    'state.json.slot0-0',
    'state.json.slot0-1',
    'state.json.slot1-0',
    'state.json.slot1-1',
    'note-registry.json.commit.json',
  ]) {
    const file = path.join(dir, name);
    await fsp.writeFile(file, '{}');
    assert.equal(enrolledMarkerSync(dir), file, `${name} (sync)`);
    assert.equal(await enrolledMarker(dir), file, `${name} (async)`);
    await fsp.rm(file);
  }
});

test('guard: a plain state.json is not ownership, only its generation signals are', async () => {
  const dir = await tempDir('guard-plain-state');
  await fsp.writeFile(path.join(dir, 'state.json'), '{}');
  assert.equal(enrolledMarkerSync(dir), null);
});

test('guard: opening through the notes child still sees the vault parent', async () => {
  const dir = await tempDir('guard-parent');
  const notes = path.join(dir, 'notes');
  await fsp.mkdir(notes);
  const marker = path.join(dir, 'state.json.commit.json');
  await fsp.writeFile(marker, '{}');
  assert.equal(enrolledMarkerSync(notes), marker);
  assert.equal(await enrolledMarker(notes), marker);
});

test('guard: an unreadable root fails closed instead of passing', async () => {
  const dir = await tempDir('guard-errno');
  const notADirectory = path.join(dir, 'a-file');
  await fsp.writeFile(notADirectory, 'x');
  assert.throws(() => enrolledMarkerSync(notADirectory), /ENOTDIR|ENOENT|EACCES/);
  await assert.rejects(() => enrolledMarker(notADirectory), /ENOTDIR|ENOENT|EACCES/);
});

test('guard: marker shapes are named not guessed', () => {
  assert.equal(isEnrolledMarkerName('note-registry.json'), true);
  assert.equal(isEnrolledMarkerName('state.json.commit.json'), true);
  assert.equal(isEnrolledMarkerName('ledger.slot1-0'), true);
  assert.equal(isEnrolledMarkerName('state.json'), false);
  assert.equal(isEnrolledMarkerName('note.md'), false);
});

// ---- durable replacement ------------------------------------------------------------------------

test('durable: a replace swaps content and leaves no temp sibling', async () => {
  const dir = await tempDir('durable-replace');
  const file = path.join(dir, 'note.md');
  await fsp.writeFile(file, 'old');
  await writeFileDurable(file, 'new');
  assert.equal(await fsp.readFile(file, 'utf-8'), 'new');
  assert.deepEqual(await fsp.readdir(dir), ['note.md']);
});

test('durable: the sync path replaces bytes too', async () => {
  const dir = await tempDir('durable-sync');
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '{"old":true}');
  writeFileDurableSync(file, new TextEncoder().encode('{"new":true}'));
  assert.equal(fs.readFileSync(file, 'utf-8'), '{"new":true}');
  assert.deepEqual(fs.readdirSync(dir), ['state.json']);
});

test('durable: a failed replacement keeps the target and removes the temp file', async () => {
  const dir = await tempDir('durable-failure');
  const target = path.join(dir, 'occupied');
  await fsp.mkdir(target);
  await assert.rejects(() => writeFileDurable(target, 'x'));
  assert.deepEqual(await fsp.readdir(dir), ['occupied']);
  assert.deepEqual(await fsp.readdir(target), []);
});

// ---- MCP server ---------------------------------------------------------------------------------

test('mcp: a marker that appears while running fences writes but not reads', async () => {
  const dir = await tempDir('mcp-fence');
  // The app creates `notes/` before the server starts; without it the vault root itself is the
  // notes directory (resolveVaultConfig keeps that legacy shape).
  await fsp.mkdir(path.join(dir, 'notes'));
  const vault = new McpVault(dir);
  await vault.init();

  const created = await vault.saveNote({ title: 'legacy fixture', content: 'Исходный текст' });
  assert.equal(created.created, true);
  const noteFile = path.join(dir, 'notes', created.path);
  const before = await fsp.readFile(noteFile, 'utf-8');
  assert.equal(fs.readdirSync(path.dirname(noteFile)).some((name) => name.endsWith('.tmp')), false);

  await fsp.writeFile(path.join(dir, 'recovery-local-only.json'), '{}');
  const refused = /реестр синхронизации/;
  await assert.rejects(() => vault.saveNote({ id: created.item.id, content: 'changed' }), refused);
  await assert.rejects(() => vault.toggleTask(created.item.id), refused);
  await assert.rejects(() => vault.deleteNote(created.item.id), refused);
  await assert.rejects(() => vault.createFolder('cannot-create'), refused);
  await assert.rejects(() => vault.writeState({ folders: [] }), refused);

  // Reading is independent of ownership: the note and its card stay reachable.
  const note = await vault.getNote(created.item.id);
  assert.equal(note.item.title, 'legacy fixture');
  assert.equal(note.rawMarkdown, before);
  assert.equal(await fsp.readFile(noteFile, 'utf-8'), before, 'a refused write must not touch the file');
  assert.equal((await vault.getStats()).totalItems, 1);
});

test('mcp: init does not recreate directories in an enrolled vault', async () => {
  const dir = await tempDir('mcp-enrolled');
  await fsp.writeFile(path.join(dir, 'note-registry.json'), '{}');
  const vault = new McpVault(dir);
  await vault.init();
  assert.equal(fs.existsSync(path.join(dir, 'notes')), false);
  assert.deepEqual(await fsp.readdir(dir), ['note-registry.json']);
});

test('mcp: a note save replaces its file instead of truncating it', async () => {
  const dir = await tempDir('mcp-note-save');
  await fsp.mkdir(path.join(dir, 'notes'));
  const vault = new McpVault(dir);
  await vault.init();
  const created = await vault.saveNote({ title: 'fixture', content: 'первая строка' });
  await vault.saveNote({ id: created.item.id, content: 'вторая строка' });
  const note = await vault.getNote(created.item.id);
  assert.match(note.rawMarkdown, /вторая строка/);
  const folder = path.join(dir, 'notes');
  assert.deepEqual(fs.readdirSync(folder).filter((name) => name.endsWith('.tmp')), []);
});

// ---- headless node ------------------------------------------------------------------------------

test('node: the headless vault refuses an enrolled vault and its parent marker', async () => {
  const dir = await tempDir('node-fence');
  const vault = new NodeVault(dir);
  vault.load();
  const item = sensorItem();
  await vault.importSyncedVaultData({ items: [item] });
  const [file] = fs.readdirSync(path.join(dir, 'notes'));
  assert.equal(fs.readFileSync(path.join(dir, 'notes', file), 'utf-8').includes('Исходный текст'), true);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'notes')).filter((name) => name.endsWith('.tmp')), []);

  await fsp.writeFile(path.join(dir, 'state.json.slot1-1'), '{}');
  const refused = /cannot open an enrolled note registry vault/;
  assert.throws(() => vault.saveMemory([{ id: 'm1', content: 'x' }]), refused);
  await assert.rejects(() => vault.importSyncedVaultData({ items: [] }), refused);
  assert.throws(() => vault.moveToTrash(item.id), refused);
  assert.throws(() => new NodeVault(path.join(dir, 'notes')).load(), refused);
  assert.equal(fs.existsSync(path.join(dir, 'notes', file)), true, 'a refused write must not remove the note');
});
