// The manifest is the thing a device compares, so these tests are about one promise: the same
// meaning gives the same string, and a real edit is the only thing that moves a hash.
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, fingerprint, sha256Hex } from '../src/lib/vault/integrity/fingerprint.ts';
import { buildManifest, compare } from '../src/lib/vault/integrity/manifest.ts';

const HEX = /^[0-9a-f]{64}$/;

function item(overrides = {}) {
  return {
    id: 'i1',
    type: 'note',
    title: 'Заголовок',
    content: 'тело заметки',
    folder: 'Входящие',
    tags: ['b', 'a'],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function attachment(dataUrl) {
  return {
    id: 'a1',
    name: 'pic.png',
    type: 'image',
    mimeType: 'image/png',
    size: 42,
    relativePath: '.attachments/pic.png',
    dataUrl,
  };
}

function folder(path) {
  return { path, name: path, description: `${path} — описание` };
}

function manifest(root, folders, leaves) {
  return { root, folders, leaves };
}

test('canonical form does not depend on key order', () => {
  const keyed = item({
    filename: 'Заголовок.md',
    attachments: [attachment('data:same')],
    recurrence: { freq: 'weekly', interval: 2 },
  });
  const shuffled = {
    recurrence: { interval: 2, freq: 'weekly' },
    attachments: [
      {
        relativePath: '.attachments/pic.png',
        dataUrl: 'data:same',
        size: 42,
        mimeType: 'image/png',
        type: 'image',
        name: 'pic.png',
        id: 'a1',
      },
    ],
    filename: 'Заголовок.md',
    id: keyed.id,
    type: keyed.type,
    title: keyed.title,
    content: keyed.content,
    folder: keyed.folder,
    tags: ['b', 'a'],
    createdAt: keyed.createdAt,
    updatedAt: keyed.updatedAt,
  };

  assert.equal(canonicalJson(shuffled), canonicalJson(keyed));

  const keys = Object.keys(JSON.parse(canonicalJson(keyed)));
  assert.deepEqual(keys, [...keys].sort(), 'top-level keys come out sorted');
  assert.deepEqual(Object.keys(JSON.parse(canonicalJson(keyed)).recurrence), ['freq', 'interval']);
  assert.deepEqual(JSON.parse(canonicalJson(keyed)).tags, ['b', 'a'], 'arrays keep their order');
});

test('canonical form ignores line endings and trailing blanks', () => {
  const linux = item({ title: 'Первая\nВторая', content: 'строка\nещё' });
  const windows = item({ title: 'Первая\r\nВторая   ', content: 'строка \r\nещё\t' });

  assert.equal(canonicalJson(windows), canonicalJson(linux));
  assert.notEqual(canonicalJson(item({ title: 'Первая\nВторая ' })), canonicalJson(linux));
});

test('canonical form drops filename and dataUrl', () => {
  const withBytes = item({ filename: 'a.md', attachments: [attachment('data:image/png;base64,AAA')] });
  const withoutBytes = item({ filename: 'b.md', attachments: [attachment(undefined)] });
  const parsed = JSON.parse(canonicalJson(withBytes));

  assert.equal(canonicalJson(withBytes), canonicalJson(withoutBytes));
  assert.equal(parsed.filename, undefined);
  assert.equal(parsed.attachments[0].dataUrl, undefined);
  assert.equal(parsed.attachments[0].name, 'pic.png', 'the rest of the attachment stays');
});

test('identical notes fingerprint the same', async () => {
  const first = await fingerprint(canonicalJson(item()));
  const second = await fingerprint(canonicalJson(item({ updatedAt: 1_700_000_000_000 })));

  assert.match(first, HEX);
  assert.equal(first, second);
  assert.notEqual(first, await fingerprint(canonicalJson(item({ title: 'Другая' }))));
});

test('hmac with a key differs from a plain sha256', async () => {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const canonical = canonicalJson(item());
  const plain = await fingerprint(canonical);
  const keyed = await fingerprint(canonical, key);

  assert.match(keyed, HEX);
  assert.notEqual(keyed, plain, 'a keyed vault does not look like an unkeyed one');
  assert.equal(keyed, await fingerprint(canonical, key), 'the same key is deterministic');
});

test('editing the title moves the leaf, its folder and the root', async () => {
  const before = await buildManifest([item()], [folder('Входящие')]);
  const after = await buildManifest([item({ title: 'Заголовок v2' })], [folder('Входящие')]);

  assert.notEqual(after.leaves.i1, before.leaves.i1);
  assert.notEqual(after.folders['Входящие'], before.folders['Входящие']);
  assert.notEqual(after.root, before.root);
  assert.equal(before.root, (await buildManifest([item()], [folder('Входящие')])).root);
});

test('adding a note moves only its folder and the root', async () => {
  const one = folder('Входящие');
  const two = folder('Проекты');
  const before = await buildManifest([item()], [one, two]);
  const after = await buildManifest([item(), item({ id: 'i2', folder: 'Входящие' })], [one, two]);

  assert.notEqual(after.folders['Входящие'], before.folders['Входящие']);
  assert.equal(after.folders['Проекты'], before.folders['Проекты'], 'a quiet folder stays quiet');
  assert.equal(after.leaves.i1, before.leaves.i1, 'old leaves stay put');
  assert.notEqual(after.root, before.root);
});

test('a folder the list forgot, and a folder with nothing in it', async () => {
  const stray = await buildManifest([item({ folder: 'Скрытая' })], [folder('Входящие')]);

  assert.ok(stray.folders['Скрытая'], 'the folder list is a hint, not the truth');
  assert.equal(stray.folders['Входящие'], await sha256Hex(''), 'an empty folder is the empty hash');
  assert.equal(stray.folders['Скрытая'], await sha256Hex('i1:' + stray.leaves.i1));
});

test('compare: equal manifests give an empty report', () => {
  const same = manifest('root-1', { 'Входящие': 'f1' }, { i1: 'l1' });
  assert.deepEqual(compare(same, same), {
    rootMatch: true,
    folders: [],
    missing: [],
    extra: [],
    conflict: [],
  });
});

test('compare catches missing, extra, conflict and folder drift apart', () => {
  const local = manifest('root-1', { 'Входящие': 'f1', 'Проекты': 'f2' }, { i1: 'l1', i2: 'l2' });
  const remote = manifest('root-2', { 'Входящие': 'f1', 'Архив': 'f3' }, { i1: 'l1', i3: 'l3' });

  const report = compare(local, remote);

  assert.equal(report.rootMatch, false);
  assert.deepEqual(report.missing, ['i3'], 'the reference has it, we do not');
  assert.deepEqual(report.extra, ['i2'], 'we have it, the reference does not');
  assert.deepEqual(report.conflict, [], 'same id, same leaf');
  assert.deepEqual(report.folders, ['Архив', 'Проекты'], 'appeared and disappeared both count');
});

test('compare catches a conflicting leaf on its own', () => {
  const local = manifest('root-1', { 'Входящие': 'f1' }, { i1: 'l1' });
  const remote = manifest('root-2', { 'Входящие': 'f1' }, { i1: 'l1-edited' });
  const report = compare(local, remote);

  assert.deepEqual(report.conflict, ['i1']);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.folders, []);
  assert.equal(report.rootMatch, false);
});
