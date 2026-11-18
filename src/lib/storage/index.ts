// The one door to the vault: notes, cache and change events, and delegation to disk, folders,
// trash, settings and attachments. Everything that touches the disk goes through here.
import type {
  SlagItem,
  FolderMeta,
  VaultMeta,
  SlagAttachment,
  ComposerDraft,
  FullscreenDraft,
  WorkspaceState,
  ChatMessage,
  MemoryItem,
  FolderViewSettings,
} from '../../types';
import { collectExistingTags, computeVaultStats, type VaultStats } from '../vault/stats';
export type { VaultStats } from '../vault/stats';
import { generateDemoItems } from '../vault/demoVault';
import { getSafeNoteFilename, withIdSuffix } from '../vault/noteFilename';
import { safeVaultRelativePath } from '../vault/safePath';
export { getSafeNoteFilename } from '../vault/noteFilename';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import {
  mkdir,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

import { stripAttachmentData } from './attachmentData';
import { hasNewerVersionOnDisk } from './writeGuard';
import { AttachmentStore } from './attachments';
import { VaultFiles } from './vaultFiles';
import {
  initCurrentVault,
  getVaults,
  ensureVaultSyncId,
  switchVault,
  createVault,
  deleteVault,
  pickVaultDirectory,
} from './vaultRegistry';
import {
  forgetVaultFolders,
  readFolders,
  rememberFolders,
  writeFolder,
  renameFolderTree,
  describeFolder,
  eraseFolder,
} from './folderStore';
import { folderMetaFor } from './folderSource';
import {
  trashStorageKey,
  readTrash,
  trashItem,
  recoverFromTrash,
} from './trashStore';
import {
  readComposerDrafts,
  readComposerDraft,
  writeComposerDraft,
  eraseComposerDraft,
  flushDraftWrites,
  installDraftFlushGuards,
  readFullscreenDraft,
  writeFullscreenDraft,
  eraseFullscreenDraft,
  readFullscreenWidth,
  writeFullscreenWidth,
  readAssistantHistory,
  writeAssistantHistory,
  eraseAssistantHistory,
  readMemory,
  writeMemory,
  readWorkspaceState,
  writeWorkspaceState,
  writeFolderViewSettings,
} from './settingsStore';
import {
  buildVaultExportJson,
  importVaultPayload,
  parseVaultBackup,
  type VaultImportIo,
  type VaultImportPayload,
} from './vaultTransfer';
import { notesRemovedByImport } from './noteRemoval';
import { reconcileSyncedVault } from './syncReconcile';
import {
  DEFAULT_INBOX_FOLDER,
  STORAGE_KEYS,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_FOLDERS,
} from '../../config';

export { DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_INBOX_FOLDER };

/**
 * Who wrote the change. `local` is the app's own edit and the only value the sync engine packs
 * into an operation; `remote` is an incoming bundle; `external` is a file that changed on disk
 * under us — the MCP server, an outside editor — and is never re-pushed, or the relay would echo
 * the same note back and the two devices would ping-pong it forever.
 */
export type StorageOrigin = 'local' | 'remote' | 'external';

export type StorageChangeEvent =
  | { kind: 'item'; action: 'upsert' | 'delete' | 'conflict'; id: string; payload?: SlagItem; origin?: StorageOrigin }
  | { kind: 'folder'; action: 'upsert' | 'delete'; id: string; payload?: FolderMeta; origin?: StorageOrigin }
  | { kind: 'folder'; action: 'rename'; id: string; payload: FolderMeta; oldPath: string; origin?: StorageOrigin }
  | { kind: 'workspace'; action: 'upsert'; id: string; payload?: WorkspaceState; origin?: StorageOrigin }
  | { kind: 'trash'; action: 'restore' | 'purge'; id: string; payload?: SlagItem; origin?: StorageOrigin }
  | { kind: 'draft'; action: 'upsert' | 'delete'; id: string; payload?: ComposerDraft | FullscreenDraft; origin?: StorageOrigin }
  // One event per memory write, not per fact: the sync packer reads the list from storage.
  | { kind: 'memory'; action: 'upsert'; id: string; payload?: undefined; origin?: StorageOrigin };

export type StorageChangeListener = (event: StorageChangeEvent) => void;

/** What a sweep of `notes/` reports: note paths that changed or went, folders that came or left. */
export interface VaultDiskChange {
  changed: string[];
  removed: string[];
  foldersAdded?: string[];
  foldersRemoved?: string[];
}

const fsLog = logger.scope('FS');
/** Attachment bytes: which file was asked for, and where the answer came from. */

const ITEMS_STORAGE_PREFIX = STORAGE_KEYS.ITEMS_PREFIX;

export class StorageService {
  public currentVault: VaultMeta;
  private changeListeners: Set<StorageChangeListener> = new Set();
  /** Set once the disk scan settles; see `isHydrated()`. */
  private hydrated = false;
  public instanceId: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  private crossWindowDraftChannel: BroadcastChannel | null = null;
  public attachments = new AttachmentStore(() => this.getVaultAttachmentsPath());

  public files: VaultFiles = new VaultFiles({
    getVault: () => this.currentVault,
    getItems: (folder) => this.getItems(folder),
    getWorkspaceState: () => this.getWorkspaceState(),
    cacheItems: (key, items) => this.cacheItems(key, items),
    getItemsKey: () => this.getItemsKey(),
    getTrashKey: () => this.getTrashKey(),
    persistFolders: (folders, origin) => this.persistFolders(folders, origin),
    attachments: this.attachments,
  });

  public getVaultAttachmentsPath(vault: VaultMeta = this.currentVault): string {
    return `${this.files.getVaultDir(vault)}/.attachments`;
  }

  public async getAttachmentUrl(id: string, relativePath: string, mimeType?: string): Promise<string | undefined> {
    return this.attachments.getUrl(id, relativePath, mimeType);
  }

  public async getAttachmentDataUrl(att: SlagAttachment): Promise<string | undefined> {
    return this.attachments.getDataUrl(att);
  }

  public async importSyncedAttachment(attachment: SlagAttachment, dataUrl: string): Promise<boolean> {
    return this.attachments.importSynced(attachment, dataUrl);
  }

  public async hasAttachmentBytes(id: string, relativePath: string): Promise<boolean> {
    return this.attachments.hasBytes(id, relativePath);
  }

  public saveAttachment(attachment: SlagAttachment): Promise<void> {
    return this.attachments.save(attachment);
  }

  /**
   * The note index, in memory and nowhere else on native. It is rebuilt by the disk scan on start
   * — the directories are the source of truth — and every write updates it here, per vault, so
   * switching back to a vault this session already visited does not wait for another scan.
   *
   * A browser build has no disk at all: there `localStorage` *is* its storage, so the index is
   * mirrored into it and read back after a reload. A native build never takes either of those
   * branches — `isTauri()` is false exactly where the webview profile is the only vault.
   */
  private itemsIndex: Map<string, SlagItem[]> = new Map();

  private readItemsIndex(key: string): SlagItem[] {
    const cached = this.itemsIndex.get(key);
    if (cached) return cached;
    if (!isTauri()) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.itemsIndex.set(key, parsed as SlagItem[]);
            return parsed as SlagItem[];
          }
        } catch {
          // A half-written value is no index: the browser build starts from an empty vault.
        }
      }
    }
    return [];
  }

  /**
   * The index is a cache of what the disk says, never a second source of truth. The bytes of an
   * attachment stay in `.attachments/` and IndexedDB; the index keeps their metadata, as it did
   * when it had a quota to respect.
   */
  public cacheItems(key: string, items: SlagItem[]): void {
    const stored = stripAttachmentData(items);
    this.itemsIndex.set(key, stored);
    if (isTauri()) return;
    // Browser build without a disk: localStorage is its storage, not a cache. Native keeps the
    // index in memory only — a wiped webview profile there loses nothing the scan cannot rebuild.
    try {
      localStorage.setItem(key, JSON.stringify(stored));
    } catch (err) {
      fsLog.warn('Browser storage refused the index write; it stays in memory', {
        key,
        itemCount: stored.length,
        error: err,
      });
    }
  }

  public subscribeChanges(listener: StorageChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public emitChange(event: StorageChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (err) {
        fsLog.error('Error in storage change listener:', err);
      }
    }
  }

public getVaultDir(vault: VaultMeta = this.currentVault): string {
    return this.files.getVaultDir(vault);
  }

  public getVaultNotesPath(vault: VaultMeta = this.currentVault): string {
    return this.files.getVaultNotesPath(vault);
  }

  public getVaultStatePath(vault: VaultMeta = this.currentVault): string {
    return this.files.getVaultStatePath(vault);
  }

  public getNoteAbsolutePath(item: SlagItem): Promise<string> {
    return this.files.getNoteAbsolutePath(item);
  }

  public getFolderAbsolutePath(folderPath: string): Promise<string> {
    return this.files.getFolderAbsolutePath(folderPath);
  }

  public syncCurrentVaultFs(): Promise<boolean> {
    return this.files.syncCurrentVaultFs();
  }

  public initTauriFs(): Promise<boolean> {
    return this.files.initTauriFs().finally(() => {
      this.hydrated = true;
    });
  }

  /**
   * Whether the disk has been read: the notes and the trash are in the index, so "not loaded yet"
   * and "empty" are finally two different answers.
   *
   * It flips when the scan settles, not when it succeeds. A vault whose files could not be read is
   * still a vault someone has to be able to open, and a push it makes says nothing about deletions
   * either way — that is the point of the flag, not a promise the scan worked.
   */
  public isHydrated(): boolean {
    return this.hydrated;
  }

  constructor() {
    this.currentVault = initCurrentVault(this);
    this.seedBrowserVault();
    this.initCrossWindowDraftSync();
    installDraftFlushGuards(this);
    if (isTauri()) {
      void this.files.initTauriFs().finally(() => {
        this.hydrated = true;
      });
    } else {
      // No disk to wait for: a browser build's index is whatever the store already holds.
      this.hydrated = true;
    }
  }

  /**
   * A browser build has no disk to scan, so a first load would draw an empty vault: the demo notes
   * are its starting point, exactly what the "generate demo" button makes. Native never seeds —
   * its index comes from `scanNotesDir`, and an empty installation is an empty vault by design.
   * An existing key wins, even an empty list: a spec or an import already decided the contents.
   */
  private seedBrowserVault(): void {
    if (isTauri()) return;
    const itemsKey = this.getItemsKey();
    if (this.itemsIndex.has(itemsKey) || localStorage.getItem(itemsKey) !== null) return;
    this.cacheItems(itemsKey, this.currentVault.id === 'default_vault' ? generateDemoItems() : []);
  }

  /**
   * Every queued draft write lands now. Draft writes are throttled, so a close, a blur, a
   * hidden tab or an unmount has to say "this text is about to leave the screen" explicitly.
   */
  public flushDrafts(): void {
    flushDraftWrites(this);
  }

  public getDraftChannel(): BroadcastChannel | null {
    return this.crossWindowDraftChannel;
  }

  private initCrossWindowDraftSync(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.crossWindowDraftChannel = new BroadcastChannel('slag_cross_window_drafts_v1');
      this.crossWindowDraftChannel.onmessage = (event) => {
        const data = event.data;
        if (data && data.senderId !== this.instanceId && data.type === 'DRAFT_CHANGED') {
          this.emitChange({
            kind: 'draft',
            action: data.action,
            id: `composer:${data.folderPath}`,
            payload: data.draft,
            origin: 'remote',
          });
        }
      };
    } catch {
      this.crossWindowDraftChannel = null;
    }
  }

  public getCurrentVault(): VaultMeta {
    return this.currentVault;
  }

  public getVaults(): VaultMeta[] {
    return getVaults(this);
  }

  public ensureVaultSyncId(vaultId: string): string {
    return ensureVaultSyncId(this, vaultId);
  }

  public switchVault(vaultId: string): VaultMeta {
    return switchVault(this, vaultId);
  }

  public createVault(
    name: string,
    mode?: 'indexeddb' | 'fsa' | 'tauri',
    path?: string,
    id?: string
  ): VaultMeta {
    return createVault(this, name, mode, path, id);
  }

  public seedDemoData(): SlagItem[] {
    const demoItems = generateDemoItems();
    const existing = this.getItems();
    const updated = [...existing, ...demoItems];
    this.cacheItems(this.getItemsKey(), updated);
    if (isTauri()) {
      for (const item of demoItems) {
        void this.files.flushItemToDisk(item);
      }
    }
    fsLog.info(`Seeded ${demoItems.length} demo items into vault "${this.currentVault.name}"`);
    return updated;
  }

  public deleteVault(vaultId: string): boolean {
    const deleted = deleteVault(this, vaultId);
    if (deleted) {
      // The vault is gone from the registry and the disk; what this session still remembered of
      // it must not become the content of a new vault that later reuses the id.
      forgetVaultFolders(vaultId);
      this.itemsIndex.delete(`${ITEMS_STORAGE_PREFIX}${vaultId}`);
      this.itemsIndex.delete(`${STORAGE_KEYS.TRASH_PREFIX}${vaultId}`);
    }
    return deleted;
  }

  public async pickDirectory(): Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null> {
    return pickVaultDirectory();
  }

  public getItemsKey(): string {
    return `${ITEMS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  public getTrashKey(): string {
    return trashStorageKey(this);
  }

  // Folders API
  public getFolders(): FolderMeta[] {
    return readFolders(this);
  }

  /**
   * The one write path for the folder list. Memory is what the sidebar draws before the scan
   * answers; `state.json` takes the metadata by path, never a verdict on what exists. An
   * `external` change came from the disk itself, so there is nothing to tell the disk back.
   */
  public persistFolders(folders: FolderMeta[], origin: StorageOrigin): void {
    rememberFolders(this, folders);
    if (isTauri() && origin !== 'external') {
      void this.files.writeFolderMeta(folders).catch((err: unknown) => {
        fsLog.warn('Failed to write folder metadata to state.json', { error: String(err) });
      });
    }
  }

  public saveFolder(folder: FolderMeta, origin: 'local' | 'remote' = 'local'): void {
    writeFolder(this, folder, origin);
  }

  public renameFolder(oldPath: string, updatedFolder: FolderMeta, origin: 'local' | 'remote' = 'local'): void {
    renameFolderTree(this, oldPath, updatedFolder, origin);
  }

  public updateFolderDescription(path: string, description: string, origin: 'local' | 'remote' = 'local'): void {
    describeFolder(this, path, description, origin);
  }

  public deleteFolder(path: string, origin: 'local' | 'remote' = 'local'): void {
    eraseFolder(this, path, origin);
  }

  // Items API
  public getItems(folder?: string): SlagItem[] {
    // Copies, not the cached objects: callers trim, move and re-save items in place
    // (`moveItem` mutates `folder`), and that must not reach the shared parse.
    const list = this.attachments.hydrate(this.readItemsIndex(this.getItemsKey())).map(item => ({ ...item }));
    if (folder) {
      return list.filter(i => i.folder === folder);
    }
    return list;
  }

  public getItemById(id: string): SlagItem | undefined {
    return this.getItems().find(i => i.id === id);
  }

  public saveItem(item: SlagItem, origin: 'local' | 'remote' = 'local'): SlagItem {
    const items = this.getItems();
    const existingIndex = items.findIndex(i => i.id === item.id);
    const oldItem = existingIndex >= 0 ? items[existingIndex] : undefined;
    const filename = getSafeNoteFilename(item.title, item.id);
    const updatedItem: SlagItem = {
      ...item,
      filename,
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      items[existingIndex] = updatedItem;
      fsLog.info(`Updated [${updatedItem.type}] "${updatedItem.title || 'untitled'}" (${updatedItem.id}) in "${updatedItem.folder}"`);
    } else {
      items.unshift(updatedItem);
      fsLog.info(`Created [${updatedItem.type}] "${updatedItem.title || 'untitled'}" (${updatedItem.id}) in "${updatedItem.folder}"`);
    }

    this.attachments.persistNew([updatedItem]);
    this.cacheItems(this.getItemsKey(), items);

    if (isTauri()) {
      const oldFilename = oldItem?.filename || (oldItem ? getSafeNoteFilename(oldItem.title, oldItem.id) : undefined);
      // A local edit is the only one that can be stale: a remote bundle is applied state, and a
      // note without a file behind it has nothing to lose.
      if (origin === 'local' && oldItem && oldFilename) {
        void this.flushGuarded(updatedItem, oldItem, oldFilename);
      } else {
        void this.files.flushItemToDisk(updatedItem, oldItem?.folder, oldFilename);
      }
    }

    this.emitChange({ kind: 'item', action: 'upsert', id: updatedItem.id, payload: updatedItem, origin });
    return updatedItem;
  }

  /**
   * Writes a note back unless the file has moved on without us — the MCP server, an outside
   * editor, a sync that landed between the read and the save. The disk wins and the index is
   * told, so the person sees the truth instead of watching their edit vanish at the next reload.
   */
  private async flushGuarded(item: SlagItem, previous: SlagItem, previousFilename: string): Promise<void> {
    const seenAt = previous.updatedAt;
    const target = `${previous.folder || DEFAULT_INBOX_FOLDER}/${previousFilename}`;
    const onDisk = await this.files.readNoteIdentity(target);

    if (hasNewerVersionOnDisk(onDisk, { id: previous.id, updatedAt: seenAt })) {
      const { items: reloaded } = await this.files.reloadNotesFromDisk([target]);
      const diskItem = reloaded[0];
      if (diskItem) {
        const items = this.getItems();
        const index = items.findIndex(candidate => candidate.id === diskItem.id);
        if (index >= 0) items[index] = diskItem;
        else items.unshift(diskItem);
        this.cacheItems(this.getItemsKey(), items);
        this.emitChange({ kind: 'item', action: 'conflict', id: diskItem.id, payload: diskItem, origin: 'external' });
        fsLog.warn(`Refused to overwrite "${diskItem.title}" (${diskItem.id}): the file is newer on disk`);
        return;
      }
    }

    await this.files.flushItemToDisk(item, previous.folder, previousFilename);
  }

  public saveItems(itemsToSave: SlagItem[], origin: 'local' | 'remote' = 'local'): void {
    if (itemsToSave.length === 0) return;
    const items = this.getItems();
    const oldItemsMap = new Map(items.map(i => [i.id, i]));
    const saveMap = new Map(itemsToSave.map(i => {
      const filename = getSafeNoteFilename(i.title, i.id);
      return [i.id, { ...i, filename, updatedAt: Date.now() }];
    }));
    const updated = items.map(i => saveMap.get(i.id) || i);
    for (const [id, item] of saveMap) {
      if (!items.some(i => i.id === id)) {
        updated.unshift(item);
      }
    }
    this.attachments.persistNew([...saveMap.values()]);
    this.cacheItems(this.getItemsKey(), updated);

    if (isTauri()) {
      for (const it of saveMap.values()) {
        const old = oldItemsMap.get(it.id);
        const oldFilename = old?.filename || (old ? getSafeNoteFilename(old.title, old.id) : undefined);
        void this.files.flushItemToDisk(it, old?.folder, oldFilename);
      }
    }

    for (const it of saveMap.values()) {
      this.emitChange({ kind: 'item', action: 'upsert', id: it.id, payload: it, origin });
    }
  }

  /**
   * Picks up notes and folders that changed on disk behind the app's back: the MCP server wrote one,
   * someone edited a file in an outside editor, a script dropped a folder in. The sweep that noticed
   * hands over vault-relative paths; a note path that no longer reads back is a deletion.
   *
   * A rewrite that ends where it started is not a change: the app stamps its own save into the
   * index before the flush reaches the disk, and re-announcing that would fight the editor.
   */
  public async reloadFromDisk(change: VaultDiskChange): Promise<{ updated: number; removed: number }> {
    if (!isTauri()) return { updated: 0, removed: 0 };

    this.mergeDiskFolders(change.foldersAdded ?? [], change.foldersRemoved ?? []);

    const { items: parsed, missing } = await this.files.reloadNotesFromDisk(change.changed);
    const current = this.getItems();
    const byId = new Map(current.map(item => [item.id, item]));
    const events: StorageChangeEvent[] = [];

    for (const item of parsed) {
      const cached = byId.get(item.id);
      if (cached && cached.updatedAt === item.updatedAt && cached.content === item.content) continue;
      byId.set(item.id, item);
      events.push({ kind: 'item', action: 'upsert', id: item.id, payload: item, origin: 'external' });
    }

    let removed = 0;
    for (const relativePath of missing) {
      const normalized = relativePath.replace(/\\/g, '/');
      const gone = current.find(item => `${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename ?? ''}` === normalized);
      if (!gone) continue;
      byId.delete(gone.id);
      removed++;
      events.push({ kind: 'item', action: 'delete', id: gone.id, origin: 'external' });
    }

    if (events.length === 0) return { updated: 0, removed: 0 };
    this.cacheItems(this.getItemsKey(), [...byId.values()]);
    for (const event of events) this.emitChange(event);
    fsLog.info(`Picked up ${events.length - removed} changed and ${removed} removed notes from disk`);
    return { updated: events.length - removed, removed };
  }

  /**
   * A folder appeared or vanished under `notes/`. The list is rebuilt from the paths this sweep now
   * knows about, so the metadata of a directory that is gone goes with it. Every event is
   * `external`: the disk changed, not the person, and the relay must not hear its own echo.
   */
  private mergeDiskFolders(added: string[], removed: string[]): void {
    if (added.length === 0 && removed.length === 0) return;

    const current = this.getFolders();
    const gone = new Set(removed);
    const paths = current.map(folder => folder.path).filter(path => !gone.has(path));
    paths.push(...added);
    const folders = folderMetaFor(paths, current, DEFAULT_INBOX_FOLDER);
    this.persistFolders(folders, 'external');

    const before = new Set(current.map(folder => folder.path));
    const after = new Set(folders.map(folder => folder.path));
    for (const folder of folders) {
      if (before.has(folder.path)) continue;
      this.emitChange({ kind: 'folder', action: 'upsert', id: folder.path, payload: folder, origin: 'external' });
    }
    for (const folder of current) {
      if (after.has(folder.path)) continue;
      this.emitChange({ kind: 'folder', action: 'delete', id: folder.path, origin: 'external' });
    }
  }

  public getTrashItems(): SlagItem[] {
    return readTrash(this);
  }

  /** The trash list the scan and the writes keep: the same snapshot door as `.trash/` itself. */
  public readTrashIndex(): SlagItem[] {
    return this.readItemsIndex(this.getTrashKey());
  }

  public cacheTrash(items: SlagItem[]): void {
    this.cacheItems(this.getTrashKey(), items);
  }

  public moveToTrash(id: string, origin: 'local' | 'remote' = 'local'): void {
    trashItem(this, id, origin);
  }

  public restoreFromTrash(id: string, origin: 'local' | 'remote' = 'local'): SlagItem | null {
    return recoverFromTrash(this, id, origin);
  }

  public moveItem(id: string, targetFolder: string, origin: 'local' | 'remote' = 'local'): SlagItem | null {
    const item = this.getItemById(id);
    if (!item) return null;
    item.folder = targetFolder;
    item.updatedAt = Date.now();
    return this.saveItem(item, origin);
  }

  // Attachments

  // Tag taxonomy index
  public getAllExistingTags(): string[] {
    return collectExistingTags(this.getItems());
  }

  // Vault & Folder Statistics for AI RAG & Inspector
  public getVaultStats(folderScope?: string): VaultStats {
    return computeVaultStats(this.getItems(), folderScope);
  }

  public getAllComposerDrafts(): Record<string, ComposerDraft> {
    return readComposerDrafts(this);
  }

  public getComposerDraft(folderPath: string): ComposerDraft | null {
    return readComposerDraft(this, folderPath);
  }

  public saveComposerDraft(folderPath: string, draft: ComposerDraft, origin: 'local' | 'remote' = 'local'): void {
    // The stored draft keeps metadata only, so the bytes have to be in the store before that
    // strip — otherwise the draft is the last place a just-attached photo ever existed.
    this.attachments.persistDrafts(draft.attachments ?? []);
    writeComposerDraft(this, folderPath, draft, origin);
  }

  public deleteComposerDraft(folderPath: string, origin: 'local' | 'remote' = 'local'): void {
    eraseComposerDraft(this, folderPath, origin);
  }

  /** What a deleted folder takes with it: its drafts, and those of its subfolders. */
  public eraseDraft(folderPath: string, origin: 'local' | 'remote' = 'local'): void {
    this.deleteComposerDraft(folderPath, origin);
  }

  public getFullscreenDraft(itemId: string): FullscreenDraft | null {
    return readFullscreenDraft(this, itemId);
  }

  public saveFullscreenDraft(itemId: string, draft: FullscreenDraft, origin: 'local' | 'remote' = 'local'): void {
    writeFullscreenDraft(this, itemId, draft, origin);
  }

  public clearFullscreenDraft(itemId: string, origin: 'local' | 'remote' = 'local'): void {
    eraseFullscreenDraft(this, itemId, origin);
  }

  public getFullscreenWidth(): boolean {
    return readFullscreenWidth(this);
  }

  public saveFullscreenWidth(isFullWidth: boolean): void {
    writeFullscreenWidth(this, isFullWidth);
  }

  public getAssistantHistory(): ChatMessage[] {
    return readAssistantHistory(this);
  }

  public saveAssistantHistory(messages: ChatMessage[]): void {
    writeAssistantHistory(this, messages);
  }

  public clearAssistantHistory(): void {
    eraseAssistantHistory(this);
  }

  public getMemory(): MemoryItem[] {
    return readMemory(this);
  }

  /** Persists the list and wakes sync. Returns false when the quota refuses the write. */
  public saveMemory(items: MemoryItem[], origin: 'local' | 'remote' = 'local'): boolean {
    const saved = writeMemory(this, items);
    if (saved && origin === 'local') {
      this.emitChange({ kind: 'memory', action: 'upsert', id: 'memory', origin });
    }
    return saved;
  }

  public getWorkspaceState(): WorkspaceState {
    return readWorkspaceState(this);
  }

  public saveWorkspaceState(partialState: Partial<WorkspaceState>, origin: 'local' | 'remote' = 'local'): void {
    writeWorkspaceState(this, partialState, origin);
  }

  public saveFolderViewSettings(folderPath: string, settings: Partial<FolderViewSettings>): void {
    writeFolderViewSettings(this, folderPath, settings);
  }

  // Export current vault as Markdown files (ZIP or downloadable Blob)
  public exportVaultAsJson(): string {
    return buildVaultExportJson({
      vault: this.currentVault,
      folders: this.getFolders(),
      items: this.getItems(),
      assistantHistory: this.getAssistantHistory(),
      memory: this.getMemory(),
      workspaceState: this.getWorkspaceState(),
      composerDrafts: this.getAllComposerDrafts(),
    });
  }

  /** Persist received state before the relay can discard its only pending copy. */
  public async importSyncedVaultData(data: {
    items?: SlagItem[];
    folders?: FolderMeta[];
    removedIds?: string[];
    workspaceState?: WorkspaceState;
  }): Promise<void> {
    const vault = this.currentVault;
    const base = {
      items: this.getItems(),
      folders: this.getFolders(),
      workspace: this.getWorkspaceState(),
    };
    const previous = base.items;
    const folders = data.folders ?? base.folders;
    for (const folder of folders) {      safeVaultRelativePath(folder.path);
    }
    for (const item of data.items ?? []) {
      const filename = item.filename || getSafeNoteFilename(item.title, item.id);
      if (filename.includes('/')) throw new Error('Invalid synced note path');
      safeVaultRelativePath(item.folder || DEFAULT_INBOX_FOLDER);
      safeVaultRelativePath(filename);
      safeVaultRelativePath(item.id);
    }
    if (isTauri()) {
      if (data.items) {
        const usedPaths = new Map<string, string>();
        for (const item of data.items) {
          let filename = item.filename || getSafeNoteFilename(item.title, item.id);
          const folder = item.folder || DEFAULT_INBOX_FOLDER;
          let noteRelPath = `${this.files.getVaultNotesPath(vault)}/${folder}/${filename}`;
          if (usedPaths.has(noteRelPath) && usedPaths.get(noteRelPath) !== item.id) {
            filename = withIdSuffix(filename, item.id);
            item.filename = filename;
            noteRelPath = `${this.files.getVaultNotesPath(vault)}/${folder}/${filename}`;
          }
          usedPaths.set(noteRelPath, item.id);
        }
        const nextIds = new Set(data.items.map(item => item.id));
        const notePath = (item: SlagItem) => `${this.files.getVaultNotesPath(vault)}/${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`;
        const nextPaths = new Set(data.items.map(notePath));
        for (const item of data.items) {
          const old = previous.find(candidate => candidate.id === item.id);
          // Unchanged notes are already on disk; rewriting all 39 files per bundle was the sync stall.
          if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
          const oldFilename = old?.filename || (old ? getSafeNoteFilename(old.title, old.id) : undefined);
          await this.files.flushItemToDisk(item, old?.folder, oldFilename, vault, true, nextPaths);
        }
        // Only the ids the bundle deleted leave the disk. A note the payload does not list is one
        // the sender never mentioned, and that is not a deletion: reading it as one is what took
        // eighty-four files off this disk while the app was still loading its index.
        for (const item of notesRemovedByImport(previous, nextIds, data.removedIds ?? [])) {
          await this.files.removeItemFromDisk(item, vault, true);
        }
      }
      const notesPath = this.files.getVaultNotesPath(vault);
      await mkdir(notesPath, { baseDir: BaseDirectory.AppData, recursive: true });
      if (data.folders) {
        const nextFolderPaths = new Set(folders.map(f => f.path));
        for (const oldF of base.folders) {
          if (!nextFolderPaths.has(oldF.path) && oldF.path !== DEFAULT_INBOX_FOLDER) {
            await this.files.removeFolderFromDisk(oldF.path);
          }
        }
      }
      // A synced folder lands the way one made here does: a directory, then its metadata.
      this.persistFolders(folders, 'remote');
    }
    if (this.currentVault.id !== vault.id) throw new Error('Vault changed while persisting sync');

    // The bundle was merged from a snapshot, and the person may have saved something while it was
    // on its way to disk. Reconcile instead of failing: the newer copy wins either way, and a red
    // error used to leave the whole burst pending over one keystroke.
    const reconciled = reconcileSyncedVault({
      base,
      current: {
        items: this.getItems(),
        folders: this.getFolders(),
        workspace: this.getWorkspaceState(),
      },
      incoming: { items: data.items ?? base.items, folders, workspace: data.workspaceState },
    });
    if (isTauri() && reconciled.drifted) {
      const notePath = (item: SlagItem) => `${this.files.getVaultNotesPath(vault)}/${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`;
      const incomingPaths = new Set((data.items ?? []).map(notePath));
      const incomingById = new Map((data.items ?? []).map(item => [item.id, item]));
      // The pass above wrote the remote copy of every changed note. Any note the screen won has
      // to go back on disk, or the next start reads the older version back.
      for (const item of reconciled.localWins) {
        const staged = incomingById.get(item.id);
        await this.files.flushItemToDisk(item, staged?.folder, staged?.filename, vault, true, incomingPaths);
      }
      for (const item of reconciled.dropped) {
        await this.files.removeItemFromDisk(item, vault, true);
      }
      fsLog.info('Reconciled sync import with local changes made during the write', {
        localWins: reconciled.localWins.length,
        dropped: reconciled.dropped.length,
      });
    }
    if (!this.importVaultData({
      // Only what the bundle carried: a workspace-only bundle has no business rewriting the notes.
      items: data.items ? reconciled.items : undefined,
      folders: data.folders ? reconciled.folders : undefined,
    })) {
      throw new Error('Failed to store received vault data');
    }
    if (JSON.stringify(reconciled.workspace) !== JSON.stringify(this.getWorkspaceState())) {
      // Origin `remote`: the change is already persisted state, not something to push back.
      this.saveWorkspaceState(reconciled.workspace, 'remote');
    }
  }

  private transferIo(): VaultImportIo {
    return {
      itemsKey: () => this.getItemsKey(),
      cacheItems: (key, items) => this.cacheItems(key, items),
      saveAssistantHistory: (messages) => this.saveAssistantHistory(messages),
      saveMemory: (items) => {
        this.saveMemory(items, 'remote');
      },
      saveWorkspaceState: (state, origin) => this.saveWorkspaceState(state, origin),
    };
  }

  public importVaultData(data: VaultImportPayload): boolean {
    try {
      for (const folder of data.folders ?? []) {
        safeVaultRelativePath(folder.path);
      }
      for (const item of data.items ?? []) {
        const filename = typeof item.filename === 'string' && item.filename
          ? item.filename
          : getSafeNoteFilename(typeof item.title === 'string' ? item.title : '', String(item.id || 'untitled'));
        if (filename.includes('/')) throw new Error('Invalid note filename');
        safeVaultRelativePath(item.folder || DEFAULT_INBOX_FOLDER);
        safeVaultRelativePath(filename);
        safeVaultRelativePath(item.id);
      }
    } catch (err) {
      fsLog.warn('Rejected vault import with unsafe path', err);
      return false;
    }
    // An imported folder list lands the way a made one does: in memory, and in `state.json`'s
    // metadata. The rest of the payload keeps its own door.
    const { folders, ...rest } = data;
    if (Array.isArray(folders) && folders.length > 0) this.persistFolders(folders, 'remote');
    return importVaultPayload(rest, this.transferIo());
  }

  public importVaultFromJson(jsonString: string): boolean {
    const payload = parseVaultBackup(jsonString);
    return payload ? this.importVaultData(payload) : false;
  }
}

export const storage = new StorageService();

if (typeof window !== 'undefined') {
  (window as any).storage = storage;
}
