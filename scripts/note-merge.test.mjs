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
