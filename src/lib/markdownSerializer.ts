import YAML from 'yaml';
import type { SlagItem, SlagItemType } from '../types';

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
    if (item.priority && item.priority !== 'none') frontmatterData.priority = item.priority;
    if (item.dueDate) frontmatterData.dueDate = item.dueDate;
    if (item.reminder) frontmatterData.reminder = item.reminder;
    if (item.subtasks && item.subtasks.length > 0) frontmatterData.subtasks = item.subtasks;
  }

  if (item.type === 'article') {
    if (item.readingTimeMinutes) frontmatterData.readingTime = item.readingTimeMinutes;
    if (item.summary) frontmatterData.summary = item.summary;
  }

  if (item.attachments && item.attachments.length > 0) {
    frontmatterData.attachments = item.attachments.map(att => ({
      id: att.id,
      name: att.name,
      type: att.type,
      mimeType: att.mimeType,
      size: att.size,
      relativePath: att.relativePath,
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
  };

  if (type === 'task') {
    item.status = frontmatter.status || 'todo';
    item.priority = frontmatter.priority || 'none';
    item.dueDate = frontmatter.dueDate;
    item.reminder = frontmatter.reminder;
    item.subtasks = Array.isArray(frontmatter.subtasks) ? frontmatter.subtasks : [];
  }

  if (type === 'article') {
    item.readingTimeMinutes = frontmatter.readingTime || Math.max(1, Math.round(body.split(/\s+/).length / 200));
    item.summary = frontmatter.summary;
  }

  return item;
}
