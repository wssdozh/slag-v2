import React from 'react';
import { Folder } from 'lucide-react';
import type { FolderMeta } from '../../types';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { SuggestionMenuHeader } from './SuggestionMenuHeader';
import { SuggestionMenuShell } from './SuggestionMenuShell';

interface FolderSuggestionMenuProps {
  isOpen?: boolean;
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
  isOpen = true,
  query,
  folders,
  currentFolder,
  selectedFolder,
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
      isEmpty={folders.length === 0}
      emptyContent={<><Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" /><span>Папка «{query}» не найдена</span></>}
      header={<SuggestionMenuHeader icon={<Folder className="w-3 h-3 text-zinc-400" />} title="Целевая папка" />}
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
    </SuggestionMenuShell>
  );
};
