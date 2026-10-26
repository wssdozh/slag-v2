import React, { useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FeedFilters } from './FeedFilters';
import { ViewModeSwitcher } from './ViewModeSwitcher';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import {
  Folder,
  Inbox,
  BookOpen,
  ArrowUpDown
} from 'lucide-react';
import type { FeedViewMode } from '../../types';

export interface FeedHeaderProps {
  viewMode?: FeedViewMode;
  onViewModeChange?: (mode: FeedViewMode) => void;
}

export const FeedHeader: React.FC<FeedHeaderProps> = ({
  viewMode: controlledViewMode,
  onViewModeChange,
}) => {
  const {
    currentFolder,
    feedViewMode: contextViewMode,
    setFeedViewMode,
    folders,
    items,
    filteredItems,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    setIsTriageModalOpen,
    openFolderInfoModal,
  } = useApp();

  const headerRef = useRef<HTMLElement | null>(null);
  const containerWidth = useContainerWidth(headerRef);
  const isCompactFilters = containerWidth > 0 && containerWidth < 460;
  const isCompactViews = containerWidth > 0 && containerWidth < 380;
  const showCenterFolder = containerWidth === 0 || containerWidth >= 400;

  const activeViewMode = controlledViewMode ?? contextViewMode;
  const handleViewModeChange = onViewModeChange ?? setFeedViewMode;

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';

  const folderMaterialsCount = useMemo(() => {
    return items.filter(item => {
      const inFolder =
        currentFolder === 'Входящие'
          ? true
          : item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
      return inFolder && !item.isArchived && (item.type === 'note' || item.type === 'article');
    }).length;
  }, [items, currentFolder]);

  const inboxUnsortedCount = useMemo(() => {
    return isInbox ? items.filter(i => i.folder === 'Входящие').length : 0;
  }, [items, isInbox]);

  const CustomIcon = folderMeta?.icon ? FOLDER_ICONS[folderMeta.icon] : null;
  const folderIconComp = CustomIcon ? (
    <CustomIcon className="w-4.5 h-4.5 text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0" />
  ) : isInbox ? (
    <Inbox className="w-4.5 h-4.5 text-zinc-300 group-hover:text-white transition-colors shrink-0" />
  ) : (
    <Folder className="w-4.5 h-4.5 text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0" />
  );

  return (
    <header
      ref={headerRef}
      className={`h-12 px-3 sm:px-4 border-b border-white/[0.06] bg-[#0c0c0e] ${
        showCenterFolder ? 'grid grid-cols-[1fr_auto_1fr]' : 'flex justify-between'
      } items-center gap-2 select-none shrink-0 relative`}
    >
      {/* Left Column: Filter Controls & Chips */}
      <div className={`flex items-center gap-1.5 ${showCenterFolder ? 'justify-self-start' : ''} min-w-0 z-10`}>
        {/* Kanban Materials Dock Toggle */}
        {activeViewMode === 'kanban' && (
          <button
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

        <FeedFilters compact={isCompactFilters} viewMode={activeViewMode} />
      </div>

      {/* Center Column: Prominent folder title in clean grid flow (hidden on narrow widths to prevent collision) */}
      {showCenterFolder && (
        <div className="flex items-center justify-center justify-self-center min-w-0 max-w-full px-1 z-0">
          <button
            type="button"
            onClick={() => openFolderInfoModal(currentFolder)}
            className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer group select-none min-w-0"
            title={`Информация и медиа папки «${folderMeta?.name || currentFolder}»`}
          >
            {folderIconComp}
            <h2 className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-white tracking-tight transition-colors truncate">
              {folderMeta?.name || currentFolder}
            </h2>
            <span className="text-2xs sm:text-xs font-mono text-zinc-500 group-hover:text-zinc-400 transition-colors shrink-0">
              ({filteredItems.length})
            </span>
          </button>
        </div>
      )}

      {/* Right Column: AI Triage & View Switcher */}
      <div className={`flex items-center gap-1.5 ${showCenterFolder ? 'justify-self-end' : ''} min-w-0 shrink-0 z-10`}>
        {/* AI Triage button in Inbox (Left of switcher with divider) */}
        {isInbox && inboxUnsortedCount > 0 && (
          <div className="flex items-center h-ctrl-sm gap-1.5 shrink-0">
            <button
              onClick={() => setIsTriageModalOpen(true)}
              title={`ИИ-Сортировка (${inboxUnsortedCount} неразобранных)`}
              aria-label="Запустить ИИ-Сортировку"
              className="h-full px-2 rounded-md flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer active:scale-95"
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono text-[11px]">{inboxUnsortedCount}</span>
              <span className="sr-only">Запустить ИИ-Сортировку</span>
            </button>
            <div className="h-4 w-px bg-white/[0.12] mx-0.5 shrink-0" />
          </div>
        )}

        <ViewModeSwitcher
          compact={isCompactViews}
          viewMode={activeViewMode}
          onViewModeChange={handleViewModeChange}
        />
      </div>
    </header>
  );
};
