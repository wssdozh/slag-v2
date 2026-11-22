import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMarkdown } from '../src/lib/text/mergeMarkdown.ts';
import { mergeNote, sameNote } from '../src/lib/sync/notes/merge.ts';
import { candidate } from '../src/lib/sync/notes/reconcile.ts';

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
