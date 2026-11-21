// Offline tool: never prints note text or the mnemonic; never requests a relay endpoint.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sealRegistryMedia } from '../src/lib/sync/notes/mediaWire.ts';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { planBootstrap, sealBootstrap, sealFolderRegistrySeed } from '../src/lib/sync/notes/bootstrap.ts';
import { deriveNoteKeys, isNoteItem } from '../src/lib/sync/notes/wire.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  devices: { type: 'string' }, room: { type: 'string' }, generation: { type: 'string' },
  'key-file': { type: 'string' }, out: { type: 'string' }, review: { type: 'string' }, decisions: { type: 'string' },
  'reviewed-folders': { type: 'string' }, 'reviewed-shared': { type: 'string' }, 'reviewed-media': { type: 'string' },
} });
const generation = Number(values.generation);
if ((values['reviewed-folders'] || values['reviewed-shared'] || values['reviewed-media']) && !values.out) throw new Error('Reviewed seed input requires --out');
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
const scope = { room: values.room, generation };
if ((values.review || values.decisions || values.out) && (!scope.room || !Number.isSafeInteger(generation) || generation <= 0)) {
  throw new Error('Review and sealing require the frozen --room and --generation');
}
const snapshot = createHash('sha256').update(JSON.stringify([scope, [...required].sort(), [...copies].sort((a, b) => a.deviceId.localeCompare(b.deviceId))])).digest('hex');
const decisions = new Map();
if (values.decisions) {
  const ledger = JSON.parse(await readFile(values.decisions, 'utf8'));
  if (ledger.snapshot !== snapshot || !Array.isArray(ledger.decisions)) throw new Error('Decisions belong to a different snapshot or room generation');
  for (const entry of ledger.decisions) {
    if (typeof entry?.id !== 'string' || !entry.id || decisions.has(entry.id) ||
        !['delete', 'keep', 'archive'].includes(entry.action) || typeof entry.evidence !== 'string' || !entry.evidence.trim()) {
      throw new Error('Each decision needs a unique ID, delete/keep/archive action and provenance');
    }
    decisions.set(entry.id, entry.action);
  }
}
const plan = planBootstrap(required, copies, decisions);
if (values.review) await writeFile(values.review, JSON.stringify({ ...scope, snapshot, blockers: plan.blockers, decisions: [] }, null, 2), { flag: 'wx', mode: 0o600 });
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
  const room = values.room;
  let reviewedShared;
  if (values['reviewed-shared']) {
    const review = JSON.parse(await readFile(values['reviewed-shared'], 'utf8'));
    if (review?.snapshot !== snapshot || typeof review.evidence !== 'string' || !review.evidence.trim() || !Array.isArray(review.records)) {
      throw new Error('Shared records require explicit review and provenance for this snapshot');
    }
    reviewedShared = review.records;
  }
  const media = new Map();
  let prepareMedia;
  let unused;
  if (values['reviewed-media']) {
    const reviewPath = values['reviewed-media'];
    const review = JSON.parse(await readFile(reviewPath, 'utf8'));
    if (review?.snapshot !== snapshot || typeof review.evidence !== 'string' || !review.evidence.trim() || !Array.isArray(review.files)) {
      throw new Error('Media requires explicit review and provenance for this snapshot');
    }
    const byId = new Map();
    for (const file of review.files) {
      if (typeof file?.id !== 'string' || !file.id || byId.has(file.id) || typeof file.path !== 'string' || !file.path
          || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid or duplicate reviewed file');
      byId.set(file.id, file);
    }
    unused = new Set(byId.keys());
    prepareMedia = async (attachment) => {
      const file = byId.get(attachment.id);
      if (!file) throw new Error('Missing reviewed attachment bytes');
      const bytes = await readFile(resolve(dirname(reviewPath), file.path));
      if (bytes.length !== attachment.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        throw new Error('Attachment bytes differ from review');
      }
      const sealed = await sealRegistryMedia(keys, room, generation, bytes);
      media.set(sealed.id, { id: sealed.id, ciphertext: Buffer.from(sealed.bytes).toString('base64') });
      unused.delete(attachment.id);
      return sealed.id;
    };
  }
  const seed = values['reviewed-folders']
    ? await sealFolderRegistrySeed(keys, room, generation, plan, JSON.parse(await readFile(values['reviewed-folders'], 'utf8')), reviewedShared, prepareMedia)
    : { room, generation, ops: await sealBootstrap(keys, room, generation, plan, reviewedShared, prepareMedia) };
  if (unused?.size) throw new Error('Review contains unreferenced files');
  if (prepareMedia) Object.assign(seed, { registryMedia: true, media: [...media.values()] });
  if (reviewedShared !== undefined) seed.sharedRecords = true;
  await writeFile(values.out, JSON.stringify(seed), { flag: 'wx', mode: 0o600 });
}
