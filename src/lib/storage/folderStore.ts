// Writing folders: save, rename with the note cascade, move by drag, describe, delete and re-route.
// Which folders exist is the disk's answer. What this module keeps is the list the sidebar draws
// before the scan lands — in memory, per vault — and the metadata `state.json` remembers by path.
import type { ComposerDraft, FolderMeta, SlagItem, VaultMeta } from '../../types';
import { DEFAULT_FOLDERS, DEFAULT_INBOX_FOLDER } from '../../config';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import { folderName, moveFolderPaths, sortFolders, type FolderDropMode } from '../vault/folderTree';
import { folderPathUnder, isFolderPathFree, isSelfOrDescendant, parentPathOf } from '../vault/folderPaths';
import type { StorageChangeEvent } from '.';
import type { NoteMutation } from './noteRegistry';

const fsLog = logger.scope('FS');

/**
 * The list as this session knows it, keyed by vault. Nothing carries it past a reload: the scan
 * rebuilds it from the directories, and `state.json` keeps only the metadata.
 */
const foldersInMemory = new Map<string, FolderMeta[]>();

export interface FolderStoreHost {
  currentVault: VaultMeta;
  files: {
    renameFolderOnDisk(oldPath: string, newPath: string, items: SlagItem[], vault?: VaultMeta, strict?: boolean): Promise<void>;
    deleteFolderOnDisk(path: string, movedItems: { item: SlagItem; oldFolder: string }[], vault?: VaultMeta, strict?: boolean): Promise<void>;
  };
  /** Remembers the list and hands its metadata to `state.json`. */
  persistFolders(folders: FolderMeta[], origin: 'local' | 'remote'): void;
  emitChange(event: StorageChangeEvent): void;
  persistNoteIntents(changes: NoteMutation[]): Promise<void> | undefined;
  queueNoteFileWrite(write: () => Promise<void>, before?: Promise<void>): Promise<void>;
  getItems(folder?: string): SlagItem[];
  cacheItems(key: string, items: SlagItem[]): void;
  getItemsKey(): string;
  getAllComposerDrafts(): Record<string, ComposerDraft>;
  /** Drops one folder's composer draft; where drafts live is the drafts writer's business. */
  eraseDraft(folderPath: string, origin: 'local' | 'remote'): void;
}

/** What the sidebar draws before the disk has answered: memory, or the defaults of a fresh start. */
export function readFolders(store: FolderStoreHost): FolderMeta[] {
  const folders = foldersInMemory.get(store.currentVault.id) ?? DEFAULT_FOLDERS;
  return sortFolders(folders, DEFAULT_INBOX_FOLDER).map(folder => ({ ...folder }));
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
  // A list that has been re-ordered once keeps new folders at the end instead of among the ranked
  // ones. A list nobody dragged has no ranks at all, and inventing one would re-sort the sidebar.
  const ranked = folders.filter((f): f is FolderMeta & { order: number } => typeof f.order === 'number');
  const order = folder.order ?? (ranked.length > 0 ? Math.max(...ranked.map(f => f.order)) + 1 : undefined);
  const saved: FolderMeta = order === undefined ? folder : { ...folder, order };
  folders.push(saved);
  store.persistFolders(folders, origin);
  fsLog.info(`Saved folder "${folder.name}" (${folder.path})`);
  store.emitChange({ kind: 'folder', action: 'upsert', id: folder.path, payload: saved, origin });
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
  const previousItems = store.getItems();
  const items = previousItems.map(it => {
    if (it.folder === oldPath) {
      return { ...it, folder: updatedFolder.path, updatedAt: Date.now() };
    }
    if (it.folder.startsWith(oldPath + '/')) {
      const subFolder = updatedFolder.path + it.folder.slice(oldPath.length);
      return { ...it, folder: subFolder, updatedAt: Date.now() };
    }
    return it;
  });
  const before = origin === 'local' ? store.persistNoteIntents(items
    .flatMap((item, index): NoteMutation[] => item === previousItems[index] ? [] : [{ id: item.id, kind: 'update', item, previous: previousItems[index] }])) : undefined;
  const vault = store.currentVault;
  store.cacheItems(store.getItemsKey(), items);

  fsLog.info(`Renamed folder "${oldPath}" to "${updatedFolder.path}"`);
  if (isTauri()) {
    void store.queueNoteFileWrite(() => store.files.renameFolderOnDisk(oldPath, updatedFolder.path, items, vault, !!before), before);
  }
  store.emitChange({ kind: 'folder', action: 'rename', id: updatedFolder.path, payload: updatedFolder, oldPath, origin });
}

/**
 * Writes the manual order back: `orderedPaths` is the tree read top to bottom, and every folder on
 * it takes that position. Only folders whose number actually moved are announced, so a drag that
 * changes nothing does not push the whole list to the relay.
 */
function applyFolderOrder(store: FolderStoreHost, orderedPaths: string[]): void {
  const rank = new Map(orderedPaths.map((path, index) => [path, index]));
  const changed: FolderMeta[] = [];
  const folders = readFolders(store).map(folder => {
    const order = rank.get(folder.path);
    if (order === undefined || folder.order === order) return folder;
    const updated: FolderMeta = { ...folder, order };
    changed.push(updated);
    return updated;
  });
  if (changed.length === 0) return;
  store.persistFolders(folders, 'local');
  for (const folder of changed) {
    store.emitChange({ kind: 'folder', action: 'upsert', id: folder.path, payload: folder, origin: 'local' });
  }
}

export interface FolderMoveResult {
  ok: boolean;
  /** Why the drop was refused, so the caller can say it in the user's words. */
  reason?: 'missing' | 'cycle' | 'exists';
  /** Where the folder ended up; a same-level move keeps its path. */
  path?: string;
}

/**
 * One drag, one write: the folder lands on `targetPath` as its child (`into`), next to it
 * (`before` / `after`) or at the end of the root (`root-end`). A move to another parent is a real
 * rename — it takes the subtree and the notes with it and touches the disk — while a move within
 * one level only re-numbers the metadata.
 */
export function moveFolderTree(
  store: FolderStoreHost,
  movedPath: string,
  targetPath: string,
  mode: FolderDropMode
): FolderMoveResult {
  if (!movedPath || movedPath === DEFAULT_INBOX_FOLDER) return { ok: false, reason: 'missing' };
  if (!targetPath && mode !== 'root-end') return { ok: false, reason: 'missing' };

  const folders = readFolders(store);
  const moved = folders.find(folder => folder.path === movedPath);
  if (!moved) return { ok: false, reason: 'missing' };
  if (targetPath && isSelfOrDescendant(movedPath, targetPath)) return { ok: false, reason: 'cycle' };

  const nextParent = mode === 'into' ? targetPath : mode === 'before' || mode === 'after' ? parentPathOf(targetPath) : '';
  const nextPath = folderPathUnder(nextParent, folderName(moved.path));
  if (nextPath !== movedPath && !isFolderPathFree(folders, nextPath, movedPath)) {
    return { ok: false, reason: 'exists' };
  }

  // The order is computed on the paths the tree will have after the move, so one call decides both
  // the new parent and the row it lands on.
  const renamed = (path: string) =>
    path === movedPath || path.startsWith(`${movedPath}/`) ? nextPath + path.slice(movedPath.length) : path;
  const reordered = folders
    .filter(folder => folder.path !== DEFAULT_INBOX_FOLDER)
    .map(folder => {
      const path = renamed(folder.path);
      return path === folder.path ? folder : { ...folder, path, name: folderName(path) };
    });
  const order = moveFolderPaths(reordered, nextPath, targetPath, mode);
  if (!order) return { ok: false, reason: 'missing' };

  // The rank travels inside the rename: a separate upsert for the same folder would replace the
  // rename in the outbox (one queue slot per entity) and the move would never reach the relay.
  const rank = order.indexOf(nextPath);

  if (nextPath !== movedPath) {
    const movedFolder: FolderMeta = { ...moved, path: nextPath, name: folderName(nextPath) };
    if (rank >= 0) movedFolder.order = rank;
    renameFolderTree(store, movedPath, movedFolder, 'local');
  }
  applyFolderOrder(store, order);
  return { ok: true, path: nextPath };
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
  const before = origin === 'local' ? store.persistNoteIntents(movedItems.map(({ item, oldFolder }) => ({
    id: item.id, kind: 'update', item, previous: { ...item, folder: oldFolder },
  }))) : undefined;
  const vault = store.currentVault;
  store.cacheItems(store.getItemsKey(), updatedItems);

  // Clean up drafts for deleted folder and any subfolders
  for (const draftFolder of Object.keys(store.getAllComposerDrafts())) {
    if (draftFolder === path || draftFolder.startsWith(path + '/')) {
      store.eraseDraft(draftFolder, origin);
    }
  }

  if (isTauri()) {
    void store.queueNoteFileWrite(() => store.files.deleteFolderOnDisk(path, movedItems, vault, !!before), before);
  }

  fsLog.info(`Deleted folder "${path}", items re-routed to Inbox`);
  store.emitChange({ kind: 'folder', action: 'delete', id: path, origin });
}
