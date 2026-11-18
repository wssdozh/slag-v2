// Keeps deleted notes in a per-vault trash, so restore happens before sync. The list is a snapshot
// of `.trash/`, rebuilt by the start-up scan; the host owns where that snapshot is kept.
import type { SlagItem, VaultMeta } from '../../types';
import { STORAGE_KEYS } from '../../config';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import type { AttachmentStore } from './attachments';
import type { StorageChangeEvent } from '.';

const fsLog = logger.scope('FS');

const TRASH_STORAGE_PREFIX = STORAGE_KEYS.TRASH_PREFIX;

export interface TrashStoreHost {
  currentVault: VaultMeta;
  attachments: AttachmentStore;
  files: {
    removeItemFromDisk(item: SlagItem): Promise<void>;
    restoreItemOnDisk(item: SlagItem): Promise<void>;
  };
  getItems(): SlagItem[];
  saveItem(item: SlagItem, origin?: 'local' | 'remote'): SlagItem;
  cacheItems(key: string, items: SlagItem[]): void;
  getItemsKey(): string;
  /** The snapshot of `.trash/` as the host keeps it: memory, and the web build's localStorage. */
  readTrashIndex(): SlagItem[];
  cacheTrash(items: SlagItem[]): void;
  emitChange(event: StorageChangeEvent): void;
}

export function trashStorageKey(store: TrashStoreHost): string {
  return `${TRASH_STORAGE_PREFIX}${store.currentVault.id}`;
}

/** What `.trash/` holds: a snapshot the disk scan fills on start and every delete or restore edits. */
export function readTrash(store: TrashStoreHost): SlagItem[] {
  return store.attachments.hydrate(store.readTrashIndex()).map(item => ({ ...item }));
}

export function trashItem(store: TrashStoreHost, id: string, origin: 'local' | 'remote' = 'local'): void {
  const items = store.getItems();
  const item = items.find(i => i.id === id);
  if (!item) return;

  // Remove from active items
  const remaining = items.filter(i => i.id !== id);
  store.cacheItems(store.getItemsKey(), remaining);

  // Save to .trash
  const trash = readTrash(store);
  trash.unshift({ ...item, updatedAt: Date.now() });
  store.cacheTrash(trash);
  fsLog.info(`Moved "${item.title || item.id}" to .trash`);

  if (isTauri()) {
    void store.files.removeItemFromDisk(item);
  }
  store.emitChange({ kind: 'item', action: 'delete', id, payload: item, origin });
}

export function recoverFromTrash(store: TrashStoreHost, id: string, origin: 'local' | 'remote' = 'local'): SlagItem | null {
  const trash = readTrash(store);
  const item = trash.find(i => i.id === id);
  if (!item) return null;

  // Remove from trash
  store.cacheTrash(trash.filter(i => i.id !== id));

  // Restore to active items
  store.saveItem(item, origin);
  fsLog.info(`Restored "${item.title || item.id}" from .trash to "${item.folder}"`);

  if (isTauri()) {
    void store.files.restoreItemOnDisk(item);
  }
  store.emitChange({ kind: 'trash', action: 'restore', id: item.id, payload: item, origin });
  return item;
}
