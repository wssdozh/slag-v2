// Writing folders: save, rename with the note cascade, describe, delete and re-route to Inbox.
// Which folders exist is the disk's answer; what is written here is the cache that draws them
// before the scan lands, and the metadata `state.json` keeps per path.
import type { ComposerDraft, FolderMeta, SlagItem, VaultMeta } from '../../types';
import { DEFAULT_FOLDERS, DEFAULT_INBOX_FOLDER, STORAGE_KEYS } from '../../config';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import { readStoredJson } from './readJson';
import type { StorageChangeEvent } from '.';

const fsLog = logger.scope('FS');

const FOLDERS_STORAGE_PREFIX = STORAGE_KEYS.FOLDERS_PREFIX;

export interface FolderStoreHost {
  currentVault: VaultMeta;
  files: {
    renameFolderOnDisk(oldPath: string, newPath: string, items: SlagItem[]): Promise<void>;
    deleteFolderOnDisk(path: string, movedItems: { item: SlagItem; oldFolder: string }[]): Promise<void>;
  };
  /** Writes the list as given: the cache the sidebar draws from, and the metadata on disk. */
  persistFolders(folders: FolderMeta[], origin: 'local' | 'remote'): void;
  emitChange(event: StorageChangeEvent): void;
  getItems(folder?: string): SlagItem[];
  cacheItems(key: string, items: SlagItem[]): void;
  getItemsKey(): string;
  getDraftsKey(): string;
  getAllComposerDrafts(): Record<string, ComposerDraft>;
}

export function folderStorageKey(store: FolderStoreHost): string {
  return `${FOLDERS_STORAGE_PREFIX}${store.currentVault.id}`;
}

/** What the sidebar draws before the disk has answered — and all a browser build ever has. */
export function readFolders(store: FolderStoreHost): FolderMeta[] {
  return readStoredJson<FolderMeta[]>(folderStorageKey(store), DEFAULT_FOLDERS, value =>
    Array.isArray(value) ? (value as FolderMeta[]) : undefined
  );
}

export function writeFolder(store: FolderStoreHost, folder: FolderMeta, origin: 'local' | 'remote' = 'local'): void {
  const folders = readFolders(store).filter(f => f.path !== folder.path);
  folders.push(folder);
  store.persistFolders(folders, origin);
  fsLog.info(`Saved folder "${folder.name}" (${folder.path})`);
  store.emitChange({ kind: 'folder', action: 'upsert', id: folder.path, payload: folder, origin });
}

export function renameFolderTree(
  store: FolderStoreHost,
  oldPath: string,
  updatedFolder: FolderMeta,
  origin: 'local' | 'remote' = 'local'
): void {
  if (oldPath === DEFAULT_INBOX_FOLDER) return; // Cannot rename system inbox

  // A rename remaps metadata and notes. Whether a folder exists is still the directory's call.
  const folders = readFolders(store).map(f => {
    if (f.path === oldPath) {
      return updatedFolder;
    }
    if (f.path.startsWith(oldPath + '/')) {
      const subPath = updatedFolder.path + f.path.slice(oldPath.length);
      const subName = subPath.split('/').pop() || f.name;
      return { ...f, path: subPath, name: subName };
    }
    return f;
  });
  store.persistFolders(folders, origin);

  // Update items belonging to this folder and its subfolders
  const items = store.getItems().map(it => {
    if (it.folder === oldPath) {
      return { ...it, folder: updatedFolder.path, updatedAt: Date.now() };
    }
    if (it.folder.startsWith(oldPath + '/')) {
      const subFolder = updatedFolder.path + it.folder.slice(oldPath.length);
      return { ...it, folder: subFolder, updatedAt: Date.now() };
    }
    return it;
  });
  store.cacheItems(store.getItemsKey(), items);

  fsLog.info(`Renamed folder "${oldPath}" to "${updatedFolder.path}"`);
  if (isTauri()) {
    void store.files.renameFolderOnDisk(oldPath, updatedFolder.path, items);
  }
  store.emitChange({ kind: 'folder', action: 'rename', id: updatedFolder.path, payload: updatedFolder, oldPath, origin });
}

export function describeFolder(
  store: FolderStoreHost,
  path: string,
  description: string,
  origin: 'local' | 'remote' = 'local'
): void {
  let targetFolder: FolderMeta | undefined;
  const folders = readFolders(store).map(f => {
    if (f.path === path) {
      targetFolder = { ...f, description };
      return targetFolder;
    }
    return f;
  });
  store.persistFolders(folders, origin);
  fsLog.debug(`Updated description for folder "${path}"`);
  if (targetFolder) {
    store.emitChange({ kind: 'folder', action: 'upsert', id: path, payload: targetFolder, origin });
  }
}

export function eraseFolder(store: FolderStoreHost, path: string, origin: 'local' | 'remote' = 'local'): void {
  if (path === DEFAULT_INBOX_FOLDER) return; // Cannot delete system inbox
  const folders = readFolders(store).filter(f => f.path !== path && !f.path.startsWith(path + '/'));
  store.persistFolders(folders, origin);

  // Move orphan items to inbox
  const items = store.getItems();
  const movedItems: { item: SlagItem; oldFolder: string }[] = [];
  const updatedItems = items.map(it => {
    if (it.folder === path || it.folder.startsWith(path + '/')) {
      const oldFolder = it.folder;
      const updated: SlagItem = { ...it, folder: DEFAULT_INBOX_FOLDER, updatedAt: Date.now() };
      movedItems.push({ item: updated, oldFolder });
      return updated;
    }
    return it;
  });
  store.cacheItems(store.getItemsKey(), updatedItems);

  // Clean up drafts for deleted folder and any subfolders
  const drafts = store.getAllComposerDrafts();
  let draftsChanged = false;
  for (const key of Object.keys(drafts)) {
    if (key === path || key.startsWith(path + '/')) {
      delete drafts[key];
      draftsChanged = true;
    }
  }
  if (draftsChanged) {
    try {
      localStorage.setItem(store.getDraftsKey(), JSON.stringify(drafts));
    } catch (err) {
      fsLog.warn(`Failed to drop drafts of the deleted folder "${path}"`, err);
    }
  }

  if (isTauri()) {
    void store.files.deleteFolderOnDisk(path, movedItems);
  }

  fsLog.info(`Deleted folder "${path}", items re-routed to Inbox`);
  store.emitChange({ kind: 'folder', action: 'delete', id: path, origin });
}
