import React, { useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { ActiveFilterBadges } from './ActiveFilterBadges';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { materialsInFolder } from '../../lib/vault/folderItems';
import {
  Folder,
  Inbox,
  BookOpen,
  ArrowUpDown,
  MoreVertical,
} from 'lucide-react';
import type { FeedViewMode } from '../../types';

export interface FeedHeaderProps {
  viewMode?: FeedViewMode;
  onViewModeChange?: (mode: FeedViewMode) => void;
}

export const FeedHeader: React.FC<FeedHeaderProps> = ({
  viewMode: controlledViewMode,
  onViewModeChange: _onViewModeChange,
}) => {
  const {
    currentFolder,
    feedViewMode: contextViewMode,
    folders,
    items,
    filteredItems,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    setIsTriageModalOpen,
    openFolderInfoModal,
    openFolderViewModal,
    activeTypeFilter,
    sortBy,
    sortOrder,
    hideCompletedTasks,
    isPinnedOnlyFilter,
    inboxMode,
  } = useApp();

  const headerRef = useRef<HTMLElement | null>(null);

  const activeViewMode = controlledViewMode ?? contextViewMode;
  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;

  const folderMaterialsCount = useMemo(
    () => materialsInFolder(items, currentFolder).length,
    [items, currentFolder],
  );

  const inboxUnsortedCount = useMemo(() => {
    return isInbox ? items.filter(i => i.folder === DEFAULT_INBOX_FOLDER).length : 0;
  }, [items, isInbox]);

  const CustomIcon = folderMeta?.icon ? FOLDER_ICONS[folderMeta.icon] : null;
  const folderIconComp = CustomIcon ? (
    <CustomIcon className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0" />
  ) : isInbox ? (
    <Inbox className="w-4 h-4 text-zinc-300 group-hover:text-white transition-colors shrink-0" />
  ) : (
    <Folder className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0" />
  );

  // Check if current folder has customized view/filter/sort settings
  const isCustomized =
    activeViewMode !== 'feed' ||
    activeTypeFilter !== 'all' ||
    sortBy !== 'createdAt' ||
    sortOrder !== 'asc' ||
    hideCompletedTasks ||
    isPinnedOnlyFilter ||
    (isInbox && inboxMode !== 'all');

  return (
    <header
      ref={headerRef}
      className="h-12 px-3 sm:px-4 border-b border-white/[0.06] bg-panel grid grid-cols-[1fr_auto_1fr] items-center gap-2 select-none shrink-0 relative"
    >
      {/* Left Column: Active Filter Badges */}
      <div className="flex items-center gap-1.5 justify-self-start min-w-0 z-10 overflow-x-auto scrollbar-none py-1">
        <ActiveFilterBadges />
      </div>

      {/* Center Column: Prominent Folder Title Button */}
      <div className="flex items-center justify-center justify-self-center min-w-0 max-w-full px-1 z-0">
        <button
          type="button"
          onClick={() => openFolderInfoModal(currentFolder)}
          className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 rounded-lg hover:bg-white/[0.06] motion-press cursor-pointer group select-none min-w-0"
          title={`Информация и медиа папки «${folderMeta?.name || currentFolder}»`}
          aria-label="Информация о папке"
        >
          {folderIconComp}
          <h2 className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-white tracking-tight transition-colors truncate max-w-[240px]">
            {folderMeta?.name || currentFolder}
          </h2>
          <span className="text-2xs sm:text-xs font-mono text-zinc-500 group-hover:text-zinc-400 transition-colors shrink-0">
            ({filteredItems.length})
          </span>
        </button>
      </div>

      {/* Right Column: Actions (Materials, AI triage, 3-dots popover button) */}
      <div className="flex items-center gap-1.5 justify-self-end min-w-0 shrink-0 z-10">
        {/* Kanban Materials Dock Toggle */}
        {activeViewMode === 'kanban' && (
          <button
            type="button"
            onClick={() => setIsKanbanMaterialsOpen(prev => !prev)}
            className={`h-ctrl-sm px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              isKanbanMaterialsOpen
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title={
              isKanbanMaterialsOpen
                ? `Скрыть материалы (${folderMaterialsCount})`
                : `Показать материалы (${folderMaterialsCount})`
            }
            aria-label="Материалы папки"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {/* AI Triage button in Inbox */}
        {isInbox && inboxUnsortedCount > 0 && (
          <button
            type="button"
            onClick={() => setIsTriageModalOpen(true)}
            title={`ИИ-Сортировка (${inboxUnsortedCount} неразобранных)`}
            aria-label="Запустить ИИ-Сортировку"
            className="h-ctrl-sm px-2 rounded-md flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer motion-press"
          >
            <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
            <span key={inboxUnsortedCount} className="font-mono text-[11px] motion-count">{inboxUnsortedCount}</span>
            <span className="sr-only">Запустить ИИ-Сортировку</span>
          </button>
        )}

        {/* View & Filter Options (3-dots button) */}
        <button
          type="button"
          onClick={openFolderViewModal}
          className="relative h-ctrl-sm w-ctrl-sm flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] motion-press cursor-pointer"
          title="Вид и фильтры папки"
          aria-label="Вид и фильтры папки"
        >
          <MoreVertical className="w-4 h-4" />
          {isCustomized && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white ring-2 ring-panel" />
          )}
        </button>
      </div>
    </header>
  );
};
