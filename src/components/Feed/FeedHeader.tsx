// The feed's header: folder name and icon, filter badges, sort, materials toggle.
import React, { useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { folderIconName } from '../UI/icons/icons';
import { ActiveFilterBadges } from './ActiveFilterBadges';
import { FolderViewButton } from './FolderViewButton';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { materialsInFolder } from '../../lib/vault/folderItems';
import { Icon } from '../UI/icons/Icon';
import type { TaskQuickFilter } from '../../lib/tasks/taskQuickFilter';
import type { FeedViewMode } from '../../types';

export interface FeedHeaderProps {
  viewMode?: FeedViewMode;
  taskFilter?: TaskQuickFilter;
  onViewModeChange?: (mode: FeedViewMode) => void;
}

export const FeedHeader: React.FC<FeedHeaderProps> = ({
  viewMode: controlledViewMode,
  onViewModeChange,
  taskFilter,
}) => {
  const {
    currentFolder,
    feedViewMode: contextViewMode,
    folders,
    items,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    setIsTriageModalOpen,
    openFolderInfoModal,
  } = useApp();

  const headerRef = useRef<HTMLElement | null>(null);

  const activeViewMode = controlledViewMode ?? contextViewMode;
  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;

  const folderMaterialsCount = useMemo(
    () => activeViewMode === 'kanban' && !taskFilter ? materialsInFolder(items, currentFolder).length : 0,
    [items, currentFolder, activeViewMode, taskFilter],
  );

  const canTriageInbox = isInbox && items.some(i => i.folder === DEFAULT_INBOX_FOLDER);

  const folderIconComp = folderMeta?.icon ? (
    <Icon
      name={folderIconName(folderMeta.icon)}
      size="md"
      className="group-hover:text-fg-soft transition-colors shrink-0"
    />
  ) : isInbox ? (
    <Icon name="entity.inbox" size="md" tone="tertiary" className="group-hover:text-white transition-colors shrink-0" />
  ) : (
    <Icon name="entity.folder" size="md" className="group-hover:text-fg-soft transition-colors shrink-0" />
  );

  return (
    <header
      ref={headerRef}
      className="h-12 px-3 sm:px-4 border-b border-tint-6 bg-panel grid grid-cols-[1fr_auto_1fr] items-center gap-2 select-none shrink-0 relative"
    >
      {/* Left Column: Active Filter Badges */}
      <div className="flex items-center gap-1.5 justify-self-start min-w-0 z-10 overflow-x-auto scrollbar-none py-1">
        <ActiveFilterBadges ignoreTypeAndCompletion={Boolean(taskFilter)} />
      </div>

      {/* Center Column: Prominent Folder Title Button */}
      <div className="flex items-center justify-center justify-self-center min-w-0 max-w-full px-1 z-0">
        <button
          type="button"
          onClick={() => openFolderInfoModal(currentFolder)}
          className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 rounded-lg hover:bg-tint-6 motion-press cursor-pointer group select-none min-w-0"
          title={`Информация и медиа папки «${folderMeta?.name || currentFolder}»`}
          aria-label="Информация о папке"
        >
          {folderIconComp}
          <h2 className="text-xs sm:text-sm font-bold text-fg-primary group-hover:text-white tracking-tight transition-colors truncate max-w-[240px]">
            {folderMeta?.name || currentFolder}
          </h2>
        </button>
      </div>

      {/* Right Column: Actions (Materials, AI triage, 3-dots popover button) */}
      <div className="flex items-center gap-1.5 justify-self-end min-w-0 shrink-0 z-10">
        {/* Kanban Materials Dock Toggle */}
        {activeViewMode === 'kanban' && !taskFilter && (
          <button
            type="button"
            onClick={() => setIsKanbanMaterialsOpen(prev => !prev)}
            className={`h-ctrl-sm px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              isKanbanMaterialsOpen
                ? 'bg-tint-10 text-white'
                : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-6'
            }`}
            title={
              isKanbanMaterialsOpen
                ? `Скрыть материалы (${folderMaterialsCount})`
                : `Показать материалы (${folderMaterialsCount})`
            }
            aria-label="Материалы папки"
          >
            <Icon name="entity.materials" size="sm" tone="inherit" className="shrink-0" />
          </button>
        )}

        {/* AI Triage button in Inbox */}
        {canTriageInbox && (
          <button
            type="button"
            onClick={() => setIsTriageModalOpen(true)}
            title="ИИ-Сортировка"
            aria-label="Запустить ИИ-Сортировку"
            className="flex items-center justify-center h-ctrl-sm w-ctrl-sm rounded-md text-fg-secondary hover:text-fg-soft hover:bg-tint-6 cursor-pointer motion-press"
          >
            <Icon name="action.sort" size="sm" tone="inherit" />
          </button>
        )}

        <FolderViewButton mode={activeViewMode} changeLocalMode={onViewModeChange} />
      </div>
    </header>
  );
};
