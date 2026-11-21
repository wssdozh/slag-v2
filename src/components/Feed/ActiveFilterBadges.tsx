// The removable chips for whatever narrows the feed: type, tag, folder, pinned.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/ui/usePresence';
import { Icon } from '../UI/icons/Icon';
export interface ActiveFilterBadgesProps {
  className?: string;
  badgeClassName?: string;
}

export const ActiveFilterBadges: React.FC<ActiveFilterBadgesProps> = ({
  className = '',
  badgeClassName = 'h-6 text-2xs',
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
      {activeTypeFilter !== 'all' && (
        <button
          type="button"
          onClick={() => setActiveTypeFilter('all')}
          className={`flex shrink-0 items-center gap-1 rounded-md bg-tint-6 px-1.5 text-fg-secondary hover:bg-tint-10 hover:text-fg-primary focus-visible:bg-tint-10 cursor-pointer ${badgeClassName}`}
          title={`${activeTypeFilter === 'note' ? 'Заметки' : activeTypeFilter === 'task' ? 'Таски' : 'Статьи'} · нажмите для сброса`}
          aria-label="Сбросить фильтр по типу"
        >
          <Icon name={activeTypeFilter === 'note' ? 'entity.note' : activeTypeFilter === 'task' ? 'entity.task' : 'entity.article'} size="sm" tone="inherit" />
          <Icon name="action.close" size="xs" tone="inherit" />
        </button>
      )}
      {isInbox && inboxMode !== 'all' && (
        <button
          type="button"
          onClick={() => setInboxMode('all')}
          className={`flex shrink-0 items-center gap-1 rounded-md bg-tint-6 px-1.5 text-fg-secondary hover:bg-tint-10 hover:text-fg-primary focus-visible:bg-tint-10 cursor-pointer ${badgeClassName}`}
          title={`${inboxMode === 'sorted' ? 'Разобранные' : 'Неразобранные'} · нажмите для сброса`}
          aria-label="Сбросить фильтр входящих"
        >
          <Icon name={inboxMode === 'sorted' ? 'entity.folderFilter' : 'entity.inbox'} size="sm" tone="inherit" />
          <Icon name="action.close" size="xs" tone="inherit" />
        </button>
      )}

      {/* Pinned Filter Badge */}
      {isPinnedOnlyFilter && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-tint-10 text-white font-mono shrink-0 ${badgeClassName}`}
        >
          <Icon name="action.pin" size="xs" tone="tertiary" />
          <span>Закрепленные</span>
          <button
            type="button"
            onClick={() => setIsPinnedOnlyFilter(false)}
            className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
            title="Показать все записи"
            aria-label="Сбросить фильтр закрепленных"
          >
            <Icon name="action.close" size="sm" tone="inherit" />
          </button>
        </div>
      )}

      {/* Hide Completed Tasks Badge */}
      {hideCompletedTasks && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-tint-6 border border-tint-8 text-fg-secondary font-mono shrink-0 ${badgeClassName}`}
        >
          <Icon name="action.hide" size="sm" tone="muted" />
          <span>Без готовых</span>
          <button
            type="button"
            onClick={() => setHideCompletedTasks(false)}
            className="p-0.5 hover:text-white transition-colors cursor-pointer ml-0.5"
            title="Показать выполненные таски"
          >
            <Icon name="action.close" size="sm" tone="inherit" />
          </button>
        </div>
      )}

      {/* Tag Filter Badge */}
      {activeTagFilter && (
        <div
          className={`flex items-center gap-1 px-2 rounded-md bg-tint-10 text-white font-mono shrink-0 ${badgeClassName}`}
        >
          <span>#{activeTagFilter}</span>
          <button
            type="button"
            onClick={() => setActiveTagFilter(null)}
            className="p-0.5 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
            title="Сбросить фильтр тега"
          >
            <Icon name="action.close" size="sm" tone="inherit" />
          </button>
        </div>
      )}

      {/* AI Item Filter Badge */}
      {aiItemFilter && (
        <div
          className={`flex items-center gap-1.5 px-2 rounded-md bg-tint-8 border border-tint-12 text-fg-soft font-mono shrink-0 ${badgeClassName}`}
        >
          <Icon name="action.filter" size="sm" />
          <span className="truncate max-w-[120px]">
            ИИ: "{aiItemFilter.queryLabel}"
          </span>
          <button
            type="button"
            onClick={clearAiFilter}
            className="p-0.5 hover:text-white transition-colors cursor-pointer ml-0.5"
            title="Сбросить фильтр ИИ"
          >
            <Icon name="action.close" size="sm" tone="inherit" />
          </button>
        </div>
      )}
      </div>
    </div>
  );
};
