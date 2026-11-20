// Offline tool: never prints note text or the mnemonic; never requests a relay endpoint.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { planBootstrap, sealBootstrap } from '../src/lib/sync/notes/bootstrap.ts';
import { deriveNoteKeys, isNoteItem } from '../src/lib/sync/notes/wire.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  devices: { type: 'string' }, room: { type: 'string' }, generation: { type: 'string' },
  'key-file': { type: 'string' }, out: { type: 'string' },
} });
const generation = Number(values.generation);
if (!values.devices || !positionals.length) throw new Error('Usage: node scripts/note-bootstrap.mjs --devices device1,device2 snapshot1.json snapshot2.json');
const required = values.devices.split(',').map((id) => id.trim());
if (required.includes('') || new Set(required).size !== required.length) throw new Error('Invalid required devices list');
const copies = await Promise.all(positionals.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
for (const copy of copies) {
  if (!copy || typeof copy.deviceId !== 'string' || !copy.deviceId || typeof copy.hydrated !== 'boolean'
    || !Array.isArray(copy.pendingIds) || !copy.pendingIds.every((id) => typeof id === 'string' && id)
    || !Array.isArray(copy.tombstones) || !copy.tombstones.every((id) => typeof id === 'string' && id)
    || !Array.isArray(copy.live) || !copy.live.every(isNoteItem) || !Array.isArray(copy.trash) || !copy.trash.every(isNoteItem)) {
    throw new Error('Invalid device snapshot');
  }
}
const plan = planBootstrap(required, copies);
const reasons = {};
for (const { reason } of plan.blockers) reasons[reason] = (reasons[reason] ?? 0) + 1;
process.stdout.write(`${JSON.stringify({ devices: copies.length, candidates: plan.candidates.size, blockers: reasons })}\n`);
if (plan.blockers.length) process.exitCode = 2;
else if (values.out) {
  if (!values.room || !values['key-file'] || !Number.isSafeInteger(generation) || generation <= 0) throw new Error('Sealing requires --room, --generation and --key-file');
  const keyBytes = Buffer.from((await readFile(values['key-file'], 'utf8')).trim(), 'base64');
  if (keyBytes.length !== 32) throw new Error('Expected 32-byte room vault key in base64');
  const vaultKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(vaultKey, values.room);
  const ops = await sealBootstrap(keys, values.room, generation, plan);
  await writeFile(values.out, JSON.stringify({ room: values.room, generation, ops }), { flag: 'wx', mode: 0o600 });
}
