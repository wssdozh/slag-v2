// The manifest as it travels: what the wire is allowed to say, and what a device does with it.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WIRE_BYTES,
  WIRE_VERSION,
  decideManifest,
  describeWire,
  diffWire,
  leavesToRequest,
  parseWire,
  toWire,
  wireFromText,
  wireToText,
} from '../src/lib/sync/manifest/channel.ts';

/** A manifest as the local device holds it: root, folder hashes, leaf fingerprints. */
function manifest(overrides = {}) {
  return {
    root: 'root-a',
    folders: { 'Проекты': 'folder-a', 'Входящие': 'folder-b' },
    leaves: { item_1: 'leaf-a', item_2: 'leaf-b' },
    ...overrides,
  };
}

/** A keyed wire as another device would send it. */
function wire(overrides = {}) {
  return {
    v: WIRE_VERSION,
    root: 'root-a',
    folders: { 'Проекты': 'folder-a', 'Входящие': 'folder-b' },
    leaves: { item_1: 'leaf-a', item_2: 'leaf-b' },
    ...overrides,
  };
}

/** One peer's row: a wire plus the device that published it and when the relay wrote it. */
function peer(deviceId, overrides = {}) {
  return { deviceId, at: null, ...wire(overrides) };
}

test('toWire carries version, root, folders and leaves', () => {
  const carried = toWire(manifest());

  assert.deepEqual(carried, wire());
  assert.equal(WIRE_VERSION, 1);
});

test('a wire survives toWire → wireToText → wireFromText unchanged', () => {
  const carried = toWire(manifest());
  const text = wireToText(carried);

  assert.deepEqual(wireFromText(text), carried);
  assert.deepEqual(parseWire(JSON.parse(text)), carried);
});

test('the text is canonical: keys sorted, same manifest same bytes', () => {
  const first = wireToText(wire());
  const second = wireToText(
    toWire(manifest({ folders: { 'Входящие': 'folder-b', 'Проекты': 'folder-a' } })),
  );

  assert.equal(first, second);
  assert.equal(first, '{"folders":{"Входящие":"folder-b","Проекты":"folder-a"},"leaves":{"item_1":"leaf-a","item_2":"leaf-b"},"root":"root-a","v":1}');
});

test('a wire without leaves stays without leaves after the round-trip', () => {
  const short = wire({ leaves: undefined });
  const text = wireToText(short);
  const back = wireFromText(text);

  assert.equal(back?.leaves, undefined);
  assert.equal('leaves' in (back ?? {}), false);
});

test('parseWire refuses a foreign version', () => {
  assert.equal(parseWire(wire({ v: 2 })), null);
  assert.equal(parseWire(wire({ v: '1' })), null);
  assert.equal(parseWire({ ...wire(), v: undefined }), null);
});

test('parseWire refuses anything that is not an object', () => {
  for (const raw of [null, undefined, 42, 'wire', true, [], [wire()], () => {}]) {
    assert.equal(parseWire(raw), null);
  }
});

test('parseWire refuses a broken root', () => {
  assert.equal(parseWire(wire({ root: '' })), null);
  assert.equal(parseWire(wire({ root: 7 })), null);
  assert.equal(parseWire({ v: WIRE_VERSION, folders: {} }), null);
});

test('parseWire refuses folders that are not string → string', () => {
  assert.equal(parseWire(wire({ folders: undefined })), null);
  assert.equal(parseWire(wire({ folders: 'Проекты' })), null);
  assert.equal(parseWire(wire({ folders: ['Проекты'] })), null);
  assert.equal(parseWire(wire({ folders: { 'Проекты': 1 } })), null);
  assert.equal(parseWire(wire({ folders: { 'Проекты': null } })), null);
});

test('parseWire refuses leaves of the wrong type', () => {
  assert.equal(parseWire(wire({ leaves: ['item_1'] })), null);
  assert.equal(parseWire(wire({ leaves: 'item_1:leaf-a' })), null);
  assert.equal(parseWire(wire({ leaves: 5 })), null);
  assert.equal(parseWire(wire({ leaves: { item_1: 1 } })), null);
  assert.equal(parseWire(wire({ leaves: { item_1: { hash: 'leaf-a' } } })), null);
});

test('parseWire drops fields it does not know instead of passing them on', () => {
  const parsed = parseWire({ ...wire(), signature: 'abc', at: 123 });

  assert.deepEqual(parsed, wire());
  assert.equal(Object.hasOwn(parsed ?? {}, 'signature'), false);
  assert.equal(Object.hasOwn(parsed ?? {}, 'at'), false);
});

test('wireFromText refuses torn json', () => {
  assert.equal(wireFromText('{"folders":'), null);
  assert.equal(wireFromText(''), null);
  assert.equal(wireFromText('null'), null);
  assert.equal(wireFromText('[]'), null);
  assert.equal(wireFromText('{"v":2,"root":"r","folders":{}}'), null);
});

test('wireFromText refuses a payload past the size limit', () => {
  const junk = 'x'.repeat(MAX_WIRE_BYTES + 1);
  assert.equal(wireFromText(junk), null);

  const folders = {};
  for (let i = 0; i < 5000; i++) folders[`Проекты/${i}`] = 'f'.repeat(32);
  const huge = JSON.stringify({ v: WIRE_VERSION, root: 'root-a', folders });
  assert.ok(huge.length > MAX_WIRE_BYTES, 'the generated wire must be over the limit');
  assert.equal(wireFromText(huge), null);

  const empty = wireToText(wire({ folders: {}, leaves: {} }));
  assert.ok(wireFromText(empty), 'a small wire still parses');
});

test('diffWire without leaves reports folder drift and nothing about leaves', () => {
  const report = diffWire(
    manifest(),
    wire({ leaves: undefined, root: 'root-b', folders: { 'Проекты': 'folder-z', 'Входящие': 'folder-b' } }),
  );

  assert.equal(report.rootMatch, false);
  assert.deepEqual(report.folders, ['Проекты']);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.conflict, []);
});

test('diffWire with leaves catches missing, extra and conflict', () => {
  const report = diffWire(
    manifest({ leaves: { item_1: 'leaf-a', item_2: 'leaf-x', item_4: 'leaf-d' } }),
    wire({ leaves: { item_1: 'leaf-a', item_2: 'leaf-b', item_3: 'leaf-c' } }),
  );

  assert.equal(report.rootMatch, true);
  assert.deepEqual(report.folders, []);
  assert.deepEqual(report.missing, ['item_3']);
  assert.deepEqual(report.extra, ['item_4']);
  assert.deepEqual(report.conflict, ['item_2']);
});

test('diffWire speaks about both sides of a folder, not just the changed hash', () => {
  const report = diffWire(
    manifest({ folders: { 'Проекты': 'folder-a', 'Новая': 'folder-n' } }),
    wire({ folders: { 'Проекты': 'folder-a', 'Пропала': 'folder-g' } }),
  );

  assert.deepEqual(report.folders, ['Новая', 'Пропала']);
});

test('leavesToRequest asks for missing plus conflict, sorted and unique', () => {
  const report = {
    rootMatch: false,
    folders: [],
    missing: ['item_3', 'item_1'],
    extra: ['item_9'],
    conflict: ['item_2', 'item_3'],
  };

  assert.deepEqual(leavesToRequest(report, wire()), ['item_1', 'item_2', 'item_3']);
});

test('leavesToRequest asks for nothing when the remote sent no leaves', () => {
  const report = {
    rootMatch: false,
    folders: [],
    missing: ['item_1'],
    extra: [],
    conflict: ['item_2'],
  };

  assert.deepEqual(leavesToRequest(report, wire({ leaves: undefined })), []);
});

test('describeWire logs counts and version, never a hash', () => {
  const carried = wire();
  const line = describeWire(carried);

  assert.ok(line.includes('v1'), line);
  assert.ok(line.includes('папок 2, листьев 2,'), line);
  assert.equal(line.includes('root-a'), false);
  for (const hash of Object.values(carried.folders)) assert.equal(line.includes(hash), false);
  for (const [id, hash] of Object.entries(carried.leaves)) {
    assert.equal(line.includes(hash), false);
    assert.equal(line.includes(id), false);
  }
});

test('describeWire says when the leaves were not sent', () => {
  const line = describeWire(wire({ leaves: undefined }));

  assert.ok(line.includes('не присланы'), line);
});

// --- what a device does about it ------------------------------------------------------------

test('a matching root asks for nothing', () => {
  const decision = decideManifest(manifest(), [peer('dev-a')]);

  assert.equal(decision.action, 'none');
  assert.equal(decision.peer?.deviceId, 'dev-a');
  assert.equal(decision.drift?.rootMatch, true);
  assert.equal(decision.resendTo, null);
});

test('a device that got no answer does not call that a mismatch', () => {
  assert.deepEqual(decideManifest(manifest(), []), {
    action: 'none',
    peer: null,
    drift: null,
    resendTo: null,
  });
});

test('a fresh divergence reports the named peer without authorizing a resend', () => {
  const decision = decideManifest(manifest(), [peer('dev-a'), peer('dev-b', { root: 'root-b' })]);

  assert.equal(decision.action, 'report');
  assert.equal(decision.peer?.deviceId, 'dev-b');
  assert.equal(decision.resendTo, null);
  assert.equal(decision.drift?.rootMatch, false);
});

test('an old client is compared but never resent to', () => {
  const decision = decideManifest(manifest(), [peer(null, { root: 'root-b' })]);

  assert.equal(decision.action, 'none');
  assert.equal(decision.peer?.deviceId, null);
  assert.equal(decision.drift?.rootMatch, false);
  assert.equal(decision.resendTo, null);
});

test('a named peer that disagrees outranks the old client', () => {
  const decision = decideManifest(manifest(), [peer(null, { root: 'root-b' }), peer('dev-a', { root: 'root-c' })]);

  assert.equal(decision.action, 'report');
  assert.equal(decision.peer?.deviceId, 'dev-a');
  assert.equal(decision.resendTo, null);
});

test('a task absent from fresh, repeated and newer peer snapshots stays only a diagnostic extra', () => {
  const local = manifest({ leaves: { 'local-task': 'local-leaf' } });
  for (const root of ['root-b', 'root-b', 'root-c']) {
    const decision = decideManifest(local, [peer('dev-a', { root, leaves: {} })]);
    assert.equal(decision.action, 'report');
    assert.deepEqual(decision.drift?.extra, ['local-task']);
    assert.equal(decision.resendTo, null);
  }
});

test('a remote without leaves still decides on the root', () => {
  const decision = decideManifest(manifest(), [peer('dev-a', { root: 'root-b', leaves: undefined })]);

  assert.equal(decision.action, 'report');
  assert.deepEqual(decision.drift?.missing, []);
  assert.deepEqual(decision.drift?.conflict, []);
});

