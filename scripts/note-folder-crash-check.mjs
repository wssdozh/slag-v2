// Read-only evidence for the Windows staging crash/restart run. Never point at a working vault.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';

const { values, positionals: ids } = parseArgs({ allowPositionals: true, options: {
  run: { type: 'string' }, room: { type: 'string' }, vault: { type: 'string', default: 'main' },
  phase: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' }, head: { type: 'string' },
} });
const { run, room, vault, phase, source, target } = values;
const head = Number(values.head);
assert.equal(process.platform, 'win32');
assert.ok(process.env.APPDATA, 'Windows AppData is required');
assert.match(run ?? '', /^\d+$/);
assert.match(room ?? '', /^room_[a-f0-9]{32}$/);
assert.match(vault, /^(main|vault_[a-f0-9-]{36})$/);
assert.ok(['interrupted', 'recovered'].includes(phase), 'pass --phase interrupted|recovered');
assert.ok(Number.isSafeInteger(head) && head >= 3, 'pass the revision of the group’s final tree');
for (const folder of [source, target]) assert.match(folder ?? '', /^[\p{L}\p{N} _-]+$/u);
assert.notEqual(source, target);
assert.equal(ids.length, 2, 'pass the two fixture note IDs, in write order');
assert.equal(new Set(ids).size, 2);
assert.ok(ids.every((id) => /^[\w-]+$/.test(id)));
const dir = join(process.env.APPDATA, `com.slag.notes.staging.r${run}`, 'vaults', vault);
const json = async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'));
const registration = await json('note-registry.json');
assert.equal(registration.room, room);
assert.equal(registration.atomicGroups, true);
const { journal } = registration;
assert.equal(journal.pending.length, 0, 'use a receiving staging profile with no local edits');
assert.equal(journal.cursor, phase === 'interrupted' ? head - 3 : head);
const { pendingFolderProjection = {}, folders } = await json('state.json');
assert.deepEqual(Object.keys(pendingFolderProjection).sort(), phase === 'interrupted' ? [...ids].sort() : []);
assert.equal(folders.some(({ path }) => path === source), phase === 'interrupted');
const copies = new Map(ids.map((id) => [id, []]));
async function scan(relative = '') {
  for (const entry of await readdir(join(dir, 'notes', relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(relative, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      const text = await readFile(join(dir, 'notes', path), 'utf8');
      const header = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      if (!header) continue;
      const id = parse(header[1])?.id;
      copies.get(id)?.push(relative);
    }
  }
}
await scan();
for (const [index, id] of ids.entries()) {
  assert.deepEqual(copies.get(id), [phase === 'interrupted' && index === 1 ? source : target], `physical copies of ${id}`);
  assert.equal(journal.confirmed[id]?.item?.folder, phase === 'interrupted' ? source : target, `journal folder of ${id}`);
}
process.stdout.write(`${JSON.stringify({ phase, room, cursor: journal.cursor, fenced: Object.keys(pendingFolderProjection), copies: Object.fromEntries(copies) })}\n`);
