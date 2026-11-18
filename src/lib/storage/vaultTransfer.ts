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
import { replaceComposerDrafts } from './settingsStore';

/**
 * Moving a vault in and out. This is the interchange format — a backup file, a
 * relay bundle, an Obsidian drop — and it changes when that contract changes,
 * not when note persistence does. Keeping it apart also keeps the storage
 * service from owning `JSON.stringify` of its own guts.
 *
 * It writes no cache of its own: folders live in the directories and their metadata in
 * `state.json.folders`, and the drafts go through the writer in `settingsStore`, which is the one
 * place that knows where they belong now.
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
  /** Still named by the caller, no longer written here: the folders are the directories' business. */
  foldersKey(): string;
  itemsKey(): string;
  /** The old draft key: the drafts are written through `settingsStore` now, so it stays for the caller. */
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
    // The folder list is not cached here any more: a directory is what makes a folder, and
    // `state.json.folders` only dresses it. Writing the imported list would be a third opinion.
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
      replaceComposerDrafts(data.composerDrafts);
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
