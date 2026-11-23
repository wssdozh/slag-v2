// One folder profile in the desktop dock and the phone screen.
import React, { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { itemsInFolder } from '../../lib/vault/folderItems';
import { useFolderMedia } from '../RightPanel/useFolderMedia';
import { FolderMediaTabs } from '../RightPanel/FolderMediaTabs';
import { FolderProfileHeader, type FolderProfileVariant } from './FolderProfileHeader';
import { FolderStats } from './FolderStats';
import { useFolderProfileEdit } from './useFolderProfileEdit';

export interface FolderProfileProps {
  folderPath: string;
  variant: FolderProfileVariant;
  onSelectTag?: (tag: string) => void;
  /** Container-specific buttons (create record, AI triage) rendered under the header. */
  actions?: React.ReactNode;
}

const containerClass: Record<FolderProfileVariant, string> = {
  dock: 'flex flex-col gap-4 min-w-0',
  screen: 'flex flex-col gap-3.5 px-4 py-3.5 min-w-0',
};

/**
 * Counters and media come from the folder's own records on desktop and mobile.
 */
export const FolderProfile: React.FC<FolderProfileProps> = ({
  folderPath,
  variant,
  onSelectTag,
  actions,
}) => {
  const {
    items,
    folders,
    saveFolder,
    renameFolder,
    updateFolderDescription,
    deleteFolder,
    openFolderMoveModal,
    addToast,
    confirmAction,
    openLightbox,
    setActiveTagFilter,
  } = useApp();

  const folder = useMemo(() => folders.find(meta => meta.path === folderPath), [folders, folderPath]);
  const folderItems = useMemo(() => itemsInFolder(items, folderPath), [items, folderPath]);
  const mediaData = useFolderMedia(folderItems);

  const edit = useFolderProfileEdit({
    path: folderPath,
    folder,
    folders,
    renameFolder,
    updateFolderDescription,
    addToast,
  });

  const handleDelete = useCallback(async () => {
    const confirmed = await confirmAction({
      title: `Удалить папку «${folder?.name || folderPath}»?`,
      description: 'Записи из неё переедут во «Входящие».',
      confirmLabel: 'Удалить',
      isDestructive: true,
    });
    if (!confirmed) return;
    deleteFolder(folderPath);
  }, [confirmAction, deleteFolder, folder, folderPath]);

  const handleMove = useCallback(() => openFolderMoveModal(folderPath), [folderPath, openFolderMoveModal]);

  const statsVariant = variant === 'dock' ? 'rows' : 'grid';

  return (
    <div className={containerClass[variant]} data-testid="folder-profile" data-variant={variant}>
      <FolderProfileHeader
        folder={folder}
        path={folderPath}
        itemCount={folderItems.length}
        variant={variant}
        edit={edit}
        onSaveFolder={saveFolder}
        onMove={handleMove}
        onDelete={handleDelete}
      />

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      <FolderStats mediaData={mediaData} variant={statsVariant} />

      <div className={variant === 'dock' ? '' : 'pt-1 border-t border-subtle'}>
        <FolderMediaTabs
          mediaData={mediaData}
          onOpenLightbox={(images, index) => openLightbox(images, index)}
          onSelectTag={tag => (onSelectTag ? onSelectTag(tag) : setActiveTagFilter(tag))}
          variant={variant === 'screen' ? 'mobile' : 'desktop'}
          compact={variant === 'dock'}
        />
      </div>
    </div>
  );
};
