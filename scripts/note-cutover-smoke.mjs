// Test-only cutover using an ephemeral relay database and synthetic snapshots. Loopback only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openRegistryMedia } from '../src/lib/sync/notes/mediaWire.ts';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sharedRegistryId } from '../src/lib/sync/notes/sharedBody.ts';
import { deriveNoteKeys, openAnyRegistryBody, openNote, openRegistryBody, sealFolderTree, sealNote } from '../src/lib/sync/notes/wire.ts';

const relay = resolve(process.argv[2] ?? '../slag-relay/.worktrees/note-registry');
const dir = await mkdtemp(join(tmpdir(), 'slag-cutover-'));
const db = join(dir, 'staging.db');
const room = 'isolated-staging';
const python = (args) => JSON.parse(execFileSync('python', args, { cwd: relay, encoding: 'utf8' }));
const admin = (action, ...args) => python(['note_registry_admin.py', '--db', db, '--room', room, action, ...args]);
const node = (args) => JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
const note = (id) => ({ id, type: 'note', title: id, content: 'fixture', folder: 'Inbox', createdAt: 1, updatedAt: 1, tags: [], attachments: [] });
try {
  python(['-c', `import json, sys, asyncio
from test_note_registry import TestNoteRegistry, VAULT
from store import RelayDatabase
async def create():
    test = TestNoteRegistry()
    await test.asyncSetUp()
    try:
        _, _ = await test.setup_room()
        db = RelayDatabase(sys.argv[1])
        test.db.conn.backup(db.conn)
        db.touch_room(sys.argv[2], VAULT)
        db.conn.close()
        print('{}')
    finally:
        await test.asyncTearDown()
asyncio.run(create())`, db, room]);
  assert.equal(admin('status').mode, 'legacy');
  const { generation, mode } = admin('freeze');
  assert.equal(mode, 'frozen');
  const snaps = ['pc', 'laptop'].map((name) => join(dir, `${name}.json`));
  const noteCopies = Array.from({ length: 11 }, (_, i) => note(`stale-${i}`));
  const bytes = Buffer.from('synthetic attachment');
  const file = { id: 'fixture-attachment', name: 'fixture.bin', size: bytes.length, type: 'file', mimeType: 'application/octet-stream', relativePath: '.attachments/fixture.bin' };
  const source = { ...note('shared'), attachments: [file] };
  const archiveOnly = note('local-archive');
  await writeFile(join(dir, file.name), bytes);
  await writeFile(snaps[0], JSON.stringify({ deviceId: 'pc', hydrated: true, pendingIds: [], tombstones: [], live: [source, ...noteCopies], trash: [] }));
  await writeFile(snaps[1], JSON.stringify({ deviceId: 'laptop', hydrated: true, pendingIds: [], tombstones: noteCopies.map(({ id }) => id), live: [source], trash: [...noteCopies, archiveOnly] }));
  const command = ['scripts/note-bootstrap.mjs', '--devices', 'pc,laptop', '--room', room, '--generation', String(generation), ...snaps];
  const ledgerPath = join(dir, 'review.json');
  assert.throws(() => node([...command, '--review', ledgerPath]), (err) => err.status === 2 &&
    JSON.parse(err.stdout).blockers.review_restore_provenance === 11 && JSON.parse(err.stdout).blockers.unproven_deletion === 1);
  assert.equal(admin('status').mode, 'frozen');
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.equal(ledger.blockers.length, 12);
  // The fixture defines these copies as stale; never edit the input snapshots to resolve this.
  ledger.decisions = noteCopies.map(({ id }) => ({ id, action: 'delete', evidence: 'fixture: explicit delete and no restore' }));
  ledger.decisions.push({ id: archiveOnly.id, action: 'archive', evidence: 'fixture: only in archived trash; keep bytes in original backup' });
  await writeFile(ledgerPath, JSON.stringify(ledger));
  assert.throws(() => node([...command, '--generation', String(generation + 1), '--decisions', ledgerPath]), (err) => err.status === 1 && /different snapshot or room generation/.test(err.stderr));
  const secret = join(dir, 'key.b64');
  const seed = join(dir, 'seed.json');
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await writeFile(secret, Buffer.from(await crypto.subtle.exportKey('raw', vaultKey)).toString('base64'), { mode: 0o600 });
  const folderFile = join(dir, 'reviewed-folders.json');
  const folders = [{ name: 'Inbox', path: 'Inbox', description: '', order: 0 }];
  await writeFile(folderFile, JSON.stringify(folders));
  const sharedFile = join(dir, 'reviewed-shared.json');
  const records = [
    { id: sharedRegistryId('workspace', 'aiPrompt'), shared: '' },
    { id: sharedRegistryId('memory', 'deleted-fact'), shared: null },
    { id: sharedRegistryId('fullscreen', 'shared'), shared: { itemId: 'shared', title: 'Editor draft', content: 'draft with a copy of the same file', folder: 'Inbox', type: 'task', reminder: '2026-11-21T13:00:00Z', tags: [], attachments: [file], updatedAt: 1 } },
  ];
  await writeFile(sharedFile, JSON.stringify({ snapshot: ledger.snapshot, evidence: 'synthetic fixture', records }));
  const mediaFile = join(dir, 'reviewed-media.json');
  const mediaReview = { snapshot: ledger.snapshot, evidence: 'synthetic fixture', files: [{ id: file.id, path: file.name, sha256: '0'.repeat(64) }] };
  const seedCommand = [...command, '--decisions', ledgerPath, '--key-file', secret, '--out', seed,
    '--reviewed-folders', folderFile, '--reviewed-shared', sharedFile, '--reviewed-media', mediaFile];
  await writeFile(mediaFile, JSON.stringify(mediaReview));
  assert.throws(() => node(seedCommand), (err) => /bytes differ from review/.test(err.stderr));
  mediaReview.files[0].sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(mediaFile, JSON.stringify(mediaReview));
  const report = node(seedCommand);
  const { folderTreeId } = JSON.parse(await readFile(seed, 'utf8'));
  assert.match(folderTreeId, /^[0-9a-f]{64}$/);
  assert.deepEqual(report, { devices: 2, candidates: 12, blockers: {} });
  const windowsSeed = join(dir, 'windows-seed.json');
  await writeFile(windowsSeed, '\uFEFF' + await readFile(seed, 'utf8'));
  assert.throws(() => admin('activate', '--seed', windowsSeed, '--confirm-room', room), (err) => err.status === 2 && /capability must match/.test(err.stderr));
  assert.equal(admin('status').mode, 'frozen');
  assert.deepEqual(admin('activate', '--seed', windowsSeed, '--confirm-room', room, '--atomic-groups', '--shared-records', '--registry-media'), { mode: 'registry', generation, head: 16, floor: 16, folderTree: true, atomicGroups: true, sharedRecords: true, registryMedia: true });
  const page = python(['-c', 'import json, sys; from store import RelayDatabase; print(json.dumps(RelayDatabase(sys.argv[1]).note_heads(sys.argv[2], int(sys.argv[3]), "", 0, 16, 2000000, folder_tree=True, groups=True, shared=True, media=True)))', db, room, String(generation)]);
  const keys = await deriveNoteKeys(vaultKey, room);
  const tree = page.heads.find(({ noteId }) => noteId === folderTreeId);
  assert.deepEqual((await openRegistryBody(keys, room, generation, tree)).folders, folders);
  const bodies = await Promise.all(page.heads.map((entry) => openAnyRegistryBody(keys, room, generation, entry)));
  const draft = bodies.find(({ id }) => id === records[2].id);
  records[2].shared.attachments = [{ ...file, registryBlobId: draft.shared.attachments[0].registryBlobId }];
  assert.deepEqual(bodies.filter((body) => 'shared' in body).sort((a, b) => a.id.localeCompare(b.id)), [...records].sort((a, b) => a.id.localeCompare(b.id)));
  const noteHeads = page.heads.filter((_, index) => 'item' in bodies[index]);
  const opened = await Promise.all(noteHeads.map((entry) => openNote(keys, room, generation, entry)));
  assert.equal(opened.filter(({ item }) => item).length, 1);
  assert.equal(opened.filter(({ item }) => !item).length, 11);
  const blob = opened.find(({ id }) => id === 'shared').item.attachments[0].registryBlobId;
  assert.equal(blob, draft.shared.attachments[0].registryBlobId);
  assert.equal(JSON.parse(await readFile(seed, 'utf8')).media.length, 1);
  const stored = python(['-c', 'import base64, json, sys; from store import RelayDatabase; print(json.dumps(base64.b64encode(RelayDatabase(sys.argv[1]).get_note_media(sys.argv[2], int(sys.argv[3]), sys.argv[4])).decode()))', db, room, String(generation), blob]);
  assert.deepEqual(Buffer.from(await openRegistryMedia(keys, room, generation, blob, Buffer.from(stored, 'base64'))), bytes);
  // Start fresh processes against the activated DB: prove CAS and immutable replay survive reopen.
  const shared = noteHeads[opened.findIndex(({ id }) => id === 'shared')];
  const edit = await sealNote(keys, room, generation, { noteId: shared.noteId, opId: crypto.randomUUID(),
    baseRevision: shared.revision, kind: 'update' }, 'shared', { ...note('shared'), content: 'after restart' });
  const submit = (op, observedHead, sender = 'device-1') => python(['-c', `import json, sys
from store import RelayDatabase
db = RelayDatabase(sys.argv[1])
owner = db.conn.execute('SELECT owner_account_id FROM vaults JOIN rooms ON vaults.id = rooms.vault_id WHERE room_id = ?', (sys.argv[2],)).fetchone()[0]
print(json.dumps(db.commit_note_ops(sys.argv[2], int(sys.argv[3]), sys.argv[5], owner, 20000000, json.loads(sys.argv[4]), folder_tree=True, groups=True, shared=True, media=True, observed_head=int(sys.argv[6]))))`, db, room, String(generation), JSON.stringify([op].flat()), sender, String(observedHead)]);
  const [accepted, events] = submit(edit, 16);
  assert.deepEqual(accepted, [{ opId: edit.opId, status: 'accepted', revision: 17 }]);
  assert.equal((await openNote(keys, room, generation, events[0])).item.content, 'after restart');
  assert.deepEqual(submit(edit, 16), [accepted, []]);
  const transition = (kind, baseRevision, item) => sealNote(keys, room, generation,
    { noteId: shared.noteId, opId: crypto.randomUUID(), kind, baseRevision }, 'shared', item);
  const stale = await transition('update', 17, { ...note('shared'), content: 'offline copy' });
  const deleted = await transition('delete', 17, null);
  assert.equal(submit(deleted, 17)[0][0].revision, 18);
  // Every submit reopens the same database in a new process.
  assert.equal(submit(stale, 17, 'device-2')[0][0].code, 'note_head_changed');
  const [[rejected], unexpected] = submit(stale, 18, 'device-2');
  assert.equal(rejected.status, 'stale');
  assert.equal(rejected.current.kind, 'delete');
  assert.deepEqual(unexpected, []);
  assert.deepEqual(admin('status'), { mode: 'registry', generation, head: 18, floor: 16, folderTree: true, atomicGroups: true, sharedRecords: true, registryMedia: true });
  const restored = await transition('restore', 18, note('shared'));
  assert.equal(submit(restored, 18)[0][0].revision, 19);
  const id = crypto.randomUUID();
  const moved = await sealNote(keys, room, generation, { noteId: shared.noteId, opId: id,
    kind: 'update', baseRevision: 19, group: { id, index: 0, size: 2 } }, 'shared', { ...note('shared'), folder: 'Work' });
  const reordered = await sealFolderTree(keys, room, generation, { noteId: folderTreeId, opId: crypto.randomUUID(),
    kind: 'update', baseRevision: tree.revision, group: { id, index: 1, size: 2 } }, [...folders, { name: 'Work', path: 'Work', description: '', order: 1 }]);
  const group = [moved, reordered];
  const [folderReceipt, folderEvents] = submit(group, 19);
  assert.deepEqual(folderReceipt.map(({ revision }) => revision), [20, 21]);
  assert.equal((await openNote(keys, room, generation, folderEvents[0])).item.folder, 'Work');
  assert.equal((await openRegistryBody(keys, room, generation, folderEvents[1])).folders[1].path, 'Work');
  assert.deepEqual(submit(group, 19), [folderReceipt, []]);
  process.stdout.write('isolated cutover: reviewed folders, shared records, notes and encrypted media activated together; 11 ambiguous copies blocked; archive-only copy excluded without tombstone; folder and note receipts survived reopening SQLite; explicit deletion, stale rejection and restore verified\n');
} finally {
  await rm(dir, { recursive: true, force: true });
}
