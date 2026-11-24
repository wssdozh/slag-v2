// Domain defaults shared by Markdown projection and registry comparison.
import type { RecurrenceRule, SlagAttachment, SlagItem } from '../../types/index.ts';
import { parseSubtasksFromContent } from '../tasks/taskUtils.ts';

export const taskOnlyFields = ['status', 'priority', 'dueDate', 'reminder', 'duration', 'recurrence', 'streak', 'history', 'lastCompletedDate', 'subtasks', 'kanbanColumn'] as const;
export const articleOnlyFields = ['readingTimeMinutes', 'summary'] as const;

/** Keep the locally saved and synced record consistent with what its new kind can store. */
export function projectItemKind(item: SlagItem): SlagItem {
  const next = { ...item };
  if (next.type !== 'task') for (const key of taskOnlyFields) delete next[key];
  if (next.type !== 'article') for (const key of articleOnlyFields) delete next[key];
  return next;
}

export function stripNoteTransportFields(item: SlagItem): SlagItem {
  const { filename: _filename, ...rest } = item;
  const attachments = item.attachments.map(({ dataUrl: _dataUrl, enrichmentStatus, ...metadata }): SlagAttachment =>
    enrichmentStatus === 'ready' || enrichmentStatus === 'error' ? { ...metadata, enrichmentStatus } : metadata);
  return { ...rest, attachments };
}

export function frontmatterTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((tag) => String(tag).replace(/^#/, ''));
  return typeof raw === 'string' ? raw.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean) : [];
}

export const normalizeNoteBody = (content: string) => content.replace(/\r\n/g, '\n');

export const estimateReadingMinutes = (content: string) => Math.max(1, Math.round(content.trim().split(/\s+/).length / 200));

export function recurrenceProperties(rule: RecurrenceRule | undefined) {
  return rule && { ...rule, interval: rule.interval ?? 1, resetSubtasks: rule.resetSubtasks ?? true };
}

export function noteProperties(item: SlagItem) {
  const { updatedAt: _updatedAt, createdAt: _createdAt, ...value } = stripNoteTransportFields(item);
  const content = normalizeNoteBody(value.content);
  const subtasks = value.type === 'task' && content.includes('[') ? parseSubtasksFromContent(content) : [];
  return { ...value, content,
    subtasks: subtasks.length ? subtasks : value.subtasks ?? [],
    dueDate: value.dueDate || undefined, kanbanColumn: value.kanbanColumn || undefined,
    replyToId: value.replyToId || undefined, history: value.history?.length ? value.history : undefined,
    linkedItemIds: value.linkedItemIds?.length ? value.linkedItemIds : undefined,
    isPinned: value.isPinned ?? false, isArchived: value.isArchived ?? false,
    customProps: value.customProps && Object.keys(value.customProps).length ? value.customProps : undefined,
    ...(value.type === 'article' && { readingTimeMinutes: value.readingTimeMinutes || estimateReadingMinutes(content) }),
    ...(value.type === 'task' && { status: value.status ?? 'todo', priority: value.priority ?? 'none',
      recurrence: recurrenceProperties(value.recurrence) }) };
}
