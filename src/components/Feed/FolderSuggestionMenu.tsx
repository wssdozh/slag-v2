import React, { useEffect, useRef } from 'react';
import { Folder } from 'lucide-react';
import type { FolderMeta } from '../../types';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { SuggestionMenuHeader } from './SuggestionMenuHeader';

interface FolderSuggestionMenuProps {
  query: string;
  folders: FolderMeta[];
  currentFolder: string;
  selectedFolder?: string | null;
  selectedIndex: number;
  onSelect: (folder: FolderMeta) => void;
  placement?: 'top' | 'bottom';
  isModal?: boolean;
}

export const FolderSuggestionMenu: React.FC<FolderSuggestionMenuProps> = ({
  query,
  folders,
  currentFolder,
  selectedFolder,
  selectedIndex,
  onSelect,
  placement = 'top',
  isModal = false,
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
    : isModal
    ? 'bottom-[calc(100%+55px)]'
    : 'bottom-[calc(100%+14px)]';
  const animationClasses = isBottom ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2';

  if (folders.length === 0) {
    return (
      <div
        className={`absolute left-0 right-0 ${positionClasses} w-full rounded-2xl bg-surface-elevated border border-white/[0.12] shadow-2xl shadow-black/90 p-3 z-50 animate-in ${animationClasses} fade-in duration-150 ease-out select-none`}
      >
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>Папка «{query}» не найдена</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute left-0 right-0 ${positionClasses} w-full rounded-2xl bg-surface-elevated border border-white/[0.12] shadow-2xl shadow-black/90 p-1.5 z-50 flex flex-col gap-0.5 animate-in ${animationClasses} fade-in duration-150 ease-out select-none overflow-hidden`}
    >
      {/* Шапка меню папок — фиксированная */}
      <SuggestionMenuHeader icon={<Folder className="w-3 h-3 text-zinc-400" />} title="Целевая папка" />

      {/* Список папок со скроллом строго внутри */}
      <div
        ref={listRef}
        className="flex flex-col gap-0.5 pt-1 max-h-44 overflow-y-auto pr-0.5"
      >
        {folders.map((f, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = f.path === currentFolder;
          const isTarget = f.path === selectedFolder;
          const IconComponent = (f.icon && FOLDER_ICONS[f.icon]) || Folder;
          const parentPath = f.path.includes('/')
            ? f.path.substring(0, f.path.lastIndexOf('/') + 1)
            : null;

          return (
            <button
              key={f.path}
              type="button"
              data-selected={isSelected}
              data-folder-item={f.path}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(f)}
              className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <IconComponent
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isSelected ? 'text-zinc-100' : 'text-zinc-400'
                  }`}
                />

                <div className="flex items-center gap-1.5 truncate">
                  {parentPath && (
                    <span className="text-[11px] font-mono text-zinc-500 truncate shrink-0">
                      {parentPath}
                    </span>
                  )}
                  <span className="text-xs font-medium text-zinc-100 truncate">
                    {f.name}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isTarget && (
                  <span className="text-[10px] font-mono text-zinc-300">
                    выбрана
                  </span>
                )}
                {isCurrent && !isTarget && (
                  <span className="text-[10px] font-mono text-zinc-500">
                    текущая
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
