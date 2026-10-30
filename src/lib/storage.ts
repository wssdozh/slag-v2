import type {
  SlagItem,
  FolderMeta,
  VaultMeta,
  SlagAttachment,
  ComposerDraft,
  WorkspaceState,
  ChatMessage,
} from '../types';
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

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  currentFolder: 'Входящие',
  feedViewMode: 'feed',
  inboxMode: 'all',
  activeTypeFilter: 'all',
  activeTagFilter: null,
  activeMobileTab: 'folders',
  folderMediaTab: 'media',
  isKanbanMaterialsOpen: true,
};

// Initial default folders (Custom taxonomy aligned with Career, Personal, Projects, Future and Knowledge Base)
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
    description: 'Профессиональный рост, карьерные цели, резюме, поиск работы и ключевые навыки.',
    icon: 'Briefcase',
  },
  {
    path: 'Карьера/Поиск работы',
    name: 'Поиск работы',
    description: 'Отклики, вакансии, контакты рекрутеров, резюме и подготовка к собеседованиям.',
    icon: 'Compass',
  },
  {
    path: 'Карьера/Развитие',
    name: 'Развитие',
    description: 'Обучение, курсы, новые технологии, профессиональные книги и менторство.',
    icon: 'Sparkles',
  },
  {
    path: 'Личное',
    name: 'Личное',
    description: 'Личные цели, баланс жизни, здоровье, дом и быт.',
    icon: 'Bookmark',
  },
  {
    path: 'Личное/Быт',
    name: 'Быт',
    description: 'Домашние дела, покупки, счета, мелкий ремонт, бытовая рутина и организация жизни.',
    icon: 'Coffee',
  },
  {
    path: 'Личное/Здоровье',
    name: 'Здоровье',
    description: 'Тренировки, чекапы, врачи, анализы, режим сна, питание и самочувствие.',
    icon: 'Heart',
  },
  {
    path: 'Проекты',
    name: 'Проекты',
    description: 'Активная продуктовая и техническая разработка, пет-проекты, код и контент.',
    icon: 'Folder',
  },
  {
    path: 'Проекты/Дизайн',
    name: 'Дизайн',
    description: 'Интерфейсы, типографика Inter, референсы Linear и Vercel.',
    icon: 'Layers',
  },
  {
    path: 'Проекты/медиа',
    name: 'медиа',
    description: 'Создание контента, сценарии для видео и блогов, статьи, соцсети и публикации.',
    icon: 'Book',
  },
  {
    path: 'Проекты/fantazer',
    name: 'fantazer',
    description: 'Разработка проекта fantazer, архитектура, задачи и фичи.',
    icon: 'Cpu',
  },
  {
    path: 'Проекты/block-sorting',
    name: 'block-sorting',
    description: 'Проект сортировки блоков block-sorting, алгоритмы, верстка и код.',
    icon: 'Code2',
  },
  {
    path: 'Будущее',
    name: 'Будущее',
    description: 'Инкубатор долгосрочных замыслов, список отложенного и идеи без жестких сроков.',
    icon: 'Flame',
  },
  {
    path: 'Будущее/Потом',
    name: 'Потом',
    description: 'Задачи и идеи «когда-нибудь / может быть», книги на будущее, отложенные планы.',
    icon: 'Archive',
  },
  {
    path: 'Будущее/Хотелки',
    name: 'Хотелки',
    description: 'Вишлист покупок, гаджеты, подарки, развлечения и вдохновляющие хотелки.',
    icon: 'Sparkles',
  },
  {
    path: 'База знаний',
    name: 'База знаний',
    description: 'Вечнозеленые заметки, статьи, документация и референсы.',
    icon: 'Book',
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

  constructor() {
    this.currentVault = this.initCurrentVault();
    this.initDefaultsIfNeeded();
    if (isTauri()) {
      void this.initTauriFs();
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
            items.push(parsed);
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

  private async flushItemToDisk(item: SlagItem, oldFolder?: string, oldFilename?: string): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath();
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

      if (oldPath !== newPath && await exists(oldPath, { baseDir: BaseDirectory.AppData })) {
        await remove(oldPath, { baseDir: BaseDirectory.AppData });
      }
      if (legacyOldPath !== newPath && await exists(legacyOldPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyOldPath, { baseDir: BaseDirectory.AppData });
      }
      if (legacyTargetPath !== newPath && await exists(legacyTargetPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyTargetPath, { baseDir: BaseDirectory.AppData });
      }

      const content = serializeItemToMarkdown(item);
      await writeTextFile(newPath, content, { baseDir: BaseDirectory.AppData });
    } catch (err) {
      fsLog.error(`Failed to flush note ${item.id} to disk:`, err);
    }
  }

  private async removeItemFromDisk(item: SlagItem): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath();
      const trashBase = this.getVaultTrashPath();
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

  public createVault(name: string, mode: 'indexeddb' | 'fsa' | 'tauri' = isTauri() ? 'tauri' : 'indexeddb', path?: string): VaultMeta {
    const resolvedMode = isTauri() && mode === 'indexeddb' ? 'tauri' : mode;
    const newVault: VaultMeta = {
      id: 'vault_' + Date.now(),
      name,
      mode: resolvedMode,
      path,
      isCurrent: true,
    };
    this.saveVaultMeta(newVault);
    fsLog.info(`Created new vault "${name}" [${resolvedMode}]${path ? ` at ${path}` : ''}`);
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
      const initialItems = generateDemoItems();
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

  public saveFolder(folder: FolderMeta): void {
    const folders = this.getFolders().filter(f => f.path !== folder.path);
    folders.push(folder);
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));
    fsLog.info(`Saved folder "${folder.name}" (${folder.path})`);
    if (isTauri()) {
      void this.flushStateToDisk();
    }
  }

  public renameFolder(oldPath: string, updatedFolder: FolderMeta): void {
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
  }

  public updateFolderDescription(path: string, description: string): void {
    const folders = this.getFolders().map(f => {
      if (f.path === path) {
        return { ...f, description };
      }
      return f;
    });
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));
    fsLog.debug(`Updated description for folder "${path}"`);
    if (isTauri()) {
      void this.flushStateToDisk();
    }
  }

  public deleteFolder(path: string): void {
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

  public saveItem(item: SlagItem): SlagItem {
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
      void this.flushItemToDisk(updatedItem, oldItem?.folder, oldItem?.filename);
    }

    return updatedItem;
  }

  public saveItems(itemsToSave: SlagItem[]): void {
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
        void this.flushItemToDisk(it, old?.folder, old?.filename);
      }
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

  public moveToTrash(id: string): void {
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
  }

  public restoreFromTrash(id: string): SlagItem | null {
    const trash = this.getTrashItems();
    const item = trash.find(i => i.id === id);
    if (!item) return null;

    // Remove from trash
    const remainingTrash = trash.filter(i => i.id !== id);
    localStorage.setItem(this.getTrashKey(), JSON.stringify(remainingTrash));

    // Restore to active items
    this.saveItem(item);
    fsLog.info(`Restored "${item.title || item.id}" from .trash to "${item.folder}"`);

    if (isTauri()) {
      void this.restoreItemOnDisk(item);
    }
    return item;
  }

  public emptyTrash(): void {
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
  }

  public deleteItem(id: string): void {
    this.moveToTrash(id);
  }

  public moveItem(id: string, targetFolder: string): SlagItem | null {
    const item = this.getItemById(id);
    if (!item) return null;
    item.folder = targetFolder;
    item.updatedAt = Date.now();
    return this.saveItem(item);
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

  public saveComposerDraft(folderPath: string, draft: ComposerDraft): void {
    try {
      const all = this.getAllComposerDrafts();
      all[folderPath] = draft;
      localStorage.setItem(this.getDraftsKey(), JSON.stringify(all));
    } catch (err) {
      fsLog.warn('Failed to save composer draft to localStorage', { folderPath, err });
    }
  }

  public deleteComposerDraft(folderPath: string): void {
    try {
      const all = this.getAllComposerDrafts();
      if (folderPath in all) {
        delete all[folderPath];
        localStorage.setItem(this.getDraftsKey(), JSON.stringify(all));
      }
    } catch (err) {
      fsLog.warn('Failed to delete composer draft from localStorage', { folderPath, err });
    }
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

  public saveWorkspaceState(partialState: Partial<WorkspaceState>): void {
    try {
      const current = this.getWorkspaceState();
      const updated = { ...current, ...partialState };
      localStorage.setItem(this.getWorkspaceStateKey(), JSON.stringify(updated));
    } catch (err) {
      fsLog.warn('Failed to save workspace state to localStorage', err);
    }
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
