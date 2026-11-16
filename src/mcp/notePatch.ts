// What a `save_note` call changes on an existing record: a patch, not a rebuild from defaults.
//
// The activity that exposed this: a bot asked to move one task to `in_progress` and got it turned
// into a plain note in «Входящие», with status, priority and due date gone from the frontmatter.
// The cause was outside this file (the zod schema filled `type` and `folder` with defaults even
// when the client said nothing), but the merge below is what keeps a patch a patch.

import type { SlagItem, SlagItemPriority, SlagItemStatus, SlagItemType, SlagSubtask } from '../types';

export interface NotePatch {
  title?: string;
  content?: string;
  appendContent?: string;
  type?: SlagItemType;
  folder?: string;
  tags?: string[];
  status?: SlagItemStatus;
  priority?: SlagItemPriority;
  dueDate?: string;
  reminder?: string;
  subtasks?: string[];
}

/** Parts the caller has to resolve first: the body needs markdown parsing, the folder needs disk rules. */
export interface NotePatchResolved {
  /** Final body: the old one, the replacement, or the old one plus an append. */
  content: string;
  subtasks: SlagSubtask[];
  /** Final folder: the patched one, or the one the record already lives in. */
  folder: string;
}

/**
 * Apply `patch` over `existing`. Every field the caller did not pass keeps its current value;
 * `type` and `folder` in particular are never reset to a default, because for a client that only
 * sends `status` that default is not a default — it is data loss.
 */
export function applyNotePatch(
  existing: SlagItem,
  patch: NotePatch,
  resolved: NotePatchResolved,
  now: number,
): SlagItem {
  return {
    ...existing,
    title: patch.title?.trim() || existing.title,
    content: resolved.content,
    type: patch.type ?? existing.type,
    folder: resolved.folder,
    tags: patch.tags ?? existing.tags,
    status: patch.status ?? existing.status,
    priority: patch.priority ?? existing.priority,
    dueDate: patch.dueDate ?? existing.dueDate,
    reminder: patch.reminder ?? existing.reminder,
    subtasks: resolved.subtasks.length > 0 ? resolved.subtasks : existing.subtasks,
    updatedAt: now,
  };
}
