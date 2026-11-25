import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMarkdown } from '../src/lib/text/mergeMarkdown.ts';
import { mergeNote, sameNote } from '../src/lib/sync/notes/merge.ts';
import { candidate } from '../src/lib/sync/notes/reconcile.ts';
import { applyReviewedFields } from '../src/lib/sync/notes/review.ts';

const base = { id: 'one', type: 'note', folder: 'Inbox', title: 'old', content: 'First\nSeparator\nLast',
  tags: [], attachments: [], createdAt: 1, updatedAt: 1 };

test('independent Markdown edits and property changes compose', () => {
  const remote = { ...base, title: 'remote', content: 'Top\nSeparator\nLast', customProps: { remote: 'value' } };
  const local = { ...base, tags: ['local'], content: 'First\nSeparator\nBottom', customProps: { local: 0 } };
  const { item, conflicts } = mergeNote(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.equal(item.title, 'remote');
  assert.equal(item.content, 'Top\nSeparator\nBottom');
  assert.deepEqual(item.tags, ['local']);
  assert.deepEqual(item.customProps, { remote: 'value', local: 0 });
});

test('identical edits coalesce; repeated ambiguous lines, same-position inserts and limits do not guess', () => {
  assert.equal(mergeMarkdown('a', 'b', 'b'), 'b');
  assert.equal(mergeMarkdown('A\nB\nB\nB', 'A\nB\nB', 'A\nB\nremote\nB'), undefined);
  assert.equal(mergeMarkdown('A\nB', 'A\nx\nB', 'A\ny\nB'), undefined);
  const big = 'x'.repeat(256 * 1024);
  assert.equal(mergeMarkdown(big, `${big}\na`, `b\n${big}`), undefined);
});

test('adjacent plain replacements compose symmetrically without rewriting paragraph separators', () => {
  const cases = [
    ['Первый\nВторой', 'Первый изменён\nВторой', 'Первый\nВторой изменён', 'Первый изменён\nВторой изменён'],
    ['Alpha\n\nOmega', 'A\nExtra line\n\nOmega', 'Alpha\n\nZ', 'A\nExtra line\n\nZ'],
    ['# Section\nAlpha\n   \nOmega\n# End', '# Section\nA\n   \nOmega\n# End', '# Section\nAlpha\n   \nZ\n# End', '# Section\nA\n   \nZ\n# End'],
    ['A\nB', 'A\nsame\nB', 'A\nsame\nB', 'A\nsame\nB'],
  ];
  for (const [base, left, right, expected] of cases) {
    assert.equal(mergeMarkdown(base, left, right), expected);
    assert.equal(mergeMarkdown(base, right, left), expected);
  }
});

test('range uncertainty, Markdown structure and changed code fences stop concurrent merges', () => {
  const cases = [
    ['Alpha\nBeta\nGamma', 'A\nB\nGamma', 'Alpha\nX\nY'],
    ['Alpha\nBeta', 'Beta\nAlpha', 'Alpha\nZ'],
    ['A\nB\nB\nB', 'A\nB\nB', 'A\nB\nremote\nB'],
    ['Alpha\nBeta', '- Alpha\nBeta', 'Alpha\nZ'],
    ['Alpha\n\nBeta', 'A\nBeta', 'Alpha\n\nZ'],
    ['Before\nParagraph\nExample\nNext\nAfter', 'Before\n```\nParagraph\nExample\nNext\n```\nAfter', 'Before\nParagraph\n# Heading\nExample\nNext\nAfter'],
    ['A\nAnchor\nB', '```\nA\nAnchor\nB', 'A\nAnchor\nB\n```'],
    ['A\nAnchor\nB', '> - ~~~js\nA\nAnchor\nB', 'A\nAnchor\nMore'],
    ['A\n```\nB\nAnchor\nC', '```\nA\nB\nAnchor\nC', 'A\n```\nB\nAnchor\nMore'],
    ['A\n```\nB\nAnchor\nC', 'A\nB\nAnchor\nC', 'A\n```\nB\nAnchor\nMore'],
  ];
  for (const [base, left, right] of cases) {
    assert.equal(mergeMarkdown(base, left, right), undefined, left);
    assert.equal(mergeMarkdown(base, right, left), undefined, right);
  }
  const withFence = '~~~js\nExample\n~~~';
  assert.equal(mergeMarkdown('Example', withFence, 'Example'), withFence);
  assert.equal(mergeMarkdown('Example', withFence, withFence), withFence);
  assert.equal(mergeMarkdown('~~~\nExample\n~~~\nAfter\nAnchor\nEnd', '~~~\nExample\n~~~\nA\nAnchor\nEnd', '~~~\nExample\n~~~\nAfter\nAnchor\nZ'), '~~~\nExample\n~~~\nA\nAnchor\nZ');
  const long = Array.from({ length: 8_001 }, (_, i) => `Line ${i}`).join('\n');
  assert.equal(mergeMarkdown(long, `A\n${long}`, `${long}\nZ`), undefined);
});

test('only tags merge by membership, with stable order and conservative ambiguity checks', () => {
  const combine = (original, mine, theirs) => mergeNote({ ...base, tags: original }, { ...base, tags: mine }, { ...base, tags: theirs });
  const cases = [
    [['base'], ['base', 'z'], ['base', 'a'], ['base', 'a', 'z']],
    [['base', 'old'], ['base'], ['base', 'old', 'new'], ['base', 'new']],
    [['z', 'a'], ['z', 'a', 'common', 'b'], ['z', 'a', 'common', 'c'], ['z', 'a', 'b', 'c', 'common']],
    [['base', 'old'], ['base', 'one'], ['base', 'two'], undefined],
    [['a', 'b'], ['b', 'a'], ['a', 'b', 'new'], undefined],
    [['base'], ['base', 'new', 'new'], ['base', 'other'], undefined],
    [['base'], ['base', 'Work'], ['base', 'work'], undefined],
  ];
  for (const [original, mine, theirs, expected] of cases) {
    for (const [left, right] of [[mine, theirs], [theirs, mine]]) {
      const { item, conflicts } = combine(original, left, right);
      assert.deepEqual(conflicts, expected ? [] : ['tags']);
      if (expected) assert.deepEqual(item.tags, expected);
    }
  }
  assert.deepEqual(combine(['base'], ['z', 'base', 'a'], ['base']).item.tags, ['z', 'base', 'a']);
  assert.deepEqual(mergeNote(base, { ...base, linkedItemIds: ['one'] }, { ...base, linkedItemIds: ['two'] }).conflicts, ['linkedItemIds']);
});

test('incompatible type and attachment edits are reported rather than synthesized', () => {
  const task = { ...base, type: 'task' };
  assert.ok(mergeNote(task, { ...task, dueDate: '2026-11-22' }, { ...task, type: 'note' }).conflicts.includes('type'));
  const attached = { ...base, attachments: [{ id: 'image', type: 'image', name: 'image.png' }] };
  assert.ok(mergeNote(attached, { ...attached, content: '![[image.png]]' }, base).conflicts.includes('attachments'));
});

test('a shared task outcome does not conflict with an independent field already valid on either device', () => {
  const task = { ...base, type: 'task', status: 'todo', dueDate: '2026-11-20', recurrence: { freq: 'daily' }, content: '- [ ] step' };
  const closed = { ...task, status: 'done', streak: 1, history: ['2026-11-20'], lastCompletedDate: '2026-11-20', content: '- [x] step' };
  const withTags = { ...closed, tags: ['mine'] };
  const withReminder = { ...closed, reminder: '2026-11-20T12:00:00Z' };
  const moved = { ...task, dueDate: '2026-11-22' };
  for (const [before, left, right, expected] of [
    [task, withTags, withReminder, { ...withReminder, tags: ['mine'] }],
    [task, { ...moved, tags: ['mine'] }, { ...moved, reminder: '2026-11-22T12:00:00Z' },
      { ...moved, tags: ['mine'], reminder: '2026-11-22T12:00:00Z' }],
  ]) {
    for (const [local, head] of [[left, right], [right, left]]) {
      const merged = mergeNote(before, local, head);
      assert.deepEqual(merged.conflicts, []);
      assert.ok(sameNote(merged.item, expected));
    }
  }
  assert.ok(mergeNote(task, closed, { ...task, reminder: withReminder.reminder }).conflicts.includes('recurrence'));
  assert.ok(mergeNote(task, moved, { ...task, reminder: withReminder.reminder }).conflicts.includes('reminder'));
});

test('a first Markdown checkbox does not silently replace an independent legacy checklist edit', () => {
  const task = { ...base, type: 'task' };
  const legacy = { ...task, subtasks: [{ id: 'legacy', title: 'Legacy step', completed: true }] };
  const markdown = { ...task, content: `${task.content}\n\n- [ ] Markdown step` };
  for (const [local, head] of [[legacy, markdown], [markdown, legacy]]) {
    assert.deepEqual(mergeNote(task, local, head).conflicts, ['subtasks']);
  }
  const sameStep = { ...markdown, content: `${task.content}\n\n- [x] Legacy step` };
  assert.deepEqual(mergeNote(task, legacy, sameStep).conflicts, []);
  const removed = { ...legacy, subtasks: [] };
  assert.deepEqual(mergeNote(legacy, removed, { ...legacy, title: 'New title' }).item.subtasks, []);
  assert.deepEqual(mergeNote(legacy, removed, sameStep).conflicts, ['subtasks']);
  assert.deepEqual(mergeNote(task, { ...task, title: 'New title' }, markdown).conflicts, []);
});

test('concurrent edits cannot attach a changed caption to a different same-name file', () => {
  const attachment = (id) => ({ id, type: 'file', name: 'sheet.pdf', relativePath: `.attachments/${id}` });
  const attached = { ...base, content: 'Top\n\n![[sheet.pdf|Old caption]]\n\nBottom', attachments: [attachment('A'), attachment('B')] };
  const caption = { ...attached, content: attached.content.replace('Old caption', 'Edited caption') };
  const reordered = { ...attached, attachments: [...attached.attachments].reverse() };
  for (const [local, head] of [[caption, reordered], [reordered, caption]]) {
    assert.deepEqual(mergeNote(attached, local, head).conflicts, ['attachments']);
  }
  assert.throws(() => applyReviewedFields(reordered, caption, ['content']), /связанные изменения/);
  const explicit = caption.content.replace('sheet.pdf', 'A');
  assert.equal(applyReviewedFields(reordered, caption, ['content'], explicit).content, explicit);
  assert.deepEqual(mergeNote(attached, { ...attached, content: attached.content.replace('Top', 'Introduction') }, reordered).conflicts, []);
  const stable = { ...attached, content: attached.content.replace('sheet.pdf', 'A') };
  assert.deepEqual(mergeNote(stable, { ...stable, content: stable.content.replace('Old caption', 'Edited caption') },
    { ...stable, attachments: reordered.attachments }).conflicts, []);
});

test('two explicit ISO representations of one one-off reminder do not generate a conflict or revision', () => {
  const task = { ...base, type: 'task' };
  const local = { ...task, reminder: '2026-11-24T10:00:00+03:00' };
  const head = { ...task, reminder: '2026-11-24T07:00:00Z' };
  assert.ok(sameNote(local, head));
  assert.deepEqual(mergeNote(task, local, head).conflicts, []);
  assert.equal(mergeNote(task, local, head).item.reminder, head.reminder);
  assert.ok(!sameNote(local, { ...head, reminder: '2026-11-24T10:00:00+05:00' }));
  assert.ok(!sameNote(local, { ...head, reminder: '2026-11-24T07:00:00' }));
  assert.ok(!sameNote({ ...local, reminder: '2026-11-31T10:00:00+03:00' }, { ...head, reminder: '2026-12-01T07:00:00Z' }));
  const later = mergeNote(local, head, { ...local, dueDate: '2026-11-25' });
  assert.deepEqual(later.conflicts, []);
  assert.equal(later.item.dueDate, '2026-11-25');
  const recurrence = { freq: 'daily' };
  assert.equal(sameNote({ ...local, recurrence }, { ...head, recurrence }), false);
  assert.deepEqual(mergeNote({ ...task, recurrence }, { ...local, recurrence }, { ...head, recurrence }).conflicts, ['reminder']);
});

test('normalization ignores a running enrichment, not actual metadata or custom null', () => {
  const attachment = { id: 'image', type: 'image', name: 'image.png' };
  assert.ok(sameNote({ ...base, attachments: [{ ...attachment, enrichmentStatus: 'processing' }] }, { ...base, attachments: [attachment] }));
  assert.ok(!sameNote({ ...base, attachments: [{ ...attachment, enrichmentError: 'offline' }] }, { ...base, attachments: [attachment] }));
  assert.ok(!sameNote({ ...base, customProps: { key: null } }, { ...base, customProps: {} }));
});

test('a legacy synthetic base cannot opt into rebase or replace a different current snapshot', () => {
  const local = { ...base, content: 'edited' };
  const intent = { id: base.id, intentId: 'legacy', kind: 'update', item: local, base: { revision: 2, item: base } };
  const head = { revision: 2, since: 1, item: { ...base, title: 'actual latest' } };
  assert.equal(candidate(intent, head).skip, true);
  assert.equal(candidate({ ...intent, base: { ...intent.base, revision: 1 } }, head).skip, true);
});
