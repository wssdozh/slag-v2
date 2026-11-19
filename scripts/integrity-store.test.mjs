// Round-trip encode / decode for IntegrityIndex and leaves.
//
// Pure codec — no Tauri, no fs. Checks that decodeIndex/null on bad json and that order of keys
// does not matter (encode then decode produces an equivalent object).

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeIndex,
  decodeIndex,
  encodeLeaves,
  decodeLeaves,
} from '../src/lib/storage/integrityStore.ts';

test('encodeIndex / decodeIndex round-trip', () => {
  const index = {
    at: '2026-11-19T08:50:00Z',
    root: 'abc123',
    folders: { 'Входящие': 'f1', 'Проекты': 'f2' },
  };

  const raw = encodeIndex(index);
  assert.equal(typeof raw, 'string');
  assert.ok(raw.includes('abc123'));
  assert.ok(raw.includes('f1'));

  const restored = decodeIndex(raw);
  assert.ok(restored != null);
  assert.equal(restored.root, index.root);
  assert.equal(restored.at, index.at);
  assert.deepEqual(restored.folders, index.folders);
});

test('decodeIndex returns null on bad json', () => {
  assert.equal(decodeIndex(''), null);
  assert.equal(decodeIndex('{broken'), null);
  assert.equal(decodeIndex('"just string"'), null);
  assert.equal(decodeIndex('null'), null);
  // Missing root field → null
  assert.equal(decodeIndex('{"at":"x","folders":{}}'), null);
});

test('index key order is irrelevant after decoding', () => {
  // Hand-crafted json with fields in different order
  const reordered = '{"folders":{"a":"1"},"at":"2025-01-01","root":"r"}';
  const out = decodeIndex(reordered);
  assert.ok(out != null);
  assert.equal(out.root, 'r');
  assert.equal(out.at, '2025-01-01');
  assert.equal(out.folders.a, '1');
});

test('encodeLeaves / decodeLeaves round-trip', () => {
  const leaves = {
    'n-1': 'hash-a',
    'n-2': 'hash-b',
    'n-3': 'hash-c',
  };

  const raw = encodeLeaves(leaves);
  const restored = decodeLeaves(raw);
  assert.ok(restored != null);
  assert.deepEqual(restored, leaves);
});

test('decodeLeaves returns null on bad json', () => {
  assert.equal(decodeLeaves(''), null);
  assert.equal(decodeLeaves('{{bad}}'), null);
  assert.equal(decodeLeaves('"not an object"'), null);
  assert.equal(decodeLeaves('42'), null);
});

test('leaves key order is irrelevant after decoding', () => {
  const reordered = '{"z":"last","m":"mid","a":"first"}';
  const out = decodeLeaves(reordered);
  assert.ok(out != null);
  assert.equal(out.z, 'last');
  assert.equal(out.m, 'mid');
  assert.equal(out.a, 'first');
  assert.equal(Object.keys(out).length, 3);
});
