// The decisions the disk sweep makes without a filesystem: what changed between two snapshots —
// note stamps and directory paths — and whether the file behind a note is newer than the index.
// The rest of the guard reads files.
import assert from 'node:assert/strict';
import test from 'node:test';
import { diffNoteFiles } from '../src/lib/storage/vaultWatchDiff.ts';
import { hasNewerVersionOnDisk } from '../src/lib/storage/writeGuard.ts';
import { editFromDisk, noteDiskProjection } from '../src/lib/storage/noteDiskProjection.ts';
import { parseMarkdownToItem, serializeItemToMarkdown } from '../src/lib/vault/markdownSerializer.ts';

const stamp = (mtime, size = 100) => ({ mtime, size });

test('sweep: unknown path is new, same stamp is silence, either field flipping is a change', () => {
  const previous = new Map([
    ['Входящие/старая.md', stamp(1)],
    ['Входящие/правленая.md', stamp(2)],
    ['Входящие/дописана.md', stamp(3)],
  ]);
  const next = new Map([
    ['Входящие/старая.md', stamp(1)],
    ['Входящие/правленая.md', stamp(20)],
    ['Входящие/дописана.md', stamp(3, 250)],
    ['Входящие/новая.md', stamp(4)],
  ]);

  assert.deepEqual(diffNoteFiles(previous, next), {
    changed: ['Входящие/дописана.md', 'Входящие/новая.md', 'Входящие/правленая.md'],
    removed: [],
  });
});

test('sweep: a path that left the folder is reported as removed, sorted', () => {
  const previous = new Map([
    ['Проекты/SLAG/б.md', stamp(1)],
    ['Проекты/SLAG/а.md', stamp(1)],
  ]);
  assert.deepEqual(diffNoteFiles(previous, new Map()), {
    changed: [],
    removed: ['Проекты/SLAG/а.md', 'Проекты/SLAG/б.md'],
  });
});

test('sweep: untouched vault is an empty answer, not undefined', () => {
  const same = new Map([['Входящие/заметка.md', stamp(9, 42)]]);
  assert.deepEqual(diffNoteFiles(same, new Map(same)), { changed: [], removed: [] });
});

test('guard: a newer file on disk wins, an older or foreign one does not', () => {
  const indexed = { id: 'note_1', updatedAt: 1000 };

  assert.equal(hasNewerVersionOnDisk({ id: 'note_1', updatedAt: 2000 }, indexed), true);
  assert.equal(hasNewerVersionOnDisk({ id: 'note_1', updatedAt: 1000 }, indexed), false, 'равный updated — это наш же файл');
  assert.equal(hasNewerVersionOnDisk({ id: 'note_1', updatedAt: 500 }, indexed), false);
  assert.equal(hasNewerVersionOnDisk({ id: 'note_2', updatedAt: 2000 }, indexed), false, 'другая заметка на этом пути — не конфликт');
  assert.equal(hasNewerVersionOnDisk(null, indexed), false, 'файла нет — затирать нечего');
});

test('registry projection ignores its own YAML echo and retains an actual property edit', () => {
  const note = { id: 'watch', type: 'task', title: 'Watch', folder: 'Inbox', createdAt: 1, updatedAt: 1,
    content: 'body #inline\r\n- [ ] test', dueDate: '', tags: ['manual'], attachments: [{ id: 'a', name: 'a.png', type: 'image',
      enrichmentStatus: 'processing', enrichmentError: 'previous error', dataUrl: 'inline bytes' }],
    customProps: { budget: 0, title: 'nested', optional: null } };
  const markdown = serializeItemToMarkdown(note);
  const parse = (source) => parseMarkdownToItem(source, note.id, note.folder, undefined, false);
  const projected = noteDiskProjection(note);
  assert.deepEqual(projected.customProps, note.customProps);
  assert.deepEqual(projected.tags, ['manual']);
  assert.equal(projected.attachments[0].enrichmentError, 'previous error');
  assert.equal(editFromDisk(note, parse(markdown), projected), undefined);
  const edit = editFromDisk(note, parse(markdown.replace('budget: 0', 'budget: 1').replace('#inline', '#changed')), projected);
  assert.deepEqual(edit.customProps, { ...note.customProps, budget: 1 });
  assert.deepEqual(edit.attachments, note.attachments);
  assert.equal(edit.dueDate, '');
  assert.deepEqual(edit.tags, note.tags);
});