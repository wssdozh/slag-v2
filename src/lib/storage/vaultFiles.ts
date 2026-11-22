import type { FolderMeta, KanbanColumn, SlagItem, VaultMeta, WorkspaceState } from '../../types';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import { writeAppDataTextAtomic, writeJsonAtomic } from '../platform/writeJsonAtomic';
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
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { getSafeNoteFilename, withIdSuffix } from '../vault/noteFilename';
import { isSafeVaultRelativePath, safeVaultRelativePath } from '../vault/safePath';
import { folderMetaFor } from './folderSource';
import { isFolderColor } from '../vault/folderColor';
import type { AttachmentStore } from './attachments';
import { hasSharedRegistryEnrollment } from '../sync/notes/persistence';
import { mergeRegistryDeviceWorkspace } from '../sync/notes/sharedWorkspace';

const fsLog = logger.scope('FS');

/**
 * How many note files are read at once.
 *
 * Every `readTextFile` is an IPC round trip, and the disk is not the cost: 89 notes took 1.2 s at
 * eight in flight (~13 ms per file), which is the bridge talking, not the SSD. Sixteen halves the
 * number of batches without a queue deep enough to matter to a filesystem.
 */
const NOTE_READ_CONCURRENCY = 16;

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
  getWorkspaceState(): WorkspaceState;
  cacheItems(key: string, items: SlagItem[]): void;
  getItemsKey(): string;
  getTrashKey(): string;
  /** The one write path for the folder list; `external` came from the disk and writes nothing back. */
  persistFolders(folders: FolderMeta[], origin: 'local' | 'remote' | 'external'): void;
  hydrateRegistryFolders(folders: FolderMeta[]): void;
  attachments: AttachmentStore;
}

export class VaultFiles {
  private deps: VaultFilesDeps;
  private tauriInitialization: Promise<boolean> | null = null;
  // `state.json` has two writers now — folder metadata and the workspace — and both read before
  // they write. One queue per file keeps a slower write from putting its stale copy back.
  private stateWrite: Promise<void> = Promise.resolve();

  constructor(deps: VaultFilesDeps) {
    this.deps = deps;
  }

  private queueStateWrite(write: () => Promise<void>): Promise<void> {
    this.stateWrite = this.stateWrite.then(write, write);
    return this.stateWrite;
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
          const state = this.parseStateStrict(await readTextFile('state.json', { baseDir: BaseDirectory.AppData }));
          await mkdir('vaults/main', { baseDir: BaseDirectory.AppData, recursive: true });
          await writeJsonAtomic('vaults/main/state.json', state);
          await remove('state.json', { baseDir: BaseDirectory.AppData });
        }
      }
    } catch (err) {
      fsLog.warn('Legacy vault migration error:', err);
    }
  }

  public async syncCurrentVaultFs(): Promise<boolean> {
    if (!isTauri()) return false;
    const startedAt = performance.now();
    try {
      const vault = this.vault;
      const notesPath = this.getVaultNotesPath(vault);
      const trashPath = this.getVaultTrashPath(vault);
      const statePath = this.getVaultStatePath(vault);
      const fence = await this.readStateSection('pendingFolderProjection', vault, true);
      if (this.vault !== vault) return false;

      await mkdir(trashPath, { baseDir: BaseDirectory.AppData, recursive: true });
      // The inbox comes first: it is where a note without a folder goes, and folders are read back
      // from these directories.
      await this.ensureFolderOnDisk(DEFAULT_INBOX_FOLDER);

      const notesStartedAt = performance.now();
      const loadedItems = (await this.scanNotesDir(notesPath)).filter(({ id }) => !Object.hasOwn(fence, id));
      if (this.vault !== vault) return false;
      const notesMs = performance.now() - notesStartedAt;
      if (loadedItems.length > 0 || Object.keys(fence).length > 0) {
        this.deps.cacheItems(this.deps.getItemsKey(), loadedItems);
        fsLog.info(`Loaded ${loadedItems.length} notes for vault "${this.vault.name}" from ${notesPath}`);
      } else {
        const current = this.deps.getItems();
        for (const item of current) {
          await this.flushItemToDisk(item);
        }
      }

      // The trash list is the `.trash/` snapshot, exactly as the notes list is the `notes/` one:
      // a note deleted in an earlier session still has to be restorable. Three independent reads,
      // one wait: the trash, the directory tree and the folder metadata never look at each other,
      // and running them in sequence was most of the start-up.
      const sideStartedAt = performance.now();
      const [trashedItems, folderPaths, folderState] = await Promise.all([
        this.scanTrashDir(),
        this.listFolderPaths(),
        this.readFolderState(),
      ]);
      if (this.vault !== vault) return false;
      const sideMs = performance.now() - sideStartedAt;
      this.deps.cacheItems(this.deps.getTrashKey(), trashedItems);
      fsLog.info(`Loaded ${trashedItems.length} trashed notes for vault "${this.vault.name}"`);

      // After the notes: a note that lands on disk creates its folder, and the list read before that
      // would leave the note in a folder the sidebar does not show. `external` keeps this read-only:
      // the list came from the disk, so there is nothing to write back to it.
      const authoritative = folderState.authoritative || Object.keys(fence).length > 0;
      const folders = authoritative ? folderState.folders
        : folderMetaFor(folderPaths, folderState.folders, DEFAULT_INBOX_FOLDER);
      if (authoritative) this.deps.hydrateRegistryFolders(folders);
      else this.deps.persistFolders(folders, 'external');
      fsLog.info(`Found ${folders.length} folders for vault "${this.vault.name}" under ${notesPath}`);

      if (!(await exists(statePath, { baseDir: BaseDirectory.AppData }))) {
        await this.flushStateToDisk();
      }
      // One line with the numbers, because "the start feels slow" is not a measurement: the notes,
      // the side reads and the total answer which of them to touch next.
      fsLog.info('Vault read from disk', {
        vault: this.vault.id,
        notes: loadedItems.length,
        trashed: trashedItems.length,
        folders: folders.length,
        notesMs: Math.round(notesMs),
        sideMs: Math.round(sideMs),
        totalMs: Math.round(performance.now() - startedAt),
      });
      return true;
    } catch (err) {
      fsLog.error(`Failed to sync vault "${this.vault.name}" in AppData:`, err);
      return false;
    }
  }

  /**
   * Every directory under `notes/` is a folder, by vault-relative path. A dot directory is one of
   * the app's own and a `node_modules` is a package dump somebody dropped in: neither is a folder
   * a person made.
   */
  public async listFolderPaths(): Promise<string[]> {
    if (!isTauri()) return [];
    const paths: string[] = [];
    await this.collectFolderPaths(this.getVaultNotesPath(), '', paths);
    return paths.sort();
  }

  private async collectFolderPaths(dirPath: string, relativePath: string, out: string[]): Promise<void> {
    try {
      const entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData });
      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        out.push(path);
        await this.collectFolderPaths(`${dirPath}/${entry.name}`, path, out);
      }
    } catch (err) {
      fsLog.warn(`Failed to list folders under ${dirPath}:`, err);
    }
  }

  /** A folder exists because its directory does, so creating one is creating the directory. */
  public async ensureFolderOnDisk(path: string): Promise<void> {
    if (!isTauri()) return;
    const safe = safeVaultRelativePath(path);
    await mkdir(`${this.getVaultNotesPath()}/${safe}`, { baseDir: BaseDirectory.AppData, recursive: true });
  }

  /** Folder metadata is optional for the index; an unreadable file must still block writes. */
  public async readFoldersMeta(): Promise<FolderMeta[]> {
    return (await this.readFolderState()).folders;
  }

  private async readFolderState(): Promise<{ folders: FolderMeta[]; authoritative: boolean }> {
    const state = await this.readStateObject(this.getVaultStatePath()).catch((error: unknown) => {
      fsLog.warn('Could not read folder metadata:', error);
      return {} as Record<string, unknown>;
    });
    if (!Array.isArray(state.folders)) return { folders: [], authoritative: false };
    const folders: FolderMeta[] = [];
    for (const entry of state.folders) {
      const folder = toFolderMeta(entry);
      if (folder) folders.push(folder);
    }
    return { folders, authoritative: state.registryFolderTree === true };
  }

  /**
   * The one thing `state.json` still knows about folders: metadata by path. The directories are
   * created here too, so what is listed and what exists cannot part ways.
   *
   * Entries the cache has not seen yet are kept as they are: a folder the MCP server created a
   * second ago is not in the cache until the next sweep, and writing the cache straight over the
   * file would throw away the description and icon it just wrote. Every other key is read back and
   * written as it was — the MCP server keeps its own there.
   */
  public writeFolderMeta(folders: FolderMeta[], vault = this.vault, replace = false): Promise<void> {
    if (!isTauri()) return Promise.resolve();
    const statePath = this.getVaultStatePath(vault);
    return this.queueStateWrite(async () => {
      const state = await this.readStateObject(statePath);
      for (const folder of folders) {
        await mkdir(`${this.getVaultNotesPath(vault)}/${safeVaultRelativePath(folder.path)}`, {
          baseDir: BaseDirectory.AppData, recursive: true,
        });
      }
      const byPath = new Map<string, FolderMeta>();
      for (const entry of !replace && Array.isArray(state.folders) ? state.folders : []) {
        const meta = toFolderMeta(entry);
        if (meta) byPath.set(meta.path, meta);
      }
      for (const folder of folders) byPath.set(folder.path, folder);
      state.folders = [...byPath.values()];
      if (replace) state.registryFolderTree = true;
      await writeJsonAtomic(statePath, state);
    });
  }

  public async readStateSection(name: string, vault = this.vault, strict = false): Promise<Record<string, unknown>> {
    const statePath = this.getVaultStatePath(vault);
    await this.stateWrite.catch(() => undefined);
    try {
      const state = await this.readStateObject(statePath);
      const section = state[name];
      if (strict && section !== undefined && (!section || typeof section !== 'object' || Array.isArray(section))) {
        throw new Error(`Invalid vault state section: ${name}`);
      }
      return asStateObject(section);
    } catch (err) {
      if (strict) throw err;
      fsLog.warn(`Failed to read the "${name}" section of state.json:`, err);
      return {};
    }
  }

  /**
   * Writes into one section and leaves every other one — `folders`, `workspace`, the MCP server's
   * own keys — as it is. It goes through the same queue as the folder writer: several writers, one
   * file, one read-merge-write at a time.
   */
  public writeStateSection(name: string, patch: Record<string, unknown> | ((section: Record<string, unknown>) => Record<string, unknown>), vault = this.vault, strict = false, replace = false): Promise<void> {
    if (!isTauri()) return Promise.resolve();
    const statePath = this.getVaultStatePath(vault);
    return this.queueStateWrite(async () => {
      try {
        const state = await this.readStateObject(statePath);
        const section = state[name];
        if (strict && section !== undefined && (!section || typeof section !== 'object' || Array.isArray(section))) {
          throw new Error(`Invalid vault state section: ${name}`);
        }
        const current = asStateObject(section);
        const next = typeof patch === 'function' ? patch(current) : patch;
        state[name] = replace ? next : { ...current, ...next };
        // The first sync write can race native vault hydration before it creates the directory.
        await mkdir(this.getVaultDir(vault), { baseDir: BaseDirectory.AppData, recursive: true });
        await writeJsonAtomic(statePath, state);
      } catch (err) {
        if (strict) throw err;
        fsLog.warn(`Failed to write the "${name}" section of state.json:`, err);
      }
    });
  }

  /** Registry data is not a cache. Never replace corrupt state or hide a failed rename. */
  public async readRegistryState(vault: VaultMeta): Promise<unknown> {
    await this.stateWrite.catch(() => undefined); // Read the last committed copy after a failed write.
    return this.readRegistryFile(vault);
  }

  private async readRegistryFile(vault: VaultMeta): Promise<unknown> {
    const path = `${this.getVaultDir(vault)}/note-registry.json`;
    const text = await readTextFile(path, { baseDir: BaseDirectory.AppData }).catch((error: unknown) => {
      // `exists` can also return false on access errors; those must keep the fence closed.
      if (/\(os error [23]\)$/.test(String(error))) return undefined;
      throw error;
    });
    return text === undefined ? undefined : this.parseStateStrict(text);
  }

  public writeRegistryState(vault: VaultMeta, value: unknown): Promise<void> {
    return this.writeNoteSyncJson(this.getVaultDir(vault), 'note-registry.json', value);
  }

  private writeNoteSyncJson(dir: string, name: string, value: unknown): Promise<void> {
    const path = `${dir}/${name}`;
    return this.queueStateWrite(async () => {
      await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
      await writeJsonAtomic(path, value);
    });
  }

  private parseStateStrict(text: string): Record<string, unknown> {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vault state');
    return value as Record<string, unknown>;
  }

  /** A first run has no file. An existing unreadable file is not an empty journal. */
  private async readStateObject(statePath: string): Promise<Record<string, unknown>> {
    let text: string;
    try {
      text = await readTextFile(statePath, { baseDir: BaseDirectory.AppData });
    } catch (error) {
      // Tauri exposes the Rust I/O error as text. Only file/path-not-found is a first run;
      // plugin-fs `exists` also returns false on permissions errors.
      if (!/\(os error [23]\)$/.test(String(error))) throw error;
      if (statePath === 'vaults/main/state.json') {
        try {
          await readTextFile('state.json', { baseDir: BaseDirectory.AppData });
        } catch (legacyError) {
          if (/\(os error [23]\)$/.test(String(legacyError))) return {};
          throw legacyError;
        }
        throw new Error('Не завершён перенос state.json в основное хранилище');
      }
      return {};
    }
    try {
      return this.parseStateStrict(text);
    } catch (err) {
      await this.backupBrokenState(statePath, text);
      throw new Error('state.json повреждён', { cause: err });
    }
  }

  private async backupBrokenState(statePath: string, text: string): Promise<void> {
    try {
      await writeTextFile(`${statePath}.broken`, text, { baseDir: BaseDirectory.AppData });
    } catch (err) {
      fsLog.error('Could not keep a copy of the broken state.json:', err);
    }
  }

  /**
   * Reads the notes under these vault-relative paths back into items, without touching the index.
   * The caller owns the merge: this class knows the on-disk format, not what an index is.
   *
   * Only a path confirmed absent lands in `missing`. Failure to read an existing file is not a deletion.
   */
  public async reloadNotesFromDisk(relativePaths: string[], includeInlineTags = true) {
    const notesBase = this.getVaultNotesPath();
    const items: SlagItem[] = [];
    const missing: string[] = [];
    const markers = new Map<SlagItem, string>();

    for (const relativePath of relativePaths) {
      let safe: string;
      try {
        safe = safeVaultRelativePath(relativePath);
      } catch (error) {
        fsLog.warn('Ignored invalid path from vault watcher', error);
        continue;
      }
      const slash = safe.lastIndexOf('/');
      const folder = slash >= 0 ? safe.slice(0, slash) : DEFAULT_INBOX_FOLDER;
      const filename = slash >= 0 ? safe.slice(slash + 1) : safe;
      try {
        const content = await readTextFile(`${notesBase}/${safe}`, { baseDir: BaseDirectory.AppData });
        let marker: string | undefined;
        const parsed = parseMarkdownToItem(content, filename.replace(/\.md$/, ''), folder, (value) => { marker = value; }, includeInlineTags);
        if (marker) markers.set(parsed, marker);
        parsed.filename = filename;
        items.push(parsed);
      } catch (error) {
        if (!(await exists(`${notesBase}/${safe}`, { baseDir: BaseDirectory.AppData }))) missing.push(relativePath);
        else fsLog.warn('Unable to read existing note from vault watcher', error);
      }
    }

    return { items, missing, markers };
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
        .then(() => this.syncCurrentVaultFs());
    }
    return this.tauriInitialization;
  }

  /**
   * The trashed notes, newest first. `.trash/` is flat — `removeItemFromDisk` writes one file per
   * note and never nests — and a note keeps its frontmatter, so its folder survives the trip and
   * a restore knows where to put it back. A missing or unreadable directory is an empty trash.
   */
  public async scanTrashDir(): Promise<SlagItem[]> {
    const trashPath = this.getVaultTrashPath();
    let entries: Awaited<ReturnType<typeof readDir>>;
    try {
      entries = await readDir(trashPath, { baseDir: BaseDirectory.AppData });
    } catch (err) {
      fsLog.warn(`No trash directory to scan for vault "${this.vault.name}"`, { error: String(err) });
      return [];
    }

    const files = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith('.md'));
    const items: SlagItem[] = [];
    // Bounded parallelism, same as the notes scan: every `readTextFile` is one IPC round trip, and
    // a vault with a few hundred trashed notes spent over a second here one file at a time. Batches
    // keep the read order, so ties on `updatedAt` still sort the way the serial loop left them.
    const CONCURRENCY = NOTE_READ_CONCURRENCY;
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      const parsed = await Promise.all(
        batch.map(async (entry) => {
          const subPath = `${trashPath}/${entry.name}`;
          try {
            const content = await readTextFile(subPath, { baseDir: BaseDirectory.AppData });
            // The folder comes from the frontmatter; the inbox is only a fallback for a file written
            // before a folder was part of the format.
            const item = parseMarkdownToItem(content, entry.name.replace(/\.md$/, ''), DEFAULT_INBOX_FOLDER);
            item.filename = entry.name;
            return item;
          } catch (err) {
            fsLog.warn(`Failed to read trashed note ${subPath}:`, err);
            return null;
          }
        }),
      );
      for (const item of parsed) {
        if (item) items.push(item);
      }
    }
    return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  public async readProjectionCopies(vault: VaultMeta, ids: Set<string>): Promise<SlagItem[]> {
    return (await this.scanNotesDir(this.getVaultNotesPath(vault), vault, true)).filter(({ id }) => ids.has(id));
  }

  public async readRegistryNoteCopies(vault: VaultMeta, ids: Set<string>) {
    const markers = new Map<SlagItem, string>();
    const path = this.getVaultNotesPath(vault);
    const items = await this.scanNotesDir(path, vault, true, markers);
    return items.filter(({ id }) => ids.has(id)).map((item) => ({ item, marker: markers.get(item) }));
  }

  public async removeProjectionCopy(copy: SlagItem, vault: VaultMeta): Promise<void> {
    const folder = copy.folder ? `${safeVaultRelativePath(copy.folder)}/` : '';
    const filename = safeVaultRelativePath(copy.filename || '');
    if (filename.includes('/') || !filename.endsWith('.md')) throw new Error('Invalid projection filename');
    const path = `${this.getVaultNotesPath(vault)}/${folder}${filename}`;
    if (await this.fileBelongsTo(path, copy.id, true)) await remove(path, { baseDir: BaseDirectory.AppData });
  }

  private async scanNotesDir(dirPath: string, vault = this.vault, strict = false, markers?: Map<SlagItem, string>): Promise<SlagItem[]> {
    const items: SlagItem[] = [];
    try {
      const entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData });
      const normalized = dirPath.replace(/\\/g, '/');
      const notesBase = this.getVaultNotesPath(vault).replace(/\\/g, '/');
      const folderPart = normalized.startsWith(notesBase + '/')
        ? normalized.slice(notesBase.length + 1)
        : (normalized === notesBase ? DEFAULT_INBOX_FOLDER : normalized);

      // Read this directory's notes with bounded parallelism. Read order is restored
      // below by walking `entries` in readDir order, so a tie on `updatedAt` still
      // resolves to the first file, exactly like the serial loop did.
      const noteFiles = entries.filter((entry) => !entry.isDirectory && entry.name.endsWith('.md'));
      const parsedByName = new Map<string, SlagItem>();
      const CONCURRENCY = NOTE_READ_CONCURRENCY;
      for (let i = 0; i < noteFiles.length; i += CONCURRENCY) {
        const batch = noteFiles.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (entry) => {
            const subPath = `${dirPath}/${entry.name}`;
            try {
              const content = await readTextFile(subPath, { baseDir: BaseDirectory.AppData });
              const fallbackId = entry.name.replace(/\.md$/, '');
              let marker: string | undefined;
              const parsed = parseMarkdownToItem(content, markers ? '' : fallbackId, folderPart, (value) => { marker = value; }, !markers);
              if (markers && marker) markers.set(parsed, marker);
              parsed.filename = entry.name;
              return [entry.name, parsed] as const;
            } catch (e) {
              if (strict) throw e;
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
          // Dot directories belong to the app: `.trash` holds deleted notes, `.attachments` holds
          // files. Walking into them would put deleted notes back in the feed — and the folder
          // list skips them too, so a note from there would land in a folder nothing draws.
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const nested = await this.scanNotesDir(subPath, vault, strict, markers);
          for (const nestedItem of nested) {
            if (!firstIndexById.has(nestedItem.id)) {
              firstIndexById.set(nestedItem.id, items.length);
            }
            items.push(nestedItem);
          }
        } else if (entry.name.endsWith('.md')) {
          const parsed = parsedByName.get(entry.name);
          if (!parsed) continue;
          if (strict) {
            // Recovery needs physical paths, including both copies if a move stopped after write.
            parsed.folder = normalized === notesBase ? '' : folderPart;
            items.push(parsed);
            continue;
          }
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
      if (strict) throw err;
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
  private async freeTrashFilename(trashBase: string, filename: string, id: string, strict: boolean): Promise<string> {
    const options = { baseDir: BaseDirectory.AppData };
    let candidate = filename;
    for (let n = 1; await exists(`${trashBase}/${candidate}`, options); n++) {
      // A replay after writing trash but before deleting the source must not make another copy.
      if (strict && await this.fileBelongsTo(`${trashBase}/${candidate}`, id, true)) break;
      candidate = withIdSuffix(n === 1 ? filename : `${filename.slice(0, -3)}-${n}.md`, id);
    }
    return candidate;
  }

  /** A file on disk is this note's only if its frontmatter says so. */
  private async fileBelongsTo(path: string, id: string, strict = false): Promise<boolean> {
    try {
      if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return false;
      const text = await readTextFile(path, { baseDir: BaseDirectory.AppData });
      return parseMarkdownToItem(text, '').id === id;
    } catch (error) {
      if (strict) throw error;
      return false;
    }
  }

  public async flushItemToDisk(item: SlagItem, oldFolder?: string, oldFilename?: string, vault: VaultMeta = this.vault, strict = false, protectedPaths = new Set<string>(), registryBodyMarker?: string): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath(vault);
      const folder = safeVaultRelativePath(item.folder || DEFAULT_INBOX_FOLDER);
      const targetDir = `${notesBase}/${folder}`;
      await mkdir(targetDir, { baseDir: BaseDirectory.AppData, recursive: true });

      const baseDir = BaseDirectory.AppData;
      let newFilename = safeVaultRelativePath(this.claimNoteFilename(item, folder));
      if (newFilename.includes('/')) throw new Error('Invalid note filename');
      if (strict) {
        const base = newFilename;
        for (let n = 1; await exists(`${targetDir}/${newFilename}`, { baseDir }) &&
          !(await this.fileBelongsTo(`${targetDir}/${newFilename}`, item.id, true)); n++) {
          newFilename = withIdSuffix(n === 1 ? base : `${base.slice(0, -3)}-${n}.md`, item.id);
        }
      }
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
      const content = serializeItemToMarkdown(item, registryBodyMarker);
      if (strict) await writeAppDataTextAtomic(newPath, content);
      else await writeTextFile(newPath, content, { baseDir });
      if (vault.id === this.vault.id) await this.deps.attachments.persistAll(item);

      // The old path may be somebody else's file when two notes shared a title, so a rename
      // only deletes a file that is really this note.
      if (oldPath !== newPath && !protectedPaths.has(oldPath) && await this.fileBelongsTo(oldPath, item.id, strict)) {
        await remove(oldPath, { baseDir: BaseDirectory.AppData });
      }
      for (const path of new Set([legacyOldPath, legacyTargetPath])) {
        if (path && path !== newPath && !protectedPaths.has(path) &&
          await (strict ? this.fileBelongsTo(path, item.id, true) : exists(path, { baseDir }))) await remove(path, { baseDir });
      }

    } catch (err) {
      fsLog.error(`Failed to flush note ${item.id} to disk:`, err);
      if (strict) throw err;
    }
  }

  public async removeItemFromDisk(item: SlagItem, vault: VaultMeta = this.vault, strict = false, discardLiveCopy = false): Promise<void> {
    if (!isTauri()) return;
    try {
      const notesBase = this.getVaultNotesPath(vault);
      const trashBase = this.getVaultTrashPath(vault);
      // The strict recovery scanner uses an empty folder for a physical file at notes root.
      const targetDir = strict && item.folder === '' ? notesBase : `${notesBase}/${safeVaultRelativePath(item.folder || DEFAULT_INBOX_FOLDER)}`;
      const filename = safeVaultRelativePath(item.filename || getSafeNoteFilename(item.title, item.id));
      if (filename.includes('/')) throw new Error('Invalid note filename');
      const notePath = `${targetDir}/${filename}`;
      const legacyPath = isSafeVaultRelativePath(item.id)
        ? `${targetDir}/${item.id}.md`
        : '';

      const baseDir = BaseDirectory.AppData;
      const owns = (path: string) => strict ? this.fileBelongsTo(path, item.id, true) : exists(path, { baseDir });
      const pathToRemove = (await owns(notePath)) ? notePath : (legacyPath && await owns(legacyPath) ? legacyPath : null);

      if (pathToRemove) {
        if (!discardLiveCopy) {
          await mkdir(trashBase, { baseDir, recursive: true });
          const content = await readTextFile(pathToRemove, { baseDir });
          const trashPath = `${trashBase}/${await this.freeTrashFilename(trashBase, filename, item.id, strict)}`;
          if (strict) await writeAppDataTextAtomic(trashPath, content);
          else await writeTextFile(trashPath, content, { baseDir });
        }
        await remove(pathToRemove, { baseDir });
      }
    } catch (err) {
      fsLog.error(`Failed to remove note ${item.id} from disk:`, err);
      if (strict) throw err;
    }
  }

  public async restoreItemOnDisk(item: SlagItem, vault: VaultMeta = this.vault, strict = false): Promise<void> {
    if (!isTauri()) return;
    try {
      const filenameInTrash = item.filename;
      await this.flushItemToDisk(item, undefined, undefined, vault, true);
      await this.removeTrashCopy(item, filenameInTrash, vault);
    } catch (err) {
      fsLog.error(`Failed to restore note ${item.id} on disk:`, err);
      if (strict) throw err;
    }
  }

  public async removeTrashCopy(item: SlagItem, previousFilename: string | undefined, vault: VaultMeta): Promise<void> {
    if (!isTauri()) return;
    const trashBase = this.getVaultTrashPath(vault);
    const filename = safeVaultRelativePath(previousFilename || getSafeNoteFilename(item.title, item.id));
    if (filename.includes('/')) throw new Error('Invalid note filename');
    const safeId = isSafeVaultRelativePath(item.id) ? item.id : null;
    for (const candidate of new Set([filename, withIdSuffix(filename, item.id), ...(safeId ? [`${safeId}.md`] : [])])) {
      const path = `${trashBase}/${candidate}`;
      if (await this.fileBelongsTo(path, item.id, true)) await remove(path, { baseDir: BaseDirectory.AppData });
    }
  }

  /**
   * `state.json` keeps what the disk cannot say: the workspace. Folders are directories now, so
   * this must never put a list of them over one the MCP server wrote.
   */
  public flushStateToDisk(strict = false): Promise<void> {
    if (!isTauri()) return Promise.resolve();
    const vault = this.vault;
    const statePath = this.getVaultStatePath(vault);
    const workspace = this.deps.getWorkspaceState();
    return this.queueStateWrite(async () => {
      try {
        const state = await this.readStateObject(statePath);
        const enrolled = hasSharedRegistryEnrollment(await this.readRegistryFile(vault));
        state.workspace = enrolled ? mergeRegistryDeviceWorkspace(asStateObject(state.workspace), workspace) : workspace;
        await writeJsonAtomic(statePath, state);
      } catch (err) {
        if (strict) throw err;
        fsLog.warn(`Failed to flush state.json to disk:`, err);
      }
    });
  }

  public async deleteFolderOnDisk(path: string, movedItems: { item: SlagItem; oldFolder: string }[], vault = this.vault, strict = false): Promise<void> {
    if (!isTauri()) return;
    try {
      // 1. Move notes to Inbox on disk and remove old note files from deleted folder
      for (const { item, oldFolder } of movedItems) {
        await this.flushItemToDisk(item, oldFolder, item.filename, vault, strict);
      }
      await this.removeFolderFromDisk(path, vault);
      if (vault.id === this.vault.id) await this.flushStateToDisk();
    } catch (err) {
      fsLog.error(`Failed to complete disk deletion for folder "${path}":`, err);
      if (strict) throw err;
    }
  }

  public async renameFolderOnDisk(oldPath: string, newPath: string, items: SlagItem[], vault = this.vault, strict = false): Promise<void> {
    if (!isTauri()) return;
    try {
      for (const it of items) {
        if (it.folder === newPath || it.folder.startsWith(newPath + '/')) {
          const originalSub = it.folder === newPath
            ? oldPath
            : oldPath + it.folder.slice(newPath.length);
          await this.flushItemToDisk(it, originalSub, it.filename, vault, strict);
        }
      }
      await this.removeFolderFromDisk(oldPath, vault);
      if (vault.id === this.vault.id) await this.flushStateToDisk();
    } catch (err) {
      fsLog.error(`Failed to complete disk rename for folder "${oldPath}" to "${newPath}":`, err);
      if (strict) throw err;
    }
  }

  public async removeFolderFromDisk(folderPath: string, vault = this.vault): Promise<void> {
    if (!isTauri() || !folderPath || folderPath === DEFAULT_INBOX_FOLDER) return;
    try {
      const safeFolder = safeVaultRelativePath(folderPath);
      const notesBase = this.getVaultNotesPath(vault);
      const targetDir = `${notesBase}/${safeFolder}`;
      if (await exists(targetDir, { baseDir: BaseDirectory.AppData })) {
        // Directory membership is not permission to delete a note. Non-recursive removal also
        // protects a file created by another writer between this check and the remove call.
        if ((await readDir(targetDir, { baseDir: BaseDirectory.AppData })).length > 0) return;
        await remove(targetDir, { baseDir: BaseDirectory.AppData, recursive: false });
        fsLog.info(`Removed folder directory from disk: ${targetDir}`);
      }
    } catch (err) {
      fsLog.warn(`Failed to remove folder directory ${folderPath} from disk:`, err);
    }
  }

}

/**
 * `state.json` is a file people and older builds write too. An entry counts as folder metadata only
 * when the path is there; the rest of the fields fall back to what the folder would be without them.
 */
function toFolderMeta(value: unknown): FolderMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || record.path.length === 0) return undefined;

  const folder: FolderMeta = {
    path: record.path,
    name: typeof record.name === 'string' && record.name.length > 0 ? record.name : record.path,
    description: typeof record.description === 'string' ? record.description : '',
  };
  if (typeof record.icon === 'string') folder.icon = record.icon;
  if (isFolderColor(record.color)) folder.color = record.color;
  if (typeof record.order === 'number' && Number.isFinite(record.order)) folder.order = record.order;
  if (typeof record.showReferenceColumn === 'boolean') folder.showReferenceColumn = record.showReferenceColumn;
  if (Array.isArray(record.kanbanColumns)) folder.kanbanColumns = record.kanbanColumns.filter(isKanbanColumn);
  return folder;
}

function isKanbanColumn(value: unknown): value is KanbanColumn {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string';
}

/** A section of `state.json` is a plain object or it is nothing: an array would take keys silently. */
function asStateObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
