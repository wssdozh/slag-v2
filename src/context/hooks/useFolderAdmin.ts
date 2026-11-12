import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { storage } from '../../lib/storage';
import type { ToastMessage } from '../appContext.types';

/**
 * What a folder itself can do: save, describe, rename, delete, and the create modal.
 *
 * One reason to change — the shape of a folder on disk. Every write goes through the
 * storage service and comes back through refreshData; the provider owns the folder
 * list and the open folder, so this never becomes a second source of truth.
 */
export function useFolderAdmin(deps: {
  currentFolder: string;
  setCurrentFolder: Dispatch<SetStateAction<string>>;
  setFolderInfoTarget: Dispatch<SetStateAction<string | null>>;
  remapMobileFolder: (remap: (value: string | null) => string | null) => void;
  refreshData: () => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: ToastMessage['action']) => void;
  setIsFolderModalOpen: Dispatch<SetStateAction<boolean>>;
  setFolderModalParent: Dispatch<SetStateAction<string | null>>;
}): {
  saveFolder: (folder: FolderMeta) => void;
  updateFolderDescription: (path: string, description: string) => void;
  renameFolder: (oldPath: string, updatedFolder: FolderMeta) => void;
  deleteFolder: (path: string) => void;
  openCreateFolderModal: (parentPath?: string) => void;
  closeFolderModal: () => void;
} {
  const {
    currentFolder, setCurrentFolder, setFolderInfoTarget,
    remapMobileFolder, refreshData, addToast,
    setIsFolderModalOpen, setFolderModalParent,
  } = deps;

  const saveFolder = (folder: FolderMeta) => {
    storage.saveFolder(folder);
    refreshData();
    setIsFolderModalOpen(false);
    setFolderModalParent(null);
    addToast(`Папка «${folder.name}» сохранена`, 'success');
  };

  const updateFolderDescription = useCallback((path: string, description: string) => {
    storage.updateFolderDescription(path, description);
    refreshData();
    addToast('Описание папки обновлено', 'success');
  }, [refreshData, addToast]);

  const renameFolder = useCallback((oldPath: string, updatedFolder: FolderMeta) => {
    storage.renameFolder(oldPath, updatedFolder);
    const remap = (value: string | null): string | null =>
      value && (value === oldPath || value.startsWith(oldPath + '/'))
        ? updatedFolder.path + value.slice(oldPath.length)
        : value;
    if (currentFolder === oldPath || currentFolder.startsWith(oldPath + '/')) {
      const newCurrent = updatedFolder.path + currentFolder.slice(oldPath.length);
      setCurrentFolder(newCurrent);
    }
    // The profile modal and the phone screen point at the old path; follow the move.
    setFolderInfoTarget(previous => remap(previous));
    remapMobileFolder(remap);
    refreshData();
    addToast(`Папка переименована в «${updatedFolder.name}»`, 'success');
  }, [currentFolder, refreshData, addToast, setFolderInfoTarget, remapMobileFolder, setCurrentFolder]);

  const deleteFolder = (path: string) => {
    if (path === DEFAULT_INBOX_FOLDER) {
      addToast(`Папку «${DEFAULT_INBOX_FOLDER}» нельзя удалить`, 'error');
      return;
    }
    storage.deleteFolder(path);
    if (currentFolder === path || currentFolder.startsWith(path + '/')) {
      setCurrentFolder(DEFAULT_INBOX_FOLDER);
    }
    refreshData();
    addToast('Папка удалена, заметки перемещены во Входящие', 'info');
  };

  const openCreateFolderModal = (parentPath?: string) => {
    setFolderModalParent(parentPath ?? null);
    setIsFolderModalOpen(true);
  };

  const closeFolderModal = () => {
    setIsFolderModalOpen(false);
    setFolderModalParent(null);
  };

  return {
    saveFolder,
    updateFolderDescription,
    renameFolder,
    deleteFolder,
    openCreateFolderModal,
    closeFolderModal,
  };
}
