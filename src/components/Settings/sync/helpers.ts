import { isSharedRegistryId, parseSharedRegistryId } from '../../../lib/sync/notes/sharedBody';
import { FOLDER_TREE_ID, isNoteItem } from '../../../lib/sync/notes/wire';
import type { syncEngine } from '../../../lib/sync/syncEngine';

export type ReviewEntry = ReturnType<typeof syncEngine.getNoteConflicts>[number];
export const reviewKey = (entry: ReviewEntry) => entry.folderGroup?.id ?? entry.intentId;
export const reviewedRevisions = (entries: ReviewEntry[]) => Object.fromEntries(entries.map(({ noteId, currentRevision }) => [noteId, currentRevision]));

export function itemTitle(entry: ReviewEntry): string {
  if (entry.noteId === FOLDER_TREE_ID || Array.isArray(entry.item) || Array.isArray(entry.currentItem)) return 'Дерево папок';
  if (isNoteItem(entry.item)) return entry.item.title || 'Запись';
  if (isNoteItem(entry.currentItem)) return entry.currentItem.title || 'Запись';
  if (!isSharedRegistryId(entry.noteId)) return 'Запись';
  const { type } = parseSharedRegistryId(entry.noteId);
  return type === 'composer' || type === 'fullscreen' ? 'Черновик' : 'Общие данные';
}
