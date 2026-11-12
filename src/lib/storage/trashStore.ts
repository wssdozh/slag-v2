import type { SlagItem, VaultMeta } from '../../types';
import { STORAGE_KEYS } from '../../config';
import { logger } from '../logger';
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
  emitChange(event: StorageChangeEvent): void;
}

export function trashStorageKey(store: TrashStoreHost): string {
  return `${TRASH_STORAGE_PREFIX}${store.currentVault.id}`;
}

export function readTrash(store: TrashStoreHost): SlagItem[] {
  const raw = localStorage.getItem(trashStorageKey(store));
  if (!raw) return [];
  try {
    return store.attachments.hydrate(JSON.parse(raw));
  } catch {
    return [];
  }
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
  store.cacheItems(trashStorageKey(store), trash);
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
  const remainingTrash = trash.filter(i => i.id !== id);
  store.cacheItems(trashStorageKey(store), remainingTrash);

  // Restore to active items
  store.saveItem(item, origin);
  fsLog.info(`Restored "${item.title || item.id}" from .trash to "${item.folder}"`);

  if (isTauri()) {
    void store.files.restoreItemOnDisk(item);
  }
  store.emitChange({ kind: 'trash', action: 'restore', id: item.id, payload: item, origin });
  return item;
}
