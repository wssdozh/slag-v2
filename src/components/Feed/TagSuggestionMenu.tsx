import React, { useEffect, useRef } from 'react';
import { Hash } from 'lucide-react';

export interface TagMeta {
  tag: string;
  count: number;
}

interface TagSuggestionMenuProps {
  query: string;
  tags: TagMeta[];
  selectedIndex: number;
  onSelect: (tag: string) => void;
  placement?: 'top' | 'bottom';
  isModal?: boolean;
}

export const TagSuggestionMenu: React.FC<TagSuggestionMenuProps> = ({
  query,
  tags,
  selectedIndex,
  onSelect,
  placement = 'top',
  isModal: _isModal = false,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const isBottom = placement === 'bottom';
  const positionClasses = isBottom
    ? 'top-full mt-2'
    : 'bottom-full mb-2';
  const animationClasses = isBottom ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2';

  if (tags.length === 0) {
    return (
      <div
        className={`absolute left-0 right-0 ${positionClasses} w-full rounded-2xl bg-[#141416] border border-white/[0.12] shadow-2xl shadow-black/90 p-3 z-50 animate-in ${animationClasses} fade-in duration-150 ease-out select-none`}
      >
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Hash className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>Тег «#{query}» не найден в хранилище</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className={`absolute left-0 right-0 ${positionClasses} w-full max-h-52 overflow-y-auto rounded-2xl bg-[#141416] border border-white/[0.12] shadow-2xl shadow-black/90 p-1.5 z-50 flex flex-col gap-0.5 animate-in ${animationClasses} fade-in duration-150 ease-out select-none`}
    >
      {/* Шапка меню тегов */}
      <div className="px-2.5 py-1.5 border-b border-white/[0.06] bg-white/[0.02] rounded-t-xl flex items-center justify-between text-[10px] text-zinc-500 font-mono tracking-wider">
        <div className="flex items-center gap-1.5 text-zinc-300 uppercase">
          <Hash className="w-3 h-3 text-cyan-400" />
          <span>Теги хранилища (#)</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>↑↓ выбор</span>
          <span>•</span>
          <span>Enter применить</span>
          <span>•</span>
          <span>Esc отмена</span>
        </div>
      </div>

      {/* Список существующих тегов */}
      <div className="flex flex-col gap-0.5 pt-1">
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
      </div>
    </div>
  );
};
