import { DraftStore } from './draftStore';
import type {
  SlagItem,
  FolderMeta,
  VaultMeta,
  SlagAttachment,
  ComposerDraft,
  FullscreenDraft,
  WorkspaceState,
  ChatMessage,
  FolderViewSettings,
} from '../../types';
import { serializeItemToMarkdown, parseMarkdownToItem } from '../vault/markdownSerializer';
import { generateDemoItems } from '../vault/demoVault';
import { getSafeNoteFilename } from '../vault/noteFilename';
export { getSafeNoteFilename } from '../vault/noteFilename';
import { logger } from '../logger';
import { isTauri } from '@tauri-apps/api/core';
import {
  writeTextFile,
  readTextFile,
  readDir,
  mkdir,
  remove,
  exists,
  BaseDirectory,
  readFile,
  writeFile,
} from '@tauri-apps/plugin-fs';

import { idbSaveAttachment, idbGetAttachment } from './indexedDb';
import { stripAttachmentData } from './attachmentData';
import {
  DEFAULT_INBOX_FOLDER,
  STORAGE_KEYS,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_FOLDERS,
  DEFAULT_VAULT_META,
} from '../../config';

export { DEFAULT_WORKSPACE_STATE, DEFAULT_FOLDERS, DEFAULT_INBOX_FOLDER };

export type StorageChangeEvent =
  | { kind: 'item'; action: 'upsert' | 'delete'; id: string; payload?: SlagItem; origin?: 'local' | 'remote' }
  | { kind: 'folder'; action: 'upsert' | 'delete'; id: string; payload?: FolderMeta; origin?: 'local' | 'remote' }
  | { kind: 'folder'; action: 'rename'; id: string; payload: FolderMeta; oldPath: string; origin?: 'local' | 'remote' }
  | { kind: 'workspace'; action: 'upsert'; id: string; payload?: WorkspaceState; origin?: 'local' | 'remote' }
  | { kind: 'trash'; action: 'restore' | 'purge'; id: string; payload?: SlagItem; origin?: 'local' | 'remote' }
  | { kind: 'draft'; action: 'upsert' | 'delete'; id: string; payload?: ComposerDraft | FullscreenDraft; origin?: 'local' | 'remote' };

export type StorageChangeListener = (event: StorageChangeEvent) => void;

const fsLog = logger.scope('FS');

const VAULTS_KEY = STORAGE_KEYS.VAULTS;
const CURRENT_VAULT_KEY = STORAGE_KEYS.CURRENT_VAULT;
const ITEMS_STORAGE_PREFIX = STORAGE_KEYS.ITEMS_PREFIX;
const FOLDERS_STORAGE_PREFIX = STORAGE_KEYS.FOLDERS_PREFIX;
const ATTACHMENTS_STORAGE_PREFIX = STORAGE_KEYS.ATTACHMENTS_PREFIX;
const TRASH_STORAGE_PREFIX = STORAGE_KEYS.TRASH_PREFIX;
const DRAFTS_STORAGE_PREFIX = STORAGE_KEYS.DRAFTS_PREFIX;
const ASSISTANT_STORAGE_PREFIX = STORAGE_KEYS.ASSISTANT_PREFIX;
const WORKSPACE_STATE_PREFIX = STORAGE_KEYS.WORKSPACE_STATE_PREFIX;

// Initial demo & onboarding items
export const DEFAULT_ITEMS: SlagItem[] = generateDemoItems();

export class StorageService {
  private currentVault: VaultMeta;
  private draftStore: DraftStore;
  private tauriInitialization: Promise<boolean> | null = null;
  private changeListeners: Set<StorageChangeListener> = new Set();
  private instanceId: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  private crossWindowDraftChannel: BroadcastChannel | null = null;
  private persistedAttachmentIds: Set<string> = new Set();
  private attachmentUrlCache: Map<string, string> = new Map();
  /**
   * Attachment bytes for the current session, keyed by id. The note itself only keeps metadata:
   * a data URL in `localStorage` is one photo against a five-megabyte quota.
   */
  private attachmentDataUrlCache: Map<string, string> = new Map();

  public getVaultAttachmentsPath(vault: VaultMeta = this.currentVault): string {
    return `${this.getVaultDir(vault)}/.attachments`;
  }

  private attachmentBasename(att: SlagAttachment): string {
    const parts = att.relativePath.split(/[\\/]/);
    return parts[parts.length - 1] || att.id;
  }

  /**
   * Playable url for an attachment. Lives only in memory: a blob: URL inside
   * the item would be dead after restart and would leak into localStorage/sync.
   */
  public async getAttachmentUrl(id: string, relativePath: string, mimeType?: string): Promise<string | undefined> {
    const cached = this.attachmentUrlCache.get(id);
    if (cached) return cached;

    const stored = await idbGetAttachment(id);
    if (stored?.dataUrl) return stored.dataUrl;

    if (!isTauri()) return undefined;
    try {
      const path = `${this.getVaultAttachmentsPath()}/${relativePath.split(/[\\/]/).pop() || id}`;
      if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return undefined;
      const bytes = await readFile(path, { baseDir: BaseDirectory.AppData });
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType || 'application/octet-stream' }));
      this.attachmentUrlCache.set(id, url);
      return url;
    } catch (err) {
      fsLog.warn(`Failed to read attachment ${id} from disk`, err);
      return undefined;
    }
  }

  /** Persist base64 bytes to .attachments/ once; markdown keeps only metadata. */
  private async persistAttachmentFiles(item: SlagItem, vault: VaultMeta = this.currentVault): Promise<void> {
    if (!isTauri()) return;
    for (const att of item.attachments || []) {
      if (!att.dataUrl?.startsWith('data:')) continue;
      if (this.persistedAttachmentIds.has(att.id)) continue;

      try {
        const dir = this.getVaultAttachmentsPath(vault);
        await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
        const path = `${dir}/${this.attachmentBasename(att)}`;
        if (await exists(path, { baseDir: BaseDirectory.AppData })) {
          this.persistedAttachmentIds.add(att.id);
          continue;
        }

        const response = await fetch(att.dataUrl);
        const buffer = await response.arrayBuffer();
        await writeFile(path, new Uint8Array(buffer), { baseDir: BaseDirectory.AppData });
        this.persistedAttachmentIds.add(att.id);
      } catch (err) {
        fsLog.warn(`Failed to persist attachment ${att.id}`, err);
      }
    }
  }

  /** A note keeps attachment ids; the bytes belong in IndexedDB, once per attachment. */
  private persistNewAttachments(items: SlagItem[]): void {
    for (const item of items) {
      for (const att of item.attachments || []) {
        if (att.dataUrl && !this.attachmentDataUrlCache.has(att.id)) this.saveAttachment(att);
      }
    }
  }

  /**
   * The index is a cache, never the source of truth: a note that does not fit here still has to
   * reach the disk. So a quota miss is a warning, not an exception.
   */
  private cacheItems(key: string, items: SlagItem[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(stripAttachmentData(items)));
    } catch (err) {
      fsLog.warn('Storage index write failed, notes keep landing on disk', {
        key,
        itemCount: items.length,
        error: err,
      });
    }
  }

  /** Put back the bytes of the session's own attachments, so the UI sees them as it always has. */
  private hydrateAttachmentData(items: SlagItem[]): SlagItem[] {
    if (this.attachmentDataUrlCache.size === 0) return items;
    return items.map((item) => (
      item.attachments?.some((att) => !att.dataUrl)
        ? {
          ...item,
          attachments: item.attachments.map((att) => (
            att.dataUrl ? att : { ...att, dataUrl: this.attachmentDataUrlCache.get(att.id) }
          )),
        }
        : item
    ));
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

  constructor() {
    this.currentVault = this.initCurrentVault();
    this.draftStore = new DraftStore({
      getVaultId: () => this.currentVault.id,
      emitChange: (event) => this.emitChange(event),
      getChannel: () => this.crossWindowDraftChannel,
      instanceId: this.instanceId,
    });
    this.initDefaultsIfNeeded();
    this.initCrossWindowDraftSync();
    if (isTauri()) {
      void this.initTauriFs();
    }
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

  // Vault disk paths for strict multi-vault isolation
  public getVaultDir(vault: VaultMeta = this.currentVault): string {
    const dirName = vault.id === 'default_vault' ? 'main' : vault.id;
    return `vaults/${dirName}`;
  }

  public getVaultNotesPath(vault: VaultMeta = this.currentVault): string {
    return `${this.getVaultDir(vault)}/notes`;
  }

  public getVaultTrashPath(vault: VaultMeta = this.currentVault): string {
    return `${this.getVaultDir(vault)}/.trash`;
  }

  public getVaultStatePath(vault: VaultMeta = this.currentVault): string {
    return `${this.getVaultDir(vault)}/state.json`;
  }

  public async getNoteAbsolutePath(item: SlagItem): Promise<string> {
    const filename = item.filename || getSafeNoteFilename(item.title, item.id);
    const folder = item.folder || DEFAULT_INBOX_FOLDER;
    return this.resolveAbsolutePath(`${this.getVaultNotesPath()}/${folder}/${filename}`, 'note');
  }

  public async getFolderAbsolutePath(folderPath: string): Promise<string> {
    return this.resolveAbsolutePath(`${this.getVaultNotesPath()}/${folderPath || DEFAULT_INBOX_FOLDER}`, 'folder');
  }

  private async resolveAbsolutePath(relativePath: string, kind: 'note' | 'folder'): Promise<string> {
    if (isTauri()) {
      try {
        const { appDataDir } = await import('@tauri-apps/api/path');
        const base = await appDataDir();
        const cleanBase = base.replace(/[/\\]+$/, '');
        const cleanRel = relativePath.replace(/^[/\\]+/, '');
        const sep = navigator.userAgent.includes('Windows') ? '\\' : '/';
        return `${cleanBase}${sep}${cleanRel.split('/').join(sep)}`;
      } catch (err) {
        fsLog.warn(`Failed to resolve absolute ${kind} path via Tauri API`, err);
      }
    }
    return relativePath;
  }

  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await mkdir(dest, { baseDir: BaseDirectory.AppData, recursive: true });
    const entries = await readDir(src, { baseDir: BaseDirectory.AppData });
    for (const entry of entries) {
      const srcChild = `${src}/${entry.name}`;
      const destChild = `${dest}/${entry.name}`;
      if (entry.isDirectory) {
        await this.copyDirRecursive(srcChild, destChild);
      } else {
        const content = await readTextFile(srcChild, { baseDir: BaseDirectory.AppData });
        await writeTextFile(destChild, content, { baseDir: BaseDirectory.AppData });
      }
    }
  }

  public async migrateLegacyNotesToVaults(): Promise<void> {
    if (!isTauri()) return;
    try {
      const legacyNotesExists = await exists('notes', { baseDir: BaseDirectory.AppData });
      if (legacyNotesExists) {
        fsLog.info('Migrating legacy AppData/notes to AppData/vaults/main/notes...');
        await this.copyDirRecursive('notes', 'vaults/main/notes');
        await remove('notes', { baseDir: BaseDirectory.AppData, recursive: true });
        fsLog.info('Legacy AppData/notes successfully migrated to vaults/main/notes');
      }

      const legacyTrashExists = await exists('.trash', { baseDir: BaseDirectory.AppData });
      if (legacyTrashExists) {
        await this.copyDirRecursive('.trash', 'vaults/main/.trash');
        await remove('.trash', { baseDir: BaseDirectory.AppData, recursive: true });
      }

      const legacyStateExists = await exists('state.json', { baseDir: BaseDirectory.AppData });
      if (legacyStateExists) {
        const mainStateExists = await exists('vaults/main/state.json', { baseDir: BaseDirectory.AppData });
        if (!mainStateExists) {
          const stateContent = await readTextFile('state.json', { baseDir: BaseDirectory.AppData });
          await mkdir('vaults/main', { baseDir: BaseDirectory.AppData, recursive: true });
          await writeTextFile('vaults/main/state.json', stateContent, { baseDir: BaseDirectory.AppData });
        }
        await remove('state.json', { baseDir: BaseDirectory.AppData });
      }
    } catch (err) {
      fsLog.warn('Legacy vault migration error:', err);
    }
  }

  public async syncCurrentVaultFs(): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      const notesPath = this.getVaultNotesPath();
      const trashPath = this.getVaultTrashPath();
      const statePath = this.getVaultStatePath();

      await mkdir(trashPath, { baseDir: BaseDirectory.AppData, recursive: true });
      const folders = this.getFolders();
      for (const f of folders) {
        await mkdir(`${notesPath}/${f.path}`, { baseDir: BaseDirectory.AppData, recursive: true });
      }

      const loadedItems = await this.scanNotesDir(notesPath);
      if (loadedItems.length > 0) {
        this.cacheItems(this.getItemsKey(), loadedItems);
        fsLog.info(`Loaded ${loadedItems.length} notes for vault "${this.currentVault.name}" from ${notesPath}`);
      } else {
        const current = this.getItems();
        for (const item of current) {
          await this.flushItemToDisk(item);
        }
      }

      const hasState = await exists(statePath, { baseDir: BaseDirectory.AppData });
      if (hasState) {
        const stateStr = await readTextFile(statePath, { baseDir: BaseDirectory.AppData });
        try {
          const parsed = JSON.parse(stateStr);
          if (Array.isArray(parsed.folders)) {
            localStorage.setItem(this.getFoldersKey(), JSON.stringify(parsed.folders));
          }
        } catch {
          // ignore
        }
      } else {
        await this.flushStateToDisk();
      }
      return true;
    } catch (err) {
      fsLog.error(`Failed to sync vault "${this.currentVault.name}" in AppData:`, err);
      return false;
    }
  }

  // ponytail: in-memory sync cache with async fs flush. ceiling: 5,000 notes. upgrade: worker-thread batch indexing if disk io throttles
  public initTauriFs(): Promise<boolean> {
    if (!isTauri()) return Promise.resolve(false);
    if (!this.tauriInitialization) {
      this.tauriInitialization = this.migrateLegacyNotesToVaults()
        .then(() => this.syncCurrentVaultFs())
        .then((ready) => this.compactLocalStorage().then(() => ready));
    }
    return this.tauriInitialization;
  }

  /**
   * One-off pass over what older builds left in localStorage: attachment bytes and note bodies
   * with data URLs inside. The bytes move to IndexedDB (where `getAttachmentUrl` looks first),
   * the keys are dropped, and the note index is rewritten as metadata only. This is what frees
   * the quota that used to reject every save with an attachment in it.
   */
  private async compactLocalStorage(): Promise<void> {
    try {
      const staleKeys: string[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(ATTACHMENTS_STORAGE_PREFIX)) staleKeys.push(key);
      }
      for (const key of staleKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            await idbSaveAttachment(JSON.parse(raw) as SlagAttachment);
          } catch {
            // Unreadable leftovers are exactly what we came here to delete.
          }
        }
        localStorage.removeItem(key);
      }
      this.cacheItems(this.getItemsKey(), this.getItems());
      this.cacheItems(this.getTrashKey(), this.getTrashItems());
      if (staleKeys.length > 0) {
        fsLog.info(`Dropped ${staleKeys.length} attachment entries from localStorage (bytes live in IndexedDB)`);
      }
    } catch (err) {
      fsLog.warn('localStorage compaction failed', err);
    }
  }

  private async scanNotesDir(dirPath: string): Promise<SlagItem[]> {
    const items: SlagItem[] = [];
    try {
      const entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData });
      const normalized = dirPath.replace(/\\/g, '/');
      const notesBase = this.getVaultNotesPath().replace(/\\/g, '/');
      const folderPart = normalized.startsWith(notesBase + '/')
        ? normalized.slice(notesBase.length + 1)
        : (normalized === notesBase ? DEFAULT_INBOX_FOLDER : normalized);

      // Read this directory's notes with bounded parallelism. Read order is restored
      // below by walking `entries` in readDir order, so a tie on `updatedAt` still
      // resolves to the first file, exactly like the serial loop did.
      const noteFiles = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith('.md'));
      const parsedByName = new Map<string, SlagItem>();
      const CONCURRENCY = 8;
      for (let i = 0; i < noteFiles.length; i += CONCURRENCY) {
        const batch = noteFiles.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (entry) => {
            const subPath = `${dirPath}/${entry.name}`;
            try {
              const content = await readTextFile(subPath, { baseDir: BaseDirectory.AppData });
              const fallbackId = entry.name.replace(/\.md$/, '');
              const parsed = parseMarkdownToItem(content, fallbackId, folderPart);
              parsed.filename = entry.name;
              return [entry.name, parsed] as const;
            } catch (e) {
              fsLog.warn(`Failed to read note file ${subPath}:`, e);
              return null;
            }
          })
        );
        for (const result of results) {
          if (result) parsedByName.set(result[0], result[1]);
        }
      }

      // First occurrence of an id wins, mirroring the previous findIndex() semantics
      // while staying O(1) per note instead of O(n²) over the directory.
      const firstIndexById = new Map<string, number>();
      for (const entry of entries) {
        const subPath = `${dirPath}/${entry.name}`;
        if (entry.isDirectory) {
          const nested = await this.scanNotesDir(subPath);
          for (const nestedItem of nested) {
            if (!firstIndexById.has(nestedItem.id)) {
              firstIndexById.set(nestedItem.id, items.length);
            }
            items.push(nestedItem);
          }
        } else if (entry.name.endsWith('.md')) {
          const parsed = parsedByName.get(entry.name);
          if (!parsed) continue;
          const existingIdx = firstIndexById.get(parsed.id);
          if (existingIdx !== undefined) {
            if ((parsed.updatedAt || 0) > (items[existingIdx].updatedAt || 0)) {
              items[existingIdx] = parsed;
            }
          } else {
            firstIndexById.set(parsed.id, items.length);
            items.push(parsed);
          }
        }
      }
    } catch (err) {
      fsLog.warn(`Failed reading dir ${dirPath}:`, err);
    }
    return items;
  }

  private async flushItemToDisk(item: SlagItem, oldFolder?: string, oldFilename?: string, vault: VaultMeta = this.currentVault, strict = false, protectedPaths = new Set<string>()): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath(vault);
      const folder = item.folder || DEFAULT_INBOX_FOLDER;
      const targetDir = `${notesBase}/${folder}`;
      await mkdir(targetDir, { baseDir: BaseDirectory.AppData, recursive: true });

      const newFilename = item.filename || getSafeNoteFilename(item.title, item.id);
      const newPath = `${targetDir}/${newFilename}`;

      const prevFolder = oldFolder || folder;
      const prevFilename = oldFilename || newFilename;
      const oldPath = `${notesBase}/${prevFolder}/${prevFilename}`;
      const legacyOldPath = `${notesBase}/${prevFolder}/${item.id}.md`;
      const legacyTargetPath = `${targetDir}/${item.id}.md`;

      // Write the replacement before removing the previous filename.
      const content = serializeItemToMarkdown(item);
      await writeTextFile(newPath, content, { baseDir: BaseDirectory.AppData });
      await this.persistAttachmentFiles(item, vault);

      if (oldPath !== newPath && !protectedPaths.has(oldPath) && await exists(oldPath, { baseDir: BaseDirectory.AppData })) {
        await remove(oldPath, { baseDir: BaseDirectory.AppData });
      }
      if (legacyOldPath !== newPath && !protectedPaths.has(legacyOldPath) && await exists(legacyOldPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyOldPath, { baseDir: BaseDirectory.AppData });
      }
      if (legacyTargetPath !== newPath && !protectedPaths.has(legacyTargetPath) && await exists(legacyTargetPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyTargetPath, { baseDir: BaseDirectory.AppData });
      }

    } catch (err) {
      fsLog.error(`Failed to flush note ${item.id} to disk:`, err);
      if (strict) throw err;
    }
  }

  private async removeItemFromDisk(item: SlagItem, vault: VaultMeta = this.currentVault, strict = false): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath(vault);
      const trashBase = this.getVaultTrashPath(vault);
      const targetFolder = item.folder || DEFAULT_INBOX_FOLDER;
      const filename = item.filename || getSafeNoteFilename(item.title, item.id);
      const notePath = `${notesBase}/${targetFolder}/${filename}`;
      const legacyPath = `${notesBase}/${targetFolder}/${item.id}.md`;

      const pathToRemove = (await exists(notePath, { baseDir: BaseDirectory.AppData }))
        ? notePath
        : ((await exists(legacyPath, { baseDir: BaseDirectory.AppData })) ? legacyPath : null);

      if (pathToRemove) {
        await mkdir(trashBase, { baseDir: BaseDirectory.AppData, recursive: true });
        const content = await readTextFile(pathToRemove, { baseDir: BaseDirectory.AppData });
        await writeTextFile(`${trashBase}/${filename}`, content, { baseDir: BaseDirectory.AppData });
        await remove(pathToRemove, { baseDir: BaseDirectory.AppData });
      }
    } catch (err) {
      fsLog.error(`Failed to remove note ${item.id} from disk:`, err);
      if (strict) throw err;
    }
  }

  private async restoreItemOnDisk(item: SlagItem): Promise<void> {
    if (!isTauri()) return;
    try {
      const trashBase = this.getVaultTrashPath();
      const filename = item.filename || getSafeNoteFilename(item.title, item.id);
      const trashPath = `${trashBase}/${filename}`;
      const legacyTrashPath = `${trashBase}/${item.id}.md`;
      if (await exists(trashPath, { baseDir: BaseDirectory.AppData })) {
        await remove(trashPath, { baseDir: BaseDirectory.AppData });
      } else if (await exists(legacyTrashPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyTrashPath, { baseDir: BaseDirectory.AppData });
      }
      await this.flushItemToDisk(item);
    } catch (err) {
      fsLog.error(`Failed to restore note ${item.id} on disk:`, err);
    }
  }

  private async flushStateToDisk(): Promise<void> {
    if (!isTauri()) return;
    try {
      const statePath = this.getVaultStatePath();
      const state = {
        folders: this.getFolders(),
        workspace: this.getWorkspaceState(),
        updatedAt: Date.now(),
      };
      await writeTextFile(statePath, JSON.stringify(state, null, 2), { baseDir: BaseDirectory.AppData });
    } catch (err) {
      fsLog.warn(`Failed to flush state.json to disk:`, err);
    }
  }

  private async deleteFolderOnDisk(path: string, movedItems: { item: SlagItem; oldFolder: string }[]): Promise<void> {
    if (!isTauri()) return;
    try {
      // 1. Move notes to Inbox on disk and remove old note files from deleted folder
      for (const { item, oldFolder } of movedItems) {
        await this.flushItemToDisk(item, oldFolder, item.filename);
      }
      // 2. Remove deleted folder directory recursively from disk
      await this.removeFolderFromDisk(path);
      // 3. Persist updated state.json to disk
      await this.flushStateToDisk();
    } catch (err) {
      fsLog.error(`Failed to complete disk deletion for folder "${path}":`, err);
    }
  }

  private async renameFolderOnDisk(oldPath: string, newPath: string, items: SlagItem[]): Promise<void> {
    if (!isTauri()) return;
    try {
      for (const it of items) {
        if (it.folder === newPath || it.folder.startsWith(newPath + '/')) {
          const originalSub = it.folder === newPath
            ? oldPath
            : oldPath + it.folder.slice(newPath.length);
          await this.flushItemToDisk(it, originalSub, it.filename);
        }
      }
      await this.removeFolderFromDisk(oldPath);
      await this.flushStateToDisk();
    } catch (err) {
      fsLog.error(`Failed to complete disk rename for folder "${oldPath}" to "${newPath}":`, err);
    }
  }

  private async removeFolderFromDisk(folderPath: string): Promise<void> {
    if (!isTauri() || !folderPath || folderPath === DEFAULT_INBOX_FOLDER) return;
    try {
      const notesBase = this.getVaultNotesPath();
      const targetDir = `${notesBase}/${folderPath}`;
      if (await exists(targetDir, { baseDir: BaseDirectory.AppData })) {
        await remove(targetDir, { baseDir: BaseDirectory.AppData, recursive: true });
        fsLog.info(`Removed folder directory from disk: ${targetDir}`);
      }
    } catch (err) {
      fsLog.warn(`Failed to remove folder directory ${folderPath} from disk:`, err);
    }
  }

  private initCurrentVault(): VaultMeta {
    const saved = localStorage.getItem(CURRENT_VAULT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.id) {
          // Auto-migrate old default vault name to 'main'
          if (parsed.id === 'default_vault' && (parsed.name === 'Основное хранилище (Vault)' || !parsed.name)) {
            parsed.name = 'main';
            localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(parsed));
          }
          this.currentVault = parsed;
          return parsed;
        }
      } catch {
        // ignore
      }
    }
    const defaultVault: VaultMeta = { ...DEFAULT_VAULT_META };
    this.currentVault = defaultVault;
    localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(defaultVault));
    this.saveVaultMeta(defaultVault);
    return defaultVault;
  }

  public getCurrentVault(): VaultMeta {
    return this.currentVault;
  }

  public getVaults(): VaultMeta[] {
    const raw = localStorage.getItem(VAULTS_KEY);
    if (!raw) return this.currentVault ? [this.currentVault] : [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let changed = false;
        const vaults = parsed
          .filter(v => v && typeof v === 'object' && v.id)
          .map(v => {
            if (v.id === 'default_vault' && (v.name === 'Основное хранилище (Vault)' || !v.name)) {
              changed = true;
              return { ...v, name: 'main' };
            }
            return v;
          });
        if (changed) {
          localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
        }
        return vaults.length > 0 ? vaults : (this.currentVault ? [this.currentVault] : []);
      }
      return this.currentVault ? [this.currentVault] : [];
    } catch {
      return this.currentVault ? [this.currentVault] : [];
    }
  }

  public ensureVaultSyncId(vaultId: string): string {
    const vault = this.getVaults().find((entry) => entry.id === vaultId);
    if (!vault) throw new Error('Хранилище не найдено');
    if (vault.syncId) return vault.syncId;
    const syncId = vault.id === 'default_vault' ? `vault_${crypto.randomUUID()}` : vault.id;
    const updated = { ...vault, syncId };
    this.saveVaultMeta(updated);
    if (this.currentVault.id === vaultId) {
      this.currentVault = { ...this.currentVault, syncId };
      localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(this.currentVault));
    }
    return syncId;
  }

  public saveVaultMeta(vault: VaultMeta): void {
    if (!vault || !vault.id) return;
    const list = this.getVaults().filter(v => v && v.id !== vault.id);
    list.push(vault);
    localStorage.setItem(VAULTS_KEY, JSON.stringify(list));
  }

  public switchVault(vaultId: string): VaultMeta {
    const vaults = this.getVaults();
    const target = vaults.find(v => v.id === vaultId);
    if (target) {
      this.currentVault = { ...target, isCurrent: true };
      localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(this.currentVault));
      this.initDefaultsIfNeeded();
      fsLog.info(`Switched vault to "${this.currentVault.name}" (${this.currentVault.id})`);
      if (isTauri()) {
        void this.syncCurrentVaultFs();
      }
      return this.currentVault;
    }
    return this.currentVault;
  }

  public createVault(
    name: string,
    mode: 'indexeddb' | 'fsa' | 'tauri' = isTauri() ? 'tauri' : 'indexeddb',
    path?: string,
    id?: string
  ): VaultMeta {
    const resolvedMode = isTauri() && mode === 'indexeddb' ? 'tauri' : mode;
    const newVault: VaultMeta = {
      id: id?.trim() || `vault_${crypto.randomUUID()}`,
      name,
      mode: resolvedMode,
      path,
      isCurrent: true,
    };
    this.saveVaultMeta(newVault);
    fsLog.info(`Created new vault "${name}" (${newVault.id}) [${resolvedMode}]${path ? ` at ${path}` : ''}`);
    return this.switchVault(newVault.id);
  }

  public seedDemoData(): SlagItem[] {
    const demoItems = generateDemoItems();
    const existing = this.getItems();
    const updated = [...existing, ...demoItems];
    this.cacheItems(this.getItemsKey(), updated);
    if (isTauri()) {
      for (const item of demoItems) {
        void this.flushItemToDisk(item);
      }
    }
    fsLog.info(`Seeded ${demoItems.length} demo items into vault "${this.currentVault.name}"`);
    return updated;
  }

  public deleteVault(vaultId: string): boolean {
    if (vaultId === 'default_vault') {
      return false; // Cannot delete default root vault
    }
    if (vaultId === this.currentVault.id) {
      this.switchVault('default_vault');
    }
    const vaults = this.getVaults().filter(v => v.id !== vaultId);
    localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
    try {
      localStorage.removeItem(`${ITEMS_STORAGE_PREFIX}${vaultId}`);
      localStorage.removeItem(`${FOLDERS_STORAGE_PREFIX}${vaultId}`);
      localStorage.removeItem(`${DRAFTS_STORAGE_PREFIX}${vaultId}`);
      localStorage.removeItem(`${ASSISTANT_STORAGE_PREFIX}${vaultId}`);
      localStorage.removeItem(`${WORKSPACE_STATE_PREFIX}${vaultId}`);
    } catch {
      // ignore
    }
    if (isTauri()) {
      try {
        const vaultDir = `vaults/${vaultId}`;
        void remove(vaultDir, { baseDir: BaseDirectory.AppData, recursive: true });
      } catch (err) {
        fsLog.warn(`Failed to clean up vault directory on disk:`, err);
      }
    }
    fsLog.info(`Deleted vault "${vaultId}"`);
    return true;
  }

  public async pickDirectory(): Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null> {
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Выберите папку хранилища',
        });
        if (selected && typeof selected === 'string') {
          const folderName = selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Папка';
          return { name: folderName, path: selected, mode: 'tauri' };
        }
        return null;
      } catch (err) {
        fsLog.error('Tauri folder picker error:', err);
        return null;
      }
    }

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        return { name: dirHandle.name || 'Локальный Vault', mode: 'fsa' };
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          fsLog.warn('showDirectoryPicker error:', err);
        }
        return null;
      }
    }

    return null;
  }

  private getItemsKey(): string {
    return `${ITEMS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  private getFoldersKey(): string {
    return `${FOLDERS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  private getDraftsKey(): string {
    return `${DRAFTS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  private getWorkspaceStateKey(): string {
    return `${WORKSPACE_STATE_PREFIX}${this.currentVault.id}`;
  }

  private initDefaultsIfNeeded(): void {
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
    const raw = localStorage.getItem(this.getFoldersKey());
    if (!raw) return DEFAULT_FOLDERS;
    try {
      const parsed: FolderMeta[] = JSON.parse(raw);
      let changed = false;
      // Ensure inbox always exists
      if (!parsed.some(f => f.path === DEFAULT_INBOX_FOLDER)) {
        parsed.unshift(DEFAULT_FOLDERS[0]);
        changed = true;
      }
      if (changed) {
        localStorage.setItem(this.getFoldersKey(), JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return DEFAULT_FOLDERS;
    }
  }

  public saveFolder(folder: FolderMeta, origin: 'local' | 'remote' = 'local'): void {
    const folders = this.getFolders().filter(f => f.path !== folder.path);
    folders.push(folder);
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));
    fsLog.info(`Saved folder "${folder.name}" (${folder.path})`);
    if (isTauri()) {
      void this.flushStateToDisk();
    }
    this.emitChange({ kind: 'folder', action: 'upsert', id: folder.path, payload: folder, origin });
  }

  public renameFolder(oldPath: string, updatedFolder: FolderMeta, origin: 'local' | 'remote' = 'local'): void {
    if (oldPath === DEFAULT_INBOX_FOLDER) return; // Cannot rename system inbox

    // 1. Update folders list
    const folders = this.getFolders().map(f => {
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
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));

    // 2. Update items belonging to this folder and its subfolders
    const items = this.getItems().map(it => {
      if (it.folder === oldPath) {
        return { ...it, folder: updatedFolder.path, updatedAt: Date.now() };
      }
      if (it.folder.startsWith(oldPath + '/')) {
        const subFolder = updatedFolder.path + it.folder.slice(oldPath.length);
        return { ...it, folder: subFolder, updatedAt: Date.now() };
      }
      return it;
    });
    this.cacheItems(this.getItemsKey(), items);

    fsLog.info(`Renamed folder "${oldPath}" to "${updatedFolder.path}"`);
    if (isTauri()) {
      void this.renameFolderOnDisk(oldPath, updatedFolder.path, items);
    }
    this.emitChange({ kind: 'folder', action: 'rename', id: updatedFolder.path, payload: updatedFolder, oldPath, origin });
  }

  public updateFolderDescription(path: string, description: string, origin: 'local' | 'remote' = 'local'): void {
    let targetFolder: FolderMeta | undefined;
    const folders = this.getFolders().map(f => {
      if (f.path === path) {
        targetFolder = { ...f, description };
        return targetFolder;
      }
      return f;
    });
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));
    fsLog.debug(`Updated description for folder "${path}"`);
    if (isTauri()) {
      void this.flushStateToDisk();
    }
    if (targetFolder) {
      this.emitChange({ kind: 'folder', action: 'upsert', id: path, payload: targetFolder, origin });
    }
  }

  public deleteFolder(path: string, origin: 'local' | 'remote' = 'local'): void {
    if (path === DEFAULT_INBOX_FOLDER) return; // Cannot delete system inbox
    const folders = this.getFolders().filter(f => f.path !== path && !f.path.startsWith(path + '/'));
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));

    // Move orphan items to inbox
    const items = this.getItems();
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
    this.cacheItems(this.getItemsKey(), updatedItems);

    // Clean up drafts for deleted folder and any subfolders
    const drafts = this.getAllComposerDrafts();
    let draftsChanged = false;
    for (const key of Object.keys(drafts)) {
      if (key === path || key.startsWith(path + '/')) {
        delete drafts[key];
        draftsChanged = true;
      }
    }
    if (draftsChanged) {
      try {
        localStorage.setItem(this.getDraftsKey(), JSON.stringify(drafts));
      } catch {
        // ignore
      }
    }

    if (isTauri()) {
      void this.deleteFolderOnDisk(path, movedItems);
    }

    fsLog.info(`Deleted folder "${path}", items re-routed to Inbox`);
    this.emitChange({ kind: 'folder', action: 'delete', id: path, origin });
  }

  // Items API
  public getItems(folder?: string): SlagItem[] {
    const raw = localStorage.getItem(this.getItemsKey());
    let list: SlagItem[] = [];
    if (raw) {
      try {
        list = this.hydrateAttachmentData(JSON.parse(raw));
      } catch {
        list = [];
      }
    }
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

    this.persistNewAttachments([updatedItem]);
    this.cacheItems(this.getItemsKey(), items);

    if (isTauri()) {
      const oldFilename = oldItem?.filename || (oldItem ? getSafeNoteFilename(oldItem.title, oldItem.id) : undefined);
      void this.flushItemToDisk(updatedItem, oldItem?.folder, oldFilename);
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
    this.persistNewAttachments([...saveMap.values()]);
    this.cacheItems(this.getItemsKey(), updated);

    if (isTauri()) {
      for (const it of saveMap.values()) {
        const old = oldItemsMap.get(it.id);
        const oldFilename = old?.filename || (old ? getSafeNoteFilename(old.title, old.id) : undefined);
        void this.flushItemToDisk(it, old?.folder, oldFilename);
      }
    }

    for (const it of saveMap.values()) {
      this.emitChange({ kind: 'item', action: 'upsert', id: it.id, payload: it, origin });
    }
  }

  private getTrashKey(): string {
    return `${TRASH_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  public getTrashItems(): SlagItem[] {
    const raw = localStorage.getItem(this.getTrashKey());
    if (!raw) return [];
    try {
      return this.hydrateAttachmentData(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  public moveToTrash(id: string, origin: 'local' | 'remote' = 'local'): void {
    const items = this.getItems();
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Remove from active items
    const remaining = items.filter(i => i.id !== id);
    this.cacheItems(this.getItemsKey(), remaining);

    // Save to .trash
    const trash = this.getTrashItems();
    trash.unshift({ ...item, updatedAt: Date.now() });
    this.cacheItems(this.getTrashKey(), trash);
    fsLog.info(`Moved "${item.title || item.id}" to .trash`);

    if (isTauri()) {
      void this.removeItemFromDisk(item);
    }
    this.emitChange({ kind: 'item', action: 'delete', id, payload: item, origin });
  }

  public restoreFromTrash(id: string, origin: 'local' | 'remote' = 'local'): SlagItem | null {
    const trash = this.getTrashItems();
    const item = trash.find(i => i.id === id);
    if (!item) return null;

    // Remove from trash
    const remainingTrash = trash.filter(i => i.id !== id);
    this.cacheItems(this.getTrashKey(), remainingTrash);

    // Restore to active items
    this.saveItem(item, origin);
    fsLog.info(`Restored "${item.title || item.id}" from .trash to "${item.folder}"`);

    if (isTauri()) {
      void this.restoreItemOnDisk(item);
    }
    this.emitChange({ kind: 'trash', action: 'restore', id: item.id, payload: item, origin });
    return item;
  }

  public emptyTrash(origin: 'local' | 'remote' = 'local'): void {
    localStorage.removeItem(this.getTrashKey());
    fsLog.info('Emptied .trash folder');

    if (isTauri()) {
      void (async () => {
        try {
          const trashPath = this.getVaultTrashPath();
          if (await exists(trashPath, { baseDir: BaseDirectory.AppData })) {
            await remove(trashPath, { baseDir: BaseDirectory.AppData, recursive: true });
            await mkdir(trashPath, { baseDir: BaseDirectory.AppData, recursive: true });
          }
        } catch (e) {
          fsLog.warn('Failed to empty .trash on disk:', e);
        }
      })();
    }
    this.emitChange({ kind: 'trash', action: 'purge', id: '*', origin });
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
  public saveAttachment(attachment: SlagAttachment): void {
    // Bytes go to IndexedDB; the note keeps only the id. `localStorage` would count every photo
    // against the same five megabytes the whole note index lives in.
    if (attachment.dataUrl) this.attachmentDataUrlCache.set(attachment.id, attachment.dataUrl);
    void idbSaveAttachment(attachment);
    fsLog.info(`Saved attachment "${attachment.name}" (${attachment.type}, ${Math.round(attachment.size / 1024)} KB)`);
  }

  // Tag taxonomy index
  public getAllExistingTags(): string[] {
    const items = this.getItems();
    const tagSet = new Set<string>();
    items.forEach(it => {
      (it.tags || []).forEach(t => tagSet.add(t.toLowerCase().trim()));
    });
    return Array.from(tagSet).sort();
  }

  // Vault & Folder Statistics for AI RAG & Inspector
  public getVaultStats(folderScope?: string): {
    totalItems: number;
    notesCount: number;
    tasksCount: number;
    articlesCount: number;
    tags: Record<string, number>;
    folders: Record<string, number>;
    scope: string;
  } {
    const allItems = this.getItems();
    const scopedItems = folderScope && folderScope !== DEFAULT_INBOX_FOLDER
      ? allItems.filter(i => i.folder === folderScope)
      : allItems;

    const tags: Record<string, number> = {};
    const folders: Record<string, number> = {};
    let notesCount = 0;
    let tasksCount = 0;
    let articlesCount = 0;

    scopedItems.forEach(it => {
      if (it.type === 'note') notesCount++;
      else if (it.type === 'task') tasksCount++;
      else if (it.type === 'article') articlesCount++;

      const folderName = it.folder || DEFAULT_INBOX_FOLDER;
      folders[folderName] = (folders[folderName] || 0) + 1;

      (it.tags || []).forEach(t => {
        const clean = t.toLowerCase().trim();
        if (clean) tags[clean] = (tags[clean] || 0) + 1;
      });
    });

    return {
      totalItems: scopedItems.length,
      notesCount,
      tasksCount,
      articlesCount,
      tags,
      folders,
      scope: folderScope || 'Все хранилище',
    };
  }

  public getAllComposerDrafts(): Record<string, ComposerDraft> {
    return this.draftStore.getAllComposerDrafts();
  }

  public getComposerDraft(folderPath: string): ComposerDraft | null {
    return this.draftStore.getComposerDraft(folderPath);
  }

  public saveComposerDraft(folderPath: string, draft: ComposerDraft, origin: 'local' | 'remote' = 'local'): void {
    return this.draftStore.saveComposerDraft(folderPath, draft, origin);
  }

  public deleteComposerDraft(folderPath: string, origin: 'local' | 'remote' = 'local'): void {
    return this.draftStore.deleteComposerDraft(folderPath, origin);
  }

  public getFullscreenDraft(itemId: string): FullscreenDraft | null {
    return this.draftStore.getFullscreenDraft(itemId);
  }

  public saveFullscreenDraft(itemId: string, draft: FullscreenDraft, origin: 'local' | 'remote' = 'local'): void {
    return this.draftStore.saveFullscreenDraft(itemId, draft, origin);
  }

  public clearFullscreenDraft(itemId: string, origin: 'local' | 'remote' = 'local'): void {
    return this.draftStore.clearFullscreenDraft(itemId, origin);
  }

  public getFullscreenWidth(): boolean {
    return this.draftStore.getFullscreenWidth();
  }

  public saveFullscreenWidth(isFullWidth: boolean): void {
    return this.draftStore.saveFullscreenWidth(isFullWidth);
  }

  public getAssistantHistory(): ChatMessage[] {
    return this.draftStore.getAssistantHistory();
  }

  public saveAssistantHistory(messages: ChatMessage[]): void {
    return this.draftStore.saveAssistantHistory(messages);
  }

  public clearAssistantHistory(): void {
    return this.draftStore.clearAssistantHistory();
  }

  public getWorkspaceState(): WorkspaceState {
    return this.draftStore.getWorkspaceState();
  }

  public saveWorkspaceState(partialState: Partial<WorkspaceState>, origin: 'local' | 'remote' = 'local'): void {
    return this.draftStore.saveWorkspaceState(partialState, origin);
  }

  public getFolderViewSettings(folderPath: string): FolderViewSettings {
    return this.draftStore.getFolderViewSettings(folderPath);
  }

  public saveFolderViewSettings(folderPath: string, settings: Partial<FolderViewSettings>): void {
    return this.draftStore.saveFolderViewSettings(folderPath, settings);
  }

  // Export current vault as Markdown files (ZIP or downloadable Blob)
  public exportVaultAsJson(): string {
    return JSON.stringify({
      vault: this.currentVault,
      folders: this.getFolders(),
      items: this.getItems(),
      assistantHistory: this.getAssistantHistory(),
      workspaceState: this.getWorkspaceState(),
      composerDrafts: this.getAllComposerDrafts(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
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
    const safeRelativePath = (path: string) => path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && path.split('/').every(part => part !== '..' && part !== '.' && part !== '');
    for (const folder of folders) {
      if (!safeRelativePath(folder.path)) throw new Error('Invalid synced folder path');
    }
    for (const item of data.items ?? []) {
      const filename = item.filename || getSafeNoteFilename(item.title, item.id);
      if (!safeRelativePath(item.folder || DEFAULT_INBOX_FOLDER) || !safeRelativePath(filename) || filename.includes('/') || !safeRelativePath(item.id) || item.id.includes('/')) {
        throw new Error('Invalid synced note path');
      }
    }
    if (isTauri()) {
      if (data.items) {
        const usedPaths = new Map<string, string>();
        for (const item of data.items) {
          let filename = item.filename || getSafeNoteFilename(item.title, item.id);
          const folder = item.folder || DEFAULT_INBOX_FOLDER;
          let noteRelPath = `${this.getVaultNotesPath(vault)}/${folder}/${filename}`;
          if (usedPaths.has(noteRelPath) && usedPaths.get(noteRelPath) !== item.id) {
            const shortId = item.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'dup';
            const base = filename.replace(/\.md$/, '');
            filename = `${base} (${shortId}).md`;
            item.filename = filename;
            noteRelPath = `${this.getVaultNotesPath(vault)}/${folder}/${filename}`;
          }
          usedPaths.set(noteRelPath, item.id);
        }
        const nextIds = new Set(data.items.map(item => item.id));
        const notePath = (item: SlagItem) => `${this.getVaultNotesPath(vault)}/${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`;
        const nextPaths = new Set(data.items.map(notePath));
        for (const item of data.items) {
          const old = previous.find(candidate => candidate.id === item.id);
          // Unchanged notes are already on disk; rewriting all 39 files per bundle was the sync stall.
          if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
          const oldFilename = old?.filename || (old ? getSafeNoteFilename(old.title, old.id) : undefined);
          await this.flushItemToDisk(item, old?.folder, oldFilename, vault, true, nextPaths);
        }
        for (const item of previous) {
          if (!nextIds.has(item.id) && !nextPaths.has(notePath(item))) await this.removeItemFromDisk(item, vault, true);
        }
      }
      const notesPath = this.getVaultNotesPath(vault);
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
              await this.removeFolderFromDisk(oldF.path);
            }
          }
        } catch {
          // ignore parsing error
        }
      }
      await writeTextFile(this.getVaultStatePath(vault), JSON.stringify({ folders, workspace, updatedAt: Date.now() }), { baseDir: BaseDirectory.AppData });
    }
    if (this.currentVault.id !== vault.id) throw new Error('Vault changed while persisting sync');
    if (JSON.stringify(this.getItems()) !== previousItems || JSON.stringify(this.getFolders()) !== previousFolders || JSON.stringify(this.getWorkspaceState()) !== previousWorkspace) {
      // Re-persist the latest local state so an in-flight remote write cannot win on disk.
      const latest = this.getItems();
      const latestPaths = new Set(latest.map(item => `${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`));
      for (const item of data.items ?? []) {
        if (!latestPaths.has(`${item.folder || DEFAULT_INBOX_FOLDER}/${item.filename || getSafeNoteFilename(item.title, item.id)}`)) await this.removeItemFromDisk(item, vault, true);
      }
      await this.importSyncedVaultData({ items: this.getItems(), folders: this.getFolders(), workspaceState: this.getWorkspaceState() });
      throw new Error('Local state changed while persisting sync; bundle remains pending');
    }
    if (!this.importVaultData({ items: data.items, folders: data.folders })) {
      throw new Error('Failed to store received vault data');
    }
    localStorage.setItem(this.getWorkspaceStateKey(), JSON.stringify(workspace));
  }

  public importVaultData(data: {
    folders?: FolderMeta[];
    items?: SlagItem[];
    assistantHistory?: ChatMessage[];
    workspaceState?: WorkspaceState;
    composerDrafts?: Record<string, ComposerDraft>;
  }): boolean {
    try {
      if (Array.isArray(data.folders) && data.folders.length > 0) {
        localStorage.setItem(this.getFoldersKey(), JSON.stringify(data.folders));
      }
      if (Array.isArray(data.items)) {
        this.cacheItems(this.getItemsKey(), data.items);
      }
      if (Array.isArray(data.assistantHistory)) {
        this.saveAssistantHistory(data.assistantHistory);
      }
      if (data.workspaceState && typeof data.workspaceState === 'object') {
        this.saveWorkspaceState(data.workspaceState, 'remote');
      }
      if (data.composerDrafts && typeof data.composerDrafts === 'object') {
        try {
          localStorage.setItem(this.getDraftsKey(), JSON.stringify(data.composerDrafts));
        } catch {
          // ignore
        }
      }
      fsLog.info(`Imported vault data: ${data.items?.length || 0} items, ${data.folders?.length || 0} folders`);
      return true;
    } catch (err) {
      fsLog.error('Failed to import vault data:', err);
      return false;
    }
  }

  public importVaultFromJson(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      return this.importVaultData(data);
    } catch (err) {
      fsLog.error('Failed to import vault JSON backup:', err);
      return false;
    }
  }

  // Obsidian Markdown bundle: returns array of { path: string, content: string }
  public exportObsidianBundle(): Array<{ path: string; content: string }> {
    const items = this.getItems();
    return items.map(item => {
      const filename = item.filename || getSafeNoteFilename(item.title, item.id);
      const filePath = item.folder ? `${item.folder}/${filename}` : filename;
      const content = serializeItemToMarkdown(item);
      return { path: filePath, content };
    });
  }
}

export const storage = new StorageService();

if (typeof window !== 'undefined') {
  (window as any).storage = storage;
}
