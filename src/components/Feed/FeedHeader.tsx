import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FeedFilters } from './FeedFilters';
import { ViewModeSwitcher } from './ViewModeSwitcher';
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
  } = useApp();

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

  return (
    <header className="h-12 px-4 border-b border-white/[0.06] bg-[#0c0c0e] flex items-center justify-between gap-3 select-none shrink-0 relative">
      {/* Left: Filter Controls & Chips */}
      <div className="flex items-center gap-2 shrink-0 z-10 min-w-0">
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

        <FeedFilters viewMode={activeViewMode} />
      </div>

      {/* Center: Large prominent folder title in the center of the bar */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto px-2">
          {isInbox ? (
            <Inbox className="w-4.5 h-4.5 text-zinc-300 shrink-0" />
          ) : (
            <Folder className="w-4.5 h-4.5 text-zinc-400 shrink-0" />
          )}
          <h2 className="text-sm font-bold text-zinc-100 tracking-tight">
            {folderMeta?.name || currentFolder}
          </h2>
          <span className="text-xs font-mono text-zinc-500">
            ({filteredItems.length})
          </span>
        </div>
      </div>

      {/* Center / Right Controls */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto z-10">
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

        <ViewModeSwitcher viewMode={activeViewMode} onViewModeChange={handleViewModeChange} />
      </div>
    </header>
  );
};
