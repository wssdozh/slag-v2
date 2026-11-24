// Classify a conflict or pending intent by whether the user has reviewed it.
import { LEGACY_CUTOVER } from './legacyCutover.ts';

const reviewFields = ['base', 'predecessor', 'lifecycle', 'recovered-disk'];
// Everything else (including folder/folders/delete, ordinary data fields) → conflict.
const allWritableFields = ['id', 'title', 'type', 'content', 'folder', 'tags', 'attachments', 'status', 'priority',
  'dueDate', 'reminder', 'duration', 'recurrence', 'subtasks', 'kanbanColumn', 'isPinned', 'isArchived',
  'replyToId', 'linkedItemIds', 'streak', 'history', 'lastCompletedDate', 'summary', 'readingTimeMinutes', 'customProps'];

/**
 * Classify a field set per contract:
 * - 'legacy' — ONLY when the LEGACY_CUTOVER marker is present
 * - 'review' — no-proof fields (base/predecessor/lifecycle), empty list, or bare 'update' without evidence
 * - 'conflict' — structural markers (folder/folders/delete) or ordinary data fields (dueDate, content, etc.)
 */
export function noteReviewKind(fields: readonly string[]): 'legacy' | 'review' | 'conflict' {
  // Only the explicit LEGACY_CUTOVER marker classifies as legacy.
  if (fields.includes(LEGACY_CUTOVER)) return 'legacy';
  // No-proof fields: base mismatch, predecessor gap, lifecycle break — review, not conflict.
  if (reviewFields.some((f) => fields.includes(f))) return 'review';
  // Empty or bare 'update' without any proof of overlap — review.
  if (!fields.length || (fields.length === 1 && fields[0] === 'update')) return 'review';
  // Everything else: structural markers or ordinary data fields → real conflict.
  return 'conflict';
}

/** Validate that `selected` is a subset of writable properties and exclude transport-only keys. */
export function validateSelectedFields(selected: readonly string[] | undefined): string[] | null {
  if (selected === undefined) return null;
  const whitelist = new Set(allWritableFields);
  const result: string[] = [];
  for (const key of selected) {
    if (!whitelist.has(key) || !allWritableFields.includes(key)) continue;
    if (key === 'id') continue;
    if (key.startsWith('transport')) continue;
    result.push(key);
  }
  return result;
}
