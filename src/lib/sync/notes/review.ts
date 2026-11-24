import type { SlagItem } from '../../../types/index.ts';
import { LEGACY_CUTOVER } from './legacyCutover.ts';
import { noteDifferences } from './merge.ts';
import { noteMergeViolations } from './mergeValidation.ts';
import { parseSubtasksFromContent } from '../../tasks/taskUtils.ts';

export const RECOVERED_DISK = 'recovered-disk';
export const needsReviewedHead = (fields: readonly string[]) => fields.includes(LEGACY_CUTOVER) || fields.includes(RECOVERED_DISK);

export function noteReviewKind(fields: readonly string[]): 'legacy' | 'review' | 'conflict' {
  if (fields.includes(LEGACY_CUTOVER)) return 'legacy';
  return !fields.length || fields.some((field) => ['base', 'predecessor', 'lifecycle', RECOVERED_DISK, 'update'].includes(field)) ? 'review' : 'conflict';
}

// Fields with separate projections (attachments, type and folder) still need a full-item decision.
const reviewable = new Set<string>(['title', 'tags', 'status', 'priority', 'dueDate', 'reminder', 'duration', 'recurrence',
  'subtasks', 'kanbanColumn', 'isPinned', 'isArchived', 'replyToId', 'linkedItemIds', 'streak', 'history',
  'lastCompletedDate', 'summary', 'readingTimeMinutes', 'customProps', 'content'] satisfies (keyof SlagItem)[]);

export function selectableNoteFields(head: SlagItem, local: SlagItem): string[] {
  if (head.type !== local.type) return [];
  const differences = noteDifferences(head, local);
  const bodyOwnsSubtasks = head.type === 'task' && (parseSubtasksFromContent(head.content).length || parseSubtasksFromContent(local.content).length);
  return differences.filter((key) => reviewable.has(key) && (key !== 'subtasks' || !bodyOwnsSubtasks));
}

export function applyReviewedFields(head: SlagItem, local: SlagItem, selected: readonly string[], content?: string): SlagItem {
  const allowed = new Set(selectableNoteFields(head, local));
  if (head.type !== local.type || (!selected.length && content === undefined) || selected.some((key) => !allowed.has(key))) {
    throw new Error('Неприменимые поля; проверьте выбранные свойства');
  }
  const fields = new Set(selected);
  const values = local as unknown as Record<string, unknown>;
  const item = { ...head, ...Object.fromEntries([...fields].map((key) => [key, values[key]])), updatedAt: Date.now() };
  if (content !== undefined) { item.content = content; fields.add('content'); }
  if (fields.has('content') && item.type === 'task') item.subtasks = parseSubtasksFromContent(item.content);
  for (const [field, value] of Object.entries(item)) {
    if (value === undefined) Reflect.deleteProperty(item, field);
  }
  const retained = new Set(noteDifferences(head, local).filter((key) => !fields.has(key) && key !== 'subtasks'));
  const violations = noteMergeViolations(item, local, head, fields, retained);
  if (violations.length) throw new Error('Выбранные свойства нельзя применить отдельно; проверьте связанные изменения');
  return item;
}
