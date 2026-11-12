// Inline folder editing: one field at a time, committed through the storage action.
import { useCallback, useState } from 'react';
import type { FolderMeta } from '../../types';
import {
  folderPathForName,
  folderPathUnder,
  isFolderPathFree,
  parentPathOf,
  sanitizeFolderName,
} from '../../lib/vault/folderPaths';

export type FolderProfileEditMode = 'name' | 'description' | 'move' | null;

export interface FolderProfileEditOptions {
  path: string;
  folder: FolderMeta | undefined;
  folders: FolderMeta[];
  renameFolder: (oldPath: string, updatedFolder: FolderMeta) => void;
  updateFolderDescription: (path: string, description: string) => void;
  saveFolder: (folder: FolderMeta) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export interface FolderProfileEdit {
  mode: FolderProfileEditMode;
  nameDraft: string;
  descriptionDraft: string;
  moveTarget: string;
  startRename: () => void;
  startDescription: () => void;
  startMove: () => void;
  cancel: () => void;
  updateNameDraft: (value: string) => void;
  updateDescriptionDraft: (value: string) => void;
  updateMoveTarget: (value: string) => void;
  commitName: () => void;
  commitDescription: () => void;
  commitMove: () => void;
  selectIcon: (icon: string) => void;
}

/**
 * Inline editing for the folder profile. One field at a time, nothing is written
 * until the field commits, and every write goes through the single storage action
 * for that change: `renameFolder` for name and parent, `updateFolderDescription`
 * for the AI description.
 */
export function useFolderProfileEdit({
  path,
  folder,
  folders,
  renameFolder,
  updateFolderDescription,
  saveFolder,
  addToast,
}: FolderProfileEditOptions): FolderProfileEdit {
  const [mode, setMode] = useState<FolderProfileEditMode>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [moveTarget, setMoveTarget] = useState('');

  const cancel = useCallback(() => setMode(null), []);

  const startRename = useCallback(() => {
    setNameDraft(folder?.name || '');
    setMode('name');
  }, [folder]);

  const startDescription = useCallback(() => {
    setDescriptionDraft(folder?.description || '');
    setMode('description');
  }, [folder]);

  const startMove = useCallback(() => {
    setMoveTarget(parentPathOf(path));
    setMode('move');
  }, [path]);

  const commitName = useCallback(() => {
    if (!folder) {
      setMode(null);
      return;
    }
    const name = sanitizeFolderName(nameDraft);
    if (!name || name === folder.name) {
      setMode(null);
      return;
    }
    const nextPath = folderPathForName(path, name);
    if (!isFolderPathFree(folders, nextPath, path)) {
      addToast(`Папка «${nextPath}» уже существует`, 'error');
      return;
    }
    renameFolder(path, { ...folder, path: nextPath, name });
    setMode(null);
  }, [addToast, folder, folders, nameDraft, path, renameFolder]);

  const commitDescription = useCallback(() => {
    if (!folder) {
      setMode(null);
      return;
    }
    updateFolderDescription(path, descriptionDraft.trim());
    setMode(null);
  }, [descriptionDraft, folder, path, updateFolderDescription]);

  const commitMove = useCallback(() => {
    if (!folder) {
      setMode(null);
      return;
    }
    const nextPath = folderPathUnder(moveTarget, folder.name);
    if (nextPath === path) {
      setMode(null);
      return;
    }
    if (!isFolderPathFree(folders, nextPath, path)) {
      addToast(`Папка «${nextPath}» уже существует`, 'error');
      return;
    }
    renameFolder(path, { ...folder, path: nextPath });
    setMode(null);
  }, [addToast, folder, folders, moveTarget, path, renameFolder]);

  const selectIcon = useCallback(
    (icon: string) => {
      if (!folder) return;
      saveFolder({ ...folder, icon });
    },
    [folder, saveFolder]
  );

  return {
    mode,
    nameDraft,
    descriptionDraft,
    moveTarget,
    startRename,
    startDescription,
    startMove,
    cancel,
    updateNameDraft: setNameDraft,
    updateDescriptionDraft: setDescriptionDraft,
    updateMoveTarget: setMoveTarget,
    commitName,
    commitDescription,
    commitMove,
    selectIcon,
  };
}
