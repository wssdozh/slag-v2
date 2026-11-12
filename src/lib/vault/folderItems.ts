import type { SlagItem } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

/**
 * Records that belong to a folder. Inbox is a leaf: it holds only the items that
 * literally sit in it, while a regular folder also owns everything below it.
 *
 * Stats and media everywhere go through this selector so the feed filters
 * (type, tag, pinned, completed, inbox mode) never leak into folder numbers.
 */
export function itemsInFolder(items: SlagItem[], folderPath: string): SlagItem[] {
  if (!folderPath) return [];
  if (folderPath === DEFAULT_INBOX_FOLDER) {
    return items.filter(item => item.folder === DEFAULT_INBOX_FOLDER);
  }
  const prefix = `${folderPath}/`;
  return items.filter(item => item.folder === folderPath || item.folder.startsWith(prefix));
}

/**
 * The reading material a folder shows in the materials dock: notes and articles, never
 * archived tasks.
 *
 * The inbox is the one place where this does *not* behave like `itemsInFolder` — in the inbox
 * the dock mirrors the feed and counts the whole vault. Both headers ask here so the two
 * numbers can never drift apart.
 */
export function materialsInFolder(items: SlagItem[], folderPath: string): SlagItem[] {
  return items.filter(item => {
    const inFolder =
      folderPath === DEFAULT_INBOX_FOLDER
        ? true
        : item.folder === folderPath || item.folder.startsWith(`${folderPath}/`);
    return inFolder && !item.isArchived && (item.type === 'note' || item.type === 'article');
  });
}
