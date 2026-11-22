// Reject combinations whose individual property edits do not compose safely.
import type { SlagItem } from '../../../types/index.ts';
import { resolveAttachmentEmbeds } from '../../text/attachmentEmbed.ts';
import { isSafeVaultRelativePath } from '../../vault/safePath.ts';

const taskFields = ['status', 'priority', 'dueDate', 'reminder', 'duration', 'recurrence', 'streak', 'history', 'lastCompletedDate', 'subtasks', 'kanbanColumn'];
const articleFields = ['summary', 'readingTimeMinutes'];
const completion = ['status', 'history', 'streak', 'lastCompletedDate', 'subtasks'];
const schedule = ['dueDate', 'reminder', 'duration', 'recurrence'];

function validDay(day: unknown): boolean {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === day;
}

export function noteMergeViolations(item: SlagItem, local: SlagItem, head: SlagItem,
  mine: ReadonlySet<string>, theirs: ReadonlySet<string>): string[] {
  const fields: string[] = [];
  if (item.id !== head.id || item.id !== local.id || !isSafeVaultRelativePath(item.id)) fields.push('id');
  if (!isSafeVaultRelativePath(item.folder)) fields.push('folder');
  const crosses = (left: readonly string[], right: readonly string[]) =>
    (left.some((key) => mine.has(key)) && right.some((key) => theirs.has(key)))
    || (left.some((key) => theirs.has(key)) && right.some((key) => mine.has(key)));
  if (local.type !== head.type && crosses(['type'], [...taskFields, ...articleFields])) fields.push('type');
  if (item.type !== 'task' && taskFields.some((key) => key !== 'subtasks' && Object.hasOwn(item, key))) fields.push('type');
  if (item.type !== 'article' && articleFields.some((key) => Object.hasOwn(item, key))) fields.push('type');
  if (item.type === 'task') {
    if (crosses(completion, schedule) && (item.recurrence || mine.has('recurrence') || theirs.has('recurrence'))) fields.push('recurrence');
    if (crosses(['status'], ['subtasks', 'kanbanColumn'])) fields.push('status');
    if (crosses(['dueDate'], ['reminder'])) fields.push('reminder');
    if (item.dueDate !== undefined && !validDay(item.dueDate)) fields.push('dueDate');
    if (item.reminder !== undefined && (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(item.reminder) || !Number.isFinite(Date.parse(item.reminder)))) fields.push('reminder');
  }
  if ((mine.has('attachments') || theirs.has('attachments')) && (mine.has('content') || theirs.has('content'))) {
    const resolved = (note: SlagItem) => resolveAttachmentEmbeds(note.content, note.attachments);
    const matches = [...resolved(local), ...resolved(head)];
    const destinations = new Map<string, Set<string | undefined>>();
    for (const { embed, attachment } of matches) {
      const options = destinations.get(embed.name) ?? new Set();
      options.add(attachment?.id);
      destinations.set(embed.name, options);
    }
    if (resolved(item).some(({ embed, attachment }) => {
      const options = destinations.get(embed.name);
      return options ? !options.has(attachment?.id) || (options.size > 1 && !attachment) : false;
    })) fields.push('attachments');
  }
  return fields;
}
