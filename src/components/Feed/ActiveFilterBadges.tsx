// The removable chips for whatever narrows the feed: type, tag, folder, pinned.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { hasFeedFilters } from '../../context/feed/feedView';
import { usePresence } from '../../hooks/ui/usePresence';
import { Icon, type IconProps } from '../UI/icons/Icon';

export interface ActiveFilterBadgesProps {
  className?: string;
  badgeClassName?: string;
  ignoreTypeAndCompletion?: boolean;
}

const FilterBadge: React.FC<{
  icon?: IconProps['name'];
  title: string;
  label: string;
  onClear: () => void;
  className: string;
  children?: React.ReactNode;
}> = ({ icon, title, label, onClear, className, children }) => (
  <button
    type="button"
    onClick={onClear}
    className={`flex shrink-0 items-center gap-1 rounded-md bg-tint-6 px-1.5 text-fg-secondary hover:bg-tint-10 hover:text-fg-primary focus-visible:bg-tint-10 cursor-pointer ${className}`}
    title={`${title} · нажмите для сброса`}
    aria-label={label}
  >
    {icon && <Icon name={icon} size="sm" tone="inherit" />}
    {children}
    <Icon name="action.close" size="xs" tone="inherit" />
  </button>
);

export const ActiveFilterBadges: React.FC<ActiveFilterBadgesProps> = ({
  className = '',
  badgeClassName = 'h-6 text-2xs',
  ignoreTypeAndCompletion = false,
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

  const hasAnyFilter = hasFeedFilters({ currentFolder, activeTypeFilter: ignoreTypeAndCompletion ? 'all' : activeTypeFilter, inboxMode, isPinnedOnlyFilter,
    hideCompletedTasks: !ignoreTypeAndCompletion && hideCompletedTasks, activeTagFilter, aiItemFilter });

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
      {/* Padding lives inside the clipped row so a collapsed bar takes no height. */}
      <div className={`motion-accordion-inner flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none py-0.5 ${className}`}>
        {!ignoreTypeAndCompletion && activeTypeFilter !== 'all' && (
          <FilterBadge
            icon={activeTypeFilter === 'note' ? 'entity.note' : activeTypeFilter === 'task' ? 'entity.task' : 'entity.article'}
            title={activeTypeFilter === 'note' ? 'Заметки' : activeTypeFilter === 'task' ? 'Таски' : 'Статьи'}
            label="Сбросить фильтр по типу"
            onClear={() => setActiveTypeFilter('all')}
            className={badgeClassName}
          />
        )}
        {isInbox && inboxMode !== 'all' && (
          <FilterBadge
            icon={inboxMode === 'sorted' ? 'entity.folderFilter' : 'entity.inbox'}
            title={inboxMode === 'sorted' ? 'Разобранные' : 'Неразобранные'}
            label="Сбросить фильтр входящих"
            onClear={() => setInboxMode('all')}
            className={badgeClassName}
          />
        )}
        {isPinnedOnlyFilter && (
          <FilterBadge
            icon="action.pin"
            title="Закрепленные"
            label="Сбросить фильтр закрепленных"
            onClear={() => setIsPinnedOnlyFilter(false)}
            className={badgeClassName}
          />
        )}
        {!ignoreTypeAndCompletion && hideCompletedTasks && (
          <FilterBadge
            icon="action.hide"
            title="Без готовых"
            label="Показать выполненные таски"
            onClear={() => setHideCompletedTasks(false)}
            className={badgeClassName}
          />
        )}
        {activeTagFilter && (
          <FilterBadge
            title={`#${activeTagFilter}`}
            label={`Сбросить фильтр тега: #${activeTagFilter}`}
            onClear={() => setActiveTagFilter(null)}
            className={badgeClassName}
          >
            <span className="max-w-[120px] truncate whitespace-nowrap">#{activeTagFilter}</span>
          </FilterBadge>
        )}
        {aiItemFilter && (
          <FilterBadge
            icon="action.filter"
            title={`ИИ: "${aiItemFilter.queryLabel}"`}
            label={`Сбросить фильтр ИИ: ${aiItemFilter.queryLabel}`}
            onClear={clearAiFilter}
            className={badgeClassName}
          >
            <span className="max-w-[120px] truncate whitespace-nowrap">ИИ: "{aiItemFilter.queryLabel}"</span>
          </FilterBadge>
        )}
      </div>
    </div>
  );
};
