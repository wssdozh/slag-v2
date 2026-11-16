// The flyout panels of the context menu: more actions, type switch and explorer.
import React from 'react';
import { Icon } from '../icons/Icon';
import type { FolderMeta, SlagItem, SlagItemType } from '../../../types';
import type { ContextMenuTarget } from '../../../context/appContext.types';
import { usePresence } from '../../../hooks/ui/usePresence';

export type MenuSubmenuName = 'more' | 'type' | 'explorer';

/**
 * A side panel of the menu. The menu itself already outlives its own exit; a
 * flyout that unmounts the moment the pointer leaves pulls the frame out from
 * under the cursor, so it keeps the same window as everything else.
 */
const Flyout: React.FC<React.HTMLAttributes<HTMLDivElement> & { open: boolean }> = ({ open, children, ...rest }) => {
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(open);
  if (!isPresent) return null;
  return (
    <div ref={ref} data-motion-state={phase} onTransitionEnd={onTransitionEnd} {...rest}>
      {children}
    </div>
  );
};

export interface MenuSubmenusProps {
  type: ContextMenuTarget['type'];
  item?: SlagItem;
  folder?: FolderMeta;
  triggerRect: DOMRect | null;
  activeSubmenu: MenuSubmenuName | null;
  submenuX: number;
  submenuY: number;
  submenuDirection: 'right' | 'left';
  submenuMaxHeight: number;
  onChangeType: (type: SlagItemType) => void;
  onOpenInExplorer: () => void;
  onCopyFullPath: () => void;
  onCopyRelativePath: () => void;
  onCopyLink: () => void;
  onOpenFolder: (path: string) => void;
  onCopyFolderFullPath: (path: string) => Promise<void>;
  onCopyFolderPath: (path: string) => void;
  onSubmenuMouseEnter: () => void;
  onSubmenuMouseLeave: () => void;
}

export const MenuSubmenus: React.FC<MenuSubmenusProps> = ({
  type,
  item,
  folder,
  triggerRect,
  activeSubmenu,
  submenuX,
  submenuY,
  submenuDirection,
  submenuMaxHeight,
  onChangeType,
  onOpenInExplorer,
  onCopyFullPath,
  onCopyRelativePath,
  onCopyLink,
  onOpenFolder,
  onCopyFolderFullPath,
  onCopyFolderPath,
  onSubmenuMouseEnter,
  onSubmenuMouseLeave,
}) => (
  <>
    {/* Side Submenu Panel: Quick Type Change */}
    {type === 'item' && item && triggerRect && (
      <Flyout
        open={activeSubmenu === 'type'}
        style={{ left: `${submenuX}px`, top: `${submenuY}px`, maxHeight: `${submenuMaxHeight}px` }}
        onMouseEnter={onSubmenuMouseEnter}
        onMouseLeave={onSubmenuMouseLeave}
        className="fixed z-[120] w-44 rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-tint-8 shadow-2xl p-1 text-xs text-fg-tertiary flex flex-col gap-0.5 select-none motion-popover overflow-y-auto scrollbar-thin"
      >
        {/* Bridge hit-area */}
        <div
          className={`absolute top-0 bottom-0 w-3 pointer-events-auto ${
            submenuDirection === 'right' ? '-left-2' : '-right-2'
          }`}
        />

        <button
          onClick={() => onChangeType('note')}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 transition-colors text-left cursor-pointer ${
            item.type === 'note' ? 'text-white bg-tint-6' : 'text-fg-tertiary hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon name="entity.note" size="sm" />
            <span>Заметка</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-fg-muted font-mono">1</span>
            {item.type === 'note' && <Icon name="action.check" size="sm" tone="accent" />}
          </div>
        </button>

        <button
          onClick={() => onChangeType('task')}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 transition-colors text-left cursor-pointer ${
            item.type === 'task' ? 'text-white bg-tint-6' : 'text-fg-tertiary hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon name="entity.task" size="sm" />
            <span>Таска</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-fg-muted font-mono">2</span>
            {item.type === 'task' && <Icon name="action.check" size="sm" tone="accent" />}
          </div>
        </button>

        <button
          onClick={() => onChangeType('article')}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 transition-colors text-left cursor-pointer ${
            item.type === 'article' ? 'text-white bg-tint-6' : 'text-fg-tertiary hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon name="entity.article" size="sm" />
            <span>Статья</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-fg-muted font-mono">3</span>
            {item.type === 'article' && <Icon name="action.check" size="sm" tone="accent" />}
          </div>
        </button>
      </Flyout>
    )}

    {/* Side Submenu Panel: Explorer / File System */}
    {((type === 'item' && item) || (type === 'folder' && folder)) && triggerRect && (
      <Flyout
        open={activeSubmenu === 'explorer'}
        style={{ left: `${submenuX}px`, top: `${submenuY}px`, maxHeight: `${submenuMaxHeight}px` }}
        onMouseEnter={onSubmenuMouseEnter}
        onMouseLeave={onSubmenuMouseLeave}
        className="fixed z-[120] w-64 rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-tint-8 shadow-2xl p-1 text-xs text-fg-tertiary flex flex-col gap-0.5 select-none motion-popover overflow-y-auto scrollbar-thin"
      >
        {/* Bridge hit-area */}
        <div
          className={`absolute top-0 bottom-0 w-3 pointer-events-auto ${
            submenuDirection === 'right' ? '-left-2' : '-right-2'
          }`}
        />

        <button
          onClick={() => {
            if (type === 'item') {
              onOpenInExplorer();
            } else if (folder) {
              onOpenFolder(folder.path);
            }
          }}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Icon name="entity.folderOpen" size="sm" />
            <span className="whitespace-nowrap">Открыть в проводнике</span>
          </div>
          <span className="text-3xs text-fg-muted font-mono">⌘O</span>
        </button>

        <button
          onClick={async () => {
            if (type === 'item') {
              onCopyFullPath();
            } else if (folder) {
              await onCopyFolderFullPath(folder.path);
            }
          }}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Icon name="entity.article" size="sm" />
            <span className="whitespace-nowrap">Скопировать полный путь</span>
          </div>
        </button>

        <button
          onClick={() => {
            if (type === 'item') {
              onCopyRelativePath();
            } else if (folder) {
              onCopyFolderPath(folder.path);
            }
          }}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Icon name="action.copy" size="sm" />
            <span className="whitespace-nowrap">Относительный путь</span>
          </div>
        </button>
      </Flyout>
    )}

    {/* Side Submenu Panel: Additional Utilities */}
    {type === 'item' && item && triggerRect && (
      <Flyout
        open={activeSubmenu === 'more'}
        style={{ left: `${submenuX}px`, top: `${submenuY}px`, maxHeight: `${submenuMaxHeight}px` }}
        onMouseEnter={onSubmenuMouseEnter}
        onMouseLeave={onSubmenuMouseLeave}
        className="fixed z-[120] w-48 rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-tint-8 shadow-2xl p-1 text-xs text-fg-tertiary flex flex-col gap-0.5 select-none motion-popover overflow-y-auto scrollbar-thin"
      >
        {/* Bridge hit-area */}
        <div
          className={`absolute top-0 bottom-0 w-3 pointer-events-auto ${
            submenuDirection === 'right' ? '-left-2' : '-right-2'
          }`}
        />

        <button
          onClick={onCopyLink}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Icon name="action.link" size="sm" />
            <span>Копировать [[линк]]</span>
          </div>
          <span className="text-3xs text-fg-muted font-mono">⌘L</span>
        </button>
      </Flyout>
    )}
  </>
);
