// `state.json` now keeps the drafts, the assistant chat and memory, and the workspace. These are
// the rules that keep that move from losing an unsaved text, duplicating a fact, letting junk into
// a section, or merging an old `localStorage` blob twice. `stateSections.ts` is pure on purpose —
// no Tauri, no `localStorage` — so this file reads it as is.
import assert from 'node:assert/strict';
import test from 'node:test';
import { draftSharedMutation, memorySharedMutations, sharedSettingsProjection, workspaceSharedMutations } from '../src/lib/storage/sharedProjection.ts';
import { sharedRegistryId } from '../src/lib/sync/notes/sharedBody.ts';

test('local shared mutations keep device preferences and inline attachment bytes out of the journal', () => {
  const before = { aiPrompt: 'old', aiPersona: 'keep', notifyPrefs: { integrationsEnabled: true } };
  assert.deepEqual(workspaceSharedMutations(before, { currentFolder: 'private', aiPromptAt: 300,
    notifyPrefs: { integrationsEnabled: false } }), []);
  assert.deepEqual(workspaceSharedMutations(before, { aiPrompt: '' }), [
    { id: sharedRegistryId('workspace', 'aiPrompt'), value: '', previous: 'old' },
  ]);
  const fact = { id: 'fact', text: 'remember this' };
  assert.deepEqual(memorySharedMutations([fact], []), []);
  assert.deepEqual(memorySharedMutations([fact], [{ ...fact, deletedAt: 123 }]), [
    { id: sharedRegistryId('memory', 'fact'), value: null, previous: fact },
  ]);
  const attached = draft('photo', 1, { attachments: [{ id: 'a', dataUrl: 'local bytes' }] });
  assert.deepEqual(draftSharedMutation('composer', 'Inbox', null, attached)[0].value.attachments, [{ id: 'a' }]);
  assert.deepEqual(draftSharedMutation('composer', 'Inbox', attached, draft('photo', 1, { attachments: [{ id: 'a' }] })), []);
});

test('shared projection ignores local clocks and only replaces the addressed value', () => {
  const id = sharedRegistryId('composer', 'Inbox');
  const local = { composer: { Inbox: draft('newer local', 500), Other: draft('keep', 100) }, fullscreen: {} };
  const accepted = sharedSettingsProjection({ id, shared: draft('canonical', 1) });
  assert.equal(accepted.section, 'drafts');
  const patch = accepted.patch(local);
  assert.equal(patch.composer.Inbox.content, 'canonical');
  assert.equal(patch.composer.Other.content, 'keep');
  assert.equal(local.composer.Inbox.content, 'newer local');
  const deleted = sharedSettingsProjection({ id, shared: null }).patch(patch);
  assert.deepEqual(Object.keys(deleted.composer), ['Other']);
  assert.deepEqual(sharedSettingsProjection({ id, shared: null }).patch(deleted), deleted);
  const memory = sharedSettingsProjection({ id: sharedRegistryId('memory', 'fact'), shared: null });
  assert.deepEqual(memory.patch({ items: [{ id: 'fact', text: 'remove' }, { id: 'other', text: 'keep' }] }).items.map((item) => item.id), ['other']);
});
import {
  chatFromSection,
  chatToSection,
  composerDraftsFrom,
  draftsFromSection,
  draftsToSection,
  fullscreenDraftsFrom,
  memoryFrom,
  memoryFromSection,
  memoryToSection,
  mergeChatMessages,
  mergeComposerDrafts,
  mergeFullscreenDrafts,
  mergeMemory,
  mergeTelegramThread,
  mergeWorkspaceState,
  migrationStampsFrom,
  migrationStampsToSection,
  stampMigration,
  telegramThreadFrom,
  workspaceFromState,
} from '../src/lib/storage/stateSections.ts';

const draft = (content, updatedAt, extra = {}) => ({
  content,
  itemType: 'note',
  priority: 'none',
  dueDate: '',
  tags: [],
  attachments: [],
  replyTarget: null,
  updatedAt,
  ...extra,
});

const chatMessage = (id, createdAt, content = id) => ({ id, role: 'user', content, createdAt });

test('drafts: a section holds one map per kind, and both halves are always written', () => {
  const section = draftsToSection({
    composer: { Входящие: draft('черновик', 10) },
    fullscreen: { item_1: { itemId: 'item_1', title: 'т', content: 'текст', tags: [], folder: 'А', type: 'note', updatedAt: 11 } },
  });

  assert.deepEqual(Object.keys(section).sort(), ['composer', 'fullscreen']);
  assert.equal(section.composer['Входящие'].content, 'черновик');
  assert.equal(section.fullscreen.item_1.content, 'текст');
  assert.deepEqual(draftsFromSection(section).composer, section.composer, 'reading a written section gives it back');
});

test('drafts: only the expected shape lands in the section', () => {
  const stored = draftsToSection({
    composer: { Входящие: draft('текст', 5, { junk: 'nope', updatedAt: 'позавчера' }) },
    fullscreen: {},
  });

  assert.deepEqual(
    Object.keys(stored.composer['Входящие']).sort(),
    ['attachments', 'content', 'dueDate', 'itemType', 'priority', 'replyTarget', 'tags', 'updatedAt'],
    'an unknown key from a hand-edited file is not copied into the section',
  );
  assert.equal(stored.composer['Входящие'].updatedAt, 0, 'a stamp that is not a number reads as the epoch');
});

test('drafts: empty, absent and junk all read as nothing', () => {
  for (const value of [undefined, null, {}, [], 'nope', 42, { composer: [], fullscreen: 'x' }]) {
    assert.deepEqual(draftsFromSection(value), { composer: {}, fullscreen: {} });
  }
  assert.deepEqual(composerDraftsFrom({ Входящие: { updatedAt: 1 } }), {}, 'a draft without text is not a draft');
  assert.deepEqual(fullscreenDraftsFrom({ item_1: { content: 'x' } }), {}, 'a fullscreen draft without its id is none');
});

test('drafts migration: the old blob is merged into the section, not swapped for it', () => {
  const onDisk = { Входящие: draft('из файла', 100), Проекты: draft('только в файле', 100) };
  const legacy = { Входящие: draft('новый', 200), Личное: draft('только в старом ключе', 50) };

  const merged = mergeComposerDrafts(onDisk, legacy);
  assert.deepEqual(Object.keys(merged).sort(), ['Входящие', 'Личное', 'Проекты'], 'no folder loses its draft');
  assert.equal(merged['Входящие'].content, 'новый', 'the later draft wins');
  assert.equal(merged['Проекты'].content, 'только в файле');

  const again = mergeComposerDrafts(merged, legacy);
  assert.deepEqual(again, merged, 'running the move twice changes nothing');
  assert.equal(Object.keys(again).length, 3, 'and adds no duplicate folders');
});

test('fullscreen migration: the same rule, keyed by note id', () => {
  const onDisk = { item_1: { itemId: 'item_1', title: '', content: 'старое', tags: [], folder: '', type: 'note', updatedAt: 10 } };
  const legacy = { item_1: { itemId: 'item_1', title: '', content: 'новое', tags: [], folder: '', type: 'note', updatedAt: 20 }, item_2: { itemId: 'item_2', title: '', content: 'ещё', tags: [], folder: '', type: 'task', updatedAt: 1 } };

  const merged = mergeFullscreenDrafts(onDisk, legacy);
  assert.equal(merged.item_1.content, 'новое');
  assert.equal(merged.item_2.type, 'task');
  assert.deepEqual(mergeFullscreenDrafts(merged, legacy), merged);
});

test('chat: one section, two threads, junk entries dropped', () => {
  const section = chatToSection({
    messages: [{ id: 'm1', role: 'assistant', content: 'ответ', createdAt: 5 }],
    telegram: [{ role: 'user', content: 'вопрос' }],
  });

  assert.deepEqual(chatFromSection(section), {
    messages: [{ id: 'm1', role: 'assistant', content: 'ответ', createdAt: 5 }],
    telegram: [{ role: 'user', content: 'вопрос' }],
  });
  assert.deepEqual(chatFromSection({ messages: 'x', telegram: [null, { role: 'system', content: 'no' }] }), {
    messages: [],
    telegram: [],
  }, 'a broken section reads as empty, not as a crash');
});

test('chat migration: by id and by time, never twice', () => {
  const onDisk = [chatMessage('m1', 10), chatMessage('m2', 30)];
  const legacy = [chatMessage('m2', 30, 'тот же'), chatMessage('m3', 20)];

  const merged = mergeChatMessages(onDisk, legacy);
  assert.deepEqual(merged.map((message) => message.id), ['m1', 'm3', 'm2'], 'one id is one message, in time order');
  assert.deepEqual(mergeChatMessages(merged, legacy), merged, 'a second pass adds no duplicate');

  const replaced = mergeChatMessages([chatMessage('m1', 10, 'старое')], [chatMessage('m1', 20, 'новое')]);
  assert.equal(replaced[0].content, 'новое', 'the later copy of one message wins');
});

test('telegram migration: the same exchange is one exchange, order kept', () => {
  const onDisk = [{ role: 'user', content: 'а что по задачам?' }, { role: 'assistant', content: 'на сегодня две' }];
  const legacy = [{ role: 'assistant', content: 'на сегодня две' }, { role: 'user', content: 'спасибо' }];

  const merged = mergeTelegramThread(onDisk, legacy);
  assert.deepEqual(merged, [
    { role: 'user', content: 'а что по задачам?' },
    { role: 'assistant', content: 'на сегодня две' },
    { role: 'user', content: 'спасибо' },
  ]);
  assert.deepEqual(mergeTelegramThread(merged, legacy), merged);
  assert.deepEqual(telegramThreadFrom('nope'), []);
});

test('memory: later fact wins, and a tombstone beats a stale copy with the same stamp', () => {
  const fact = (id, updatedAt, extra = {}) => ({
    id,
    text: id,
    normalized: id,
    kind: 'fact',
    tag: null,
    importance: 3,
    mentions: 1,
    usedCount: 0,
    createdAt: 1,
    updatedAt,
    usedAt: 1,
    isPinned: false,
    ...extra,
  });

  const onDisk = [fact('m1', 10), fact('m2', 10, { deletedAt: 10 })];
  const legacy = [fact('m1', 20), fact('m2', 9), fact('m3', 1)];

  const merged = mergeMemory(onDisk, legacy);
  assert.deepEqual(merged.map((item) => item.id).sort(), ['m1', 'm2', 'm3'], 'nothing is lost');
  assert.equal(merged.find((item) => item.id === 'm1').updatedAt, 20, 'the later fact wins');
  assert.equal(merged.find((item) => item.id === 'm2').updatedAt, 10, 'an older copy does not undo a forget');
  assert.equal(merged.find((item) => item.id === 'm2').deletedAt, 10);
  assert.deepEqual(mergeMemory(merged, legacy), merged, 'a second pass changes nothing');

  assert.deepEqual(memoryFrom([null, { id: 'm' }, { text: 'no id' }, 42]), [], 'an item without id and text is not a fact');
  assert.deepEqual(memoryToSection([fact('m1', 1)]).items.length, 1);
  assert.deepEqual(memoryFromSection({ items: 'nope' }), []);
});

test('workspace: the old key wins where both exist, and no folder setting is lost', () => {
  const onDisk = { currentFolder: 'Проекты', feedViewMode: 'feed', folderSettings: { A: { viewMode: 'feed' }, B: { viewMode: 'kanban' } } };
  const legacy = { currentFolder: 'Личное', folderSettings: { A: { viewMode: 'calendar' }, C: { viewMode: 'feed' } } };

  const merged = mergeWorkspaceState(onDisk, legacy);
  assert.equal(merged.currentFolder, 'Личное');
  assert.deepEqual(Object.keys(merged.folderSettings).sort(), ['A', 'B', 'C']);
  assert.equal(merged.folderSettings.A.viewMode, 'calendar', 'the folder that moved wins');
  assert.deepEqual(mergeWorkspaceState(merged, legacy), merged, 'a second pass changes nothing');

  assert.deepEqual(workspaceFromState('nope'), {}, 'a broken workspace section reads as nothing');
  assert.deepEqual(workspaceFromState({ folderSettings: { A: 'junk', B: null } }).folderSettings, undefined);
});

test('migration stamps: written once, and a name left out is taken later', () => {
  const empty = migrationStampsFrom(null);
  assert.deepEqual(empty, { legacyAt: 0, telegramAt: 0 });
  assert.deepEqual(migrationStampsToSection(empty), {}, 'nothing stamped means nothing written');

  const stamped = stampMigration(empty, 'legacy', 1_700_000_000_000);
  assert.deepEqual(migrationStampsToSection(stamped), { legacyAt: 1_700_000_000_000 });
  assert.deepEqual(stampMigration(stamped, 'legacy', 9_999), stamped, 'the first stamp keeps its moment');
  assert.deepEqual(stampMigration(stamped, 'telegram', 5), { legacyAt: 1_700_000_000_000, telegramAt: 5 });
  assert.deepEqual(migrationStampsFrom(migrationStampsToSection(stamped)), stamped);
  assert.equal(migrationStampsFrom({ legacyAt: 'вчера' }).legacyAt, 0, 'a stamp that is not a number is no stamp');
});
