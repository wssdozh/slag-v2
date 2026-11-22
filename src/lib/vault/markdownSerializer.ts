import YAML from 'yaml';
import type { SlagItem, SlagItemType, SlagAttachment } from '../../types';
import { parseSubtasksFromContent } from '../tasks/taskUtils';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { isSafeVaultRelativePath, safeVaultRelativePath } from './safePath';
import { normalizeReminder } from '../time/reminder';
import { withoutSpoilers } from '../text/noteDisclosure';

/**
 * Serializes a SlagItem into Markdown with YAML Frontmatter (Obsidian-compatible).
 */
export function serializeItemToMarkdown(item: SlagItem, registryBodyDigest?: string): string {
  const frontmatterData: Record<string, any> = {
    id: item.id,
    type: item.type,
    title: item.title,
    created: item.createdAt,
    updated: item.updatedAt,
    tags: item.tags || [],
    folder: item.folder || DEFAULT_INBOX_FOLDER,
  };

  if (item.isPinned) frontmatterData.pinned = true;
  if (item.isArchived) frontmatterData.archived = true;

  if (item.type === 'task') {
    if (item.status) frontmatterData.status = item.status;
    if (item.kanbanColumn) frontmatterData.kanbanColumn = item.kanbanColumn;
    if (item.priority && item.priority !== 'none') frontmatterData.priority = item.priority;
    if (item.dueDate) frontmatterData.dueDate = item.dueDate;
    if (item.reminder) {
      // На диск — только ISO с offset: голое `10:00` из старых записей дописывается до момента
      // дня задачи, а нераспознанное остаётся как есть (стирать чужие данные нельзя).
      const reminder = normalizeReminder(item.reminder, item.dueDate);
      if (reminder) frontmatterData.reminder = reminder;
    }
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
      ...(att.registryBlobId ? { registryBlobId: att.registryBlobId } : {}),
      ...(att.duration !== undefined ? { duration: att.duration } : {}),
      ...(att.waveform ? { waveform: att.waveform } : {}),
      ...(att.extractedText ? { extractedText: att.extractedText } : {}),
      ...(att.summary ? { summary: att.summary } : {}),
      // `processing` is a live promise, not a fact: a note saved mid-run must not come back
      // from disk claiming a job that nobody is running any more.
      ...(att.enrichmentStatus && att.enrichmentStatus !== 'processing'
        ? { enrichmentStatus: att.enrichmentStatus }
        : {}),
    }));
  }

  if (registryBodyDigest) frontmatterData.slagRegistryBody = registryBodyDigest;
  const yamlString = YAML.stringify(frontmatterData).trim();
  const body = (item.content || '').trim();

  return `---\n${yamlString}\n---\n\n${body}\n`;
}

/**
 * Parses raw Markdown text with YAML frontmatter into a SlagItem.
 */
export function parseMarkdownToItem(rawContent: string, fallbackId: string, fallbackFolder: string = DEFAULT_INBOX_FOLDER,
  onRegistryBody?: (digest: string) => void): SlagItem {
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

  const id = typeof frontmatter.id === 'string' && isSafeVaultRelativePath(frontmatter.id)
    ? frontmatter.id
    : fallbackId;
  if (typeof frontmatter.slagRegistryBody === 'string') onRegistryBody?.(frontmatter.slagRegistryBody);
  const type: SlagItemType = (['note', 'article', 'task'].includes(frontmatter.type) ? frontmatter.type : 'note') as SlagItemType;
  
  const visibleBody = withoutSpoilers(body);
  // Title fallback: from frontmatter -> from first # Heading -> first line -> Untitled
  let title = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
  if (!title) {
    const headingMatch = visibleBody.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    } else {
      const firstLine = visibleBody.split('\n')[0]?.trim();
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
  const inlineTags = Array.from(visibleBody.matchAll(/#([a-zA-Zа-яА-Я0-9_-]+)/g)).map(m => m[1]);
  const allTags = Array.from(new Set([...tags, ...inlineTags]));

  const item: SlagItem = {
    id,
    type,
    title,
    content: body.trim(),
    folder: typeof frontmatter.folder === 'string' && isSafeVaultRelativePath(frontmatter.folder)
      ? frontmatter.folder
      : (isSafeVaultRelativePath(fallbackFolder) ? safeVaultRelativePath(fallbackFolder) : DEFAULT_INBOX_FOLDER),
    tags: allTags,
    attachments: Array.isArray(frontmatter.attachments)
      // Anything written by an older build that did persist a running job: nobody is running
      // it, so the spinner would spin forever. Only `ready` and `error` survive a reload.
      ? frontmatter.attachments
        .filter((att: unknown): att is SlagAttachment => typeof att === 'object' && att !== null)
        .map((att: SlagAttachment) =>
          att.enrichmentStatus === 'processing' ? { ...att, enrichmentStatus: 'idle' as const } : att)
      : [],
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
