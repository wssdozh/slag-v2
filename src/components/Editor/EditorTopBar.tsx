// Editor top row: back, folder selector, item type.
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Select } from '../UI/Select';
import { ResponsiveSegmented } from '../UI/ResponsiveSegmented';
import type { SlagItemType } from '../../types';
import { ITEM_TYPE_OPTIONS } from './editorToolbarParts';
import type { EditorTopBarProps } from './editorToolbarParts';

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  folder,
  onFolderChange,
  folderOptions,
  type,
  onTypeChange,
  onClose,
}) => {
  return (
    <div className="flex items-center gap-2 md:gap-2.5 shrink-0 z-10">
      {/* Back Button: pure icon */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] motion-press cursor-pointer"
        title="Назад к ленте (Escape)"
        aria-label="Назад к ленте"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="sr-only">Назад</span>
      </button>

      {/* Vertical Divider */}
      <div className="h-4 w-px bg-white/[0.08] shrink-0" />

      {/* Folder Selector: ghost droplist without podlozhka, showing full hierarchical path */}
      <Select
        size="sm"
        variant="ghost"
        value={folder}
        onChange={onFolderChange}
        options={folderOptions}
        className="max-w-[220px] md:max-w-[280px] h-7 text-xs font-mono"
      />

      {/* Vertical Divider */}
      <div className="h-4 w-px bg-white/[0.08] shrink-0 hidden sm:block" />

      {/* Item Type: droplist, the same control the composer uses */}
      <div className="hidden shrink-0 sm:block">
        <ResponsiveSegmented<SlagItemType>
          value={type}
          onChange={onTypeChange}
          options={ITEM_TYPE_OPTIONS}
          compact
          size="sm"
          ariaLabel="Сменить тип записи"
        />
      </div>
    </div>
  );
};
