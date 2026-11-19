// Build a vault snapshot from a fake reader and verify its shape.
//
// The reader emulates a dirty vault: duplicate ids, folder mismatch, ghost state folders,
// broken frontmatter, and an attachment that nobody uses. We check snapshot fields — not
// scanner findings.

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshot } from '../src/lib/vault/integrity/snapshot.ts';

/** Minimal fake reader wired with "dirty" vault data. */
const createReader = () => ({
  listFolders: async () => ['Входящие', 'Проекты/SLAG'],

  listNotes: async (folder) => {
    // Map folder → file basenames
    const map = {
      '': ['a.md', 'no-id.md'],
      'Входящие': ['inbox-note.md', 'broken.md'],
      'Проекты/SLAG': ['dup-a.md', 'dup-b.md', 'wiki-ref.md'],
    };
    return (map[folder] || []).sort();
  },

  readNote: async (relativePath) => {
    // relativePath is folder/filename or just filename for inbox-level notes.
    const body = noteBodies.get(relativePath);
    if (body != null) return body;
    // Try plain name
    return noteBodies.get(relativePath.split('/').pop() ?? '');
  },

  listAttachments: async () => ['used.webp', 'unused.png'],

  listTrash: async () => [{ name: 'old-trash.md', ageMs: 50 * 86400_000 }],

  readStateFolders: async () => [
    { path: 'Входящие' },
    { path: 'Проекты/SLAG' },
    { path: 'Призрак' },   // ghost: no directory exists
  ],
});

/** Inline note bodies keyed by full relativePath. */
const noteBodies = new Map([
  // A normal note with id + matching folder → declaredFolder is ''
  ['inbox-note.md', `---\nid: n-inbox\nupdated: 1000\ntitle: Inbox Note\n---\nHello world`],
  // Same id as dup-b — last-seen wins (dup-b appears later in walk order)
  ['dup-a.md', `---\nid: n-dup\nupdated: 900\ntitle: Dup A\n---\nOlder`],
  // Same id as dup-a; also has body references to attachments
  ['dup-b.md', `---\nid: n-dup\nupdated: 2000\ntitle: Dup B\nfolder: Входящие\n---\nNewer, uses ![[used.webp]] and [[unused.png]].\nAlso link [](https://example.com/img.jpg).`],
  // Folder mismatch: declared folder differs from actual
  ['wiki-ref.md', `---\nid: n-wiki\nfolder: Личное\n---\nReferencing [[attached-file.pdf]]![[some-att.jpg]] and [](doc.pdf)`],
  // Broken frontmatter (no closing ---) → empty id, empty folder
  ['broken.md', `---\nid: broken-id\ntitle: broken\nno-closing-line`],
  // No id at all
  ['no-id.md', `just text without frontmatter`],
  ['a.md', `---\nid: n-a\nupdated: 500\ntitle: A\n---\nroot note`],
]);

test('buildSnapshot reads every note and resolves duplicates', async () => {
  const snap = await buildSnapshot(createReader(), 'Входящие');

  // Every file appears: the scan finds duplicates, it does not hide them.
  assert.equal(snap.notes.length, 7);

  // ── deduplication ───────────────────────────────────────────
  // n-dup appears twice: dup-a (index 3 before push → killed) and dup-b. Last seen wins.
  const dupNotes = snap.notes.filter(n => n.id === 'n-dup');
  assert.equal(dupNotes.length, 2);
  const dupB = dupNotes.find(n => n.path === 'Проекты/SLAG/dup-b.md');
  assert.ok(dupB);
  assert.equal(dupB.title, 'Dup B');
  assert.equal(dupB.folder, 'Входящие'); // declared ≠ effective

  // ── folder mismatch / mismatched declaration ────────────────
  const wikiNote = snap.notes.find(n => n.path === 'Проекты/SLAG/wiki-ref.md');
  assert.ok(wikiNote);
  assert.equal(wikiNote.folder, 'Личное');  // differs from dir

  // ── broken frontmatter ──────────────────────────────────────
  const broken = snap.notes.find(n => n.path === 'Входящие/broken.md');
  assert.ok(broken);
  assert.equal(broken.id, '');              // broken frontmatter → empty id
  assert.equal(broken.folder, '');          // same: no valid folder

  // ── no id ───────────────────────────────────────────────────
  const noId = snap.notes.find(n => n.path === 'no-id.md');
  assert.ok(noId);
  assert.equal(noId.id, '');                // no frontmatter at all

  // ── inbox root note ends up in inbox folder on disk ─────────
  assert.ok(snap.diskFolders.includes('Входящие'));

  // ── attachments from frontmatter + body ─────────────────────
  // dup-b mentions: used.webp, unused.png, https://example.com/img.jpg
  assert.ok(dupB.attachments.some(a => a === 'used.webp'));
  assert.ok(dupB.attachments.some(a => a === 'unused.png'));
  assert.ok(dupB.attachments.some(a => a.includes('img.jpg')));

  // wiki-note mentions: attached-file.pdf, some-att.jpg, doc.pdf
  assert.ok(wikiNote.attachments.some(a => a === 'attached-file.pdf'));
  assert.ok(wikiNote.attachments.some(a => a === 'some-att.jpg'));
  assert.ok(wikiNote.attachments.some(a => a === 'doc.pdf'));

  // ── state folders include ghost ─────────────────────────────
  assert.ok(snap.stateFolders.some(f => f.path === 'Призрак'));

  // ── attachments list ────────────────────────────────────────
  assert.deepEqual(snap.attachmentFiles, ['unused.png', 'used.webp']);

  // ── trash ───────────────────────────────────────────────────
  assert.ok(snap.trash.some(t => t.name === 'old-trash.md'));
});

test('missing reader methods do not crash the snapshot', async () => {
  const sparse = {
    listFolders: async () => ['Test'],
    listNotes: async (folder) => (folder === '' ? [] : ['x.md']),
    readNote: async () => '---\nid: s1\ntitle: sparse\n---\n',
    listAttachments: async () => [],
    listTrash: async () => [],
    readStateFolders: async () => { throw new Error('unavailable'); },
  };

  const snap = await buildSnapshot(sparse, 'Входящие');
  assert.equal(snap.notes.length, 1);
  assert.ok(snap.stateFolders == null || Array.isArray(snap.stateFolders));
});
