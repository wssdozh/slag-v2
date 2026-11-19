// The eight scans: each finds its own kind of dirt, and a clean vault finds none of them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { SCANNERS, scanVault } from '../src/lib/vault/integrity/scanners.ts';
import { FIX_KIND_BY_SCANNER } from '../src/lib/vault/integrity/types.ts';

const DAY = 86_400_000;

function note(overrides) {
  return { path: '', id: '', folder: '', title: '', updatedAt: 0, attachments: [], ...overrides };
}

function snap(overrides) {
  return {
    notes: [],
    diskFolders: [],
    stateFolders: [],
    attachmentFiles: [],
    trash: [],
    inbox: 'Входящие',
    ...overrides,
  };
}

function byScanner(findings, scanner) {
  return findings.filter((finding) => finding.scanner === scanner);
}

test('a clean vault has nothing to report', () => {
  const clean = snap({
    notes: [
      note({ path: 'Входящие/a.md', id: 'i1', title: 'a', updatedAt: 1 }),
      note({ path: 'Проекты/b.md', id: 'i2', title: 'b', updatedAt: 2 }),
    ],
    diskFolders: ['Входящие', 'Проекты'],
    stateFolders: [{ path: 'Проекты' }],
    attachmentFiles: ['pic.webp'],
    trash: [{ name: 'old.md', ageMs: 2 * DAY }],
  });
  clean.notes[1].attachments = ['.attachments/pic.webp'];

  assert.deepEqual(scanVault(clean), []);
});

test('one id in two files is one finding, newest file first', () => {
  const findings = scanVault(
    snap({
      notes: [
        note({ path: 'Входящие/old.md', id: 'i1', title: 'апельсин', updatedAt: 100 }),
        note({ path: 'Личное/Отдых/new.md', id: 'i1', title: 'апельсин', updatedAt: 200 }),
      ],
      diskFolders: ['Входящие', 'Личное', 'Личное/Отдых'],
    }),
  );

  const duplicates = byScanner(findings, 'duplicate-id');
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].severity, 'high');
  assert.equal(duplicates[0].fix, 'safe');
  assert.equal(duplicates[0].itemId, 'i1');
  assert.deepEqual(duplicates[0].paths, ['Личное/Отдых/new.md', 'Входящие/old.md']);
  assert.equal(duplicates[0].path, 'Личное/Отдых/new.md');
  assert.equal(duplicates[0].evidence.length, 2);
});

test('a file outside its declared folder is a mismatch, not a move', () => {
  const findings = scanVault(
    snap({
      notes: [note({ path: 'Входящие/баги.md', id: 'i1', folder: 'Проекты/SLAG', title: 'баги' })],
      diskFolders: ['Входящие', 'Проекты', 'Проекты/SLAG'],
    }),
  );

  const mismatch = byScanner(findings, 'path-mismatch');
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].fix, 'safe');
  assert.match(mismatch[0].action, /Проекты\/SLAG\/баги\.md/);
  assert.equal(byScanner(findings, 'folder-missing').length, 0);
});

test('a declared folder that does not exist is reported as missing and cannot be fixed safely', () => {
  const findings = scanVault(
    snap({
      notes: [note({ path: 'Входящие/x.md', id: 'i1', folder: 'Проекты/Боты' })],
      diskFolders: ['Входящие', 'Проекты'],
    }),
  );

  const missing = byScanner(findings, 'folder-missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].fix, 'manual');
  assert.equal(missing[0].severity, 'high');
});

test('a state.json entry without a directory is a ghost, and the inbox is never one', () => {
  const findings = scanVault(
    snap({
      diskFolders: ['Входящие'],
      stateFolders: [{ path: 'Входящие' }, { path: 'Проекты/Дизайн' }, { path: 'База знаний/Шпаргалки' }],
    }),
  );

  const ghosts = byScanner(findings, 'ghost-folder');
  assert.deepEqual(ghosts.map((finding) => finding.path).sort(), ['База знаний/Шпаргалки', 'Проекты/Дизайн']);
  assert.equal(ghosts[0].fix, 'safe');
});

test('a folder holding a child directory is not empty', () => {
  const findings = scanVault(
    snap({
      notes: [note({ path: 'Проекты/SLAG/a.md', id: 'i1' })],
      diskFolders: ['Входящие', 'Проекты', 'Проекты/SLAG', 'Личное/Пусто'],
    }),
  );

  assert.deepEqual(byScanner(findings, 'empty-folder').map((finding) => finding.path), ['Личное/Пусто']);
});

test('an empty folder somebody named in state.json is a decision, not dirt', () => {
  const findings = scanVault(
    snap({
      notes: [note({ path: 'Входящие/a.md', id: 'i1' })],
      diskFolders: ['Входящие', 'Будущее/Хотелки', 'Проекты/Безымянная'],
      stateFolders: [{ path: 'Будущее/Хотелки', name: 'Хотелки' }],
    }),
  );

  assert.deepEqual(byScanner(findings, 'empty-folder').map((finding) => finding.path), ['Проекты/Безымянная']);
});

test('a note without an id is broken, and it cannot be repaired automatically', () => {
  const findings = scanVault(snap({ notes: [note({ path: 'Входящие/без-id.md', title: 'текст' })], diskFolders: ['Входящие'] }));

  const broken = byScanner(findings, 'broken-frontmatter');
  assert.equal(broken.length, 1);
  assert.equal(broken[0].fix, 'manual');
  assert.equal(broken[0].severity, 'high');
});

test('an attachment nobody mentions is reported, one that is mentioned is not', () => {
  const findings = scanVault(
    snap({
      notes: [note({ path: 'Входящие/a.md', id: 'i1', attachments: ['.attachments/used.webp'] })],
      diskFolders: ['Входящие'],
      attachmentFiles: ['used.webp', 'forgotten.webp'],
    }),
  );

  assert.deepEqual(byScanner(findings, 'unreferenced-attachment').map((finding) => finding.path), ['forgotten.webp']);
});

test('old trash is dirt, fresh trash is not', () => {
  const findings = scanVault(
    snap({
      notes: [note({ path: 'Входящие/a.md', id: 'i1' })],
      diskFolders: ['Входящие'],
      trash: [
        { name: 'старое.md', ageMs: 40 * DAY },
        { name: 'свежее.md', ageMs: 3 * DAY },
      ],
    }),
  );

  assert.deepEqual(byScanner(findings, 'trash-aging').map((finding) => finding.path), ['.trash/старое.md']);
});

test('the aging threshold is an option', () => {
  const findings = scanVault(
    snap({ notes: [note({ path: 'Входящие/a.md', id: 'i1' })], diskFolders: ['Входящие'], trash: [{ name: 'x.md', ageMs: 10 * DAY }] }),
    { trashAgingMs: 5 * DAY },
  );

  assert.equal(byScanner(findings, 'trash-aging').length, 1);
});

test('loudest first, then stable by scanner, path and id', () => {
  const findings = scanVault(
    snap({
      notes: [
        note({ path: 'Входящие/dup-a.md', id: 'i1', updatedAt: 10 }),
        note({ path: 'Входящие/dup-b.md', id: 'i1', updatedAt: 5 }),
        note({ path: 'Входящие/mis.md', id: 'i2', folder: 'Проекты' }),
        note({ path: 'Входящие/no-id.md' }),
      ],
      diskFolders: ['Входящие', 'Проекты', 'Пусто'],
    }),
  );

  assert.deepEqual(
    findings.map((finding) => finding.severity),
    ['high', 'high', 'medium', 'low', 'low'],
  );
  // Same severity, so the scanner name decides: broken-frontmatter before duplicate-id.
  assert.deepEqual(
    findings.slice(0, 2).map((finding) => finding.scanner),
    ['broken-frontmatter', 'duplicate-id'],
  );
});

test('every finding carries the fix its scanner is allowed to have, and a stable id', () => {
  const dirty = snap({
    notes: [
      note({ path: 'Входящие/dup-a.md', id: 'i1', updatedAt: 10 }),
      note({ path: 'Входящие/dup-b.md', id: 'i1', updatedAt: 5 }),
      note({ path: 'Входящие/mis.md', id: 'i2', folder: 'Проекты/Нет' }),
      note({ path: 'Входящие/no-id.md' }),
    ],
    diskFolders: ['Входящие', 'Пусто'],
    stateFolders: [{ path: 'Призрак' }],
    attachmentFiles: ['forgotten.webp'],
    trash: [{ name: 'старое.md', ageMs: 40 * DAY }],
  });

  const first = scanVault(dirty);
  const second = scanVault(dirty);

  assert.deepEqual(first.map((finding) => finding.id), second.map((finding) => finding.id));
  assert.equal(new Set(first.map((finding) => finding.id)).size, first.length);
  for (const finding of first) {
    assert.equal(finding.fix, FIX_KIND_BY_SCANNER[finding.scanner]);
    assert.ok(finding.summary.length > 0 && finding.why.length > 0);
    assert.ok(Array.isArray(finding.evidence));
  }
  assert.deepEqual(Object.keys(SCANNERS).sort(), Object.keys(FIX_KIND_BY_SCANNER).sort());
});
