import React from 'react';
import { FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { MenuDropdown } from '../UI/MenuDropdown';
import { IconButton } from '../UI/IconButton';

export interface FolderActionsMenuProps {
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}

const itemClass =
  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-fg-secondary ' +
  'hover:bg-white/[0.06] hover:text-fg-primary transition-colors outline-none ring-0 cursor-pointer';

/** The single `⋯` entry point for folder actions in every container. */
export const FolderActionsMenu: React.FC<FolderActionsMenuProps> = ({ onRename, onMove, onDelete }) => (
  <MenuDropdown
    ariaLabel="Действия с папкой"
    minWidth={186}
    align="end"
    trigger={
      <IconButton size="sm" title="Действия с папкой" aria-label="Действия с папкой">
        <MoreHorizontal className="w-4 h-4" />
      </IconButton>
    }
  >
    <button type="button" className={itemClass} onClick={onRename}>
      <Pencil className="w-3.5 h-3.5 shrink-0" />
      <span>Переименовать</span>
    </button>
    <button type="button" className={itemClass} onClick={onMove}>
      <FolderInput className="w-3.5 h-3.5 shrink-0" />
      <span>Переместить</span>
    </button>
    <div className="my-0.5 border-t border-subtle" />
    <button
      type="button"
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors outline-none ring-0 cursor-pointer`}
      onClick={onDelete}
    >
      <Trash2 className="w-3.5 h-3.5 shrink-0" />
      <span>Удалить папку</span>
    </button>
  </MenuDropdown>
);
