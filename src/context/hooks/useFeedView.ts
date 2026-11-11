import { useCallback, useMemo, useState } from 'react';
import type {
  AiItemFilter,
  FolderViewSettings,
  InboxMode,
  SlagItem,
  SlagItemType,
  SortField,
  SortOrder,
  WorkspaceState,
} from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { storage } from '../../lib/storage';
import { isMobilePlatform } from '../../lib/windowControls';
import { UI_BREAKPOINTS } from '../../config';
import { selectVisibleItems } from '../feed/feedView';

/**
 * How the feed is looking: which folder, which view, which filters, which order.
 *
 * One reason to change — the rules of what the feed shows. It knows nothing about
 * saving a note or opening a modal; it needs the folder and the records, the caller
 * owns both.
 */
export function useFeedView(
  currentFolder: string,
  items: SlagItem[],
  initialWorkspace: WorkspaceState,
) {
  const initialCurFolder =
    initialWorkspace.currentFolder && initialWorkspace.currentFolder !== DEFAULT_INBOX_FOLDER
      ? initialWorkspace.currentFolder
      : DEFAULT_INBOX_FOLDER;
  const initialFolderSetting = (initialWorkspace.folderSettings || {})[initialCurFolder];

  const [inboxMode, setInboxMode] = useState<InboxMode>(
    () => initialFolderSetting?.inboxMode || initialWorkspace.inboxMode || 'all',
  );
  const [feedViewMode, setFeedViewMode] = useState<import('../../types').FeedViewMode>(
    () => initialFolderSetting?.viewMode || initialWorkspace.feedViewMode || 'feed',
  );
  const [isKanbanMaterialsOpen, setIsKanbanMaterialsOpen] = useState<boolean>(() => {
    if (typeof initialWorkspace.isKanbanMaterialsOpen === 'boolean') {
      return initialWorkspace.isKanbanMaterialsOpen;
    }
    const isMobileInitial =
      typeof window !== 'undefined' && (window.innerWidth < UI_BREAKPOINTS.MOBILE || isMobilePlatform());
    return !isMobileInitial;
  });

  const [folderSettings, setFolderSettings] = useState<Record<string, FolderViewSettings>>(
    () => initialWorkspace.folderSettings || {},
  );

  const [activeTypeFilter, setActiveTypeFilter] = useState<SlagItemType | 'all'>(
    () => initialFolderSetting?.typeFilter || initialWorkspace.activeTypeFilter || 'all',
  );
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(
    () => initialWorkspace.activeTagFilter ?? null,
  );
  const [isPinnedOnlyFilter, setIsPinnedOnlyFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortField>(
    () => initialFolderSetting?.sortBy || initialWorkspace.sortBy || 'createdAt',
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => initialFolderSetting?.sortOrder || initialWorkspace.sortOrder || 'asc',
  );
  const [hideCompletedTasks, setHideCompletedTasks] = useState<boolean>(
    () => initialFolderSetting?.hideCompletedTasks ?? initialWorkspace.hideCompletedTasks ?? false,
  );
  const [aiItemFilter, setAiItemFilter] = useState<AiItemFilter | null>(null);

  const togglePinnedOnlyFilter = useCallback(() => {
    setIsPinnedOnlyFilter((prev) => !prev);
  }, []);

  // Restore folder-specific view settings & reset ephemeral pinned filter whenever switching folders
  // (React pure adjustment pattern).
  const [prevFolderForFolderSettings, setPrevFolderForFolderSettings] = useState(currentFolder);
  if (prevFolderForFolderSettings !== currentFolder) {
    setPrevFolderForFolderSettings(currentFolder);
    setIsPinnedOnlyFilter(false);

    const saved = folderSettings[currentFolder];
    if (saved) {
      setFeedViewMode(saved.viewMode);
      setActiveTypeFilter(saved.typeFilter);
      if (saved.inboxMode) setInboxMode(saved.inboxMode);
      setSortBy(saved.sortBy);
      setSortOrder(saved.sortOrder);
      setHideCompletedTasks(saved.hideCompletedTasks ?? false);
    } else {
      setFeedViewMode('feed');
      setActiveTypeFilter('all');
      if (currentFolder === DEFAULT_INBOX_FOLDER) setInboxMode('all');
      setSortBy('createdAt');
      setSortOrder('asc');
      setHideCompletedTasks(false);
    }
  }

  const applyAiFilter = useCallback((itemIds: string[], queryLabel: string) => {
    setAiItemFilter({ itemIds, queryLabel });
  }, []);

  const clearAiFilter = useCallback(() => {
    setAiItemFilter(null);
  }, []);

  // Memoized to prevent layout churn.
  const filteredItems = useMemo(
    () =>
      selectVisibleItems(items, {
        currentFolder,
        inboxMode,
        activeTypeFilter,
        activeTagFilter,
        isPinnedOnlyFilter,
        hideCompletedTasks,
        aiItemFilter,
        sortBy,
        sortOrder,
      }),
    [
      items,
      currentFolder,
      inboxMode,
      activeTypeFilter,
      activeTagFilter,
      isPinnedOnlyFilter,
      hideCompletedTasks,
      aiItemFilter,
      sortBy,
      sortOrder,
    ],
  );

  const updateCurrentFolderViewSettings = useCallback(
    (partial: Partial<FolderViewSettings>) => {
      if (partial.viewMode !== undefined) setFeedViewMode(partial.viewMode);
      if (partial.typeFilter !== undefined) setActiveTypeFilter(partial.typeFilter);
      if (partial.inboxMode !== undefined) setInboxMode(partial.inboxMode);
      if (partial.sortBy !== undefined) setSortBy(partial.sortBy);
      if (partial.sortOrder !== undefined) setSortOrder(partial.sortOrder);
      if (partial.hideCompletedTasks !== undefined) setHideCompletedTasks(partial.hideCompletedTasks);

      setFolderSettings((prev) => {
        const current = prev[currentFolder] || {
          viewMode: partial.viewMode ?? feedViewMode,
          typeFilter: partial.typeFilter ?? activeTypeFilter,
          inboxMode: partial.inboxMode ?? inboxMode,
          sortBy: partial.sortBy ?? sortBy,
          sortOrder: partial.sortOrder ?? sortOrder,
          hideCompletedTasks: partial.hideCompletedTasks ?? hideCompletedTasks,
        };
        const updated: FolderViewSettings = { ...current, ...partial };
        const next = { ...prev, [currentFolder]: updated };
        storage.saveFolderViewSettings(currentFolder, updated);
        return next;
      });
    },
    [currentFolder, feedViewMode, activeTypeFilter, inboxMode, sortBy, sortOrder, hideCompletedTasks],
  );

  const resetCurrentFolderViewSettings = useCallback(() => {
    setFeedViewMode('feed');
    setActiveTypeFilter('all');
    if (currentFolder === DEFAULT_INBOX_FOLDER) setInboxMode('all');
    setSortBy('createdAt');
    setSortOrder('asc');
    setHideCompletedTasks(false);

    setFolderSettings((prev) => {
      const next = { ...prev };
      delete next[currentFolder];
      const ws = storage.getWorkspaceState();
      const updatedFolderSettings = { ...(ws.folderSettings || {}) };
      delete updatedFolderSettings[currentFolder];
      storage.saveWorkspaceState({ folderSettings: updatedFolderSettings });
      return next;
    });
  }, [currentFolder]);

  return {
    inboxMode,
    setInboxMode,
    feedViewMode,
    setFeedViewMode,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    isPinnedOnlyFilter,
    setIsPinnedOnlyFilter,
    togglePinnedOnlyFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    hideCompletedTasks,
    setHideCompletedTasks,
    aiItemFilter,
    setAiItemFilter,
    applyAiFilter,
    clearAiFilter,
    filteredItems,
    folderSettings,
    setFolderSettings,
    updateCurrentFolderViewSettings,
    resetCurrentFolderViewSettings,
  };
}
