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
} from '../types';
import { DEFAULT_FOLDER_VIEW_SETTINGS } from '../types';
import { serializeItemToMarkdown, parseMarkdownToItem } from './markdownSerializer';
import { generateDemoItems } from './demoVault';
import { logger } from './logger';
import { isTauri } from '@tauri-apps/api/core';
import {
  writeTextFile,
  readTextFile,
  readDir,
  mkdir,
  remove,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

import { idbSaveAttachment } from './indexedDbStorage';

const fsLog = logger.scope('FS');

const VAULTS_KEY = 'slag_vaults_v2';
const CURRENT_VAULT_KEY = 'slag_current_vault_v2';
const ITEMS_STORAGE_PREFIX = 'slag_items_';
const FOLDERS_STORAGE_PREFIX = 'slag_folders_';
const ATTACHMENTS_STORAGE_PREFIX = 'slag_attachments_';
const TRASH_STORAGE_PREFIX = 'slag_trash_';
const DRAFTS_STORAGE_PREFIX = 'slag_drafts_';
const ASSISTANT_STORAGE_PREFIX = 'slag_assistant_';
const WORKSPACE_STATE_PREFIX = 'slag_workspace_state_';
const FULLSCREEN_DRAFTS_PREFIX = 'slag_fullscreen_draft_';
const FULLSCREEN_WIDTH_KEY = 'slag_fullscreen_is_full_width';

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  currentFolder: 'Входящие',
  feedViewMode: 'feed',
  inboxMode: 'all',
  activeTypeFilter: 'all',
  activeTagFilter: null,
  activeMobileTab: 'folders',
  folderMediaTab: 'media',
  isKanbanMaterialsOpen: true,
  sortBy: 'createdAt',
  sortOrder: 'asc',
  hideCompletedTasks: false,
  folderSettings: {},
};

export type StorageChangeEvent =
  | { kind: 'item'; action: 'upsert' | 'delete'; id: string; payload?: SlagItem; origin?: 'local' | 'remote' }
  | { kind: 'folder'; action: 'upsert' | 'delete'; id: string; payload?: FolderMeta; origin?: 'local' | 'remote' }
  | { kind: 'folder'; action: 'rename'; id: string; payload: FolderMeta; oldPath: string; origin?: 'local' | 'remote' }
  | { kind: 'workspace'; action: 'upsert'; id: string; payload?: WorkspaceState; origin?: 'local' | 'remote' }
  | { kind: 'trash'; action: 'restore' | 'purge'; id: string; payload?: SlagItem; origin?: 'local' | 'remote' }
  | { kind: 'draft'; action: 'upsert' | 'delete'; id: string; payload?: ComposerDraft | FullscreenDraft; origin?: 'local' | 'remote' };

export type StorageChangeListener = (event: StorageChangeEvent) => void;

// Initial default folders: clean, top-level categories without arbitrary pet-projects
export const DEFAULT_FOLDERS: FolderMeta[] = [
  {
    path: 'Входящие',
    name: 'Входящие',
    description: 'Все новые неотсортированные заметки, идеи, быстрые мысли и задачи для дальнейшего распределения.',
    icon: 'Inbox',
    isSystem: true,
  },
  {
    path: 'Карьера',
    name: 'Карьера',
    description: 'Профессиональный рост, рабочие цели, компетенции и проекты.',
    icon: 'Briefcase',
  },
  {
    path: 'Проекты',
    name: 'Проекты',
    description: 'Активные рабочие и технические проекты, задачи и код.',
    icon: 'Folder',
  },
  {
    path: 'Личное',
    name: 'Личное',
    description: 'Личные цели, планы, здоровье и повседневные дела.',
    icon: 'Bookmark',
  },
  {
    path: 'База знаний',
    name: 'База знаний',
    description: 'Вечнозеленые заметки, статьи, документация и полезные материалы.',
    icon: 'Book',
  },
  {
    path: 'Архив',
    name: 'Архив',
    description: 'Завершенные задачи, старые заметки и архивные материалы.',
    icon: 'Archive',
  },
];

// Obsolete dev/manifest demo IDs that should never pollute a clean vault
export const OBSOLETE_DEMO_IDS = new Set<string>();

// ponytail: regex-санитизация под ограничения Windows/Unix без внешних slug-библиотек; срез до 60 символов
export function getSafeNoteFilename(title?: string, fallbackId: string = 'untitled'): string {
  const clean = (title || '')
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = clean.slice(0, 60).trim();
  return `${safe || fallbackId}.md`;
}

// Initial demo & onboarding items
export const DEFAULT_ITEMS: SlagItem[] = generateDemoItems();

export class StorageService {
  private currentVault: VaultMeta;
  private tauriInitialized = false;
  private changeListeners: Set<StorageChangeListener> = new Set();
  private instanceId: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  private crossWindowDraftChannel: BroadcastChannel | null = null;

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
    const folder = item.folder || 'Входящие';
    const relativePath = `${this.getVaultNotesPath()}/${folder}/${filename}`;

    if (isTauri()) {
      try {
        const { appDataDir } = await import('@tauri-apps/api/path');
        const base = await appDataDir();
        const cleanBase = base.replace(/[/\\]+$/, '');
        const cleanRel = relativePath.replace(/^[/\\]+/, '');
        const sep = navigator.userAgent.includes('Windows') ? '\\' : '/';
        return `${cleanBase}${sep}${cleanRel.split('/').join(sep)}`;
      } catch (err) {
        fsLog.warn('Failed to resolve absolute note path via Tauri API', err);
      }
    }
    return relativePath;
  }

  public async getFolderAbsolutePath(folderPath: string): Promise<string> {
    const relativePath = `${this.getVaultNotesPath()}/${folderPath || 'Входящие'}`;
    if (isTauri()) {
      try {
        const { appDataDir } = await import('@tauri-apps/api/path');
        const base = await appDataDir();
        const cleanBase = base.replace(/[/\\]+$/, '');
        const cleanRel = relativePath.replace(/^[/\\]+/, '');
        const sep = navigator.userAgent.includes('Windows') ? '\\' : '/';
        return `${cleanBase}${sep}${cleanRel.split('/').join(sep)}`;
      } catch (err) {
        fsLog.warn('Failed to resolve absolute folder path via Tauri API', err);
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
        for (const item of loadedItems) {
          if (OBSOLETE_DEMO_IDS.has(item.id)) {
            void this.removeItemFromDisk(item);
          }
        }
        const filteredLoaded = loadedItems.filter(i => !OBSOLETE_DEMO_IDS.has(i.id));
        localStorage.setItem(this.getItemsKey(), JSON.stringify(filteredLoaded));
        fsLog.info(`Loaded ${filteredLoaded.length} notes for vault "${this.currentVault.name}" from ${notesPath}`);
      } else {
        const current = this.getItems().filter(i => !OBSOLETE_DEMO_IDS.has(i.id));
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
  public async initTauriFs(): Promise<boolean> {
    if (!isTauri() || this.tauriInitialized) return false;
    this.tauriInitialized = true;
    await this.migrateLegacyNotesToVaults();
    return await this.syncCurrentVaultFs();
  }

  private async scanNotesDir(dirPath: string): Promise<SlagItem[]> {
    const items: SlagItem[] = [];
    try {
      const entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData });
      for (const entry of entries) {
        const subPath = `${dirPath}/${entry.name}`;
        if (entry.isDirectory) {
          const nested = await this.scanNotesDir(subPath);
          items.push(...nested);
        } else if (entry.name.endsWith('.md')) {
          try {
            const content = await readTextFile(subPath, { baseDir: BaseDirectory.AppData });
            const normalized = dirPath.replace(/\\/g, '/');
            const notesBase = this.getVaultNotesPath().replace(/\\/g, '/');
            const folderPart = normalized.startsWith(notesBase + '/')
              ? normalized.slice(notesBase.length + 1)
              : (normalized === notesBase ? 'Входящие' : normalized);
            const fallbackId = entry.name.replace(/\.md$/, '');
            const parsed = parseMarkdownToItem(content, fallbackId, folderPart);
            parsed.filename = entry.name;
            const existingIdx = items.findIndex(i => i.id === parsed.id);
            if (existingIdx >= 0) {
              if ((parsed.updatedAt || 0) > (items[existingIdx].updatedAt || 0)) {
                items[existingIdx] = parsed;
              }
            } else {
              items.push(parsed);
            }
          } catch (e) {
            fsLog.warn(`Failed to read note file ${subPath}:`, e);
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
      const folder = item.folder || 'Входящие';
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
      const targetFolder = item.folder || 'Входящие';
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
    if (!isTauri() || !folderPath || folderPath === 'Входящие') return;
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
    const defaultVault: VaultMeta = {
      id: 'default_vault',
      name: 'main',
      mode: 'indexeddb',
      isCurrent: true,
    };
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
    localStorage.setItem(this.getItemsKey(), JSON.stringify(updated));
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

  private getAssistantKey(): string {
    return `${ASSISTANT_STORAGE_PREFIX}${this.currentVault.id}`;
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
      localStorage.setItem(itemsKey, JSON.stringify(initialItems));
    } else {
      // Auto-prune obsolete demo items from existing storage
      try {
        const raw = localStorage.getItem(itemsKey);
        if (raw) {
          const parsed: SlagItem[] = JSON.parse(raw);
          const filtered = parsed.filter(i => !OBSOLETE_DEMO_IDS.has(i.id));
          if (filtered.length !== parsed.length) {
            localStorage.setItem(itemsKey, JSON.stringify(filtered));
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Folders API
  public getFolders(): FolderMeta[] {
    const raw = localStorage.getItem(this.getFoldersKey());
    if (!raw) return DEFAULT_FOLDERS;
    try {
      const parsed: FolderMeta[] = JSON.parse(raw);
      let changed = false;
      // Ensure "Входящие" always exists
      if (!parsed.some(f => f.path === 'Входящие')) {
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
    if (oldPath === 'Входящие') return; // Cannot rename system inbox

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
    localStorage.setItem(this.getItemsKey(), JSON.stringify(items));

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
    if (path === 'Входящие') return; // Cannot delete system inbox
    const folders = this.getFolders().filter(f => f.path !== path && !f.path.startsWith(path + '/'));
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));

    // Move orphan items to "Входящие"
    const items = this.getItems();
    const movedItems: { item: SlagItem; oldFolder: string }[] = [];
    const updatedItems = items.map(it => {
      if (it.folder === path || it.folder.startsWith(path + '/')) {
        const oldFolder = it.folder;
        const updated: SlagItem = { ...it, folder: 'Входящие', updatedAt: Date.now() };
        movedItems.push({ item: updated, oldFolder });
        return updated;
      }
      return it;
    });
    localStorage.setItem(this.getItemsKey(), JSON.stringify(updatedItems));

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
        list = JSON.parse(raw);
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

    try {
      localStorage.setItem(this.getItemsKey(), JSON.stringify(items));
    } catch (err) {
      fsLog.error('Failed to save items to localStorage (storage quota exceeded)', {
        itemCount: items.length,
        error: err,
      });
      throw err;
    }

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
    try {
      localStorage.setItem(this.getItemsKey(), JSON.stringify(updated));
    } catch (err) {
      fsLog.error('Failed to bulk save items to localStorage', { error: err });
      throw err;
    }

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
      return JSON.parse(raw);
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
    localStorage.setItem(this.getItemsKey(), JSON.stringify(remaining));

    // Save to .trash
    const trash = this.getTrashItems();
    trash.unshift({ ...item, updatedAt: Date.now() });
    localStorage.setItem(this.getTrashKey(), JSON.stringify(trash));
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
    localStorage.setItem(this.getTrashKey(), JSON.stringify(remainingTrash));

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
    const key = `${ATTACHMENTS_STORAGE_PREFIX}${attachment.id}`;
    idbSaveAttachment(attachment);
    try {
      localStorage.setItem(key, JSON.stringify(attachment));
      fsLog.info(`Saved attachment "${attachment.name}" (${attachment.type}, ${Math.round(attachment.size / 1024)} KB)`);
    } catch (err) {
      fsLog.warn(`localStorage quota exceeded for attachment "${attachment.name}", persisted in IndexedDB`, {
        attachmentId: attachment.id,
        sizeBytes: attachment.size,
        error: err,
      });
    }
  }

  public getAttachment(id: string): SlagAttachment | null {
    try {
      const raw = localStorage.getItem(`${ATTACHMENTS_STORAGE_PREFIX}${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
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
    const scopedItems = folderScope && folderScope !== 'Входящие'
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

      const folderName = it.folder || 'Входящие';
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

  // Composer Drafts (per-folder, silent Telegram-style)
  public getAllComposerDrafts(): Record<string, ComposerDraft> {
    const raw = localStorage.getItem(this.getDraftsKey());
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  public getComposerDraft(folderPath: string): ComposerDraft | null {
    const all = this.getAllComposerDrafts();
    return all[folderPath] || null;
  }

  public saveComposerDraft(folderPath: string, draft: ComposerDraft, origin: 'local' | 'remote' = 'local'): void {
    try {
      const all = this.getAllComposerDrafts();
      all[folderPath] = draft;
      localStorage.setItem(this.getDraftsKey(), JSON.stringify(all));
      this.emitChange({
        kind: 'draft',
        action: 'upsert',
        id: `composer:${folderPath}`,
        payload: draft,
        origin,
      });
      if (origin === 'local' && this.crossWindowDraftChannel) {
        try {
          this.crossWindowDraftChannel.postMessage({
            type: 'DRAFT_CHANGED',
            senderId: this.instanceId,
            folderPath,
            draft,
            action: 'upsert',
          });
        } catch {}
      }
    } catch (err) {
      fsLog.warn('Failed to save composer draft to localStorage', { folderPath, err });
    }
  }

  public deleteComposerDraft(folderPath: string, origin: 'local' | 'remote' = 'local'): void {
    try {
      const all = this.getAllComposerDrafts();
      const had = folderPath in all;
      if (had) {
        delete all[folderPath];
        localStorage.setItem(this.getDraftsKey(), JSON.stringify(all));
      }
      const draftTombKey = `slag_sync_draft_tomb_${this.currentVault.id}_composer:${folderPath}`;
      localStorage.setItem(draftTombKey, String(Date.now()));
      this.emitChange({
        kind: 'draft',
        action: 'delete',
        id: `composer:${folderPath}`,
        origin,
      });
      if (origin === 'local' && this.crossWindowDraftChannel) {
        try {
          this.crossWindowDraftChannel.postMessage({
            type: 'DRAFT_CHANGED',
            senderId: this.instanceId,
            folderPath,
            draft: null,
            action: 'delete',
          });
        } catch {}
      }
    } catch (err) {
      fsLog.warn('Failed to delete composer draft from localStorage', { folderPath, err });
    }
  }

  // Fullscreen Editor Drafts (per-item auto-saved in-flight edits)
  private getFullscreenDraftsKey(): string {
    return `${FULLSCREEN_DRAFTS_PREFIX}${this.currentVault.id}`;
  }

  public getFullscreenDraft(itemId: string): FullscreenDraft | null {
    try {
      const raw = localStorage.getItem(`${this.getFullscreenDraftsKey()}_${itemId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public saveFullscreenDraft(itemId: string, draft: FullscreenDraft, origin: 'local' | 'remote' = 'local'): void {
    try {
      localStorage.setItem(`${this.getFullscreenDraftsKey()}_${itemId}`, JSON.stringify(draft));
      this.emitChange({
        kind: 'draft',
        action: 'upsert',
        id: `fullscreen:${itemId}`,
        payload: draft,
        origin,
      });
    } catch (err) {
      fsLog.warn('Failed to save fullscreen draft to localStorage', { itemId, err });
    }
  }

  public clearFullscreenDraft(itemId: string, origin: 'local' | 'remote' = 'local'): void {
    try {
      localStorage.removeItem(`${this.getFullscreenDraftsKey()}_${itemId}`);
      this.emitChange({
        kind: 'draft',
        action: 'delete',
        id: `fullscreen:${itemId}`,
        origin,
      });
    } catch {}
  }

  public getFullscreenWidth(): boolean {
    try {
      return localStorage.getItem(FULLSCREEN_WIDTH_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public saveFullscreenWidth(isFullWidth: boolean): void {
    try {
      localStorage.setItem(FULLSCREEN_WIDTH_KEY, String(isFullWidth));
    } catch {}
  }

  // Assistant History (Vault-scoped, Obsidian Local-First)
  public getAssistantHistory(): ChatMessage[] {
    const raw = localStorage.getItem(this.getAssistantKey());
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public saveAssistantHistory(messages: ChatMessage[]): void {
    try {
      localStorage.setItem(this.getAssistantKey(), JSON.stringify(messages));
    } catch (err) {
      fsLog.error('Failed to save assistant history to localStorage', { count: messages.length, err });
    }
  }

  public clearAssistantHistory(): void {
    localStorage.removeItem(this.getAssistantKey());
    fsLog.info('Cleared assistant chat history');
  }

  // Workspace State (per-vault active folder, view modes, and filter settings)
  public getWorkspaceState(): WorkspaceState {
    const raw = localStorage.getItem(this.getWorkspaceStateKey());
    if (!raw) return { ...DEFAULT_WORKSPACE_STATE };
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_WORKSPACE_STATE,
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
      };
    } catch {
      return { ...DEFAULT_WORKSPACE_STATE };
    }
  }

  public saveWorkspaceState(partialState: Partial<WorkspaceState>, origin: 'local' | 'remote' = 'local'): void {
    try {
      const current = this.getWorkspaceState();
      const updated = { ...current, ...partialState };
      localStorage.setItem(this.getWorkspaceStateKey(), JSON.stringify(updated));
      this.emitChange({ kind: 'workspace', action: 'upsert', id: 'workspace_state', payload: updated, origin });
    } catch (err) {
      fsLog.warn('Failed to save workspace state to localStorage', err);
    }
  }

  public getFolderViewSettings(folderPath: string): FolderViewSettings {
    const ws = this.getWorkspaceState();
    return ws.folderSettings?.[folderPath] || {
      ...DEFAULT_FOLDER_VIEW_SETTINGS,
      viewMode: ws.feedViewMode || DEFAULT_FOLDER_VIEW_SETTINGS.viewMode,
      typeFilter: ws.activeTypeFilter || DEFAULT_FOLDER_VIEW_SETTINGS.typeFilter,
      sortBy: ws.sortBy || DEFAULT_FOLDER_VIEW_SETTINGS.sortBy,
      sortOrder: ws.sortOrder || DEFAULT_FOLDER_VIEW_SETTINGS.sortOrder,
      hideCompletedTasks: ws.hideCompletedTasks ?? DEFAULT_FOLDER_VIEW_SETTINGS.hideCompletedTasks,
    };
  }

  public saveFolderViewSettings(folderPath: string, settings: Partial<FolderViewSettings>): void {
    const ws = this.getWorkspaceState();
    const currentSettings = ws.folderSettings?.[folderPath] || { ...DEFAULT_FOLDER_VIEW_SETTINGS };
    const updatedSettings = { ...currentSettings, ...settings };
    const folderSettings = { ...(ws.folderSettings || {}), [folderPath]: updatedSettings };
    this.saveWorkspaceState({ folderSettings });
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
      if (!safeRelativePath(item.folder || 'Входящие') || !safeRelativePath(filename) || filename.includes('/') || !safeRelativePath(item.id) || item.id.includes('/')) {
        throw new Error('Invalid synced note path');
      }
    }
    if (isTauri()) {
      if (data.items) {
        const usedPaths = new Map<string, string>();
        for (const item of data.items) {
          let filename = item.filename || getSafeNoteFilename(item.title, item.id);
          const folder = item.folder || 'Входящие';
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
        const notePath = (item: SlagItem) => `${this.getVaultNotesPath(vault)}/${item.folder || 'Входящие'}/${item.filename || getSafeNoteFilename(item.title, item.id)}`;
        const nextPaths = new Set(data.items.map(notePath));
        for (const item of data.items) {
          const old = previous.find(candidate => candidate.id === item.id);
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
            if (!nextFolderPaths.has(oldF.path) && oldF.path !== 'Входящие') {
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
      const latestPaths = new Set(latest.map(item => `${item.folder || 'Входящие'}/${item.filename || getSafeNoteFilename(item.title, item.id)}`));
      for (const item of data.items ?? []) {
        if (!latestPaths.has(`${item.folder || 'Входящие'}/${item.filename || getSafeNoteFilename(item.title, item.id)}`)) await this.removeItemFromDisk(item, vault, true);
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
        localStorage.setItem(this.getItemsKey(), JSON.stringify(data.items));
      }
      if (Array.isArray(data.assistantHistory)) {
        this.saveAssistantHistory(data.assistantHistory);
      }
      if (data.workspaceState && typeof data.workspaceState === 'object') {
        this.saveWorkspaceState(data.workspaceState);
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
