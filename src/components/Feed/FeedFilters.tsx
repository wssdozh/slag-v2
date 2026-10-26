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
import type { FeedViewMode } from '../../types';
import { ResponsiveSegmented, type SegmentedOption } from '../UI/ResponsiveSegmented';

export interface FeedFiltersProps {
  className?: string;
  viewMode?: FeedViewMode;
  compact?: boolean;
}

export const FeedFilters: React.FC<FeedFiltersProps> = ({
  className = '',
  viewMode: controlledViewMode,
  compact = false,
}) => {
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
    feedViewMode: contextViewMode,
  } = useApp();

  const isInbox = currentFolder === 'Входящие';
  const activeViewMode = controlledViewMode ?? contextViewMode;

  const inboxOptions: SegmentedOption[] = [
    {
      value: 'all',
      label: 'Все',
      title: 'Все заметки хранилища сквозным списком',
    },
    {
      value: 'sorted',
      label: 'Разобранные',
      icon: <FolderCheck className="w-3.5 h-3.5" />,
      title: 'Только распределенные по папкам (Разобранные)',
    },
    {
      value: 'unsorted',
      label: 'Неразобранные',
      icon: <Inbox className="w-3.5 h-3.5" />,
      title: 'Только неразобранные заметки во Входящих',
    },
  ];

  const typeOptions: SegmentedOption[] = [
    {
      value: 'all',
      label: 'Все',
      title: 'Все типы записей',
    },
    {
      value: 'note',
      label: 'Заметки',
      icon: <StickyNote className="w-3.5 h-3.5" />,
      title: 'Только заметки',
    },
    {
      value: 'task',
      label: 'Таски',
      icon: <CheckSquare className="w-3.5 h-3.5" />,
      title: 'Только таски',
    },
    {
      value: 'article',
      label: 'Статьи',
      icon: <FileText className="w-3.5 h-3.5" />,
      title: 'Только статьи',
    },
  ];

  return (
    <div className={`flex items-center gap-1.5 shrink-0 z-10 min-w-0 ${className}`}>
      {/* Inbox Sub-mode Filter - only in feed mode */}
      {isInbox && activeViewMode === 'feed' && (
        <ResponsiveSegmented
          value={inboxMode}
          onChange={(val) => setInboxMode(val as any)}
          options={inboxOptions}
          compact={compact}
          ariaLabel="Фильтр входящих"
        />
      )}

      {/* Divider line between inbox filter and type filters */}
      {isInbox && activeViewMode === 'feed' && (
        <div className="h-4 w-px bg-white/[0.12] mx-0.5 shrink-0" />
      )}

      {/* Type filters (feed mode only) */}
      {activeViewMode === 'feed' && (
        <ResponsiveSegmented
          value={activeTypeFilter}
          onChange={(val) => setActiveTypeFilter(val as any)}
          options={typeOptions}
          compact={compact}
          ariaLabel="Фильтр по типу"
        />
      )}

      {/* AI Filter Chip when Assistant filtered the feed */}
      {aiItemFilter && (
        <div className="flex items-center gap-1.5 px-2.5 h-ctrl-sm rounded-md bg-white/[0.08] border border-white/[0.12] text-zinc-200 text-xs font-mono shrink-0">
          <Filter className="w-3.5 h-3.5 text-zinc-400" />
          <span className="truncate max-w-[120px]">
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
