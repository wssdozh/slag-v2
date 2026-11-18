// The sync ledgers moved out of `localStorage` and into the vault's `state.json`, and these are
// the rules that keep the move honest: the config never carries the seed phrase, the old blob is
// merged rather than swapped for the file, one ledger's write never takes another one with it, and
// a section that is missing or written by an older build reads as "nothing here yet".
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configFromState,
  configToState,
  mergeSectionState,
  sanitizeOutbox,
  sectionFromState,
  sectionToPatch,
} from '../src/lib/sync/syncSection.ts';
import {
  hydrateSyncSection,
  loadCursor,
  loadOutbox,
  saveCursor,
  writeSyncSectionVerified,
} from '../src/lib/sync/localBookkeeping.ts';

const SEED = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

const scopeFor = (vaultId) => ({ vaultId, roomId: null, accountSync: false });

/** A `state.json` section as the disk holds it, plus the writes the test notices. */
function fakeStore(section = {}) {
  const writes = [];
  return {
    writes,
    store: {
      read: async () => section,
      write: async (patch) => {
        writes.push(patch);
        Object.assign(section, patch);
      },
    },
  };
}

/** The queue writes on a promise chain, so one macrotask is enough to see the result. */
const settle = () => new Promise((done) => setTimeout(done, 0));

test('config: the record written to the file never carries the seed phrase', () => {
  const config = {
    enabled: true,
    serverUrl: 'http://relay.local:8320',
    deviceId: 'slag-device-1',
    deviceName: 'Мой ПК',
    seedPhrase: SEED,
    autoSync: true,
    bgSyncIntervalMinutes: 10,
    trustedDevices: [],
  };

  const record = configToState(config);
  assert.equal('seedPhrase' in record, false, 'the seed is not a field of the stored config');
  assert.equal(JSON.stringify(record).includes(SEED), false, 'and no value carries it either');
  assert.equal(JSON.stringify(record).includes('abandon'), false, 'not even the first word of it');
  assert.deepEqual(
    Object.keys(record).sort(),
    ['autoSync', 'bgSyncIntervalMinutes', 'deviceId', 'deviceName', 'enabled', 'serverUrl', 'trustedDevices'],
    'an explicit field list: a config that grows a field must add it here on purpose',
  );

  const back = configFromState(record);
  assert.equal('seedPhrase' in back, false, 'and reading it back cannot invent one');
  assert.equal(back.deviceId, 'slag-device-1');
  assert.equal(back.bgSyncIntervalMinutes, 10);
});

test('config: absent, empty and junk all read as "nothing was stored"', () => {
  const states = [undefined, null, {}, [], 'nope', 42, { deviceId: 42, enabled: 'yes', trustedDevices: 'x' }];
  for (const state of states) assert.deepEqual(configFromState(state), {});
});

test('migration: the old blob is merged into the file, and a second run changes nothing', () => {
  const file = sectionFromState({
    tombstones: { note_a: 200 },
    syncedIds: ['note_a'],
    cursor: { room_x: 4 },
    sentHashes: { room_x: { 'item:note_a': 'hash-a' } },
  });
  const legacy = sectionFromState({
    tombstones: { note_a: 100, note_b: 300 },
    syncedIds: ['note_a', 'note_b'],
    cursor: { room_x: 2 },
    sentHashes: { room_x: { 'item:note_a': 'stale', 'item:note_b': 'hash-b' } },
  });

  const merged = mergeSectionState(file, legacy);
  assert.deepEqual(Object.keys(merged.tombstones).sort(), ['note_a', 'note_b'], 'neither side loses a delete');
  assert.equal(merged.tombstones.note_a, 200, 'the later stamp wins, so nothing is resurrected');
  assert.deepEqual(merged.syncedIds, ['note_a', 'note_b'], 'ids add up, once each');
  assert.equal(merged.cursor.room_x, 4, 'a cursor never goes back');
  assert.deepEqual(merged.sentHashes.room_x, { 'item:note_a': 'hash-a', 'item:note_b': 'hash-b' },
    'the file wins per entity, the blob only fills the gaps');

  assert.deepEqual(mergeSectionState(merged, legacy), merged, 'a retried migration adds nothing');
});

test('migration: the outbox merges by opId, the file copy first and the order kept', () => {
  const op = (opId, id) => ({ opId, kind: 'folder', id, action: 'delete', timestamp: 1_700_000_000_000 });
  const stored = [op('op_1', 'a'), op('op_2', 'b')];
  const legacy = [op('op_2', 'b-from-the-blob'), op('op_3', 'c')];

  assert.deepEqual(
    mergeSectionState({ outbox: stored }, { outbox: legacy }).outbox,
    [op('op_1', 'a'), op('op_2', 'b'), op('op_3', 'c')],
    'one op per id, the file copy wins, and nothing is reordered',
  );
});

test('outbox: an op written to the file survives it, and half an op is dropped', () => {
  const op = { opId: 'op_1', kind: 'folder', id: 'Проекты/Старое', action: 'delete', timestamp: 1_700_000_000_000 };
  assert.deepEqual(sanitizeOutbox([op]), [op]);

  const junk = [null, 42, 'nope', { ...op, opId: '' }, { ...op, kind: 'note' }, { ...op, action: 'drop' },
    { ...op, timestamp: 'now' }, { ...op, opId: 'op_2' }, { ...op, opId: 'op_2', id: 'other' }];
  assert.deepEqual(sanitizeOutbox(junk), [{ ...op, opId: 'op_2' }], 'one real op, once');
});

test('section: one ledger write carries one key and leaves the others alone', async () => {
  const scope = scopeFor('vault_write');
  const section = {
    tombstones: { note_gone: 1_700_000_000_000 },
    config: { deviceId: 'slag-device-2', enabled: true },
  };
  const { store, writes } = fakeStore({ ...section, config: { ...section.config } });

  const hydrated = await hydrateSyncSection(scope, store);
  assert.equal(hydrated.persisted, true);
  assert.equal(writes.length, 0, 'nothing to migrate means nothing to write');

  saveCursor(scope, 17);
  await settle();
  assert.equal(loadCursor(scope), 17, 'the cursor is the one the device just pulled');

  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), ['cursor'], 'a cursor save carries the cursor and nothing else');
  assert.deepEqual(store.read && (await store.read()).tombstones, section.tombstones, 'the deletes are still there');
  assert.deepEqual((await store.read()).config, section.config, 'and so is the config next to them');
});

test('section: one write of the whole section still merges, it does not replace', async () => {
  const scope = scopeFor('vault_merge');
  const { store } = fakeStore({ tombstones: { note_gone: 5 }, config: { deviceId: 'slag-device-3' } });
  await hydrateSyncSection(scope, store);

  const patch = sectionToPatch(sectionFromState({ cursor: { local: 9 } }));
  assert.equal(await writeSyncSectionVerified(patch), true, 'the file tells us it took the patch');

  const written = await store.read();
  assert.deepEqual(written.config, { deviceId: 'slag-device-3' }, 'the config is untouched by a ledger write');
  assert.equal(written.cursor.local, 9);
});

test('section: empty, missing and broken all read as empty', () => {
  const empty = {
    tombstones: {}, cursor: {}, sentHashes: {}, syncedIds: [], attachmentRequests: {},
    draftTombstones: {}, stateHash: {}, outbox: [], initialSync: false,
  };
  for (const state of [undefined, null, {}, [], 'nope', 42, { tombstones: [], cursor: 'x', outbox: {} }]) {
    assert.deepEqual(sectionFromState(state), empty);
  }
});

test('outbox: an empty file means an empty queue, not a full resend', async () => {
  const scope = scopeFor('vault_empty');
  await hydrateSyncSection(scope, fakeStore({}).store);

  assert.deepEqual(loadOutbox(scope.vaultId), [], 'a section without an outbox key is an empty queue');
  assert.deepEqual(sanitizeOutbox(undefined), []);
  assert.deepEqual(sanitizeOutbox({}), []);
  assert.deepEqual(sectionFromState({ outbox: [{}] }).outbox, []);
});
