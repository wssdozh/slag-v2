// The `#tag` suggestions: matching vault tags with usage counts, keyboard selection.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { SuggestionMenuHeader } from './SuggestionMenuHeader';
import { SuggestionMenuShell } from './SuggestionMenuShell';

export interface TagMeta {
  tag: string;
  count: number;
}

interface TagSuggestionMenuProps {
  isOpen?: boolean;
  query: string;
  tags: TagMeta[];
  selectedIndex: number;
  onSelect: (tag: string) => void;
  placement?: 'top' | 'bottom';
  isModal?: boolean;
}

export const TagSuggestionMenu: React.FC<TagSuggestionMenuProps> = ({
  isOpen = true,
  query,
  tags,
  selectedIndex,
  onSelect,
  placement = 'top',
  isModal = false,
}) => {
  return (
    <SuggestionMenuShell
      isOpen={isOpen}
      selectedIndex={selectedIndex}
      placement={placement}
      isModal={isModal}
      isEmpty={tags.length === 0}
      emptyContent={<><Icon name="entity.tagHash" size="sm" tone="muted" className="shrink-0" /><span>Тег «{query}» не найден в хранилище</span></>}
      header={<SuggestionMenuHeader icon={<Icon name="entity.tagHash" size="sm" />} title="Теги хранилища (#)" />}
    >
        {tags.map((item, idx) => {
          const isSelected = idx === selectedIndex;

          return (
            <button
              key={item.tag}
              type="button"
              data-selected={isSelected}
              data-tag-item={item.tag}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item.tag)}
              className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-tint-10 text-white font-medium shadow-sm'
                  : 'text-fg-tertiary hover:bg-tint-4'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 font-mono text-xs">
                <Icon name="entity.tagHash" size="sm" tone="inherit" className={`shrink-0 ${isSelected ? 'text-cyan-300' : 'text-fg-secondary'}`} />
                <span className="truncate">#{item.tag}</span>
              </div>

              <span className="px-1.5 py-0.5 rounded text-3xs font-mono bg-tint-4 text-fg-muted border border-tint-6 shrink-0">
                {item.count}
              </span>
            </button>
          );
        })}
    </SuggestionMenuShell>
  );
};
