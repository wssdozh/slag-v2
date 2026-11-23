// Scrollable folder list for the picker overlay: tree indentation, active descendant highlighting, click-to-select.
import React from 'react';
import type { FolderTreeRow } from '../../../lib/vault/folderTree';
import { makeOptionId } from './useFolderPicker';

export interface FolderPickerListProps {
  /** Unique id for this list — used as prefix in role="option" ids and aria-activedescendant. */
  id: string;
  rows: FolderTreeRow[];
  currentFolder: string;
  selectedIndex: number;
  onSelect: (path: string) => void;
}

/** A single scrollable row inside the folder picker list. Min 48px hit area. */
const PickerRow = React.memo(function PickerRow({
  row,
  isActive,
  isSelected,
  optionId,
  onClick,
}: {
  row: FolderTreeRow;
  isActive: boolean;
  isSelected: boolean;
  optionId: string;
  onClick: () => void;
}) {
  return (
    <button
      id={optionId}
      type="button"
      role="option"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onPointerDown={(e) => e.preventDefault()} // don't steal focus, allow touch scroll
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-3 pl-3 pr-2 text-left text-sm min-h-[48px] cursor-pointer transition-colors ${
        isActive
          ? 'bg-tint-8 text-white'
          : isSelected
            ? 'text-fg-secondary'
            : 'text-fg-muted hover:bg-tint-6 hover:text-fg-secondary'
      }`}
    >
      {/* Tree branch prefix as plain text */}
      <span className="shrink-0 font-mono select-none leading-relaxed">{row.prefix}</span>
      {/* Folder name */}
      <span className="truncate">{row.name}</span>
    </button>
  );
});

/** The full scrollable list box. Bounds are set by the parent container via overflow. */
export const FolderPickerList: React.FC<FolderPickerListProps> = ({
  id,
  rows,
  currentFolder,
  selectedIndex,
  onSelect,
}) => {
  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 px-4 text-fg-muted text-sm select-none"
        role="listbox"
        aria-label="Папки"
      >
        <svg
          className="w-8 h-8 mb-2 text-fg-soft"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        Ничего не найдено
      </div>
    );
  }

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Папки"
      aria-activedescendant={makeOptionId(id, selectedIndex)}
      className="overflow-y-auto scrollbar-none max-h-[60dvh]"
    >
      {rows.map((row, index) => (
        <PickerRow
          key={row.path}
          row={row}
          isActive={index === selectedIndex}
          isSelected={row.meta?.path === currentFolder}
          optionId={makeOptionId(id, index)}
          onClick={() => row.meta?.path && onSelect(row.meta!.path)}
        />
      ))}
    </div>
  );
};
