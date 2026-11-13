// The vault interchange format: export, import and backup JSON, apart from persistence.
import type {
  ChatMessage,
  ComposerDraft,
  FolderMeta,
  MemoryItem,
  SlagItem,
  VaultMeta,
  WorkspaceState,
} from '../../types';
import { logger } from '../logger/logger';

/**
 * Moving a vault in and out. This is the interchange format — a backup file, a
 * relay bundle, an Obsidian drop — and it changes when that contract changes,
 * not when note persistence does. Keeping it apart also keeps the storage
 * service from owning `JSON.stringify` of its own guts.
 */

const transferLog = logger.scope('FS');

export interface VaultSnapshot {
  vault: VaultMeta;
  folders: FolderMeta[];
  items: SlagItem[];
  assistantHistory: ChatMessage[];
  memory: MemoryItem[];
  workspaceState: WorkspaceState;
  composerDrafts: Record<string, ComposerDraft>;
}

export function buildVaultExportJson(snapshot: VaultSnapshot): string {
  return JSON.stringify(
    {
      vault: snapshot.vault,
      folders: snapshot.folders,
      items: snapshot.items,
      assistantHistory: snapshot.assistantHistory,
      memory: snapshot.memory,
      workspaceState: snapshot.workspaceState,
      composerDrafts: snapshot.composerDrafts,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

/** The little bit of the storage service an import needs. */
export interface VaultImportIo {
  foldersKey(): string;
  itemsKey(): string;
  draftsKey(): string;
  cacheItems(key: string, items: SlagItem[]): void;
  saveAssistantHistory(messages: ChatMessage[]): void;
  saveMemory(items: MemoryItem[]): void;
  saveWorkspaceState(state: Partial<WorkspaceState>, origin: 'local' | 'remote'): void;
}

export interface VaultImportPayload {
  folders?: FolderMeta[];
  items?: SlagItem[];
  assistantHistory?: ChatMessage[];
  memory?: MemoryItem[];
  workspaceState?: WorkspaceState;
  composerDrafts?: Record<string, ComposerDraft>;
}

export function importVaultPayload(data: VaultImportPayload, io: VaultImportIo): boolean {
  try {
    if (Array.isArray(data.folders) && data.folders.length > 0) {
      localStorage.setItem(io.foldersKey(), JSON.stringify(data.folders));
    }
    if (Array.isArray(data.items)) {
      io.cacheItems(io.itemsKey(), data.items);
    }
    if (Array.isArray(data.assistantHistory)) {
      io.saveAssistantHistory(data.assistantHistory);
    }
    if (Array.isArray(data.memory)) {
      io.saveMemory(data.memory);
    }
    if (data.workspaceState && typeof data.workspaceState === 'object') {
      io.saveWorkspaceState(data.workspaceState, 'remote');
    }
    if (data.composerDrafts && typeof data.composerDrafts === 'object') {
      try {
        localStorage.setItem(io.draftsKey(), JSON.stringify(data.composerDrafts));
      } catch {
        // a full quota must not abort the rest of the import
      }
    }
    transferLog.info(
      `Imported vault data: ${data.items?.length || 0} items, ${data.folders?.length || 0} folders`,
    );
    return true;
  } catch (err) {
    transferLog.error('Failed to import vault data:', err);
    return false;
  }
}

export function parseVaultBackup(jsonString: string): VaultImportPayload | null {
  try {
    return JSON.parse(jsonString) as VaultImportPayload;
  } catch (err) {
    transferLog.error('Failed to import vault JSON backup:', err);
    return null;
  }
}
