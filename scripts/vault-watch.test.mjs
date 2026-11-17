// The two decisions the disk sweep makes without a filesystem: what changed between two stamps,
// and whether the file behind a note is newer than the index. The rest of the guard reads files.
import assert from 'node:assert/strict';
import test from 'node:test';
import { diffNoteFiles } from '../src/lib/storage/vaultWatchDiff.ts';
import { hasNewerVersionOnDisk } from '../src/lib/storage/writeGuard.ts';

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
