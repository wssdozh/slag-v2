// The one ⋯ menu for a folder: rename, move and delete in every container.
import React, { useCallback, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { MenuDropdown } from '../UI/MenuDropdown';
import { IconButton } from '../UI/IconButton';

export interface FolderActionsMenuProps {
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}

const itemClass =
  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-fg-secondary ' +
  'hover:bg-tint-6 hover:text-fg-primary transition-colors outline-none ring-0 cursor-pointer';

/** The single `⋯` entry point for folder actions in every container. */
export const FolderActionsMenu: React.FC<FolderActionsMenuProps> = ({ onRename, onMove, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Every entry opens its own surface (an input or a dialog). Dismiss the popover
  // first: a menu left open would sit on top of that surface and eat its buttons.
  const runAction = useCallback(
    (action: () => void) => () => {
      setIsOpen(false);
      action();
    },
    []
  );

  return (
    <MenuDropdown
      ariaLabel="Действия с папкой"
      minWidth={186}
      align="end"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <IconButton size="sm" title="Действия с папкой" aria-label="Действия с папкой">
          <Icon name="action.moreHorizontal" size="md" tone="inherit" />
        </IconButton>
      }
    >
      <button type="button" className={itemClass} onClick={runAction(onRename)}>
        <Icon name="action.edit" size="sm" tone="inherit" className="shrink-0" />
        <span>Переименовать</span>
      </button>
      <button type="button" className={itemClass} onClick={runAction(onMove)}>
        <Icon name="action.folderMove" size="sm" tone="inherit" className="shrink-0" />
        <span>Переместить</span>
      </button>
      <div className="my-0.5 border-t border-subtle" />
      <button
        type="button"
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors outline-none ring-0 cursor-pointer`}
        onClick={runAction(onDelete)}
      >
        <Icon name="action.delete" size="sm" tone="inherit" className="shrink-0" />
        <span>Удалить папку</span>
      </button>
    </MenuDropdown>
  );
};
