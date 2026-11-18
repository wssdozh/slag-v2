// Tombstones are the one sync ledger whose loss cannot be rebuilt: the note is already gone from
// the disk, so a wiped webview profile means the relay quietly hands the deleted note back. These
// are the rules that keep the move into `state.json` from losing a delete, duplicating one, or
// letting junk into the section.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeTombstones,
  sanitizeTombstones,
  tombstonesFromState,
  tombstonesToState,
} from '../src/lib/sync/tombstones.ts';

test('merge: a record on one side never overwrites the other side', () => {
  const disk = { item_a: 100, item_b: 300 };
  const legacy = { item_b: 200, item_c: 400 };

  assert.deepEqual(mergeTombstones(disk, legacy), { item_a: 100, item_b: 300, item_c: 400 });
  assert.deepEqual(mergeTombstones(legacy, disk), { item_a: 100, item_b: 300, item_c: 400 }, 'the later stamp wins either way');
});

test('merge: the older stamp is not allowed to resurrect a deleted note', () => {
  assert.deepEqual(mergeTombstones({ item_a: 500 }, { item_a: 400 }), { item_a: 500 });
  assert.deepEqual(mergeTombstones({ item_a: 400 }, { item_a: 500 }), { item_a: 500 });
});

test('migration: the localStorage blob is merged into the section, not swapped for it', () => {
  const section = tombstonesToState({ item_disk: 1_700_000_000_000 });
  const legacy = { item_legacy: 1_700_000_000_001, item_disk: 1_700_000_000_000 };

  const merged = mergeTombstones(tombstonesFromState(section), legacy);
  assert.deepEqual(Object.keys(merged).sort(), ['item_disk', 'item_legacy'], 'nothing stored is dropped');
  assert.equal(merged.item_legacy, 1_700_000_000_001, 'the old blob survives the move');

  const again = mergeTombstones(merged, legacy);
  assert.deepEqual(again, merged, 'running the move twice changes nothing');
  assert.equal(Object.keys(again).length, 2, 'and adds no duplicate ids');
});

test('section: empty, absent and junk all read as an empty object', () => {
  const states = [undefined, null, {}, { tombstones: null }, { tombstones: [] }, { folders: [] }, 'nope', 42];
  for (const state of states) assert.deepEqual(tombstonesFromState(state), {});

  assert.deepEqual(tombstonesFromState({}), {}, 'an empty section is {}, not "delete everything"');
});

test('section: only id -> number survives, junk is dropped', () => {
  const state = {
    tombstones: {
      item_ok: 1_700_000_000_000,
      item_string: '1700000000000',
      item_nan: Number.NaN,
      item_infinite: Number.POSITIVE_INFINITY,
      item_zero: 0,
      item_negative: -5,
      item_object: { deletedAt: 1 },
      '': 1_700_000_000_000,
    },
  };

  assert.deepEqual(tombstonesToState(tombstonesFromState(state)), { tombstones: { item_ok: 1_700_000_000_000 } });
  assert.deepEqual(sanitizeTombstones(null), {}, 'a missing blob is no tombstones');
});

test('section: what is written is one plain map under one key', () => {
  assert.deepEqual(tombstonesToState({ item_a: 5, item_b: 6 }), { tombstones: { item_a: 5, item_b: 6 } });
  assert.deepEqual(Object.keys(tombstonesToState({ item_a: 5 })), ['tombstones']);
  assert.deepEqual(tombstonesToState({}), { tombstones: {} }, 'clearing keeps the section, empty');
});
