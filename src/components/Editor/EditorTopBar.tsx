// Editor top row: back and folder. The record type lives with the metadata, under the title.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { Select } from '../UI/Select';
import type { EditorTopBarProps } from './editorToolbarParts';

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  folder,
  onFolderChange,
  folderOptions,
  onClose,
}) => {
  return (
    <div className="flex items-center gap-2 md:gap-2.5 shrink-0 z-10">
      {/* Back Button: pure icon */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg text-fg-secondary hover:text-white hover:bg-tint-6 motion-press cursor-pointer"
        data-hint="Назад к ленте (Escape)"
        aria-label="Назад к ленте"
      >
        <Icon name="nav.back" size="md" tone="inherit" />
        <span className="sr-only">Назад</span>
      </button>

      {/* Vertical Divider */}
      <div className="h-4 w-px bg-tint-8 shrink-0" />

      {/* Folder Selector: ghost droplist without podlozhka, showing full hierarchical path */}
      <Select
        size="sm"
        variant="ghost"
        value={folder}
        onChange={onFolderChange}
        options={folderOptions}
        className="max-w-[220px] md:max-w-[280px] h-7 text-xs font-mono"
      />
    </div>
  );
};
