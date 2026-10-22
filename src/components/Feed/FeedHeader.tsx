import React from 'react';
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
  Filter
} from 'lucide-react';

export const FeedHeader: React.FC = () => {
  const {
    currentFolder,
    inboxMode,
    setInboxMode,
    feedViewMode,
    setFeedViewMode,
    folders,
    filteredItems,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    aiItemFilter,
    clearAiFilter
  } = useApp();

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';

  return (
    <header className="h-12 px-4 border-b border-white/[0.06] bg-[#0c0c0e] flex items-center justify-between gap-3 select-none shrink-0 relative">
      {/* Left: Filter Controls & Chips */}
      <div className="flex items-center gap-2 shrink-0 z-10 min-w-0">
        {/* Inbox Sub-mode Filter (SPEC §8.2) - only in feed mode */}
        {isInbox && feedViewMode === 'feed' && (
          <div aria-label="Фильтр входящих" className="flex items-center h-7.5 bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
            <button
              onClick={() => setInboxMode('all')}
              className={`h-6.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                inboxMode === 'all'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Все заметки хранилища сквозным списком"
            >
              Все
            </button>
            <button
              onClick={() => setInboxMode('sorted')}
              className={`h-6.5 px-1.5 rounded-md text-[11px] flex items-center justify-center transition-all cursor-pointer ${
                inboxMode === 'sorted'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только распределенные по папкам (Разобранные)"
            >
              <FolderCheck className="w-3.5 h-3.5 text-zinc-300" />
            </button>
            <button
              onClick={() => setInboxMode('unsorted')}
              className={`h-6.5 px-1.5 rounded-md text-[11px] flex items-center justify-center transition-all cursor-pointer ${
                inboxMode === 'unsorted'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только неразобранные заметки во Входящих"
            >
              <Inbox className="w-3.5 h-3.5 text-zinc-300" />
            </button>
          </div>
        )}

        {/* Type filters (feed mode only) */}
        {feedViewMode === 'feed' && (
          <div aria-label="Фильтр по типу" className="flex items-center h-7.5 bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
            <button
              onClick={() => setActiveTypeFilter('all')}
              className={`h-6.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                activeTypeFilter === 'all'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Все типы записей"
            >
              Все
            </button>
            <button
              onClick={() => setActiveTypeFilter('note')}
              className={`h-6.5 px-1.5 rounded-md text-[11px] flex items-center transition-all cursor-pointer ${
                activeTypeFilter === 'note'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только заметки"
            >
              <StickyNote className="w-3.5 h-3.5 text-zinc-300" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('task')}
              className={`h-6.5 px-1.5 rounded-md text-[11px] flex items-center transition-all cursor-pointer ${
                activeTypeFilter === 'task'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только таски"
            >
              <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('article')}
              className={`h-6.5 px-1.5 rounded-md text-[11px] flex items-center transition-all cursor-pointer ${
                activeTypeFilter === 'article'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только статьи"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
            </button>
          </div>
        )}

        {/* AI Filter Chip when Assistant filtered the feed */}
        {aiItemFilter && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-mono shrink-0">
            <Filter className="w-2.5 h-2.5 text-blue-400" />
            <span className="truncate max-w-[140px]">ИИ: "{aiItemFilter.queryLabel}" ({aiItemFilter.itemIds.length})</span>
            <button
              onClick={clearAiFilter}
              className="p-0.5 hover:text-white transition-colors"
              title="Сбросить фильтр ИИ"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        {/* Tag filter chip if active (feed mode only) */}
        {activeTagFilter && feedViewMode === 'feed' && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px] font-mono shrink-0">
            <span>#{activeTagFilter}</span>
            <button
              onClick={() => setActiveTagFilter(null)}
              className="p-0.5 hover:text-rose-400 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
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
        {/* Unified View Mode Switcher: Icon-only Linear-grade segmented control */}
        <nav aria-label="Режимы представления" className="flex items-center h-8 bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shadow-inner shrink-0">
          <button
            onClick={() => setFeedViewMode('feed')}
            className={`h-7 px-2.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${
              feedViewMode === 'feed'
                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="Лента записей"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
          </button>
          <button
            onClick={() => setFeedViewMode('kanban')}
            className={`h-7 px-2.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${
              feedViewMode === 'kanban'
                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="Канбан-доска задач"
          >
            <Kanban className="w-3.5 h-3.5 shrink-0" />
          </button>
          <button
            onClick={() => setFeedViewMode('calendar')}
            className={`h-7 px-2.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${
              feedViewMode === 'calendar'
                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
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
