import YAML from 'yaml';
import type { SlagItem, SlagItemType } from '../types';
import { parseSubtasksFromContent } from './taskUtils';

/**
 * Serializes a SlagItem into Markdown with YAML Frontmatter (Obsidian-compatible).
 */
export function serializeItemToMarkdown(item: SlagItem): string {
  const frontmatterData: Record<string, any> = {
    id: item.id,
    type: item.type,
    title: item.title,
    created: item.createdAt,
    updated: item.updatedAt,
    tags: item.tags || [],
    folder: item.folder || 'Входящие',
  };

  if (item.isPinned) frontmatterData.pinned = true;
  if (item.isArchived) frontmatterData.archived = true;

  if (item.type === 'task') {
    if (item.status) frontmatterData.status = item.status;
    if (item.kanbanColumn) frontmatterData.kanbanColumn = item.kanbanColumn;
    if (item.priority && item.priority !== 'none') frontmatterData.priority = item.priority;
    if (item.dueDate) frontmatterData.dueDate = item.dueDate;
    if (item.reminder) frontmatterData.reminder = item.reminder;
    if (item.duration !== undefined) frontmatterData.duration = item.duration;
    if (item.recurrence) frontmatterData.recurrence = item.recurrence;
    if (typeof item.streak === 'number') frontmatterData.streak = item.streak;
    if (item.lastCompletedDate) frontmatterData.lastCompletedDate = item.lastCompletedDate;
    if (Array.isArray(item.history) && item.history.length > 0) frontmatterData.history = item.history;
    if (item.subtasks && item.subtasks.length > 0) {
      if (!/^\s*[-*+]\s*\[[ xX]\]/m.test(item.content || '')) {
        frontmatterData.subtasks = item.subtasks;
      }
    }
  }

  if (item.type === 'article') {
    if (item.readingTimeMinutes) frontmatterData.readingTime = item.readingTimeMinutes;
    if (item.summary) frontmatterData.summary = item.summary;
  }

  if (item.replyToId) {
    frontmatterData.replyTo = item.replyToId;
  }

  if (item.linkedItemIds && item.linkedItemIds.length > 0) {
    frontmatterData.linked = item.linkedItemIds;
  }

  if (item.attachments && item.attachments.length > 0) {
    frontmatterData.attachments = item.attachments.map(att => ({
      id: att.id,
      name: att.name,
      type: att.type,
      mimeType: att.mimeType,
      size: att.size,
      relativePath: att.relativePath,
      ...(att.duration !== undefined ? { duration: att.duration } : {}),
      ...(att.waveform ? { waveform: att.waveform } : {}),
      ...(att.extractedText ? { extractedText: att.extractedText } : {}),
      ...(att.summary ? { summary: att.summary } : {}),
      ...(att.enrichmentStatus ? { enrichmentStatus: att.enrichmentStatus } : {}),
    }));
  }

  const yamlString = YAML.stringify(frontmatterData).trim();
  const body = (item.content || '').trim();

  return `---\n${yamlString}\n---\n\n${body}\n`;
}

/**
 * Parses raw Markdown text with YAML frontmatter into a SlagItem.
 */
export function parseMarkdownToItem(rawContent: string, fallbackId: string, fallbackFolder: string = 'Входящие'): SlagItem {
  let frontmatter: Record<string, any> = {};
  let body = rawContent;

  const fmMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    try {
      frontmatter = (YAML.parse(fmMatch[1]) as Record<string, any>) || {};
      body = fmMatch[2] || '';
    } catch {
      // If YAML parse fails, fallback to entire raw string as body
      body = rawContent;
    }
  }

  const id = frontmatter.id || fallbackId;
  const type: SlagItemType = (['note', 'article', 'task'].includes(frontmatter.type) ? frontmatter.type : 'note') as SlagItemType;
  
  // Title fallback: from frontmatter -> from first # Heading -> first line -> Untitled
  let title = frontmatter.title;
  if (!title) {
    const headingMatch = body.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    } else {
      const firstLine = body.split('\n')[0]?.trim();
      title = firstLine ? firstLine.slice(0, 40) : 'Без названия';
    }
  }

  // Tags fallback
  let tags: string[] = [];
  if (Array.isArray(frontmatter.tags)) {
    tags = frontmatter.tags.map(t => String(t).replace(/^#/, ''));
  } else if (typeof frontmatter.tags === 'string') {
    tags = frontmatter.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
  }

  // Also extract inline #hashtags from body if any
  const inlineTags = Array.from(body.matchAll(/#([a-zA-Zа-яА-Я0-9_-]+)/g)).map(m => m[1]);
  const allTags = Array.from(new Set([...tags, ...inlineTags]));

  const item: SlagItem = {
    id,
    type,
    title,
    content: body.trim(),
    folder: frontmatter.folder || fallbackFolder,
    tags: allTags,
    attachments: Array.isArray(frontmatter.attachments) ? frontmatter.attachments : [],
    createdAt: Number(frontmatter.created) || Date.now(),
    updatedAt: Number(frontmatter.updated) || Date.now(),
    isPinned: Boolean(frontmatter.pinned),
    isArchived: Boolean(frontmatter.archived),
    replyToId: frontmatter.replyTo || undefined,
    linkedItemIds: Array.isArray(frontmatter.linked) ? frontmatter.linked : undefined,
  };

  if (type === 'task') {
    item.status = frontmatter.status || 'todo';
    item.kanbanColumn = frontmatter.kanbanColumn;
    item.priority = frontmatter.priority || 'none';
    item.dueDate = frontmatter.dueDate;
    item.reminder = frontmatter.reminder;
    if (frontmatter.duration !== undefined) {
      const parsedDuration = Number(frontmatter.duration);
      if (!isNaN(parsedDuration) && parsedDuration > 0) {
        item.duration = parsedDuration;
      }
    }
    if (frontmatter.recurrence) {
      if (typeof frontmatter.recurrence === 'string') {
        const freq = frontmatter.recurrence.toLowerCase();
        if (['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(freq)) {
          item.recurrence = { freq: freq as any, interval: 1 };
        }
      } else if (typeof frontmatter.recurrence === 'object' && frontmatter.recurrence.freq) {
        item.recurrence = {
          freq: frontmatter.recurrence.freq,
          interval: Number(frontmatter.recurrence.interval) || 1,
          weekdays: Array.isArray(frontmatter.recurrence.weekdays) ? frontmatter.recurrence.weekdays : undefined,
          resetSubtasks: frontmatter.recurrence.resetSubtasks !== false,
        };
      }
    }
    if (frontmatter.streak !== undefined) {
      const parsedStreak = Number(frontmatter.streak);
      if (!isNaN(parsedStreak) && parsedStreak >= 0) {
        item.streak = parsedStreak;
      }
    }
    if (typeof frontmatter.lastCompletedDate === 'string') {
      item.lastCompletedDate = frontmatter.lastCompletedDate;
    }
    if (Array.isArray(frontmatter.history)) {
      item.history = frontmatter.history.filter((d: unknown): d is string => typeof d === 'string');
    }
    const parsedSubtasks = parseSubtasksFromContent(body);
    item.subtasks = parsedSubtasks.length > 0
      ? parsedSubtasks
      : (Array.isArray(frontmatter.subtasks) ? frontmatter.subtasks : []);
  }

  if (type === 'article') {
    item.readingTimeMinutes = frontmatter.readingTime || Math.max(1, Math.round(body.split(/\s+/).length / 200));
    item.summary = frontmatter.summary;
  }

  return item;
}
