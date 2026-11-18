// Writing folders: save, rename with the note cascade, describe, delete and re-route to Inbox.
// Which folders exist is the disk's answer. What this module keeps is the list the sidebar draws
// before the scan lands — in memory, per vault — and the metadata `state.json` remembers by path.
import type { ComposerDraft, FolderMeta, SlagItem, VaultMeta } from '../../types';
import { DEFAULT_FOLDERS, DEFAULT_INBOX_FOLDER, STORAGE_KEYS } from '../../config';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import type { StorageChangeEvent } from '.';

const fsLog = logger.scope('FS');

const FOLDERS_STORAGE_PREFIX = STORAGE_KEYS.FOLDERS_PREFIX;

/**
 * The list as this session knows it, keyed by vault. Nothing carries it past a reload: the scan
 * rebuilds it from the directories, and `state.json` keeps only the metadata.
 */
const foldersInMemory = new Map<string, FolderMeta[]>();

export interface FolderStoreHost {
  currentVault: VaultMeta;
  files: {
    renameFolderOnDisk(oldPath: string, newPath: string, items: SlagItem[]): Promise<void>;
    deleteFolderOnDisk(path: string, movedItems: { item: SlagItem; oldFolder: string }[]): Promise<void>;
  };
  /** Remembers the list and hands its metadata to `state.json`. */
  persistFolders(folders: FolderMeta[], origin: 'local' | 'remote'): void;
  emitChange(event: StorageChangeEvent): void;
  getItems(folder?: string): SlagItem[];
  cacheItems(key: string, items: SlagItem[]): void;
  getItemsKey(): string;
  getAllComposerDrafts(): Record<string, ComposerDraft>;
  /** Drops one folder's composer draft; where drafts live is the drafts writer's business. */
  eraseDraft(folderPath: string, origin: 'local' | 'remote'): void;
}

/** The key older builds drew the list from; the import format still names it, nothing reads it. */
export function folderStorageKey(store: FolderStoreHost): string {
  return `${FOLDERS_STORAGE_PREFIX}${store.currentVault.id}`;
}

/** What the sidebar draws before the disk has answered: memory, or the defaults of a fresh start. */
export function readFolders(store: FolderStoreHost): FolderMeta[] {
  const folders = foldersInMemory.get(store.currentVault.id) ?? DEFAULT_FOLDERS;
  return folders.map(folder => ({ ...folder }));
}

/** The one writer of that memory: the service calls it for every list it persists. */
export function rememberFolders(store: FolderStoreHost, folders: FolderMeta[]): void {
  foldersInMemory.set(store.currentVault.id, folders);
}

/** A vault that is gone takes its list with it: a later vault may be created with the same id. */
export function forgetVaultFolders(vaultId: string): void {
  foldersInMemory.delete(vaultId);
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
  for (const draftFolder of Object.keys(store.getAllComposerDrafts())) {
    if (draftFolder === path || draftFolder.startsWith(path + '/')) {
      store.eraseDraft(draftFolder, origin);
    }
  }

  if (isTauri()) {
    void store.files.deleteFolderOnDisk(path, movedItems);
  }

  fsLog.info(`Deleted folder "${path}", items re-routed to Inbox`);
  store.emitChange({ kind: 'folder', action: 'delete', id: path, origin });
}
