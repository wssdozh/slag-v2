// Domain defaults shared by Markdown projection and registry comparison.
import type { SlagAttachment, SlagItem } from '../../types/index.ts';
import { parseSubtasksFromContent } from '../tasks/taskUtils.ts';

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
    ...(value.type === 'task' && { status: value.status ?? 'todo', priority: value.priority ?? 'none' }) };
}
