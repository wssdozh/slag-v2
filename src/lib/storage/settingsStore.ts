// Small settings and drafts: which localStorage keys are kept and how they are read.
import type {
  ChatMessage,
  ComposerDraft,
  FolderViewSettings,
  FullscreenDraft,
  VaultMeta,
  WorkspaceState,
} from '../../types';
import { DEFAULT_FOLDER_VIEW_SETTINGS } from '../../types';
import { DEFAULT_WORKSPACE_STATE, STORAGE_KEYS } from '../../config';
import { logger } from '../logger/logger';
import { stripAttachmentList } from './attachmentData';
import type { StorageChangeEvent } from '.';

const fsLog = logger.scope('FS');

export interface SettingsStoreHost {
  currentVault: VaultMeta;
  instanceId: string;
  getDraftChannel(): BroadcastChannel | null;
  emitChange(event: StorageChangeEvent): void;
}

export function draftsStorageKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.DRAFTS_PREFIX}${store.currentVault.id}`;
}

export function workspaceStateStorageKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${store.currentVault.id}`;
}

function fullscreenDraftsKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX}${store.currentVault.id}`;
}

function assistantStorageKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.ASSISTANT_PREFIX}${store.currentVault.id}`;
}

// Composer Drafts
export function readComposerDrafts(store: SettingsStoreHost): Record<string, ComposerDraft> {
  const raw = localStorage.getItem(draftsStorageKey(store));
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, ComposerDraft> : {};
  } catch {
    return {};
  }
}

export function readComposerDraft(store: SettingsStoreHost, folderPath: string): ComposerDraft | null {
  const all = readComposerDrafts(store);
  return all[folderPath] || null;
}

export function writeComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  draft: ComposerDraft,
  origin: 'local' | 'remote' = 'local'
): void {
  try {
    const all = readComposerDrafts(store);
    all[folderPath] = { ...draft, attachments: stripAttachmentList(draft.attachments || []) };
    localStorage.setItem(draftsStorageKey(store), JSON.stringify(all));
    store.emitChange({
      kind: 'draft',
      action: 'upsert',
      id: `composer:${folderPath}`,
      payload: draft,
      origin,
    });
    const channel = store.getDraftChannel();
    if (origin === 'local' && channel) {
      try {
        channel.postMessage({
          type: 'DRAFT_CHANGED',
          senderId: store.instanceId,
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

export function eraseComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  origin: 'local' | 'remote' = 'local'
): void {
  try {
    const all = readComposerDrafts(store);
    const had = folderPath in all;
    if (had) {
      delete all[folderPath];
      localStorage.setItem(draftsStorageKey(store), JSON.stringify(all));
    }
    const draftTombKey = `slag_sync_draft_tomb_${store.currentVault.id}_composer:${folderPath}`;
    localStorage.setItem(draftTombKey, String(Date.now()));
    store.emitChange({
      kind: 'draft',
      action: 'delete',
      id: `composer:${folderPath}`,
      origin,
    });
    const channel = store.getDraftChannel();
    if (origin === 'local' && channel) {
      try {
        channel.postMessage({
          type: 'DRAFT_CHANGED',
          senderId: store.instanceId,
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

// Fullscreen Drafts
export function readFullscreenDraft(store: SettingsStoreHost, itemId: string): FullscreenDraft | null {
  try {
    const raw = localStorage.getItem(`${fullscreenDraftsKey(store)}_${itemId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeFullscreenDraft(
  store: SettingsStoreHost,
  itemId: string,
  draft: FullscreenDraft,
  origin: 'local' | 'remote' = 'local'
): void {
  try {
    localStorage.setItem(`${fullscreenDraftsKey(store)}_${itemId}`, JSON.stringify(draft));
    store.emitChange({
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

export function eraseFullscreenDraft(
  store: SettingsStoreHost,
  itemId: string,
  origin: 'local' | 'remote' = 'local'
): void {
  try {
    localStorage.removeItem(`${fullscreenDraftsKey(store)}_${itemId}`);
    store.emitChange({
      kind: 'draft',
      action: 'delete',
      id: `fullscreen:${itemId}`,
      origin,
    });
  } catch {}
}

export function readFullscreenWidth(_store: SettingsStoreHost): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.FULLSCREEN_WIDTH) === 'true';
  } catch {
    return false;
  }
}

export function writeFullscreenWidth(_store: SettingsStoreHost, isFullWidth: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FULLSCREEN_WIDTH, String(isFullWidth));
  } catch {}
}

// Assistant History
export function readAssistantHistory(store: SettingsStoreHost): ChatMessage[] {
  const raw = localStorage.getItem(assistantStorageKey(store));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ChatMessage[] : [];
  } catch {
    return [];
  }
}

export function writeAssistantHistory(store: SettingsStoreHost, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(assistantStorageKey(store), JSON.stringify(messages));
  } catch (err) {
    fsLog.error('Failed to save assistant history to localStorage', { count: messages.length, err });
  }
}

export function eraseAssistantHistory(store: SettingsStoreHost): void {
  localStorage.removeItem(assistantStorageKey(store));
  fsLog.info('Cleared assistant chat history');
}

// Workspace State
export function readWorkspaceState(store: SettingsStoreHost): WorkspaceState {
  const raw = localStorage.getItem(workspaceStateStorageKey(store));
  if (!raw) return { ...DEFAULT_WORKSPACE_STATE };
  try {
    const parsed: unknown = JSON.parse(raw);
    return {
      ...DEFAULT_WORKSPACE_STATE,
      ...(parsed && typeof parsed === 'object' ? parsed as Partial<WorkspaceState> : {}),
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_STATE };
  }
}

export function writeWorkspaceState(
  store: SettingsStoreHost,
  partialState: Partial<WorkspaceState>,
  origin: 'local' | 'remote' = 'local'
): void {
  try {
    const current = readWorkspaceState(store);
    const updated = { ...current, ...partialState };
    localStorage.setItem(workspaceStateStorageKey(store), JSON.stringify(updated));
    store.emitChange({ kind: 'workspace', action: 'upsert', id: 'workspace_state', payload: updated, origin });
  } catch (err) {
    fsLog.warn('Failed to save workspace state to localStorage', err);
  }
}

export function readFolderViewSettings(store: SettingsStoreHost, folderPath: string): FolderViewSettings {
  const ws = readWorkspaceState(store);
  return ws.folderSettings?.[folderPath] || {
    ...DEFAULT_FOLDER_VIEW_SETTINGS,
    viewMode: ws.feedViewMode || DEFAULT_FOLDER_VIEW_SETTINGS.viewMode,
    typeFilter: ws.activeTypeFilter || DEFAULT_FOLDER_VIEW_SETTINGS.typeFilter,
    sortBy: ws.sortBy || DEFAULT_FOLDER_VIEW_SETTINGS.sortBy,
    sortOrder: ws.sortOrder || DEFAULT_FOLDER_VIEW_SETTINGS.sortOrder,
    hideCompletedTasks: ws.hideCompletedTasks ?? DEFAULT_FOLDER_VIEW_SETTINGS.hideCompletedTasks,
  };
}

export function writeFolderViewSettings(
  store: SettingsStoreHost,
  folderPath: string,
  settings: Partial<FolderViewSettings>
): void {
  const ws = readWorkspaceState(store);
  const currentSettings = ws.folderSettings?.[folderPath] || { ...DEFAULT_FOLDER_VIEW_SETTINGS };
  const updatedSettings = { ...currentSettings, ...settings };
  const folderSettings = { ...(ws.folderSettings || {}), [folderPath]: updatedSettings };
  writeWorkspaceState(store, { folderSettings });
}
