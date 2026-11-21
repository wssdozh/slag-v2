// A folder's own writes: save, describe, rename, move, delete and the create modal.
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { storage } from '../../lib/storage';
import { folderName, type FolderDropMode } from '../../lib/vault/folderTree';
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
  moveFolder: (path: string, targetPath: string, mode: FolderDropMode) => boolean;
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

  // The profile modal and the phone screen point at the old path; a rename or a move has to take
  // them, and the open folder, along.
  const followFolderPath = useCallback((oldPath: string, newPath: string) => {
    const remap = (value: string | null): string | null =>
      value && (value === oldPath || value.startsWith(oldPath + '/'))
        ? newPath + value.slice(oldPath.length)
        : value;
    if (currentFolder === oldPath || currentFolder.startsWith(oldPath + '/')) {
      setCurrentFolder(newPath + currentFolder.slice(oldPath.length));
    }
    setFolderInfoTarget(previous => remap(previous));
    remapMobileFolder(remap);
  }, [currentFolder, setCurrentFolder, setFolderInfoTarget, remapMobileFolder]);

  const reportQueued = useCallback((queued: Promise<void>) => {
    void queued.then(
      () => addToast('Изменение папки в очереди, ждём подтверждения релея', 'info'),
      (error: unknown) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить операцию с папкой', 'error'),
    );
  }, [addToast]);

  const renameFolder = useCallback((oldPath: string, updatedFolder: FolderMeta) => {
    const queued = storage.renameFolder(oldPath, updatedFolder);
    if (queued) return reportQueued(queued);
    followFolderPath(oldPath, updatedFolder.path);
    refreshData();
    addToast(`Папка переименована в «${updatedFolder.name}»`, 'success');
  }, [followFolderPath, refreshData, addToast, reportQueued]);

  /**
   * A dropped folder: the storage does the rename, the re-numbering and the announcements; this
   * only has to follow the open folder and say what happened. `true` means the drop was accepted.
   */
  const moveFolder = useCallback((path: string, targetPath: string, mode: FolderDropMode): boolean => {
    const result = storage.moveFolder(path, targetPath, mode);
    if (!result.ok) {
      const name = folderName(path);
      if (result.reason === 'cycle') addToast(`Папку «${name}» нельзя вложить в себя`, 'error');
      else if (result.reason === 'exists') {
        addToast(
          targetPath
            ? `В «${folderName(targetPath)}» уже есть папка «${name}»`
            : `В корне уже есть папка «${name}»`,
          'error'
        );
      } else addToast('Не нашёл, куда перенести папку', 'error');
      return false;
    }
    if (result.queued) { reportQueued(result.queued); return true; }
    const nextPath = result.path ?? path;
    if (nextPath !== path) {
      followFolderPath(path, nextPath);
      addToast(`Папка «${folderName(nextPath)}» перемещена`, 'success');
    }
    refreshData();
    return true;
  }, [addToast, followFolderPath, refreshData, reportQueued]);

  const deleteFolder = (path: string) => {
    if (path === DEFAULT_INBOX_FOLDER) {
      addToast(`Папку «${DEFAULT_INBOX_FOLDER}» нельзя удалить`, 'error');
      return;
    }
    const queued = storage.deleteFolder(path);
    if (queued) return reportQueued(queued);
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
    moveFolder,
    deleteFolder,
    openCreateFolderModal,
    closeFolderModal,
  };
}
