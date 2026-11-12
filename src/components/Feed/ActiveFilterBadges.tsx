import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/ui/usePresence';
import {
  FolderCheck,
  Inbox,
  StickyNote,
  CheckSquare,
  FileText,
  Pin,
  EyeOff,
  Filter,
  X,
} from 'lucide-react';

export interface ActiveFilterBadgesProps {
  className?: string;
  badgeClassName?: string;
}

export const ActiveFilterBadges: React.FC<ActiveFilterBadgesProps> = ({
  className = '',
  badgeClassName = 'h-6 text-[11px]',
}) => {
  const {
    currentFolder,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    aiItemFilter,
    clearAiFilter,
    isPinnedOnlyFilter,
    setIsPinnedOnlyFilter,
    hideCompletedTasks,
    setHideCompletedTasks,
    inboxMode,
    setInboxMode,
  } = useApp();

  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;

  const hasAnyFilter =
    activeTypeFilter !== 'all' ||
    (isInbox && inboxMode !== 'all') ||
    isPinnedOnlyFilter ||
    hideCompletedTasks ||
    Boolean(activeTagFilter) ||
    Boolean(aiItemFilter);

  const { ref: filterBarRef, phase: filterBarPhase, isPresent: isFilterBarPresent, onTransitionEnd: onFilterBarTransitionEnd } =
    usePresence(hasAnyFilter);

  if (!isFilterBarPresent) {
    return null;
  }

  return (
    <div
      ref={filterBarRef}
      data-motion-state={filterBarPhase}
      onTransitionEnd={onFilterBarTransitionEnd}
      inert={!hasAnyFilter}
      className="motion-accordion w-full min-w-0"
      data-expanded={hasAnyFilter}
    >
      {/* Padding and the divider live inside the clipped row, so a collapsed bar
          takes no height at all instead of leaving a 9px strip. */}
      <div className={`motion-accordion-inner flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none py-0.5 ${className}`}>
      {/* Type Filter Badge */}
      {activeTypeFilter !== 'all' && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-300 font-mono shrink-0 ${badgeClassName}`}
        >
          {activeTypeFilter === 'note' && <StickyNote className="w-3 h-3 text-zinc-400" />}
          {activeTypeFilter === 'task' && <CheckSquare className="w-3 h-3 text-zinc-400" />}
          {activeTypeFilter === 'article' && <FileText className="w-3 h-3 text-zinc-400" />}
          <span>
            {activeTypeFilter === 'note'
              ? 'Заметки'
              : activeTypeFilter === 'task'
              ? 'Таски'
              : 'Статьи'}
          </span>
          <button
            type="button"
            onClick={() => setActiveTypeFilter('all')}
            className="p-0.5 hover:text-white transition-colors cursor-pointer ml-0.5"
            title="Сбросить фильтр по типу"
            aria-label="Сбросить фильтр по типу"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Inbox Mode Filter Badge */}
      {isInbox && inboxMode !== 'all' && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-300 font-mono shrink-0 ${badgeClassName}`}
        >
          {inboxMode === 'sorted' ? (
            <FolderCheck className="w-3 h-3 text-zinc-400" />
          ) : (
            <Inbox className="w-3 h-3 text-zinc-400" />
          )}
          <span>{inboxMode === 'sorted' ? 'Разобранные' : 'Неразобранные'}</span>
          <button
            type="button"
            onClick={() => setInboxMode('all')}
            className="p-0.5 hover:text-white transition-colors cursor-pointer ml-0.5"
            title="Показать все входящие"
            aria-label="Сбросить фильтр входящих"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Pinned Filter Badge */}
      {isPinnedOnlyFilter && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-white/10 text-white font-mono shrink-0 ${badgeClassName}`}
        >
          <Pin className="w-3 h-3 text-zinc-300" />
          <span>Закрепленные</span>
          <button
            type="button"
            onClick={() => setIsPinnedOnlyFilter(false)}
            className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
            title="Показать все записи"
            aria-label="Сбросить фильтр закрепленных"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Hide Completed Tasks Badge */}
      {hideCompletedTasks && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-400 font-mono shrink-0 ${badgeClassName}`}
        >
          <EyeOff className="w-3 h-3 text-zinc-500" />
          <span>Без готовых</span>
          <button
            type="button"
            onClick={() => setHideCompletedTasks(false)}
            className="p-0.5 hover:text-white transition-colors cursor-pointer ml-0.5"
            title="Показать выполненные таски"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Tag Filter Badge */}
      {activeTagFilter && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-white/10 text-white font-mono shrink-0 ${badgeClassName}`}
        >
          <span>#{activeTagFilter}</span>
          <button
            type="button"
            onClick={() => setActiveTagFilter(null)}
            className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
            title="Сбросить фильтр тега"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* AI Item Filter Badge */}
      {aiItemFilter && (
        <div
          className={`flex items-center gap-1.5 px-2 rounded-md bg-white/[0.08] border border-white/[0.12] text-zinc-200 font-mono shrink-0 ${badgeClassName}`}
        >
          <Filter className="w-3 h-3 text-zinc-400" />
          <span className="truncate max-w-[120px]">
            ИИ: "{aiItemFilter.queryLabel}"
          </span>
          <button
            type="button"
            onClick={clearAiFilter}
            className="p-0.5 hover:text-white transition-colors cursor-pointer ml-0.5"
            title="Сбросить фильтр ИИ"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      </div>
    </div>
  );
};
