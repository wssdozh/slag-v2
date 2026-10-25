import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Folder,
  FolderCheck,
  Inbox,
  CheckSquare,
  FileText,
  StickyNote,
  X,
  Kanban,
  Calendar,
  Layers,
  Filter,
  BookOpen,
  ArrowUpDown
} from 'lucide-react';

export const FeedHeader: React.FC = () => {
  const {
    currentFolder,
    inboxMode,
    setInboxMode,
    feedViewMode,
    setFeedViewMode,
    folders,
    items,
    filteredItems,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    aiItemFilter,
    clearAiFilter,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    setIsTriageModalOpen,
  } = useApp();

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
        {feedViewMode === 'kanban' && (
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
        {/* Inbox Sub-mode Filter (SPEC §8.2) - only in feed mode */}
        {isInbox && feedViewMode === 'feed' && (
          <div aria-label="Фильтр входящих" className="flex items-center h-ctrl-sm gap-0.5 shrink-0">
            <button
              onClick={() => setInboxMode('all')}
              className={`h-full px-2 rounded-md text-xs transition-colors cursor-pointer ${
                inboxMode === 'all'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Все заметки хранилища сквозным списком"
            >
              Все
            </button>
            <button
              onClick={() => setInboxMode('sorted')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center justify-center transition-colors cursor-pointer ${
                inboxMode === 'sorted'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Только распределенные по папкам (Разобранные)"
            >
              <FolderCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setInboxMode('unsorted')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center justify-center transition-colors cursor-pointer ${
                inboxMode === 'unsorted'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Только неразобранные заметки во Входящих"
            >
              <Inbox className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Divider line between inbox filter and type filters */}
        {isInbox && feedViewMode === 'feed' && (
          <div className="h-4 w-px bg-white/[0.12] mx-0.5 shrink-0" />
        )}

        {/* Type filters (feed mode only) */}
        {feedViewMode === 'feed' && (
          <div aria-label="Фильтр по типу" className="flex items-center h-ctrl-sm gap-0.5 shrink-0">
            <button
              onClick={() => setActiveTypeFilter('all')}
              className={`h-full px-2 rounded-md text-xs transition-colors cursor-pointer ${
                activeTypeFilter === 'all'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Все типы записей"
            >
              Все
            </button>
            <button
              onClick={() => setActiveTypeFilter('note')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center transition-colors cursor-pointer ${
                activeTypeFilter === 'note'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Только заметки"
            >
              <StickyNote className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('task')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center transition-colors cursor-pointer ${
                activeTypeFilter === 'task'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Только таски"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('article')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center transition-colors cursor-pointer ${
                activeTypeFilter === 'article'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
              title="Только статьи"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* AI Filter Chip when Assistant filtered the feed */}
        {aiItemFilter && (
          <div className="flex items-center gap-1.5 px-2.5 h-ctrl-sm rounded-md bg-white/[0.08] border border-white/[0.12] text-zinc-200 text-xs font-mono shrink-0">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="truncate max-w-[140px]">ИИ: "{aiItemFilter.queryLabel}" ({aiItemFilter.itemIds.length})</span>
            <button
              onClick={clearAiFilter}
              className="p-0.5 hover:text-white transition-colors cursor-pointer"
              title="Сбросить фильтр ИИ"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Tag filter chip if active */}
        {activeTagFilter && (
          <div className="flex items-center gap-1.5 px-2.5 h-ctrl-sm rounded-md bg-white/10 text-white text-xs font-mono shrink-0">
            <span>#{activeTagFilter}</span>
            <button
              onClick={() => setActiveTagFilter(null)}
              className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
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

        {/* Unified View Mode Switcher: Icon-only Linear-grade ghost segmented control */}
        <nav aria-label="Режимы представления" className="flex items-center h-ctrl-sm gap-0.5 shrink-0">
          <button
            onClick={() => setFeedViewMode('feed')}
            className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              feedViewMode === 'feed'
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title="Лента записей"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
          </button>
          <button
            onClick={() => setFeedViewMode('kanban')}
            className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              feedViewMode === 'kanban'
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title="Канбан-доска задач"
          >
            <Kanban className="w-3.5 h-3.5 shrink-0" />
          </button>
          <button
            onClick={() => setFeedViewMode('calendar')}
            className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              feedViewMode === 'calendar'
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title="Календарь дедлайнов"
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
          </button>
        </nav>
      </div>
    </header>
  );
};
