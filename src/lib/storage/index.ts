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
  writeTextFile,
  mkdir,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

import { stripAttachmentData } from './attachmentData';
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
  readFolders,
  writeFolder,
  renameFolderTree,
  describeFolder,
  eraseFolder,
  folderStorageKey,
} from './folderStore';
import {
  trashStorageKey,
  readTrash,
  trashItem,
  recoverFromTrash,
} from './trashStore';
import {
  draftsStorageKey,
  workspaceStateStorageKey,
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
  readFolderViewSettings,
  writeFolderViewSettings,
} from './settingsStore';
import {
  buildVaultExportJson,
  importVaultPayload,
  parseVaultBackup,
  type VaultImportIo,
  type VaultImportPayload,
} from './vaultTransfer';
import {
  DEFAULT_INBOX_FOLDER,
  STORAGE_KEYS,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_FOLDERS,
} from '../../config';

export { DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_INBOX_FOLDER };

export type StorageChangeEvent =
  | { kind: 'item'; action: 'upsert' | 'delete'; id: string; payload?: SlagItem; origin?: 'local' | 'remote' }
  | { kind: 'folder'; action: 'upsert' | 'delete'; id: string; payload?: FolderMeta; origin?: 'local' | 'remote' }
  | { kind: 'folder'; action: 'rename'; id: string; payload: FolderMeta; oldPath: string; origin?: 'local' | 'remote' }
  | { kind: 'workspace'; action: 'upsert'; id: string; payload?: WorkspaceState; origin?: 'local' | 'remote' }
  | { kind: 'trash'; action: 'restore' | 'purge'; id: string; payload?: SlagItem; origin?: 'local' | 'remote' }
  | { kind: 'draft'; action: 'upsert' | 'delete'; id: string; payload?: ComposerDraft | FullscreenDraft; origin?: 'local' | 'remote' }
  // One event per memory write, not per fact: the sync packer reads the list from storage.
  | { kind: 'memory'; action: 'upsert'; id: string; payload?: undefined; origin?: 'local' | 'remote' };

export type StorageChangeListener = (event: StorageChangeEvent) => void;

const fsLog = logger.scope('FS');
/** Attachment bytes: which file was asked for, and where the answer came from. */

const ITEMS_STORAGE_PREFIX = STORAGE_KEYS.ITEMS_PREFIX;

export class StorageService {
  public currentVault: VaultMeta;
  private changeListeners: Set<StorageChangeListener> = new Set();
  public instanceId: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  private crossWindowDraftChannel: BroadcastChannel | null = null;
  public attachments = new AttachmentStore(() => this.getVaultAttachmentsPath());

  public files: VaultFiles = new VaultFiles({
    getVault: () => this.currentVault,
    getItems: (folder) => this.getItems(folder),
    getFolders: () => this.getFolders(),
    getTrashItems: () => this.getTrashItems(),
    getWorkspaceState: () => this.getWorkspaceState(),
    cacheItems: (key, items) => this.cacheItems(key, items),
    getItemsKey: () => this.getItemsKey(),
    getFoldersKey: () => this.getFoldersKey(),
    getTrashKey: () => trashStorageKey(this),
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

  public async importSyncedAttachment(attachment: SlagAttachment, dataUrl: string): Promise<void> {
    return this.attachments.importSynced(attachment, dataUrl);
  }

  public saveAttachment(attachment: SlagAttachment): Promise<void> {
    return this.attachments.save(attachment);
  }

  /** Resolves when the attachment bytes queued so far have reached IndexedDB. */
  public flushAttachments(): Promise<void> {
    return this.attachments.flush();
  }

  /**
   * The note index, parsed once per stored value.
   *
   * One keystroke used to parse the same key three times: `saveItem` reads the whole list,
   * rewrites it, and the UI reads it straight back. The raw string is kept next to the parse,
   * so a write from another window or from the sync engine invalidates this copy the moment
   * the bytes differ — the cache can never outlive the value it mirrors.
   */
  private itemsIndexCache: { key: string; raw: string; items: SlagItem[] } | null = null;

  private readItemsIndex(key: string): SlagItem[] {
    const raw = localStorage.getItem(key) ?? '';
    const cached = this.itemsIndexCache;
    if (cached && cached.key === key && cached.raw === raw) return cached.items;
    let parsed: SlagItem[] = [];
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = [];
      }
    }
    this.itemsIndexCache = { key, raw, items: parsed };
    return parsed;
  }

  /**
   * The index is a cache, never the source of truth: a note that does not fit here still has to
   * reach the disk. So a quota miss is a warning, not an exception.
   */
  public cacheItems(key: string, items: SlagItem[]): void {
    try {
      const stored = stripAttachmentData(items);
      const raw = JSON.stringify(stored);
      localStorage.setItem(key, raw);
      if (key === this.getItemsKey()) this.itemsIndexCache = { key, raw, items: stored };
    } catch (err) {
      fsLog.warn('Storage index write failed, notes keep landing on disk', {
        key,
        itemCount: items.length,
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

  public migrateLegacyNotesToVaults(): Promise<void> {
    return this.files.migrateLegacyNotesToVaults();
  }

  public syncCurrentVaultFs(): Promise<boolean> {
    return this.files.syncCurrentVaultFs();
  }

  public initTauriFs(): Promise<boolean> {
    return this.files.initTauriFs();
  }

  constructor() {
    this.currentVault = initCurrentVault(this);
    this.initDefaultsIfNeeded();
    this.initCrossWindowDraftSync();
    installDraftFlushGuards(this);
    if (isTauri()) {
      void this.files.initTauriFs();
    }
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
    if (typeof BroadcastChannel !== 'undefined') {
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

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (event) => {
        if (event.key === this.getDraftsKey() && event.newValue !== null) {
          try {
            const all = JSON.parse(event.newValue);
            for (const [folderPath, draft] of Object.entries(all)) {
              this.emitChange({
                kind: 'draft',
                action: 'upsert',
                id: `composer:${folderPath}`,
                payload: draft as ComposerDraft,
                origin: 'remote',
              });
            }
          } catch {}
        }
      });
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
    return deleteVault(this, vaultId);
  }

  public async pickDirectory(): Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null> {
    return pickVaultDirectory();
  }

  public getItemsKey(): string {
    return `${ITEMS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  private getFoldersKey(): string {
    return folderStorageKey(this);
  }

  public getDraftsKey(): string {
    return draftsStorageKey(this);
  }

  public initDefaultsIfNeeded(): void {
    const foldersKey = this.getFoldersKey();
    if (!localStorage.getItem(foldersKey)) {
      localStorage.setItem(foldersKey, JSON.stringify(DEFAULT_FOLDERS));
    }

    const itemsKey = this.getItemsKey();
    if (!localStorage.getItem(itemsKey)) {
      const initialItems = this.currentVault.id === 'default_vault' ? generateDemoItems() : [];
      this.cacheItems(itemsKey, initialItems);
    }
  }

  // Folders API
  public getFolders(): FolderMeta[] {
    return readFolders(this);
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
      void this.files.flushItemToDisk(updatedItem, oldItem?.folder, oldFilename);
    }

    this.emitChange({ kind: 'item', action: 'upsert', id: updatedItem.id, payload: updatedItem, origin });
    return updatedItem;
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

  public getTrashItems(): SlagItem[] {
    return readTrash(this);
  }

  public moveToTrash(id: string, origin: 'local' | 'remote' = 'local'): void {
    trashItem(this, id, origin);
  }

  public restoreFromTrash(id: string, origin: 'local' | 'remote' = 'local'): SlagItem | null {
    return recoverFromTrash(this, id, origin);
  }

  public deleteItem(id: string, origin: 'local' | 'remote' = 'local'): void {
    this.moveToTrash(id, origin);
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
    writeComposerDraft(this, folderPath, draft, origin);
  }

  public deleteComposerDraft(folderPath: string, origin: 'local' | 'remote' = 'local'): void {
    eraseComposerDraft(this, folderPath, origin);
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

  public getFolderViewSettings(folderPath: string): FolderViewSettings {
    return readFolderViewSettings(this, folderPath);
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
    workspaceState?: WorkspaceState;
  }): Promise<void> {
    const vault = this.currentVault;
    const previous = this.getItems();
    const previousItems = JSON.stringify(previous);
    const previousFolders = JSON.stringify(this.getFolders());
    const previousWorkspace = JSON.stringify(this.getWorkspaceState());
    const folders = data.folders ?? this.getFolders();
    const workspace = { ...this.getWorkspaceState(), ...data.workspaceState };
    for (const folder of folders) {
      safeVaultRelativePath(folder.path);
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
        for (const item of previous) {
          if (!nextIds.has(item.id) && !nextPaths.has(notePath(item))) await this.files.removeItemFromDisk(item, vault, true);
        }
      }
      const notesPath = this.files.getVaultNotesPath(vault);
      await mkdir(notesPath, { baseDir: BaseDirectory.AppData, recursive: true });
      for (const folder of folders) {
        await mkdir(`${notesPath}/${folder.path}`, { baseDir: BaseDirectory.AppData, recursive: true });
      }
      if (data.folders) {
        const nextFolderPaths = new Set(folders.map(f => f.path));
        try {
          const oldFoldersList: FolderMeta[] = JSON.parse(previousFolders);
          for (const oldF of oldFoldersList) {
            if (!nextFolderPaths.has(oldF.path) && oldF.path !== DEFAULT_INBOX_FOLDER) {
              await this.files.removeFolderFromDisk(oldF.path);
            }
          }
        } catch {
          // ignore parsing error
        }
      }
      await writeTextFile(this.files.getVaultStatePath(vault), JSON.stringify({ folders, workspace, updatedAt: Date.now() }), { baseDir: BaseDirectory.AppData });
    }
    if (this.currentVault.id !== vault.id) throw new Error('Vault changed while persisting sync');
    if (JSON.stringify(this.getItems()) !== previousItems || JSON.stringify(this.getFolders()) !== previousFolders || JSON.stringify(this.getWorkspaceState()) !== previousWorkspace) {
      // Re-persist the latest local state so an in-flight remote write cannot win on disk.
      const latest = this.getItems();
      const latestPaths = new Set(latest.map(item => `${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`));
      for (const item of data.items ?? []) {
        if (!latestPaths.has(`${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`)) await this.files.removeItemFromDisk(item, vault, true);
      }
      await this.importSyncedVaultData({ items: this.getItems(), folders: this.getFolders(), workspaceState: this.getWorkspaceState() });
      throw new Error('Local state changed while persisting sync; bundle remains pending');
    }
    if (!this.importVaultData({ items: data.items, folders: data.folders })) {
      throw new Error('Failed to store received vault data');
    }
    localStorage.setItem(workspaceStateStorageKey(this), JSON.stringify(workspace));
  }

  private transferIo(): VaultImportIo {
    return {
      foldersKey: () => this.getFoldersKey(),
      itemsKey: () => this.getItemsKey(),
      draftsKey: () => this.getDraftsKey(),
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
    return importVaultPayload(data, this.transferIo());
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
