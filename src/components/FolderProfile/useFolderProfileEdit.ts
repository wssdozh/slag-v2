// Inline folder editing: one field at a time, committed through the storage action.
import { useCallback, useState } from 'react';
import type { FolderMeta } from '../../types';
import {
  folderPathForName,
  isFolderPathFree,
  sanitizeFolderName,
} from '../../lib/vault/folderPaths';

export type FolderProfileEditMode = 'name' | 'description' | null;

export interface FolderProfileEditOptions {
  path: string;
  folder: FolderMeta | undefined;
  folders: FolderMeta[];
  renameFolder: (oldPath: string, updatedFolder: FolderMeta) => void;
  updateFolderDescription: (path: string, description: string) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export interface FolderProfileEdit {
  mode: FolderProfileEditMode;
  nameDraft: string;
  descriptionDraft: string;
  startRename: () => void;
  startDescription: () => void;
  cancel: () => void;
  updateNameDraft: (value: string) => void;
  updateDescriptionDraft: (value: string) => void;
  commitName: () => void;
  commitDescription: () => void;
}

/**
 * Inline editing for the folder profile. One field at a time, nothing is written
 * until the field commits, and every write goes through the single storage action
 * for that change: `renameFolder` for the name, `updateFolderDescription` for the
 * AI description. Moving is a dialog of its own (`FolderMoveModal`), not an edit mode.
 */
export function useFolderProfileEdit({
  path,
  folder,
  folders,
  renameFolder,
  updateFolderDescription,
  addToast,
}: FolderProfileEditOptions): FolderProfileEdit {
  const [mode, setMode] = useState<FolderProfileEditMode>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const cancel = useCallback(() => setMode(null), []);

  const startRename = useCallback(() => {
    setNameDraft(folder?.name || '');
    setMode('name');
  }, [folder]);

  const startDescription = useCallback(() => {
    setDescriptionDraft(folder?.description || '');
    setMode('description');
  }, [folder]);

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

  return {
    mode,
    nameDraft,
    descriptionDraft,
    startRename,
    startDescription,
    cancel,
    updateNameDraft: setNameDraft,
    updateDescriptionDraft: setDescriptionDraft,
    commitName,
    commitDescription,
  };
}
