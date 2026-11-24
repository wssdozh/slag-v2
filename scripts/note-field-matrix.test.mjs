import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { editFromDisk, noteDiskProjection } from '../src/lib/storage/noteDiskProjection.ts';
import { mergeNote, noteDifferences, relayNote, sameNote } from '../src/lib/sync/notes/merge.ts';
import { applyReviewedFields, selectableNoteFields } from '../src/lib/sync/notes/review.ts';
import { deriveNoteKeys, opaqueNoteId, openNote, registryMediaIds, sealNote } from '../src/lib/sync/notes/wire.ts';
import { serializeItemToMarkdown, parseMarkdownToItem } from '../src/lib/vault/markdownSerializer.ts';
import { projectItemKind } from '../src/lib/vault/noteSemantics.ts';
import { applyItemUpdates } from '../src/lib/vault/itemUpdates.ts';
import { applyNotePatch } from '../src/mcp/notePatch.ts';

const types = ['note', 'task', 'article'];
const base = (type) => ({ id: 'matrix-item', type, title: 'Original', content: 'First\n\nLast', folder: 'Inbox',
  tags: [], attachments: [], createdAt: 100, updatedAt: 150,
  ...(type === 'task' && { status: 'todo', priority: 'none' }), ...(type === 'article' && { readingTimeMinutes: 1 }) });
const attachment = { id: 'audio-1', name: 'sound.ogg', type: 'audio', mimeType: 'audio/ogg', size: 8, relativePath: '.attachments/audio-1.ogg' };
const subtask = { id: 'step-1', title: 'legacy step', completed: false };
const schedule = (day) => `2026-11-${day}`;
const recurrence = { freq: 'weekly', interval: 2, weekdays: [1, 3], resetSubtasks: false };
const cfg = (a, b, options = {}) => ({ values: [a, b], ...options });
// Each mutable field declares its scope, two distinct updates, and whether partial review is meaningful.
const fields = {
  id: 'identity', type: 'conversion', filename: 'local projection', createdAt: 'metadata', updatedAt: 'metadata',
  title: cfg('Changed title', 'Other title'), content: cfg('Edited\n\nLast', 'Other\n\nLast'),
  folder: cfg('Projects/A', 'Projects/B', { full: true }), tags: cfg(['red'], ['blue'], { combine: true }),
  attachments: cfg([attachment], [{ ...attachment, id: 'other-audio', relativePath: '.attachments/other-audio.ogg' }], { full: true }),
  isPinned: cfg(true, false, { boolean: true }), isArchived: cfg(true, false, { boolean: true }),
  status: cfg('in_progress', 'done', { type: 'task' }), priority: cfg('low', 'high', { type: 'task' }),
  dueDate: cfg(schedule(21), schedule(22), { type: 'task', clear: true }),
  reminder: cfg(`${schedule(21)}T10:30:00+03:00`, `${schedule(21)}T11:30:00+03:00`, { type: 'task', clear: true }),
  duration: cfg(15, 45, { type: 'task', clear: true }),
  recurrence: cfg(recurrence, { freq: 'monthly', interval: 3, resetSubtasks: true }, { type: 'task', clear: true }),
  streak: cfg(0, 4, { type: 'task', clear: true }),
  history: cfg([schedule(21)], [schedule(22)], { type: 'task', clear: true }),
  lastCompletedDate: cfg(schedule(21), schedule(22), { type: 'task', clear: true }),
  subtasks: cfg([subtask], [{ ...subtask, completed: true }], { type: 'task', clear: true }),
  kanbanColumn: cfg('doing', 'review', { type: 'task', clear: true }),
  readingTimeMinutes: cfg(2, 5, { type: 'article', reset: 1 }), summary: cfg('Summary A', 'Summary B', { type: 'article', clear: true }),
  replyToId: cfg('reference-one', 'reference-two', { clear: true }), linkedItemIds: cfg(['link-one'], ['link-two'], { clear: true }),
  customProps: cfg({ key: false, nested: { optional: null, list: [0, ''] } }, { key: true }, { clear: true }),
};
const mediaFields = {
  id: 'audio-2', name: 'renamed.ogg', type: 'video', mimeType: 'video/webm', size: 9, relativePath: '.attachments/renamed.ogg',
  dataUrl: 'data:audio/ogg;base64,YWJj', registryBlobId: 'c'.repeat(64), duration: 5.25, waveform: [0, 0.5, 1],
  extractedText: 'transcription', summary: 'file summary', enrichmentStatus: 'ready', enrichmentError: 'offline',
};
const recurrenceFields = { freq: 'monthly', interval: 3, weekdays: [2, 4], resetSubtasks: true };
const subtaskFields = { id: 'step-2', title: 'renamed', completed: true };
const room = 'field-matrix';
const generation = 1;
const keys = await deriveNoteKeys(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']), room);

async function delivered(item) {
  const value = relayNote(item);
  const noteId = await opaqueNoteId(keys, value.id);
  const mediaIds = registryMediaIds(value.attachments);
  const op = await sealNote(keys, room, generation, { noteId, opId: 'field-op', kind: 'update', baseRevision: 1,
    ...(mediaIds.length && { mediaIds }) }, value.id, value);
  const { item: opened } = await openNote(keys, room, generation, { ...op, revision: 2 });
  return opened;
}

function projection(item, context) {
  const disk = noteDiskProjection(item);
  assert.deepEqual(noteDifferences(item, disk), [], context);
  assert.equal(editFromDisk(item, disk), undefined, `${context}: projection is not an external edit`);
  return disk;
}

const tsFile = ts.createSourceFile('index.ts', readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
test('every model field is accounted for (including nested properties)', () => {
  for (const [name, fixtures] of Object.entries({ SlagItem: fields, SlagAttachment: mediaFields, RecurrenceRule: recurrenceFields, SlagSubtask: subtaskFields })) {
    const declaration = tsFile.statements.find((statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name);
    assert.ok(declaration, name);
    assert.deepEqual(declaration.members.map(({ name }) => name.text).sort(), Object.keys(fixtures).sort(), name);
  }
});

for (const type of types) {
  for (const [field, row] of Object.entries(fields)) {
    if (typeof row === 'string' || (row.type && row.type !== type)) continue;
    test(`${type}.${field}: edit, project, seal/open, merge and selective review`, async () => {
      const initial = base(type);
      const [first, second] = row.values;
      const local = { ...initial, [field]: first };
      const remote = { ...initial, [field]: second };
      const disk = projection(local, field);
      assert.deepEqual((await delivered(local))[field], first);
      const patched = editFromDisk(initial, disk);
      assert.ok(patched && sameNote(patched, local), 'live external change must survive');
      const independent = field === 'title' ? { isPinned: true } : { title: 'Remote title' };
      for (const [mine, theirs] of [[local, { ...initial, ...independent }], [{ ...initial, ...independent }, local]]) {
        const merged = mergeNote(initial, mine, theirs);
        assert.deepEqual(merged.conflicts, []);
        assert.ok(sameNote(merged.item, { ...local, ...independent }));
      }
      if (row.boolean) {
        assert.equal(mergeNote(local, remote, local).item[field], false);
        projection(remote, `${field} cleared`);
      } else {
        assert.deepEqual(mergeNote(initial, local, local).conflicts, []);
        // Testing collisions needs a genuine change on both sides, not an original value.
        const effects = mergeNote(initial, local, remote);
        if (row.combine) assert.deepEqual(effects.item[field], ['blue', 'red']);
        else assert.deepEqual(effects.conflicts, [field]);
      }
      assert.equal(selectableNoteFields(initial, local).includes(field), !row.full);
      if (!row.full) {
        const head = { ...initial, ...independent };
        assert.ok(sameNote(applyReviewedFields(head, local, [field]), { ...local, ...independent }));
      }
      if (row.clear || row.reset !== undefined || ['tags', 'attachments'].includes(field)) {
        const cleared = { ...local, [field]: row.reset ?? (['tags', 'attachments'].includes(field) ? [] : undefined) };
        assert.ok(sameNote(projection(cleared, `${field} clear/reset`), cleared));
        assert.deepEqual((await delivered(cleared))[field], cleared[field]);
        assert.ok(sameNote(editFromDisk(local, noteDiskProjection(cleared)), cleared));
      }
    });
  }
}

test('empty custom properties and calculated article reading time round-trip without an edit', () => {
  const item = { ...base('article'), readingTimeMinutes: undefined, content: Array(290).fill('word').join(' '), customProps: {} };
  const disk = projection(item, 'derived reading time and empty properties');
  assert.equal(disk.readingTimeMinutes, 1);
  const long = { ...item, content: Array(299).fill('word').join(' ') };
  assert.equal(projection(long, 'reading time rounds by actual words').readingTimeMinutes, 1);
  const longer = { ...long, content: `${long.content} extra` };
  assert.equal(projection(longer, 'changed reading time').readingTimeMinutes, 2);
  const estimateAndExplicit = mergeNote(long, longer, { ...long, readingTimeMinutes: 5 });
  assert.deepEqual(estimateAndExplicit.conflicts, []);
  assert.equal(estimateAndExplicit.item.readingTimeMinutes, 5);
});

test('identity and creation/edit timestamps persist; physical filename is not a shared edit', async () => {
  for (const type of types) {
    const item = { ...base(type), filename: 'external-rename.md', createdAt: 123, updatedAt: 456 };
    for (const received of [projection(item, type), await delivered(item)]) {
      assert.equal(received.id, item.id);
      assert.equal(received.createdAt, 123);
      assert.equal(received.updatedAt, 456);
      assert.equal(received.filename, undefined);
    }
    const otherId = { ...item, id: 'other-id' };
    assert.ok(mergeNote(item, otherId, item).conflicts.includes('id'));
    assert.deepEqual(selectableNoteFields(item, otherId), []);
  }
});

test('all six kind conversions retain common properties and reject independent old-kind edits', async () => {
  for (const from of types) for (const to of types) {
    if (from === to) continue;
    const initial = { ...base(from), tags: ['common'], replyToId: 'parent', customProps: { retained: true },
      ...Object.fromEntries(Object.entries(fields).flatMap(([key, row]) => row.type === from ? [[key, row.values[0]]] : [])) };
    const converted = { ...base(to), tags: initial.tags, replyToId: initial.replyToId, customProps: initial.customProps };
    const assistant = applyItemUpdates(initial, { type: to });
    const mcp = applyNotePatch(initial, { type: to }, { folder: initial.folder, content: initial.content, subtasks: [] }, 200);
    for (const item of [projectItemKind({ ...initial, type: to }), assistant, mcp]) {
      assert.equal(item.type, to);
      for (const [key, row] of Object.entries(fields)) if (row.type && row.type !== to) assert.equal(item[key], undefined, `${from}→${to}: ${key}`);
      assert.deepEqual(item.customProps, initial.customProps);
      assert.equal(item.replyToId, initial.replyToId);
    }
    const edit = editFromDisk(initial, noteDiskProjection(converted));
    assert.ok(sameNote(edit, converted), `${from}→${to}`);
    assert.ok(sameNote(await delivered(converted), converted));
    assert.deepEqual(selectableNoteFields(initial, converted), []);
    const merged = mergeNote(initial, converted, { ...initial, isPinned: true });
    assert.deepEqual(merged.conflicts, [], `${from}→${to}`);
    assert.ok(sameNote(merged.item, { ...converted, isPinned: true }));
    if (from !== 'note') {
      const field = from === 'task' ? { duration: 40 } : { summary: 'independent article summary' };
      assert.ok(mergeNote(initial, converted, { ...initial, ...field }).conflicts.includes('type'), `${from}→${to}`);
    }
  }
});

test('attachment metadata set/remove is preserved; bytes and transient rendering flags stay local', async () => {
  for (const [field, value] of Object.entries(mediaFields)) {
    const item = { ...base('note'), attachments: [{ ...attachment, [field]: value }] };
    const received = await delivered(item);
    assert.deepEqual(received.attachments[0][field], field === 'dataUrl' ? undefined : value, field);
    if (field !== 'dataUrl') projection(item, field);
  }
  for (const enrichmentStatus of ['idle', 'processing']) {
    const item = { ...base('note'), attachments: [{ ...attachment, enrichmentStatus }] };
    assert.equal((await delivered(item)).attachments[0].enrichmentStatus, undefined);
  }
  assert.equal((await delivered({ ...base('note'), attachments: [{ ...attachment, enrichmentStatus: 'error' }] })).attachments[0].enrichmentStatus, 'error');
});

test('separately changed attachment enrichment and waveform compose for one unchanged file', () => {
  const file = { ...attachment, registryBlobId: 'c'.repeat(64) };
  const item = { ...base('note'), attachments: [file] };
  const local = { ...item, attachments: [{ ...file, waveform: [0, 1], duration: 5 }] };
  const remote = { ...item, attachments: [{ ...file, extractedText: 'Transcript', summary: 'Summary', enrichmentStatus: 'ready' }] };
  for (const [mine, theirs] of [[local, remote], [remote, local]]) {
    const merged = mergeNote(item, mine, theirs);
    assert.deepEqual(merged.conflicts, []);
    assert.deepEqual(merged.item.attachments, [{ ...local.attachments[0], ...remote.attachments[0] }]);
  }
  const other = { ...item, attachments: [{ ...file, extractedText: 'Different transcript', enrichmentStatus: 'ready' }] };
  assert.deepEqual(mergeNote(item, remote, other).conflicts, ['attachments']);
  const failed = { ...item, attachments: [{ ...file, enrichmentError: 'Offline', enrichmentStatus: 'error' }] };
  assert.deepEqual(mergeNote(remote, other, failed).conflicts, ['attachments']);
  const bytesChanged = { ...item, attachments: [{ ...attachment, registryBlobId: 'd'.repeat(64) }] };
  assert.deepEqual(mergeNote(item, local, bytesChanged).conflicts, ['attachments']);
  const unconfirmed = (value) => ({ ...value, attachments: value.attachments.map(({ registryBlobId: _registryBlobId, ...metadata }) => metadata) });
  assert.deepEqual(mergeNote(unconfirmed(item), unconfirmed(local), unconfirmed(remote)).conflicts, ['attachments']);
});

test('taking only edited text never wipes an independent frontmatter checklist', () => {
  const task = { ...base('task'), subtasks: [subtask] };
  const edited = { ...task, content: 'New text with no Markdown checkbox' };
  assert.deepEqual(applyReviewedFields(task, edited, ['content']).subtasks, task.subtasks);
  assert.throws(() => applyReviewedFields(task, { ...edited, content: '- [ ] different step' }, ['content']), /нельзя применить отдельно/);
  const migrated = applyReviewedFields(task, { ...edited, content: '- [ ] legacy step' }, ['content']);
  assert.equal(migrated.subtasks[0].title, subtask.title);
});

test('inline hashtags survive a real parse/save/parse; checklist position is not an external ID', () => {
  const note = { ...base('note'), content: 'Inline #test-tag' };
  const read = (item) => parseMarkdownToItem(serializeItemToMarkdown(item), item.id, item.folder);
  assert.deepEqual(read(read(note)).tags, ['test-tag']);
  const task = { ...base('task'), content: '- [ ] First\n- [x] Original', subtasks: [subtask] };
  assert.deepEqual(read(task).subtasks.map(({ title, completed }) => [title, completed]), [['First', false], ['Original', true]]);
});

test('replacing the last Markdown checkbox via assistant or MCP does not revive cached subtasks', () => {
  const task = { ...base('task'), content: '- [ ] First', subtasks: [subtask] };
  const content = 'Plain text after removing the checkbox';
  assert.deepEqual(applyItemUpdates(task, { content }).subtasks, []);
  assert.deepEqual(applyNotePatch(task, { content }, { content, folder: task.folder, subtasks: [] }, 200).subtasks, []);
  const legacy = { ...task, content: 'No original checkbox' };
  assert.deepEqual(applyItemUpdates(legacy, { content }).subtasks, [subtask]);
  assert.deepEqual(applyNotePatch(legacy, { content }, { content, folder: legacy.folder, subtasks: [] }, 200).subtasks, [subtask]);
});

test('recurrence fields and frontmatter/Markdown checklist representations are explicit', () => {
  for (const [key, value] of Object.entries(recurrenceFields)) {
    const rule = key === 'freq' ? { freq: value, interval: 2, resetSubtasks: false } : { ...recurrence, [key]: value };
    projection({ ...base('task'), recurrence: rule }, key);
  }
  for (const rule of [{ freq: 'daily' }, { freq: 'weekly', interval: 1 }, { freq: 'weekdays', resetSubtasks: false }, { freq: 'yearly' }]) {
    projection({ ...base('task'), recurrence: rule }, `implicit recurrence defaults: ${rule.freq}`);
  }
  const implicit = { ...base('task'), recurrence: { freq: 'daily' } };
  assert.ok(sameNote(implicit, { ...implicit, recurrence: { freq: 'daily', interval: 1, resetSubtasks: true } }));
  assert.ok(!sameNote(implicit, { ...implicit, recurrence: { freq: 'daily', interval: 1, resetSubtasks: false } }));
  for (const [key, value] of Object.entries(subtaskFields)) projection({ ...base('task'), subtasks: [{ ...subtask, [key]: value }] }, key);
  const withoutStep = base('task');
  const withStep = { ...withoutStep, content: '- [x] checked' };
  const disk = projection(withStep, 'body checklist');
  assert.deepEqual(disk.subtasks.map(({ title, completed }) => [title, completed]), [['checked', true]]);
  assert.deepEqual(selectableNoteFields(withoutStep, withStep), ['content']);
  assert.deepEqual(applyReviewedFields(disk, withoutStep, ['content']).subtasks, []);
  const raw = { ...withStep, subtasks: [subtask] };
  assert.deepEqual(editFromDisk(raw, noteDiskProjection(withoutStep)).subtasks, []);
});
