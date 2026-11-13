// The vault as the headless node sees it: notes are files under `notes/`, everything the sync
// protocol treats as state lives in `state.json`. Reads are synchronous because the sync core
// reads synchronously; writes go to disk immediately so a crash cannot lie about what is stored.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ComposerDraft,
  FolderMeta,
  FullscreenDraft,
  MemoryItem,
  SlagAttachment,
  SlagItem,
  VaultMeta,
  WorkspaceState,
} from '../types';
import type { ChangeOrigin, SyncedVaultData, VaultPort } from '../lib/storage/port';
import type { StorageChangeEvent } from '../lib/storage';
import { parseMarkdownToItem, serializeItemToMarkdown } from '../lib/vault/markdownSerializer';
import { getSafeNoteFilename } from '../lib/vault/noteFilename';
import { safeVaultRelativePath } from '../lib/vault/safePath';
import { DEFAULT_INBOX_FOLDER, DEFAULT_WORKSPACE_STATE } from '../config';

interface VaultStateFile {
  vault: { id: string; name: string; syncId?: string };
  folders: FolderMeta[];
  workspaceState: WorkspaceState;
  memory: MemoryItem[];
}

const STATE_FILE = 'state.json';

export class NodeVault implements VaultPort {
  public readonly root: string;
  public readonly notesDir: string;
  public readonly trashDir: string;
  public readonly attachmentsDir: string;

  private items: SlagItem[] = [];
  private byId = new Map<string, SlagItem>();
  private paths = new Map<string, string>();
  private folders: FolderMeta[] = [];
  private workspaceState: WorkspaceState = DEFAULT_WORKSPACE_STATE;
  private memory: MemoryItem[] = [];
  private vault: VaultStateFile['vault'];
  private listeners = new Set<(event: StorageChangeEvent) => void>();

  constructor(root: string, vaultName = 'main') {
    this.root = path.resolve(root);
    this.notesDir = path.join(this.root, 'notes');
    this.trashDir = path.join(this.root, '.trash');
    this.attachmentsDir = path.join(this.root, '.attachments');
    this.vault = { id: 'default_vault', name: vaultName };
  }

  /** Boot: make the layout, read the state file, and index every note on disk. */
  public load(): void {
    for (const dir of [this.notesDir, this.trashDir, this.attachmentsDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const state = this.readState();
    this.vault = state.vault;
    this.folders = state.folders;
    this.workspaceState = state.workspaceState;
    this.memory = state.memory;
    this.scanDir(this.notesDir);
  }

  public get noteCount(): number {
    return this.items.length;
  }

  // ---- VaultPort ---------------------------------------------------------

  public getCurrentVault(): VaultMeta {
    return { id: this.vault.id, name: this.vault.name, path: this.notesDir, mode: 'fsa', isCurrent: true, syncId: this.vault.syncId };
  }

  public getVaults(): VaultMeta[] {
    return [this.getCurrentVault()];
  }

  public ensureVaultSyncId(vaultId: string): string {
    if (this.vault.id === vaultId && this.vault.syncId) return this.vault.syncId;
    if (vaultId !== this.vault.id) throw new Error(`Unknown vault: ${vaultId}`);
    // Account grants are keyed by this id, so it must stay stable across restarts.
    this.vault = { ...this.vault, syncId: `vault_${randomUUID()}` };
    this.writeState();
    return this.vault.syncId as string;
  }

  /** `login --vault <syncId>` pins the node to the vault the account already knows. */
  public adoptSyncId(syncId: string): void {
    this.vault = { ...this.vault, syncId };
    this.writeState();
  }

  public getItems(): SlagItem[] {
    return this.items.slice();
  }

  public getFolders(): FolderMeta[] {
    return this.folders.slice();
  }

  public getWorkspaceState(): WorkspaceState {
    return this.workspaceState;
  }

  public getMemory(): MemoryItem[] {
    return this.memory.slice();
  }

  public saveMemory(items: MemoryItem[], origin: ChangeOrigin = 'local'): boolean {
    this.memory = items.slice();
    this.writeState();
    if (origin === 'local') this.emit({ kind: 'memory', action: 'upsert', id: `memory:${items.length}` });
    return true;
  }

  public async importSyncedVaultData(data: SyncedVaultData): Promise<void> {
    if (data.items) this.applyItems(data.items);
    if (data.folders) {
      this.folders = data.folders.slice();
      this.writeState();
    }
    if (data.workspaceState) {
      this.workspaceState = { ...this.workspaceState, ...data.workspaceState };
      this.writeState();
    }
  }

  public async importSyncedAttachment(attachment: SlagAttachment, dataUrl: string): Promise<void> {
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes) throw new Error(`Attachment ${attachment.id} arrived without usable bytes`);
    const target = path.join(this.attachmentsDir, safeAttachmentName(attachment));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }

  public async getAttachmentDataUrl(attachment: SlagAttachment): Promise<string | undefined> {
    const target = path.join(this.attachmentsDir, safeAttachmentName(attachment));
    try {
      const bytes = fs.readFileSync(target);
      return `data:${attachment.mimeType || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
    } catch {
      // No bytes on this device is a normal state, not an error: the note still renders.
      return undefined;
    }
  }

  public getComposerDraft(): ComposerDraft | null {
    return null;
  }

  public saveComposerDraft(): void {
    // Drafts are per-device by contract; the node has nobody to draft for.
  }

  public deleteComposerDraft(): void {
    // Same.
  }

  public getFullscreenDraft(): FullscreenDraft | null {
    return null;
  }

  public saveFullscreenDraft(): void {
    // Same.
  }

  public clearFullscreenDraft(): void {
    // Same.
  }

  public subscribeChanges(listener: (event: StorageChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- disk --------------------------------------------------------------

  private applyItems(incoming: SlagItem[]): void {
    const incomingIds = new Set<string>();
    for (const item of incoming) {
      incomingIds.add(item.id);
      // `getItems` hands out the same objects, so an untouched note keeps its reference and
      // costs nothing here; only what a bundle actually replaced gets rewritten.
      if (this.byId.get(item.id) === item) continue;
      this.writeItem(item);
    }

    for (const existing of [...this.items]) {
      if (incomingIds.has(existing.id)) continue;
      this.trashItemFile(existing.id);
      this.byId.delete(existing.id);
      this.emit({ kind: 'item', action: 'delete', id: existing.id, origin: 'remote' });
    }

    this.items = incoming.slice();
    this.byId = new Map(this.items.map((item) => [item.id, item]));
  }

  private writeItem(item: SlagItem): void {
    const folder = item.folder && item.folder !== DEFAULT_INBOX_FOLDER ? safeVaultRelativePath(item.folder) : '';
    const filename = item.filename && item.filename.endsWith('.md')
      ? path.basename(item.filename)
      : getSafeNoteFilename(item.title, item.id);
    const target = path.join(this.notesDir, folder, filename);

    const previous = this.paths.get(item.id);
    if (previous && previous !== target) removeQuietly(previous);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeAtomic(target, serializeItemToMarkdown({ ...item, filename }));
    this.paths.set(item.id, target);
  }

  private trashItemFile(id: string): void {
    const source = this.paths.get(id);
    if (!source) return;
    this.paths.delete(id);
    const target = path.join(this.trashDir, `${Date.now()}-${path.basename(source)}`);
    try {
      fs.renameSync(source, target);
    } catch {
      // A file that already vanished is not a failure: the index is the source of truth here.
      removeQuietly(source);
    }
  }

  private scanDir(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scanDir(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const relativeDir = path.relative(this.notesDir, dir);
      const folder = relativeDir ? relativeDir.split(path.sep).join('/') : DEFAULT_INBOX_FOLDER;
      const stem = entry.name.slice(0, -'.md'.length);
      const raw = fs.readFileSync(full, 'utf-8');
      const item = parseMarkdownToItem(raw, stem, folder);
      item.filename = entry.name;
      item.folder = folder;
      this.items.push(item);
      this.byId.set(item.id, item);
      this.paths.set(item.id, full);
    }
  }

  private readState(): VaultStateFile {
    const file = path.join(this.root, STATE_FILE);
    const fallback: VaultStateFile = {
      vault: this.vault,
      folders: [],
      workspaceState: DEFAULT_WORKSPACE_STATE,
      memory: [],
    };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<VaultStateFile>;
      return {
        vault: parsed.vault ?? fallback.vault,
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        workspaceState: parsed.workspaceState ?? fallback.workspaceState,
        memory: Array.isArray(parsed.memory) ? parsed.memory : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.stderr.write(`slag-node: could not read ${file}: ${String(error)}\n`);
      }
      return fallback;
    }
  }

  private writeState(): void {
    const file = path.join(this.root, STATE_FILE);
    const payload: VaultStateFile = {
      vault: this.vault,
      folders: this.folders,
      workspaceState: this.workspaceState,
      memory: this.memory,
    };
    writeAtomic(file, JSON.stringify(payload, null, 2));
  }

  private emit(event: StorageChangeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

function removeQuietly(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    // Already gone is the outcome we wanted.
  }
}

function safeAttachmentName(attachment: SlagAttachment): string {
  const relative = safeVaultRelativePath(attachment.relativePath || attachment.name);
  return path.join(path.dirname(relative), `${attachment.id}-${path.basename(relative)}`);
}

function dataUrlToBytes(dataUrl: string): Buffer | null {
  const marker = dataUrl.indexOf(',');
  if (marker < 0) return null;
  return Buffer.from(dataUrl.slice(marker + 1), 'base64');
}
