// The folder tree, its rows and the re-order a drag produces. All of it is pure, so the rules are
// checked here and the sidebar only draws the answer.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFolderTree,
  folderRank,
  folderTreeRows,
  moveFolderPaths,
  sortFolders,
} from '../src/lib/vault/folderTree.ts';

const foldersOf = (...paths) => paths.map((path) => ({ path, name: path.split('/').pop() || path, description: '' }));

const inbox = 'Входящие';

test('tree: a nested path opens its branch even when its parent is not in the list', () => {
  const tree = buildFolderTree(foldersOf('Род/доч1/внук', 'Карьера'));

  assert.deepEqual(tree.map((node) => node.path), ['Род', 'Карьера']);
  assert.deepEqual(tree[0].children.map((node) => node.path), ['Род/доч1']);
  assert.deepEqual(tree[0].children[0].children.map((node) => node.path), ['Род/доч1/внук']);
  assert.equal(tree[0].meta, undefined, 'a parent that was not in the list stays a branch, not a folder');
});

test('rows: branch lines read as the hierarchy', () => {
  const rows = folderTreeRows(
    foldersOf('Род', 'Род/доч1', 'Род/доч1/внук', 'Род/доч2', 'Карьера', 'Карьера/Поиск работы')
  );

  assert.deepEqual(rows.map((row) => `${row.prefix}${row.name}`), [
    'Род',
    '├── доч1',
    '│\u00A0\u00A0\u00A0╰── внук',
    '╰── доч2',
    'Карьера',
    '╰── Поиск работы',
  ]);
  assert.deepEqual(rows.map((row) => row.path), [
    'Род',
    'Род/доч1',
    'Род/доч1/внук',
    'Род/доч2',
    'Карьера',
    'Карьера/Поиск работы',
  ]);
});

test('order: a ranked folder wins over the list, the unranked ones keep their place', () => {
  const ranked = [
    { path: 'В', name: 'В', description: '', order: 0 },
    { path: 'А', name: 'А', description: '', order: 2 },
    { path: 'Б', name: 'Б', description: '' },
  ];

  assert.deepEqual(sortFolders(ranked, inbox).map((folder) => folder.path), ['В', 'А', 'Б']);
  assert.equal(folderRank({ path: 'Б', name: 'Б', description: '' }), Number.POSITIVE_INFINITY);
});

test('order: the inbox is pinned first whatever its rank', () => {
  const folders = [
    { path: 'А', name: 'А', description: '', order: 0 },
    { path: inbox, name: inbox, description: '', order: 99 },
  ];

  assert.deepEqual(sortFolders(folders, inbox).map((folder) => folder.path), [inbox, 'А']);
});

test('drag into: the folder becomes the last child of the target', () => {
  const order = moveFolderPaths(foldersOf('А', 'Б', 'В'), 'В', 'А', 'into');

  assert.deepEqual(order, ['А', 'В', 'Б']);
});

test('drag before and after: the folder lands next to its new sibling', () => {
  assert.deepEqual(moveFolderPaths(foldersOf('А', 'Б', 'В'), 'В', 'А', 'before'), ['В', 'А', 'Б']);
  assert.deepEqual(moveFolderPaths(foldersOf('А', 'Б', 'В'), 'А', 'Б', 'after'), ['Б', 'А', 'В']);
});

test('drag after a folder takes the whole subtree with it', () => {
  const order = moveFolderPaths(foldersOf('А', 'А/х', 'Б', 'В'), 'В', 'А', 'after');

  assert.deepEqual(order, ['А', 'А/х', 'В', 'Б'], 'the folder goes behind the subtree, not between the parent and the child');
});

test('drag to the root puts the folder last', () => {
  assert.deepEqual(moveFolderPaths(foldersOf('А', 'А/х', 'Б'), 'А/х', '', 'root-end'), ['А', 'Б', 'А/х']);
});

test('drag into itself or its own child is refused', () => {
  assert.equal(moveFolderPaths(foldersOf('А', 'А/х'), 'А', 'А', 'into'), null);
  assert.equal(moveFolderPaths(foldersOf('А', 'А/х'), 'А', 'А/х', 'into'), null);
});

test('drag onto a folder that is not in the list is refused', () => {
  assert.equal(moveFolderPaths(foldersOf('А', 'Б'), 'А', 'Нет такой', 'into'), null);
});
