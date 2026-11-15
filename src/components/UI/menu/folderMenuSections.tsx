// Folder right-click entries: info, new subfolder, explorer and the guarded delete.
import React from 'react';
import { Icon } from '../icons/Icon';
import type { FolderMeta } from '../../../types';
import { DEFAULT_INBOX_FOLDER } from '../../../config';
import type { MenuSubmenuName } from './MenuSubmenus';

export interface FolderMenuSectionsProps {
  folder: FolderMeta;
  activeSubmenu: MenuSubmenuName | null;
  onOpenFolderInfo: (path: string) => void;
  onCreateSubfolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onClose: () => void;
  onTriggerMouseEnter: (name: MenuSubmenuName, e: React.MouseEvent<HTMLButtonElement>) => void;
  onTriggerMouseLeave: () => void;
  onTriggerClick: (name: MenuSubmenuName, e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const FolderMenuSections: React.FC<FolderMenuSectionsProps> = ({
  folder,
  activeSubmenu,
  onOpenFolderInfo,
  onCreateSubfolder,
  onDeleteFolder,
  onClose,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  onTriggerClick,
}) => (
  <>
    <button
      onClick={() => {
        onOpenFolderInfo(folder.path);
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <Icon name="status.info" size="sm" />
      <span>Информация и медиа</span>
    </button>

    <button
      onClick={() => {
        onCreateSubfolder(folder.path);
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <Icon name="action.folderAdd" size="sm" />
      <span>Создать подпапку</span>
    </button>

    <div className="my-0.5 border-t border-tint-6" />

    {/* Explorer Flyout Submenu for Folder */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('explorer', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('explorer', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'explorer' ? 'bg-tint-8 text-white' : 'hover:bg-tint-6 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon name="entity.folderOpen" size="sm" />
        <span>Проводник</span>
      </div>
      <Icon name="nav.next" size="xs" tone="muted" />
    </button>

    {folder.path !== DEFAULT_INBOX_FOLDER && (
      <>
        <div className="my-0.5 border-t border-tint-6" />
        <button
          onClick={() => {
            onDeleteFolder(folder.path);
            onClose();
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
        >
          <Icon name="action.delete" size="sm" tone="inherit" />
          <span>Удалить папку</span>
        </button>
      </>
    )}
  </>
);
