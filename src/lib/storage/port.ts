// The slice of the vault that sync may touch. The app backs it with StorageService, the headless
// node with a folder on disk; everything above this line is the same code on both.
import type {
  ComposerDraft,
  FolderMeta,
  FullscreenDraft,
  MemoryItem,
  SlagAttachment,
  SlagItem,
  VaultMeta,
  WorkspaceState,
} from '../../types';
import type { StorageChangeEvent } from './index';
import { storage } from './index';

export type ChangeOrigin = 'local' | 'remote';

/** What a synced bundle writes back: notes, folders and the kanban/views state. */
export interface SyncedVaultData {
  items?: SlagItem[];
  folders?: FolderMeta[];
  /**
   * Notes the bundle deleted. The only ids the write may take off the disk: what a bundle does not
   * mention is a note it never touched, not one it removed.
   */
  removedIds?: string[];
  workspaceState?: WorkspaceState;
}

export interface VaultPort {
  getCurrentVault(): VaultMeta;
  getVaults(): VaultMeta[];
  ensureVaultSyncId(vaultId: string): string;

  /**
   * Whether the vault has been read from its storage. Sync asks before it pushes: a bundle built
   * from an index that is still loading describes an empty vault, and the relay believes it.
   */
  isHydrated(): boolean;

  getItems(): SlagItem[];
  getFolders(): FolderMeta[];
  getWorkspaceState(): WorkspaceState;
  getMemory(): MemoryItem[];
  saveMemory(items: MemoryItem[], origin?: ChangeOrigin): boolean;

  importSyncedVaultData(data: SyncedVaultData): Promise<void>;
  /** `false` means the bytes did not reach the disk; the caller must not treat them as delivered. */
  importSyncedAttachment(attachment: SlagAttachment, dataUrl: string): Promise<boolean>;
  getAttachmentDataUrl(attachment: SlagAttachment): Promise<string | undefined>;
  /** Whether this device can actually read the bytes, without base64-ing them. */
  hasAttachmentBytes(id: string, relativePath: string): Promise<boolean>;

  // Drafts are per-device and never leave the device that wrote them, so the node returns null.
  getComposerDraft(folderPath: string): ComposerDraft | null;
  saveComposerDraft(folderPath: string, draft: ComposerDraft, origin?: ChangeOrigin): void;
  deleteComposerDraft(folderPath: string, origin?: ChangeOrigin): void;
  getFullscreenDraft(itemId: string): FullscreenDraft | null;
  saveFullscreenDraft(itemId: string, draft: FullscreenDraft, origin?: ChangeOrigin): void;
  clearFullscreenDraft(itemId: string, origin?: ChangeOrigin): void;

  subscribeChanges(listener: (event: StorageChangeEvent) => void): () => void;
}

let registered: VaultPort | null = null;

/** The headless node calls this before it imports the engine; the browser never needs to. */
export function setVaultPort(port: VaultPort): void {
  registered = port;
}

/** The app's own store is the default so the app cannot boot into "port is missing". */
export function vault(): VaultPort {
  return registered ?? storage;
}
