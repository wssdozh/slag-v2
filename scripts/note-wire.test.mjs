import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveNoteKeys, FOLDER_TREE_ID, opaqueNoteId, openAnyRegistryBody, openNote, openRegistryBody, parseNoteEvents, parseNoteResults, parseNoteStatus, sealFolderTree, sealNote, sealSharedRecord } from '../src/lib/sync/notes/wire.ts';
import { isLegacySharedKind, sharedRegistryId } from '../src/lib/sync/notes/sharedBody.ts';
import { mergeRegistryDeviceWorkspace, selectSharedWorkspace, sharedWorkspacePatch } from '../src/lib/sync/notes/sharedWorkspace.ts';

test('device workspace flush cannot restore a deleted shared prompt or overwrite accepted preferences', () => {
  const disk = { currentFolder: 'old', notifyPrefs: { telegramEnabled: false, integrationsEnabled: true }, aiPersona: 'accepted' };
  const device = { currentFolder: 'new', notifyPrefs: { telegramEnabled: true, integrationsEnabled: false }, aiPrompt: 'stale', aiPromptAt: 99, aiPersona: 'stale' };
  const result = mergeRegistryDeviceWorkspace(disk, device);
  assert.equal(result.currentFolder, 'new');
  assert.equal(result.aiPersona, 'accepted');
  assert.equal(result.notifyPrefs.telegramEnabled, false);
  assert.equal(result.notifyPrefs.integrationsEnabled, false);
  assert.equal(Object.hasOwn(result, 'aiPrompt'), false);
  assert.equal(Object.hasOwn(result, 'aiPromptAt'), false);
});

const item = { id: 'private-note', type: 'note', title: 'private title', content: 'private content', folder: 'inbox', tags: [], attachments: [], createdAt: 1, updatedAt: 2 };

test('a note envelope authenticates the room, generation, and operation metadata', async () => {
  const master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(master, 'room');
  const noteId = await opaqueNoteId(keys, item.id);
  assert.match(noteId, /^[a-f0-9]{64}$/);
  assert.notEqual(noteId, await opaqueNoteId(await deriveNoteKeys(master, 'other-room'), item.id));
  const op = await sealNote(keys, 'room', 1, { noteId, opId: 'op-1', baseRevision: 0, kind: 'create' }, item.id, item);
  const head = { ...op, revision: 1 };
  assert.deepEqual(await openNote(keys, 'room', 1, head), { id: item.id, item });
  assert.doesNotMatch(JSON.stringify(head), /private/);
  for (const changed of [{ opId: 'op-2' }, { kind: 'update' }, { baseRevision: 1 }, { noteId: 'a'.repeat(64) }]) {
    await assert.rejects(openNote(keys, 'room', 1, { ...head, ...changed }));
  }
  await assert.rejects(openNote(keys, 'room', 2, head));
  await assert.rejects(openNote(keys, 'other-room', 1, head));
  const deletion = await sealNote(keys, 'room', 1, { noteId, opId: 'op-2', baseRevision: 1, kind: 'delete' }, item.id, null);
  assert.deepEqual(await openNote(keys, 'room', 1, { ...deletion, revision: 2 }), { id: item.id, item: null });
});

test('group membership is authenticated, including its position and size', async () => {
  const master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keys = await deriveNoteKeys(master, 'room');
  const noteId = await opaqueNoteId(keys, item.id);
  const group = { id: 'move', index: 0, size: 2 };
  const op = await sealNote(keys, 'room', 1, { noteId, opId: 'move', baseRevision: 1, kind: 'update', group }, item.id, item);
  const head = { ...op, revision: 2 };
  const page = (event) => parseNoteEvents({ generation: 1, head: 3, floor: 0, events: [event] }).events[0];
  assert.deepEqual(page(head).group, group);
  assert.deepEqual(await openNote(keys, 'room', 1, page(head)), { id: item.id, item });
  for (const changed of [undefined, { ...group, id: 'other' }, { ...group, index: 1 }, { ...group, size: 3 }]) {
    await assert.rejects(openNote(keys, 'room', 1, page({ ...head, group: changed })));
  }
  assert.throws(() => page({ ...head, group: { ...group, index: 2 } }), /Invalid note group/);
});

test('one sealed revision carries the whole folder tree, not a note or deletion', async () => {
  const master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const keys = await deriveNoteKeys(master, 'room');
  const op = { noteId: await opaqueNoteId(keys, FOLDER_TREE_ID), opId: 'move-1', baseRevision: 7, kind: 'update' };
  const folders = [{ path: 'Inbox', name: 'Inbox', description: '', order: 1 }, { path: 'Projects', name: 'Projects', description: '', order: 0 }];
  const head = { ...await sealFolderTree(keys, 'room', 3, op, folders), revision: 8 };
  assert.deepEqual(await openRegistryBody(keys, 'room', 3, head), { id: FOLDER_TREE_ID, folders });
  assert.doesNotMatch(JSON.stringify(head), /Projects/);
  await assert.rejects(openNote(keys, 'room', 3, head), /not enabled/);
  await assert.rejects(openRegistryBody(keys, 'room', 4, head));
  assert.throws(() => sealFolderTree(keys, 'room', 3, op, [...folders, { ...folders[0], path: 'inbox' }]), /Duplicate/);
  assert.throws(() => sealFolderTree(keys, 'room', 3, op, [{ ...folders[0], path: '../outside' }]), /Unsafe/);
  assert.throws(() => sealFolderTree(keys, 'room', 3, { ...op, kind: 'delete' }, []), /Invalid/);
});

test('shared facts and drafts use distinct authenticated addresses and explicit tombstones', async () => {
  const master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const keys = await deriveNoteKeys(master, 'room');
  const rows = [
    ['memory', { id: 'same', text: 'private fact' }, 'text'],
    ['composer', { content: 'private composer' }, 'content'],
    ['fullscreen', { itemId: 'same', content: 'private fullscreen' }, 'content'],
  ];
  const addresses = new Set();
  for (const [type, value, field] of rows) {
    const id = sharedRegistryId(type, 'same');
    const noteId = await opaqueNoteId(keys, id);
    addresses.add(noteId);
    const meta = { noteId, opId: 'shared', baseRevision: 0, kind: 'create' };
    const op = await sealSharedRecord(keys, 'room', 1, meta, id, value);
    const head = { ...op, revision: 1 };
    assert.doesNotMatch(JSON.stringify(head), /private|shared:v1/);
    assert.equal((await openAnyRegistryBody(keys, 'room', 1, head)).shared[field], value[field]);
    await assert.rejects(openRegistryBody(keys, 'room', 1, head), /compatible replica/);
    await assert.rejects(openAnyRegistryBody(keys, 'room', 2, head));
    await assert.rejects(sealSharedRecord(keys, 'room', 1, meta, sharedRegistryId(type, 'elsewhere'), { ...value, id: 'elsewhere', itemId: 'elsewhere' }), /identity mismatch/);
    assert.throws(() => sealSharedRecord(keys, 'room', 1, { ...meta, group: { id: 'shared', size: 2, index: 0 } }, id, value), /folder group/);
    assert.throws(() => sealSharedRecord(keys, 'room', 1, meta, id, null), /deletion/);
    const deleted = await sealSharedRecord(keys, 'room', 1, { ...meta, kind: 'delete', opId: 'delete', baseRevision: 1 }, id, null);
    assert.deepEqual(await openAnyRegistryBody(keys, 'room', 1, { ...deleted, revision: 2 }), { id, shared: null });
  }
  assert.equal(addresses.size, 3);
  const id = sharedRegistryId('fullscreen', 'same');
  const noteId = await opaqueNoteId(keys, id);
  assert.throws(() => sealSharedRecord(keys, 'room', 1, { noteId, opId: 'wrong', baseRevision: 0, kind: 'create' }, id, { itemId: 'other', content: 'wrong' }), /Invalid shared registry value/);
});

test('workspace records keep navigation, device switches and legacy timestamps local', async () => {
  const fields = selectSharedWorkspace({ currentFolder: 'private folder', activeTagFilter: 'private filter',
    fullscreenEditorState: { isOpen: true, itemId: 'private note' }, aiPrompt: '', aiPromptAt: 42,
    aiPersona: 'text', aiPersonaEnabled: false, notifyPrefs: { integrationsEnabled: false, overdue: false } });
  assert.equal(fields.aiPrompt, '');
  assert.deepEqual(fields.aiPersona, { text: 'text', enabled: false });
  assert.equal(fields.notifyPrefs.overdue, false);
  assert.doesNotMatch(JSON.stringify(fields), /private|aiPromptAt|integrationsEnabled/);
  const local = { currentFolder: 'local', aiPrompt: 'old', aiPersona: 'untouched', notifyPrefs: { integrationsEnabled: false } };
  const patch = sharedWorkspacePatch('notifyPrefs', { ...fields.notifyPrefs, integrationsEnabled: true }, local);
  assert.equal(patch.notifyPrefs.integrationsEnabled, false);
  assert.deepEqual(Object.keys(patch), ['notifyPrefs']);
  assert.deepEqual({ ...local, ...sharedWorkspacePatch('aiPrompt', null, local) }, { ...local, aiPrompt: undefined, aiPromptAt: undefined });
  const master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const keys = await deriveNoteKeys(master, 'room');
  for (const key of ['aiPrompt', 'aiPersona', 'notifyPrefs']) {
    const id = sharedRegistryId('workspace', key);
    const meta = { noteId: await opaqueNoteId(keys, id), opId: key, baseRevision: 0, kind: 'create' };
    const op = await sealSharedRecord(keys, 'room', 1, meta, id, fields[key]);
    assert.deepEqual(await openAnyRegistryBody(keys, 'room', 1, { ...op, revision: 1 }), { id, shared: fields[key] });
  }
  const id = sharedRegistryId('workspace', 'currentFolder');
  assert.throws(() => sealSharedRecord(keys, 'room', 1, { kind: 'create' }, id, 'elsewhere'), /Invalid shared workspace field/);
  assert.deepEqual(['workspace', 'assistant_prompt', 'memory', 'draft', 'item', 'attachment_request'].filter(isLegacySharedKind),
    ['workspace', 'assistant_prompt', 'memory', 'draft']);
});

test('invalid watermarks and malformed outcomes do not silently advance the cursor', () => {
  assert.deepEqual(parseNoteStatus({ mode: 'registry', generation: 1, floor: 2, head: 4 }), { mode: 'registry', generation: 1, floor: 2, head: 4 });
  assert.throws(() => parseNoteEvents({ generation: 1, floor: 5, head: 4, events: [] }));
  assert.throws(() => parseNoteEvents({ generation: 1, floor: 2, head: 4, events: Array(101).fill({}) }));
  assert.throws(() => parseNoteResults({ type: 'note_results', generation: 1, requestId: 'x', results: [{ opId: 'o', status: 'accepted', revision: -1 }] }));
});
