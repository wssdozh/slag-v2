// The search block of a reply: count, expand into the list, open a note or show it inline.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import { DEFAULT_INBOX_FOLDER } from '../../../config';

export interface AssistantSearchResult {
  id: string;
  title: string;
  type?: string;
  folder?: string;
  tags?: string[];
  snippet?: string;
}

interface AssistantSearchResultsProps {
  results: AssistantSearchResult[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onShowInFeed: () => void;
  onOpenItem: (idOrTitle: string) => void;
}

export const AssistantSearchResults: React.FC<AssistantSearchResultsProps> = ({
  results,
  isExpanded,
  onToggleExpanded,
  onShowInFeed,
  onOpenItem,
}) => {
  const count = results.length;
  const showHeader = count > 3;
  const showFilterButton = count > 1;

  return (
    <div className="max-w-[92%] w-full rounded-xl bg-surface border border-tint-8 overflow-hidden mt-0.5 text-xs shadow-sm">
      {/* Header trigger only when more than 3 results */}
      {showHeader && (
        <button
          onClick={onToggleExpanded}
          className="w-full flex items-center justify-between px-3 py-2 bg-tint-2 hover:bg-tint-5 transition-colors cursor-pointer text-fg-tertiary"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Icon name="action.search" size="sm" />
            <span>Найдено {count} в хранилище</span>
          </div>
          <div className="flex items-center gap-1 text-2xs font-mono text-fg-muted">
            <Icon name="nav.next" size="sm" className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
          </div>
        </button>
      )}

      {/* Items list: always rendered when count <= 3, or when isExpanded */}
      <div
        className="motion-accordion w-full"
        data-expanded={!showHeader || isExpanded}
        aria-hidden={showHeader && !isExpanded}
      >
        <div className={`motion-accordion-inner flex flex-col divide-y divide-tint-4 ${showHeader ? 'border-t border-tint-6' : ''}`}>
          {results.map((res, rIdx) => (
            <button
              key={res.id || rIdx}
              onClick={() => onOpenItem(res.id || res.title)}
              className="flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-tint-4 transition-colors cursor-pointer group"
              title={`Перейти к «${res.title}» (${res.folder || DEFAULT_INBOX_FOLDER})`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {res.type === 'task' ? (
                  <Icon name="entity.task" size="sm" tone="muted" className="shrink-0" />
                ) : (
                  <Icon name="entity.article" size="sm" tone="muted" className="shrink-0" />
                )}
                <span className="text-fg-soft group-hover:text-white truncate font-medium text-xs">
                  {res.title}
                </span>
                {res.folder && (
                  <span className="text-2xs font-mono text-fg-muted shrink-0 truncate max-w-[120px]">
                    {res.folder}
                  </span>
                )}
              </div>
              <Icon name="nav.open" size="xs" tone="muted" className="group-hover:text-fg-tertiary shrink-0 transition-colors" />
            </button>
          ))}

          {/* Button to show in feed (only if more than 1 result) */}
          {showFilterButton && (
            <button
              onClick={onShowInFeed}
              className="flex items-center justify-between px-3 py-2 bg-tint-2 hover:bg-tint-6 text-fg-secondary hover:text-fg-soft transition-colors cursor-pointer text-xs font-medium"
              title="Отобразить только эти найденные записи в центральной ленте"
            >
              <div className="flex items-center gap-1.5">
                <Icon name="action.filter" size="xs" />
                <span>Показать {count} в ленте</span>
              </div>
              <Icon name="nav.open" size="xs" tone="muted" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
