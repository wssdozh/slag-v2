// The `@folder` autocomplete: the folder tree as branch rows, the selected one, and placement.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { folderIconName } from '../UI/icons/icons';
import type { FolderTreeRow } from '../../lib/vault/folderTree';
import { SuggestionMenuShell } from './SuggestionMenuShell';

interface FolderSuggestionMenuProps {
  isOpen?: boolean;
  query: string;
  rows: FolderTreeRow[];
  currentFolder: string;
  selectedFolder?: string | null;
  selectedIndex: number;
  onSelect: (row: FolderTreeRow) => void;
  placement?: 'top' | 'bottom';
  isModal?: boolean;
}

/**
 * A filtered folder list still reads as the tree it is: the rows of its branches keep their lines,
 * and a parent shown only to make the branch make sense is a label, not a choice.
 */
export const FolderSuggestionMenu: React.FC<FolderSuggestionMenuProps> = ({
  isOpen = true,
  query,
  rows,
  currentFolder,
  selectedFolder,
  selectedIndex,
  onSelect,
  placement = 'top',
  isModal = false,
}) => {
  const selectable = rows.filter(row => row.meta);
  const selectedPath = selectable[selectedIndex]?.path ?? null;

  return (
    <SuggestionMenuShell
      isOpen={isOpen}
      selectedIndex={selectedIndex}
      placement={placement}
      isModal={isModal}
      isEmpty={selectable.length === 0}
      emptyContent={<><Icon name="entity.folder" size="sm" tone="muted" className="shrink-0" /><span>Папка «{query}» не найдена</span></>}
    >
      {rows.map(row => {
        const { meta } = row;
        const isSelected = row.path === selectedPath;
        const isCurrent = row.path === currentFolder;
        const isTarget = row.path === selectedFolder;
        const iconName = folderIconName(meta?.icon);

        const label = (
          <span className="flex items-center gap-2 min-w-0">
            <Icon
              name={iconName}
              size="md"
              tone="inherit"
              className={`w-4 h-4 shrink-0 ${isSelected ? 'text-fg-primary' : 'text-fg-muted'}`}
            />
            <span className="flex items-baseline gap-1 min-w-0">
              {row.prefix && (
                <span className="text-2xs font-mono text-fg-dim whitespace-pre shrink-0">{row.prefix}</span>
              )}
              <span className={`truncate text-xs ${isSelected ? 'text-white font-medium' : 'text-fg-tertiary'}`}>
                {row.name}
              </span>
            </span>
          </span>
        );

        // A branch parent that only matched through its child keeps the line readable; it is not
        // something `@` can point at, so it is drawn as a caption instead of a row.
        if (!meta) {
          return (
            <div
              key={row.path}
              aria-hidden="true"
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center px-2.5 py-1 opacity-45 select-none"
            >
              {label}
            </div>
          );
        }

        return (
          <button
            key={row.path}
            type="button"
            data-selected={isSelected}
            data-folder-item={row.path}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(row)}
            className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
              isSelected
                ? 'bg-tint-10 text-white font-medium shadow-sm'
                : 'text-fg-tertiary hover:bg-tint-4'
            }`}
          >
            {label}

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
