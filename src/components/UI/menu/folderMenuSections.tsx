// Folder right-click entries: info, new subfolder, explorer and the guarded delete.
import React from 'react';
import { Trash2, FolderPlus, FolderOpen, Info, ChevronRight } from 'lucide-react';
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
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <Info className="w-3.5 h-3.5 text-zinc-400" />
      <span>Информация и медиа</span>
    </button>

    <button
      onClick={() => {
        onCreateSubfolder(folder.path);
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
      <span>Создать подпапку</span>
    </button>

    <div className="my-0.5 border-t border-white/[0.06]" />

    {/* Explorer Flyout Submenu for Folder */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('explorer', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('explorer', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'explorer' ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
        <span>Проводник</span>
      </div>
      <ChevronRight className="w-3 h-3 text-zinc-500" />
    </button>

    {folder.path !== DEFAULT_INBOX_FOLDER && (
      <>
        <div className="my-0.5 border-t border-white/[0.06]" />
        <button
          onClick={() => {
            onDeleteFolder(folder.path);
            onClose();
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Удалить папку</span>
        </button>
      </>
    )}
  </>
);
