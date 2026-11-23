// Keeps deleted notes in a per-vault trash, so restore happens before sync. The list is a snapshot
// of `.trash/`, rebuilt by the start-up scan; the host owns where that snapshot is kept.
import type { SlagItem, VaultMeta } from '../../types';
import { STORAGE_KEYS } from '../../config';
import { isTauri } from '@tauri-apps/api/core';
import type { AttachmentStore } from './attachments';
import type { StorageChangeEvent } from '.';
import type { NoteMutation } from './noteRegistry';

const TRASH_STORAGE_PREFIX = STORAGE_KEYS.TRASH_PREFIX;

export interface TrashStoreHost {
  currentVault: VaultMeta;
  attachments: AttachmentStore;
  files: {
    removeItemFromDisk(item: SlagItem, vault?: VaultMeta, strict?: boolean): Promise<void>;
    assertLocalWrite(vault: VaultMeta, id: string): Promise<void>;
  };
  getItems(): SlagItem[];
  saveItem(item: SlagItem, origin?: 'local' | 'remote', restoring?: boolean): SlagItem;
  whenNoteSaved(item: SlagItem): Promise<void>;
  persistNoteIntents(changes: NoteMutation[]): Promise<void> | undefined;
  queueNoteFileWrite(write: () => Promise<void>, before?: Promise<void>): Promise<void>;
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

export function trashItem(store: TrashStoreHost, id: string, origin: 'local' | 'remote' = 'local'): Promise<void> | undefined {
  const items = store.getItems();
  const item = items.find(i => i.id === id);
  if (!item) return;

  const vault = store.currentVault;
  const before = origin === 'local' ? store.persistNoteIntents([{ id, kind: 'delete', item: null, previous: item }]) : undefined;
  // Remove from active items
  const remaining = items.filter(i => i.id !== id);
  store.cacheItems(store.getItemsKey(), remaining);

  // Save to .trash
  const trash = readTrash(store);
  trash.unshift({ ...item, updatedAt: Date.now() });
  store.cacheTrash(trash);
  const event = { kind: 'item', action: 'delete', id, payload: item, origin } as const;
  if (!isTauri()) {
    store.emitChange(event);
    return;
  }
  store.emitChange({ ...event, pendingDisk: true });
  const committed = store.queueNoteFileWrite(async () => {
    await store.files.assertLocalWrite(vault, id);
    await store.files.removeItemFromDisk(item, vault, true);
  }, before);
  void committed.then(() => { if (store.currentVault === vault) store.emitChange(event); }, () => {
    if (store.currentVault !== vault || store.getItems().some((entry) => entry.id === id)) return;
    store.cacheTrash(readTrash(store).filter((entry) => entry.id !== id));
    store.cacheItems(store.getItemsKey(), [item, ...store.getItems()]);
    store.emitChange({ kind: 'item', action: 'upsert', id, payload: item, origin: 'external' });
  });
  return committed;
}

export function recoverFromTrash(store: TrashStoreHost, id: string, origin: 'local' | 'remote' = 'local'): SlagItem | null {
  const trash = readTrash(store);
  const item = trash.find(i => i.id === id);
  if (!item) return null;

  // Remove from trash
  store.cacheTrash(trash.filter(i => i.id !== id));

  // Restore to active items
  const vault = store.currentVault;
  const restored = store.saveItem(item, origin, true);
  const emit = () => store.emitChange({ kind: 'trash', action: 'restore', id: restored.id, payload: restored, origin });
  if (isTauri()) {
    void store.whenNoteSaved(restored).then(() => { if (store.currentVault === vault) emit(); }, () => {
      if (store.currentVault === vault && !store.getItems().some((entry) => entry.id === item.id)) store.cacheTrash([item, ...readTrash(store)]);
    });
  } else emit();
  return restored;
}
