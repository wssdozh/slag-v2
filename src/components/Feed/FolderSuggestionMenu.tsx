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

// The tree is drawn, not spelled: a text `╰──` sits on the text baseline, so the line under a
// nested folder ran below the icon instead of into its middle. The grid is the menu's own: one
// level = 16px, the hook is a square half level (8px) and the first icon starts 8px in.
const TREE_INDENT = 16;
const TREE_PADDING = 8;
const TREE_HOOK = TREE_INDENT / 2;
const TREE_LINE = 'bg-tint-15';

const rowPadding = (depth: number) => `${TREE_PADDING + depth * TREE_INDENT}px`;
const guideLeft = (column: number) => `${TREE_PADDING + column * TREE_INDENT + TREE_HOOK}px`;

/**
 * The lines of a branch: the guides of the ancestors still running, then the row's own hook —
 * down from the parent and across to the icon, closing on the last sibling.
 */
const BranchLines: React.FC<{ row: FolderTreeRow }> = ({ row }) => {
  const ownColumn = guideLeft(row.depth - 1);
  return (
    <>
      {row.columns.map((runs, column) =>
        runs ? (
          <span
            key={column}
            className={`pointer-events-none absolute -top-px -bottom-px w-px ${TREE_LINE}`}
            style={{ left: guideLeft(column) }}
          />
        ) : null
      )}
      {row.depth > 0 && (
        <>
          {/* The hook is square: half a level up, half a level across to the icon. */}
          <span
            className={`pointer-events-none absolute w-px ${TREE_LINE}`}
            style={{ left: ownColumn, top: `calc(50% - ${TREE_HOOK}px)`, height: `${TREE_HOOK}px` }}
          />
          {!row.isLast && (
            <span
              className={`pointer-events-none absolute top-1/2 -bottom-px w-px ${TREE_LINE}`}
              style={{ left: ownColumn }}
            />
          )}
          <span
            className={`pointer-events-none absolute top-1/2 h-px ${TREE_LINE}`}
            style={{ left: ownColumn, width: `${TREE_HOOK}px` }}
          />
        </>
      )}
    </>
  );
};

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
            <span className={`truncate text-xs ${isSelected ? 'text-white font-medium' : 'text-fg-tertiary'}`}>
              {row.name}
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
              data-depth={row.depth}
              onMouseDown={(e) => e.preventDefault()}
              className="relative flex h-7 items-center pr-2 opacity-45 select-none"
              style={{ paddingLeft: rowPadding(row.depth) }}
            >
              <BranchLines row={row} />
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
            data-depth={row.depth}
            data-branch={row.isLast ? 'last' : 'middle'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(row)}
            className={`relative flex h-7 items-center justify-between gap-3 pr-2 rounded-md text-left transition-colors cursor-pointer ${
              isSelected
                ? 'bg-tint-10 text-white font-medium shadow-sm'
                : 'text-fg-tertiary hover:bg-tint-4'
            }`}
            style={{ paddingLeft: rowPadding(row.depth) }}
          >
            <BranchLines row={row} />
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
