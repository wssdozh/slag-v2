// The `@folder` autocomplete: filtered folder rows, the selected one, and placement.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import type { FolderMeta } from '../../types';
import { folderIconName } from '../UI/icons/icons';
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
      emptyContent={<><Icon name="entity.folder" size="sm" tone="muted" className="shrink-0" /><span>Папка «{query}» не найдена</span></>}
    >
        {folders.map((f, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = f.path === currentFolder;
          const isTarget = f.path === selectedFolder;
          const iconName = folderIconName(f.icon);
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
                  ? 'bg-tint-10 text-white font-medium shadow-sm'
                  : 'text-fg-tertiary hover:bg-tint-4'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  name={iconName}
                  size="none"
                  tone="inherit"
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isSelected ? 'text-fg-primary' : 'text-fg-secondary'
                  }`}
                />

                <div className="flex items-center gap-1.5 truncate">
                  {parentPath && (
                    <span className="text-2xs font-mono text-fg-muted truncate shrink-0">
                      {parentPath}
                    </span>
                  )}
                  <span className="text-xs font-medium text-fg-primary truncate">
                    {f.name}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isTarget && (
                  <span className="text-3xs font-mono text-fg-tertiary">
                    выбрана
                  </span>
                )}
                {isCurrent && !isTarget && (
                  <span className="text-3xs font-mono text-fg-muted">
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
