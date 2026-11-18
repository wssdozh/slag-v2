// Folders come from the disk now: the two decisions that need no filesystem are the list itself
// and the delta a sweep reports. The rest of the storage layer reads directories.
import assert from 'node:assert/strict';
import test from 'node:test';
import { diffFolderPaths, folderMetaFor } from '../src/lib/storage/folderSource.ts';

const inbox = 'Входящие';

const metadata = [
  { path: 'Проекты', name: 'Проекты', description: 'рабочие проекты', icon: 'Folder' },
  { path: 'Архив', name: 'Архив', description: 'старое' },
];

test('folder list: the directory decides, the metadata dresses it', () => {
  const folders = folderMetaFor(['Проекты/SLAG', inbox, 'Проекты'], metadata, inbox);

  assert.deepEqual(folders.map(folder => folder.path), [inbox, 'Проекты', 'Проекты/SLAG']);
  assert.deepEqual(folders[1], { path: 'Проекты', name: 'Проекты', description: 'рабочие проекты', icon: 'Folder' });
  assert.deepEqual(folders[2], { path: 'Проекты/SLAG', name: 'SLAG', description: '' }, 'без метаданных — имя из пути');
});

test('folder list: metadata for a directory that is gone is dropped, not resurrected', () => {
  const folders = folderMetaFor([inbox, 'Проекты'], metadata, inbox);
  assert.deepEqual(folders.map(folder => folder.path), [inbox, 'Проекты'], 'Архив на диске нет — его метаданные не папка');
});

test('folder list: inbox is first even when sorting would put it later', () => {
  const folders = folderMetaFor(['Архив', inbox, 'Проекты'], [], inbox);
  assert.equal(folders[0].path, inbox);
  assert.deepEqual(folders.map(folder => folder.path), [inbox, 'Архив', 'Проекты']);
});

test('folder list: paths are normalized and deduplicated', () => {
  const folders = folderMetaFor(['Проекты/', 'Проекты', 'Проекты\\SLAG', '', '  '], [], inbox);
  assert.deepEqual(folders.map(folder => folder.path), ['Проекты', 'Проекты/SLAG'], 'пустые и повторы не папки');
});

test('delta: folders that appeared and vanished, both sorted', () => {
  assert.deepEqual(
    diffFolderPaths(['Входящие', 'Архив', 'Проекты'], ['Входящие', 'Проекты', 'Проекты\\Дизайн', 'Проекты/Архив']),
    { added: ['Проекты/Архив', 'Проекты/Дизайн'], removed: ['Архив'] }
  );
});

test('delta: an untouched vault is an empty answer, not undefined', () => {
  const same = ['Входящие', 'Проекты'];
  assert.deepEqual(diffFolderPaths(same, [...same]), { added: [], removed: [] });
});
