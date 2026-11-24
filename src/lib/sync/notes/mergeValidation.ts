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
  mine: ReadonlySet<string>, theirs: ReadonlySet<string>, base?: SlagItem): string[] {
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
    const localEmbeds = resolved(local), headEmbeds = resolved(head);
    const matches = [...localEmbeds, ...headEmbeds];
    const destinations = new Map<string, Set<string | undefined>>();
    for (const { embed, attachment } of matches) {
      const options = destinations.get(embed.name) ?? new Set();
      options.add(attachment?.id);
      destinations.set(embed.name, options);
    }
    const merged = resolved(item);
    const rejectsBinding = merged.some(({ embed, attachment }) => {
      const options = destinations.get(embed.name);
      return options ? !options.has(attachment?.id) || (options.size > 1 && !attachment) : false;
    });
    // Keep a changed token's binding from the side that edited it, not just any ID
    // another occurrence of that file name happened to resolve to.
    const byToken = (list: ReturnType<typeof resolved>) => {
      const tokens = new Map<string, (string | undefined)[]>();
      for (const { embed: { name, label }, attachment } of list) {
        const key = JSON.stringify([name, label]);
        const ids = tokens.get(key);
        if (ids) ids.push(attachment?.id);
        else tokens.set(key, [attachment?.id]);
      }
      return tokens;
    };
    const reference = base && byToken(resolved(base)), result = byToken(merged);
    const rebindsEditedEmbed = (edited: ReturnType<typeof resolved>, other: ReturnType<typeof resolved>) => {
      const previous = reference ?? byToken(other);
      for (const [token, ids] of byToken(edited)) {
        const count = previous.get(token)?.length ?? 0;
        if (ids.length <= count) continue;
        const after = result.get(token) ?? [];
        // A reviewed draft can explicitly drop or replace a token, e.g. by spelling its ID.
        if (!base && !after.length) continue;
        if (after.length !== ids.length || ids.some((id, i) => id !== after[i])) return true;
      }
      return false;
    };
    if (rejectsBinding || (mine.has('content') && theirs.has('attachments') && rebindsEditedEmbed(localEmbeds, headEmbeds))
      || (theirs.has('content') && mine.has('attachments') && rebindsEditedEmbed(headEmbeds, localEmbeds))) fields.push('attachments');
  }
  return fields;
}
