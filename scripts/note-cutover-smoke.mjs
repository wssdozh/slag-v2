// Test-only cutover using an ephemeral relay database and synthetic snapshots. Loopback only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deriveNoteKeys, openNote } from '../src/lib/sync/notes/wire.ts';

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
  await writeFile(snaps[0], JSON.stringify({ deviceId: 'pc', hydrated: true, pendingIds: [], tombstones: [], live: [note('shared'), ...noteCopies], trash: [] }));
  await writeFile(snaps[1], JSON.stringify({ deviceId: 'laptop', hydrated: true, pendingIds: [], tombstones: noteCopies.map(({ id }) => id), live: [note('shared')], trash: noteCopies }));
  const command = ['scripts/note-bootstrap.mjs', '--devices', 'pc,laptop', '--room', room, '--generation', String(generation), ...snaps];
  const ledgerPath = join(dir, 'review.json');
  assert.throws(() => node([...command, '--review', ledgerPath]), (err) => err.status === 2 && JSON.parse(err.stdout).blockers.review_restore_provenance === 11);
  assert.equal(admin('status').mode, 'frozen');
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.equal(ledger.blockers.length, 11);
  // The fixture defines these copies as stale; never edit the input snapshots to resolve this.
  ledger.decisions = noteCopies.map(({ id }) => ({ id, action: 'delete', evidence: 'fixture: explicit delete and no restore' }));
  await writeFile(ledgerPath, JSON.stringify(ledger));
  assert.throws(() => node([...command, '--generation', String(generation + 1), '--decisions', ledgerPath]), (err) => err.status === 1 && /different snapshot or room generation/.test(err.stderr));
  const secret = join(dir, 'key.b64');
  const seed = join(dir, 'seed.json');
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await writeFile(secret, Buffer.from(await crypto.subtle.exportKey('raw', vaultKey)).toString('base64'), { mode: 0o600 });
  const report = node([...command, '--decisions', ledgerPath, '--key-file', secret, '--out', seed]);
  assert.deepEqual(report, { devices: 2, candidates: 12, blockers: {} });
  assert.deepEqual(admin('activate', '--seed', seed, '--confirm-room', room), { mode: 'registry', generation, head: 12, floor: 12 });
  const page = python(['-c', 'import json, sys; from store import RelayDatabase; print(json.dumps(RelayDatabase(sys.argv[1]).note_heads(sys.argv[2], int(sys.argv[3]), "", 0, 12, 2000000)))', db, room, String(generation)]);
  const keys = await deriveNoteKeys(vaultKey, room);
  const opened = await Promise.all(page.heads.map((entry) => openNote(keys, room, generation, entry)));
  assert.equal(opened.filter(({ item }) => item).length, 1);
  assert.equal(opened.filter(({ item }) => !item).length, 11);
  process.stdout.write('isolated cutover: 11 ambiguous copies blocked; 1 live + 11 explicit tombstones verified after resolving the fixture\n');
} finally {
  await rm(dir, { recursive: true, force: true });
}
