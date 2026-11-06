import React from 'react';
import { Hash } from 'lucide-react';
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
      emptyContent={<><Hash className="w-3.5 h-3.5 text-zinc-500 shrink-0" /><span>Тег «{query}» не найден в хранилище</span></>}
      header={<SuggestionMenuHeader icon={<Hash className="w-3 h-3 text-zinc-400" />} title="Теги хранилища (#)" />}
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
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 font-mono text-xs">
                <Hash
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? 'text-cyan-300' : 'text-zinc-400'
                  }`}
                />
                <span className="truncate">#{item.tag}</span>
              </div>

              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-zinc-500 border border-white/[0.06] shrink-0">
                {item.count}
              </span>
            </button>
          );
        })}
    </SuggestionMenuShell>
  );
};
