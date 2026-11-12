// Which records the feed shows and in what order — the inbox's three modes as a pure filter.
import type { AiItemFilter, InboxMode, SlagItem, SlagItemType, SortField, SortOrder } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

/**
 * Which records the feed shows, and in what order.
 *
 * The inbox is three different views wearing one folder path: unsorted, all, sorted.
 * Everything else is a plain folder with its own subtree. Kept as a pure function so
 * the rules can be read (and tested) without a React tree around them.
 */
export interface FeedViewQuery {
  currentFolder: string;
  inboxMode: InboxMode;
  activeTypeFilter: SlagItemType | 'all';
  activeTagFilter: string | null;
  isPinnedOnlyFilter: boolean;
  hideCompletedTasks: boolean;
  aiItemFilter: AiItemFilter | null;
  sortBy: SortField;
  sortOrder: SortOrder;
}

export function selectVisibleItems(items: SlagItem[], query: FeedViewQuery): SlagItem[] {
  const {
    currentFolder,
    inboxMode,
    activeTypeFilter,
    activeTagFilter,
    isPinnedOnlyFilter,
    hideCompletedTasks,
    aiItemFilter,
    sortBy,
    sortOrder,
  } = query;

  return items
    .filter((item) => {
      let matchesFolder = false;
      if (aiItemFilter) {
        matchesFolder = true;
      } else if (currentFolder === DEFAULT_INBOX_FOLDER) {
        if (inboxMode === 'unsorted') {
          matchesFolder = item.folder === DEFAULT_INBOX_FOLDER;
        } else if (inboxMode === 'all') {
          matchesFolder = true;
        } else if (inboxMode === 'sorted') {
          matchesFolder = item.folder !== DEFAULT_INBOX_FOLDER;
        }
      } else {
        matchesFolder = item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
      }

      if (!matchesFolder) return false;
      if (activeTypeFilter !== 'all' && item.type !== activeTypeFilter) return false;
      if (activeTagFilter && !item.tags.includes(activeTagFilter)) return false;
      if (isPinnedOnlyFilter && !item.isPinned) return false;
      if (aiItemFilter && !aiItemFilter.itemIds.includes(item.id)) return false;
      if (hideCompletedTasks && item.type === 'task' && item.status === 'done') return false;

      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'updatedAt':
          cmp = (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt);
          break;
        case 'title': {
          const titleA = a.title || a.content || '';
          const titleB = b.title || b.content || '';
          cmp = titleA.localeCompare(titleB, 'ru', { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'dueDate': {
          const dueA = a.dueDate ? new Date(a.dueDate).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
          const dueB = b.dueDate ? new Date(b.dueDate).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
          cmp = dueA - dueB;
          break;
        }
        case 'createdAt':
        default:
          cmp = a.createdAt - b.createdAt;
          break;
      }
      if (cmp === 0) cmp = a.createdAt - b.createdAt;
      return sortOrder === 'desc' ? -cmp : cmp;
    });
}
