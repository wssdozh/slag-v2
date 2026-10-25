import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  FolderCheck,
  Inbox,
  StickyNote,
  CheckSquare,
  FileText,
  Filter,
  X,
} from 'lucide-react';

export interface FeedFiltersProps {
  className?: string;
}

export const FeedFilters: React.FC<FeedFiltersProps> = ({ className = '' }) => {
  const {
    inboxMode,
    setInboxMode,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    aiItemFilter,
    clearAiFilter,
    currentFolder,
    feedViewMode,
  } = useApp();

  const isInbox = currentFolder === 'Входящие';

  return (
    <div className={`flex items-center gap-2 shrink-0 z-10 min-w-0 ${className}`}>
      {/* Inbox Sub-mode Filter - only in feed mode */}
      {isInbox && feedViewMode === 'feed' && (
        <div aria-label="Фильтр входящих" className="flex items-center h-ctrl-sm gap-0.5 shrink-0">
          <button
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
          <span className="truncate max-w-[140px]">
            ИИ: "{aiItemFilter.queryLabel}" ({aiItemFilter.itemIds.length})
          </span>
          <button
            type="button"
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
            type="button"
            onClick={() => setActiveTagFilter(null)}
            className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
