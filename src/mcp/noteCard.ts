// The full card of one note: everything a client asks for in a single call, built without disk access.
//
// Nothing here touches the filesystem, the MCP server or a vault: the card is a pure view over a
// parsed SlagItem plus the facts the caller already resolved (paths, attachment bytes, links).
// That is what makes it cheap to reuse for a tool and for a resource, and testable with node:test.

import type { SlagAttachment, SlagItem, SlagItemPriority, SlagItemStatus, SlagItemType } from '../types';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  /** Nesting from leading whitespace: 0 is top level, 1 is one indent in. */
  depth: number;
}

export interface AttachmentCard {
  name: string;
  type: SlagAttachment['type'];
  mimeType: string;
  size: number;
  sizeHuman: string;
  isImage: boolean;
  /** `.attachments/<file>` inside the vault, exactly as the note records it. */
  relativePath: string;
  /** Real path on this machine, when the bytes were found. */
  absolutePath?: string;
  /** Usable url: a `file://` url for the desktop build, the MCP resource otherwise. */
  url: string;
  resourceUri: string;
  /** Bytes are on this machine; false means the file only lives on another device. */
  hasBytes: boolean;
  hasTranscript: boolean;
  duration?: number;
}

/** A note this one points at, or a note that points back at it. */
export interface NoteRelation {
  id: string;
  title?: string;
  type?: SlagItemType;
  path?: string;
}

export interface NoteCard {
  id: string;
  title: string;
  type: SlagItemType;
  folder: string;
  /** Folder path relative to the vault root, e.g. `Проекты/SLAG`. */
  folderPath: string;
  folderAbsolutePath?: string;
  /** Note file path relative to the vault root, e.g. `Проекты/SLAG/Идея.md`. */
  path: string;
  absolutePath?: string;
  filename: string;
  tags: string[];
  status?: SlagItemStatus;
  priority?: SlagItemPriority;
  dueDate?: string;
  reminder?: string;
  createdAt: number;
  createdAtIso: string;
  updatedAt: number;
  updatedAtIso: string;
  isPinned: boolean;
  isArchived: boolean;
  readingTimeMinutes?: number;
  summary?: string;
  checklist: { total: number; done: number; items: ChecklistItem[] };
  /** The file as it is on disk, frontmatter included. */
  markdown: string;
  /** The body only, as SlagItem stores it. */
  content: string;
  links: { replyTo?: NoteRelation; linked: NoteRelation[]; backlinks: NoteRelation[] };
  attachments: AttachmentCard[];
}

export interface NoteCardInput {
  item: SlagItem;
  rawMarkdown: string;
  /** Note path relative to the vault root, `/`-separated. */
  relativePath: string;
  absolutePath?: string;
  folderAbsolutePath?: string;
  attachments: AttachmentCard[];
  replyTo?: NoteRelation;
  linked?: NoteRelation[];
  backlinks?: NoteRelation[];
}

/** `- [ ] item` / `- [x] item`, any list marker, nesting from leading whitespace. */
const CHECKBOX_LINE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;

/** Checkboxes of a note body in document order, indentation kept as depth. */
export function parseChecklist(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  if (!content) return items;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(CHECKBOX_LINE);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, '  ').length;
    items.push({
      id: `st_${items.length}`,
      text: match[3].trim(),
      completed: match[2].toLowerCase() === 'x',
      depth: Math.floor(indent / 2),
    });
  }

  return items;
}

/** Human size for a chat answer: `940 Б`, `1.2 КБ`, `2.4 МБ`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Suffix for list lines: an empty string means the note has nothing attached. */
export function formatAttachmentCount(count: number): string {
  return count > 0 ? ` | вложения: ${count}` : '';
}

function toIso(milliseconds: number): string {
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : '';
}

function basenameOf(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[parts.length - 1] || relativePath;
}

function folderOf(relativePath: string, fallback: string): string {
  const index = relativePath.lastIndexOf('/');
  return index > 0 ? relativePath.slice(0, index) : fallback;
}

export function buildNoteCard(input: NoteCardInput): NoteCard {
  const { item } = input;
  const relativePath = input.relativePath.replace(/\\/g, '/');

  // Frontmatter subtasks are the legacy fallback; a note with checkboxes in the body keeps
  // nesting there, which a flat SlagSubtask[] cannot express.
  const fromContent = parseChecklist(item.content);
  const items: ChecklistItem[] = fromContent.length > 0
    ? fromContent
    : (item.subtasks ?? []).map((subtask, index) => ({
      id: subtask.id || `st_${index}`,
      text: subtask.title,
      completed: subtask.completed,
      depth: 0,
    }));
  const done = items.filter((entry) => entry.completed).length;

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    folder: item.folder,
    folderPath: folderOf(relativePath, item.folder),
    folderAbsolutePath: input.folderAbsolutePath,
    path: relativePath,
    absolutePath: input.absolutePath,
    filename: item.filename || basenameOf(relativePath),
    tags: item.tags,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    reminder: item.reminder,
    createdAt: item.createdAt,
    createdAtIso: toIso(item.createdAt),
    updatedAt: item.updatedAt,
    updatedAtIso: toIso(item.updatedAt),
    isPinned: Boolean(item.isPinned),
    isArchived: Boolean(item.isArchived),
    readingTimeMinutes: item.readingTimeMinutes,
    summary: item.summary,
    checklist: { total: items.length, done, items },
    markdown: input.rawMarkdown,
    content: item.content,
    links: {
      replyTo: input.replyTo,
      linked: input.linked ?? [],
      backlinks: input.backlinks ?? [],
    },
    attachments: input.attachments,
  };
}

function renderRelation(relation: NoteRelation): string {
  const label = relation.title ? `«${relation.title}»` : 'без названия';
  const type = relation.type ? `, ${relation.type}` : '';
  return `${label} (id: ${relation.id}${type})`;
}

function renderLinks(links: NoteCard['links']): string {
  const parts: string[] = [];
  if (links.replyTo) parts.push(`ответ на ${renderRelation(links.replyTo)}`);
  if (links.linked.length > 0) parts.push(`связано с ${links.linked.map(renderRelation).join(', ')}`);
  if (links.backlinks.length > 0) parts.push(`упоминают ${links.backlinks.map(renderRelation).join(', ')}`);
  return parts.length > 0 ? `связи: ${parts.join(' · ')}` : '';
}

function renderAttachment(attachment: AttachmentCard): string {
  const kind = attachment.isImage ? 'картинка' : attachment.type;
  const where = attachment.absolutePath
    ? `${attachment.relativePath} · ${attachment.absolutePath}`
    : `${attachment.relativePath} · байтов на этом диске нет`;
  const transcript = attachment.hasTranscript ? ' · есть извлечённый текст' : '';
  return `${attachment.name} · ${attachment.mimeType} · ${attachment.sizeHuman} · ${kind} · ${where} · ${attachment.url}${transcript}`;
}

/** The card as chat text: facts first, the untouched markdown at the end. */
export function renderNoteCard(card: NoteCard): string {
  const kind = card.type === 'task' ? 'задача' : card.type === 'article' ? 'статья' : 'заметка';
  const lines: string[] = [`${kind} «${card.title}»`, `id: ${card.id}`];
  const folder = card.folderAbsolutePath ? `${card.folder} (${card.folderAbsolutePath})` : card.folder;
  lines.push(`папка: ${folder}`);
  lines.push(`файл: ${card.path}${card.filename && card.filename !== basenameOf(card.path) ? ` (${card.filename})` : ''}`);

  const taskFacts = [
    card.status ? `статус: ${card.status}` : '',
    card.priority && card.priority !== 'none' ? `приоритет: ${card.priority}` : '',
    card.dueDate ? `срок: ${card.dueDate}` : '',
    card.reminder ? `напоминание: ${card.reminder}` : '',
  ].filter(Boolean);
  if (taskFacts.length > 0) lines.push(taskFacts.join(' · '));

  lines.push(`создано: ${card.createdAtIso} · изменено: ${card.updatedAtIso}`);
  if (card.tags.length > 0) lines.push(`теги: ${card.tags.map((tag) => `#${tag}`).join(' ')}`);
  if (card.isPinned) lines.push('закреплено: да');
  if (card.isArchived) lines.push('в архиве: да');
  if (card.readingTimeMinutes) lines.push(`чтение: ${card.readingTimeMinutes} мин`);
  if (card.summary) lines.push(`кратко: ${card.summary}`);
  const links = renderLinks(card.links);
  if (links) lines.push(links);

  lines.push('');
  lines.push(card.checklist.total > 0
    ? `чеклист: ${card.checklist.done}/${card.checklist.total}`
    : 'чеклист: пусто');
  for (const item of card.checklist.items) {
    lines.push(`${'  '.repeat(item.depth)}- [${item.completed ? 'x' : ' '}] ${item.text}`);
  }

  lines.push('');
  lines.push(card.attachments.length > 0 ? `вложения: ${card.attachments.length}` : 'вложения: нет');
  card.attachments.forEach((attachment, index) => {
    lines.push(`${index + 1}. ${renderAttachment(attachment)}`);
  });

  lines.push('');
  lines.push('markdown:');
  lines.push(card.markdown.trimEnd());
  return lines.join('\n');
}
