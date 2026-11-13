// Merges what the draft text says with what was picked, skipping dismissed chips.
import type {
  FolderMeta,
  RecurrenceRule,
  SlagItemPriority,
  SlagItemType,
  SlagSubtask,
} from '../../../types';
import {
  extractAndStripTags,
  extractFolderToken,
  parseTodoistInput,
} from '../../../lib/time/todoistTaskParser';
import { parseSubtasksFromContent } from '../../../lib/tasks/taskUtils';
import { getTodayIso } from '../../../lib/time/dateUtils';

/**
 * What the user waved away in the ghost chips. A dismissed value is still in the
 * text, but the next save must ignore it.
 */
export interface ComposerDismissals {
  isPriorityDismissed: boolean;
  isDateDismissed: boolean;
  isRecurrenceDismissed: boolean;
  isDurationDismissed: boolean;
  dismissedTags: ReadonlySet<string>;
}

export interface ComposerFieldSources {
  content: string;
  folders: FolderMeta[];
  itemType: SlagItemType;
  /** Tags picked from the draft itself, not typed into the text. */
  tags: string[];
  priority: SlagItemPriority;
  dueDate: string;
  reminder?: string;
  duration?: number;
  recurrence?: RecurrenceRule;
  dismissals: ComposerDismissals;
}

/**
 * Everything the text says about the future note, resolved once.
 *
 * The send path and the expand-to-editor path read the same field twice; they
 * only disagree on the title, so that one stays with its caller.
 */
export interface ComposerFields {
  /** Text with the `@папка` and `#тег` tokens stripped, trimmed. */
  finalContent: string;
  /** First line without leading heading marks — the seed for a free-form title. */
  firstLine: string;
  /** Task title with the date/tag/priority syntax removed. */
  cleanTitle: string;
  /** Draft tags plus the ones parsed from the text, without the dismissed. */
  tags: string[];
  /** Folder named by an `@folder` token in the text, when it exists. */
  folder: FolderMeta | null;
  subtasks: SlagSubtask[];
  priority?: SlagItemPriority;
  dueDate?: string;
  reminder?: string;
  duration?: number;
  recurrence?: RecurrenceRule;
}

export function resolveComposerFields({
  content,
  folders,
  itemType,
  tags,
  priority,
  dueDate,
  reminder,
  duration,
  recurrence,
  dismissals,
}: ComposerFieldSources): ComposerFields {
  // `@Папка` and `#тег` are composer syntax: both are stripped before saving.
  const parsed = parseTodoistInput(content);
  const { cleanContent: withoutFolder, folder } = extractFolderToken(content, folders);
  const { cleanContent, tags: extractedTags } = extractAndStripTags(withoutFolder);
  const baseContent = (cleanContent || withoutFolder || content).trim();

  const isTask = itemType === 'task';
  // A task's first line is its title, and the parser already removed the date, time,
  // priority and repeat from it. Keeping them in the body printed the same fact twice:
  // `сегодня в 17:42` in the text and `13 ноя · 17:42` in the meta under it.
  const taskFirstLine = extractFolderToken(parsed.cleanText, folders).cleanContent;
  const finalContent = isTask
    ? [taskFirstLine, ...baseContent.split('\n').slice(1)].join('\n').trim()
    : baseContent;

  const finalTags = Array.from(new Set([
    ...tags,
    ...parsed.tags.filter((tag) => !dismissals.dismissedTags.has(tag)),
    ...extractedTags.filter((tag) => !dismissals.dismissedTags.has(tag)),
  ]));

  const nextPriority = isTask
    ? (!dismissals.isPriorityDismissed && parsed.priority ? parsed.priority : priority)
    : undefined;
  const nextRecurrence = isTask
    ? (!dismissals.isRecurrenceDismissed && parsed.recurrence ? parsed.recurrence : recurrence)
    : undefined;
  const nextDueDate = isTask
    ? (!dismissals.isDateDismissed && parsed.dueDate
        ? parsed.dueDate
        : (dueDate || (nextRecurrence ? getTodayIso() : undefined)))
    : undefined;
  const nextReminder = isTask
    ? (!dismissals.isDateDismissed && parsed.reminder ? parsed.reminder : (reminder || undefined))
    : undefined;
  const nextDuration = isTask
    ? (!dismissals.isDurationDismissed && parsed.duration !== undefined ? parsed.duration : duration)
    : undefined;

  return {
    finalContent,
    firstLine: (finalContent.split('\n')[0] ?? '').replace(/^#+\s*/, '').trim(),
    cleanTitle: parsed.cleanTitle,
    tags: finalTags,
    folder,
    subtasks: isTask ? parseSubtasksFromContent(finalContent) : [],
    priority: nextPriority,
    dueDate: nextDueDate,
    reminder: nextReminder,
    duration: nextDuration,
    recurrence: nextRecurrence,
  };
}
