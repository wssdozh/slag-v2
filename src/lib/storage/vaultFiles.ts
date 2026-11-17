import type { FolderMeta, SlagAttachment, SlagItem, VaultMeta, WorkspaceState } from '../../types';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import {
  readTextFile,
  readDir,
  mkdir,
  remove,
  exists,
  BaseDirectory,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { serializeItemToMarkdown, parseMarkdownToItem } from '../vault/markdownSerializer';
import { DEFAULT_INBOX_FOLDER, STORAGE_KEYS } from '../../config';
import { idbSaveAttachment } from './indexedDb';
import { getSafeNoteFilename, withIdSuffix } from '../vault/noteFilename';
import { isSafeVaultRelativePath, safeVaultRelativePath } from '../vault/safePath';
import type { AttachmentStore } from './attachments';

const fsLog = logger.scope('FS');
const ATTACHMENTS_STORAGE_PREFIX = STORAGE_KEYS.ATTACHMENTS_PREFIX;

/**
 * The vault as files on disk: where they live, how a name is claimed, how a note is
 * flushed, renamed or removed, and how the disk is scanned back.
 *
 * One reason to change — the on-disk format. It does not know what an index is; the
 * service hands it the few questions it cannot answer itself.
 */
export interface VaultFilesDeps {
  getVault(): VaultMeta;
  getItems(folder?: string): SlagItem[];
  getFolders(): FolderMeta[];
  getTrashItems(): SlagItem[];
  getWorkspaceState(): WorkspaceState;
  cacheItems(key: string, items: SlagItem[]): void;
  getItemsKey(): string;
  getFoldersKey(): string;
  getTrashKey(): string;
  attachments: AttachmentStore;
}

export class VaultFiles {
  private deps: VaultFilesDeps;
  private tauriInitialization: Promise<boolean> | null = null;

  constructor(deps: VaultFilesDeps) {
    this.deps = deps;
  }

  private get vault(): VaultMeta {
    return this.deps.getVault();
  }

  public getVaultDir(vault: VaultMeta = this.vault): string {
    const dirName = vault.id === 'default_vault' ? 'main' : vault.id;
    return `vaults/${dirName}`;
  }

  public getVaultNotesPath(vault: VaultMeta = this.vault): string {
    return `${this.getVaultDir(vault)}/notes`;
  }

  public getVaultTrashPath(vault: VaultMeta = this.vault): string {
    return `${this.getVaultDir(vault)}/.trash`;
  }

  public getVaultStatePath(vault: VaultMeta = this.vault): string {
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
      const folders = this.deps.getFolders();
      for (const f of folders) {
        await mkdir(`${notesPath}/${f.path}`, { baseDir: BaseDirectory.AppData, recursive: true });
      }

      const loadedItems = await this.scanNotesDir(notesPath);
      if (loadedItems.length > 0) {
        this.deps.cacheItems(this.deps.getItemsKey(), loadedItems);
        fsLog.info(`Loaded ${loadedItems.length} notes for vault "${this.vault.name}" from ${notesPath}`);
      } else {
        const current = this.deps.getItems();
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
            localStorage.setItem(this.deps.getFoldersKey(), JSON.stringify(parsed.folders));
          }
        } catch {
          // ignore
        }
      } else {
        await this.flushStateToDisk();
      }
      return true;
    } catch (err) {
      fsLog.error(`Failed to sync vault "${this.vault.name}" in AppData:`, err);
      return false;
    }
  }

  /**
   * Reads the notes under these vault-relative paths back into items, without touching the index.
   * The caller owns the merge: this class knows the on-disk format, not what an index is.
   *
   * A path that cannot be read lands in `missing` — a folder of someone else's vault, a file
   * deleted between the sweep and the read. Deciding that a note is gone is the caller's call.
   */
  public async reloadNotesFromDisk(relativePaths: string[]): Promise<{ items: SlagItem[]; missing: string[] }> {
    const notesBase = this.getVaultNotesPath();
    const items: SlagItem[] = [];
    const missing: string[] = [];

    for (const relativePath of relativePaths) {
      let safe: string;
      try {
        safe = safeVaultRelativePath(relativePath);
      } catch {
        missing.push(relativePath);
        continue;
      }
      const slash = safe.lastIndexOf('/');
      const folder = slash >= 0 ? safe.slice(0, slash) : DEFAULT_INBOX_FOLDER;
      const filename = slash >= 0 ? safe.slice(slash + 1) : safe;
      try {
        const content = await readTextFile(`${notesBase}/${safe}`, { baseDir: BaseDirectory.AppData });
        const parsed = parseMarkdownToItem(content, filename.replace(/\.md$/, ''), folder);
        parsed.filename = filename;
        items.push(parsed);
      } catch {
        missing.push(relativePath);
      }
    }

    return { items, missing };
  }

  /**
   * Who the note at this path is and how old it says it is. `updated` comes from the frontmatter,
   * so this is the one question a write needs to ask before it replaces the file: has somebody
   * else written here since we last read it.
   */
  public async readNoteIdentity(relativePath: string): Promise<{ id: string; updatedAt: number } | null> {
    if (!isTauri()) return null;
    let safe: string;
    try {
      safe = safeVaultRelativePath(relativePath);
    } catch {
      return null;
    }
    const slash = safe.lastIndexOf('/');
    const folder = slash >= 0 ? safe.slice(0, slash) : DEFAULT_INBOX_FOLDER;
    const filename = slash >= 0 ? safe.slice(slash + 1) : safe;
    try {
      const content = await readTextFile(`${this.getVaultNotesPath()}/${safe}`, { baseDir: BaseDirectory.AppData });
      const parsed = parseMarkdownToItem(content, filename.replace(/\.md$/, ''), folder);
      return { id: parsed.id, updatedAt: parsed.updatedAt };
    } catch {
      return null;
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
      this.deps.cacheItems(this.deps.getItemsKey(), this.deps.getItems());
      this.deps.cacheItems(this.deps.getTrashKey(), this.deps.getTrashItems());
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

  /**
   * One note, one file. The name comes from the title, two notes can share a title, and the
   * second write used to land on the first one's path and swallow it. The id suffix keeps them
   * apart; it is derived from the id, so a note keeps its name between saves.
   */
  private claimNoteFilename(item: SlagItem, folder: string): string {
    const base = item.filename || getSafeNoteFilename(item.title, item.id);
    const taken = new Set<string>();
    for (const other of this.deps.getItems()) {
      if (other.id === item.id) continue;
      const name = other.filename || getSafeNoteFilename(other.title, other.id);
      taken.add(`${other.folder || DEFAULT_INBOX_FOLDER}/${name}`);
    }
    if (!taken.has(`${folder}/${base}`)) return base;

    let candidate = withIdSuffix(base, item.id);
    for (let n = 2; taken.has(`${folder}/${candidate}`); n += 1) {
      candidate = withIdSuffix(`${base.replace(/\.md$/, '')}-${n}`, item.id);
    }
    return candidate;
  }

  /** Two notes deleted under one title must not share one copy in `.trash/`. */
  private async freeTrashFilename(filename: string, id: string): Promise<string> {
    const trashBase = this.getVaultTrashPath();
    if (!(await exists(`${trashBase}/${filename}`, { baseDir: BaseDirectory.AppData }))) return filename;
    let candidate = withIdSuffix(filename, id);
    for (let n = 2; await exists(`${trashBase}/${candidate}`, { baseDir: BaseDirectory.AppData }); n += 1) {
      candidate = withIdSuffix(`${filename.replace(/\.md$/, '')}-${n}`, id);
    }
    return candidate;
  }

  /** A file on disk is this note's only if its frontmatter says so. */
  private async fileBelongsTo(path: string, id: string): Promise<boolean> {
    try {
      if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return false;
      const text = await readTextFile(path, { baseDir: BaseDirectory.AppData });
      return text.includes(`id: ${id}\n`) || text.includes(`id: ${id}\r`) || text.endsWith(`id: ${id}`);
    } catch {
      return false;
    }
  }

  public async flushItemToDisk(item: SlagItem, oldFolder?: string, oldFilename?: string, vault: VaultMeta = this.vault, strict = false, protectedPaths = new Set<string>()): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath(vault);
      const folder = safeVaultRelativePath(item.folder || DEFAULT_INBOX_FOLDER);
      const targetDir = `${notesBase}/${folder}`;
      await mkdir(targetDir, { baseDir: BaseDirectory.AppData, recursive: true });

      const newFilename = safeVaultRelativePath(this.claimNoteFilename(item, folder));
      if (newFilename.includes('/')) throw new Error('Invalid note filename');
      item.filename = newFilename;
      const newPath = `${targetDir}/${newFilename}`;

      const prevFolder = oldFolder ? safeVaultRelativePath(oldFolder) : folder;
      const prevFilename = oldFilename ? safeVaultRelativePath(oldFilename) : newFilename;
      if (prevFilename.includes('/')) throw new Error('Invalid previous note filename');
      const safeId = isSafeVaultRelativePath(item.id) ? item.id : null;
      const oldPath = `${notesBase}/${prevFolder}/${prevFilename}`;
      const legacyOldPath = safeId ? `${notesBase}/${prevFolder}/${safeId}.md` : '';
      const legacyTargetPath = safeId ? `${targetDir}/${safeId}.md` : '';

      // Write the replacement before removing the previous filename.
      const content = serializeItemToMarkdown(item);
      await writeTextFile(newPath, content, { baseDir: BaseDirectory.AppData });
      await this.deps.attachments.persistAll(item);

      // The old path may be somebody else's file when two notes shared a title, so a rename
      // only deletes a file that is really this note.
      if (oldPath !== newPath && !protectedPaths.has(oldPath) && await this.fileBelongsTo(oldPath, item.id)) {
        await remove(oldPath, { baseDir: BaseDirectory.AppData });
      }
      if (legacyOldPath && legacyOldPath !== newPath && !protectedPaths.has(legacyOldPath) && await exists(legacyOldPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyOldPath, { baseDir: BaseDirectory.AppData });
      }
      if (legacyTargetPath && legacyTargetPath !== newPath && !protectedPaths.has(legacyTargetPath) && await exists(legacyTargetPath, { baseDir: BaseDirectory.AppData })) {
        await remove(legacyTargetPath, { baseDir: BaseDirectory.AppData });
      }

    } catch (err) {
      fsLog.error(`Failed to flush note ${item.id} to disk:`, err);
      if (strict) throw err;
    }
  }

  public async removeItemFromDisk(item: SlagItem, vault: VaultMeta = this.vault, strict = false): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath(vault);
      const trashBase = this.getVaultTrashPath(vault);
      const targetFolder = safeVaultRelativePath(item.folder || DEFAULT_INBOX_FOLDER);
      const filename = safeVaultRelativePath(item.filename || getSafeNoteFilename(item.title, item.id));
      if (filename.includes('/')) throw new Error('Invalid note filename');
      const notePath = `${notesBase}/${targetFolder}/${filename}`;
      const legacyPath = isSafeVaultRelativePath(item.id)
        ? `${notesBase}/${targetFolder}/${item.id}.md`
        : '';

      const pathToRemove = (await exists(notePath, { baseDir: BaseDirectory.AppData }))
        ? notePath
        : ((legacyPath && await exists(legacyPath, { baseDir: BaseDirectory.AppData })) ? legacyPath : null);

      if (pathToRemove) {
        await mkdir(trashBase, { baseDir: BaseDirectory.AppData, recursive: true });
        const content = await readTextFile(pathToRemove, { baseDir: BaseDirectory.AppData });
        await writeTextFile(`${trashBase}/${await this.freeTrashFilename(filename, item.id)}`, content, { baseDir: BaseDirectory.AppData });
        await remove(pathToRemove, { baseDir: BaseDirectory.AppData });
      }
    } catch (err) {
      fsLog.error(`Failed to remove note ${item.id} from disk:`, err);
      if (strict) throw err;
    }
  }

  public async restoreItemOnDisk(item: SlagItem): Promise<void> {
    if (!isTauri()) return;
    try {
      const trashBase = this.getVaultTrashPath();
      const filename = safeVaultRelativePath(item.filename || getSafeNoteFilename(item.title, item.id));
      if (filename.includes('/')) throw new Error('Invalid note filename');
      const safeId = isSafeVaultRelativePath(item.id) ? item.id : null;
      // A copy may sit under the plain name, under the id-suffixed one, or under the old id name.
      for (const candidate of [filename, withIdSuffix(filename, item.id), ...(safeId ? [`${safeId}.md`] : [])]) {
        if (await exists(`${trashBase}/${candidate}`, { baseDir: BaseDirectory.AppData })) {
          await remove(`${trashBase}/${candidate}`, { baseDir: BaseDirectory.AppData });
          break;
        }
      }
      await this.flushItemToDisk(item);
    } catch (err) {
      fsLog.error(`Failed to restore note ${item.id} on disk:`, err);
    }
  }

  public async flushStateToDisk(): Promise<void> {
    if (!isTauri()) return;
    try {
      const statePath = this.getVaultStatePath();
      const state = {
        folders: this.deps.getFolders(),
        workspace: this.deps.getWorkspaceState(),
        updatedAt: Date.now(),
      };
      await writeTextFile(statePath, JSON.stringify(state, null, 2), { baseDir: BaseDirectory.AppData });
    } catch (err) {
      fsLog.warn(`Failed to flush state.json to disk:`, err);
    }
  }

  public async deleteFolderOnDisk(path: string, movedItems: { item: SlagItem; oldFolder: string }[]): Promise<void> {
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

  public async renameFolderOnDisk(oldPath: string, newPath: string, items: SlagItem[]): Promise<void> {
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

  public async removeFolderFromDisk(folderPath: string): Promise<void> {
    if (!isTauri() || !folderPath || folderPath === DEFAULT_INBOX_FOLDER) return;
    try {
      const safeFolder = safeVaultRelativePath(folderPath);
      const notesBase = this.getVaultNotesPath();
      const targetDir = `${notesBase}/${safeFolder}`;
      if (await exists(targetDir, { baseDir: BaseDirectory.AppData })) {
        await remove(targetDir, { baseDir: BaseDirectory.AppData, recursive: true });
        fsLog.info(`Removed folder directory from disk: ${targetDir}`);
      }
    } catch (err) {
      fsLog.warn(`Failed to remove folder directory ${folderPath} from disk:`, err);
    }
  }

}
