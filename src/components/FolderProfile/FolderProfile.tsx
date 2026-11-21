// One folder profile in three containers: dock panel, modal and phone screen.
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
  onClose?: () => void;
  onSelectTag?: (tag: string) => void;
  /** Container-specific buttons (create record, AI triage) rendered under the header. */
  actions?: React.ReactNode;
}

const containerClass: Record<FolderProfileVariant, string> = {
  dock: 'flex flex-col gap-4 min-w-0',
  modal: 'flex flex-col gap-4 p-4 sm:p-5 min-w-0',
  screen: 'flex flex-col gap-3.5 px-4 py-3.5 min-w-0',
};

/**
 * One folder profile, three containers. Counters and media come from the folder's
 * own records, so the dock panel, the modal and the phone screen cannot disagree.
 */
export const FolderProfile: React.FC<FolderProfileProps> = ({
  folderPath,
  variant,
  onClose,
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
    saveFolder,
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
    onClose?.();
  }, [confirmAction, deleteFolder, folder, folderPath, onClose]);

  const handleMove = useCallback(() => openFolderMoveModal(folderPath), [folderPath, openFolderMoveModal]);

  const statsVariant = variant === 'dock' ? 'rows' : variant === 'screen' ? 'grid' : 'inline';

  return (
    <div className={containerClass[variant]} data-testid="folder-profile" data-variant={variant}>
      <FolderProfileHeader
        folder={folder}
        path={folderPath}
        itemCount={folderItems.length}
        variant={variant}
        edit={edit}
        onMove={handleMove}
        onDelete={handleDelete}
        onClose={onClose}
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
