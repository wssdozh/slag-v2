// The composer's own syntax — `@папка` and `#тег` — read once, out of the text, into metadata.
// Pure, so the rule is checked here without a composer, a vault or a browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFolderToken, parseComposerMentions } from '../src/lib/time/todoistTaskParser.ts';

const foldersOf = (...paths) => paths.map((path) => ({ path, name: path.split('/').pop() || path }));

const slag = foldersOf('Проекты/SLAG', 'Проекты/медиа', 'Проекты', 'Архив/SLAG');

test('mentions: a folder name leaves the body and names the folder', () => {
  const { cleanContent, folder } = extractFolderToken('идея для @SLAG на завтра', slag);

  assert.equal(cleanContent, 'идея для на завтра');
  assert.equal(folder?.path, 'Проекты/SLAG');
});

test('mentions: every mention goes, not only the first one', () => {
  const { cleanContent, folder } = extractFolderToken('@Проекты раз @Проекты два', slag);

  assert.equal(cleanContent, 'раз два');
  assert.equal(folder?.path, 'Проекты');
});

test('mentions: a path names the folder it belongs to, not the parent that starts it', () => {
  const { cleanContent, folder } = extractFolderToken('таск @Проекты/медиа потом', slag);

  assert.equal(cleanContent, 'таск потом');
  assert.equal(folder?.path, 'Проекты/медиа');
});

test('mentions: a bare name that two folders share resolves to the first in the tree', () => {
  assert.equal(extractFolderToken('@SLAG', slag).folder?.path, 'Проекты/SLAG');
  assert.equal(extractFolderToken('@Архив/SLAG', slag).folder?.path, 'Архив/SLAG');
});

test('mentions: a folder nobody has stays text, and a half-word is not a mention', () => {
  assert.deepEqual(extractFolderToken('почта @неттакой', slag), {
    cleanContent: 'почта @неттакой',
    folder: null,
  });
  assert.equal(extractFolderToken('почта@SLAG', slag).folder, null);
});

test('mentions: tags and the folder are stripped in the same pass, each into its own field', () => {
  const { cleanContent, folder, tags } = parseComposerMentions('позвонить @Проекты #работа #звонки', slag);

  assert.equal(cleanContent, 'позвонить');
  assert.equal(folder?.path, 'Проекты');
  assert.deepEqual(tags, ['работа', 'звонки']);
});
