// Small settings and drafts: which localStorage keys are kept and how they are read.
import type {
  ChatMessage,
  ComposerDraft,
  FolderViewSettings,
  FullscreenDraft,
  MemoryItem,
  VaultMeta,
  WorkspaceState,
} from '../../types';
import { DEFAULT_FOLDER_VIEW_SETTINGS } from '../../types';
import { DEFAULT_WORKSPACE_STATE, STORAGE_KEYS } from '../../config';
import { logger } from '../logger/logger';
import { stripAttachmentList } from './attachmentData';
import { readStoredJson } from './readJson';
import type { StorageChangeEvent } from '.';

const fsLog = logger.scope('FS');

/**
 * A draft is the only thing saved on every keystroke: 22 letters used to mean 22 `setItem`
 * calls, 22 sync events and 22 rewrites of the whole sync outbox. A note is written when the
 * user means it; a draft is written by a letter, so it gets a clock. One write per window at
 * most, and readers still see the pending value — a reload cannot hand back an older draft
 * than the one on screen. The window is closed early by `flushDraftWrites`, which the editor,
 * the composer and the page itself call when the text is about to go out of sight.
 */
const DRAFT_WRITE_WINDOW_MS = 400;

interface PendingComposerDraft {
  vaultId: string;
  folderPath: string;
  /** What lands in localStorage: attachments lose their bytes, exactly as they always did. */
  stored: ComposerDraft;
  /** What the change event carries: the draft as the caller passed it. */
  payload: ComposerDraft;
}

interface PendingFullscreenDraft {
  vaultId: string;
  itemId: string;
  draft: FullscreenDraft;
}

interface DraftWriteQueue {
  composer: Map<string, PendingComposerDraft>;
  fullscreen: Map<string, PendingFullscreenDraft>;
  timer: ReturnType<typeof setTimeout> | null;
  lastWriteAt: number;
}

const draftQueues = new WeakMap<SettingsStoreHost, DraftWriteQueue>();

export interface SettingsStoreHost {
  currentVault: VaultMeta;
  instanceId: string;
  getDraftChannel(): BroadcastChannel | null;
  emitChange(event: StorageChangeEvent): void;
}

function draftQueue(store: SettingsStoreHost): DraftWriteQueue {
  let queue = draftQueues.get(store);
  if (!queue) {
    queue = { composer: new Map(), fullscreen: new Map(), timer: null, lastWriteAt: 0 };
    draftQueues.set(store, queue);
  }
  return queue;
}

function composerDraftsKey(vaultId: string): string {
  return `${STORAGE_KEYS.DRAFTS_PREFIX}${vaultId}`;
}

function fullscreenDraftsKey(vaultId: string): string {
  return `${STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX}${vaultId}`;
}

/** One slot per draft, so switching vaults mid-window cannot overwrite another vault's draft. */
function slotKey(vaultId: string, id: string): string {
  return `${vaultId}\u0000${id}`;
}

export function draftsStorageKey(store: SettingsStoreHost): string {
  return composerDraftsKey(store.currentVault.id);
}

export function workspaceStateStorageKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${store.currentVault.id}`;
}

function assistantStorageKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.ASSISTANT_PREFIX}${store.currentVault.id}`;
}

function memoryStorageKey(store: SettingsStoreHost): string {
  return `${STORAGE_KEYS.MEMORY_PREFIX}${store.currentVault.id}`;
}

function readComposerDraftsAt(key: string): Record<string, ComposerDraft> {
  return readStoredJson<Record<string, ComposerDraft>>(key, {}, value => (
    value && typeof value === 'object' ? value as Record<string, ComposerDraft> : undefined
  ));
}

function postComposerDraft(store: SettingsStoreHost, folderPath: string, draft: ComposerDraft | null, action: 'upsert' | 'delete'): void {
  const channel = store.getDraftChannel();
  if (!channel) return;
  try {
    channel.postMessage({
      type: 'DRAFT_CHANGED',
      senderId: store.instanceId,
      folderPath,
      draft,
      action,
    });
  } catch {}
}

/**
 * Writes every pending draft now. This is the only way a queued write ever lands, and it is
 * called from three places that must not lose text: a close/unmount in the hooks, the page
 * going away, and the tab being hidden or losing focus.
 */
export function flushDraftWrites(store: SettingsStoreHost): void {
  const queue = draftQueues.get(store);
  if (!queue) return;
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }
  if (queue.composer.size === 0 && queue.fullscreen.size === 0) return;
  queue.lastWriteAt = Date.now();

  const composer = [...queue.composer.values()];
  queue.composer.clear();
  const byVault = new Map<string, PendingComposerDraft[]>();
  for (const entry of composer) {
    const list = byVault.get(entry.vaultId) ?? [];
    list.push(entry);
    byVault.set(entry.vaultId, list);
  }
  for (const [vaultId, entries] of byVault) {
    try {
      const all = readComposerDraftsAt(composerDraftsKey(vaultId));
      for (const entry of entries) all[entry.folderPath] = entry.stored;
      localStorage.setItem(composerDraftsKey(vaultId), JSON.stringify(all));
    } catch (err) {
      fsLog.warn('Failed to save composer draft to localStorage', {
        folders: entries.map(entry => entry.folderPath),
        err,
      });
      // A quota miss must not eat the text: the entry stays queued for the next write.
      for (const entry of entries) queue.composer.set(slotKey(entry.vaultId, entry.folderPath), entry);
      continue;
    }
    for (const entry of entries) {
      store.emitChange({
        kind: 'draft',
        action: 'upsert',
        id: `composer:${entry.folderPath}`,
        payload: entry.payload,
        origin: 'local',
      });
      postComposerDraft(store, entry.folderPath, entry.payload, 'upsert');
    }
  }

  const fullscreen = [...queue.fullscreen.values()];
  queue.fullscreen.clear();
  for (const entry of fullscreen) {
    try {
      localStorage.setItem(`${fullscreenDraftsKey(entry.vaultId)}_${entry.itemId}`, JSON.stringify(entry.draft));
    } catch (err) {
      fsLog.warn('Failed to save fullscreen draft to localStorage', { itemId: entry.itemId, err });
      queue.fullscreen.set(slotKey(entry.vaultId, entry.itemId), entry);
      continue;
    }
    store.emitChange({
      kind: 'draft',
      action: 'upsert',
      id: `fullscreen:${entry.itemId}`,
      payload: entry.draft,
      origin: 'local',
    });
  }
}

/** Queues the slot and makes sure a write lands within one window. */
function scheduleDraftWrite(store: SettingsStoreHost, enqueue: (queue: DraftWriteQueue) => void): void {
  const queue = draftQueue(store);
  enqueue(queue);
  const remaining = queue.lastWriteAt + DRAFT_WRITE_WINDOW_MS - Date.now();
  if (remaining <= 0) {
    flushDraftWrites(store);
    return;
  }
  if (!queue.timer) {
    queue.timer = setTimeout(() => {
      queue.timer = null;
      flushDraftWrites(store);
    }, remaining);
  }
}

/** A window that hides, loses focus or unloads is the last moment a queued draft can land. */
export function installDraftFlushGuards(store: SettingsStoreHost): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const flush = () => flushDraftWrites(store);
  window.addEventListener('pagehide', flush);
  window.addEventListener('blur', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function writeComposerDraftNow(
  store: SettingsStoreHost,
  vaultId: string,
  folderPath: string,
  stored: ComposerDraft,
  payload: ComposerDraft,
  origin: 'local' | 'remote'
): void {
  try {
    const all = readComposerDraftsAt(composerDraftsKey(vaultId));
    all[folderPath] = stored;
    localStorage.setItem(composerDraftsKey(vaultId), JSON.stringify(all));
    store.emitChange({
      kind: 'draft',
      action: 'upsert',
      id: `composer:${folderPath}`,
      payload,
      origin,
    });
    if (origin === 'local') postComposerDraft(store, folderPath, payload, 'upsert');
  } catch (err) {
    fsLog.warn('Failed to save composer draft to localStorage', { folderPath, err });
  }
}

// Composer Drafts
export function readComposerDrafts(store: SettingsStoreHost): Record<string, ComposerDraft> {
  const all = readComposerDraftsAt(draftsStorageKey(store));
  const pending = draftQueues.get(store)?.composer;
  if (pending) {
    for (const entry of pending.values()) {
      if (entry.vaultId !== store.currentVault.id) continue;
      all[entry.folderPath] = entry.stored;
    }
  }
  return all;
}

export function readComposerDraft(store: SettingsStoreHost, folderPath: string): ComposerDraft | null {
  const queued = draftQueues.get(store)?.composer.get(slotKey(store.currentVault.id, folderPath));
  if (queued) return queued.stored;
  return readComposerDraftsAt(draftsStorageKey(store))[folderPath] || null;
}

export function writeComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  draft: ComposerDraft,
  origin: 'local' | 'remote' = 'local'
): void {
  const vaultId = store.currentVault.id;
  const stored: ComposerDraft = { ...draft, attachments: stripAttachmentList(draft.attachments || []) };
  if (origin === 'remote') {
    // A merged remote draft is already the end of a network round trip; it must be durable now,
    // and it wins the folder, so a local write still sitting in the window is dropped.
    draftQueue(store).composer.delete(slotKey(vaultId, folderPath));
    writeComposerDraftNow(store, vaultId, folderPath, stored, draft, origin);
    return;
  }
  scheduleDraftWrite(store, queue => {
    queue.composer.set(slotKey(vaultId, folderPath), { vaultId, folderPath, stored, payload: draft });
  });
}

export function eraseComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  origin: 'local' | 'remote' = 'local'
): void {
  draftQueue(store).composer.delete(slotKey(store.currentVault.id, folderPath));
  try {
    const all = readComposerDraftsAt(draftsStorageKey(store));
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
    if (origin === 'local') postComposerDraft(store, folderPath, null, 'delete');
  } catch (err) {
    fsLog.warn('Failed to delete composer draft from localStorage', { folderPath, err });
  }
}

// Fullscreen Drafts
export function readFullscreenDraft(store: SettingsStoreHost, itemId: string): FullscreenDraft | null {
  const queued = draftQueues.get(store)?.fullscreen.get(slotKey(store.currentVault.id, itemId));
  if (queued) return queued.draft;
  return readStoredJson<FullscreenDraft | null>(`${fullscreenDraftsKey(store.currentVault.id)}_${itemId}`, null);
}

export function writeFullscreenDraft(
  store: SettingsStoreHost,
  itemId: string,
  draft: FullscreenDraft,
  origin: 'local' | 'remote' = 'local'
): void {
  const vaultId = store.currentVault.id;
  if (origin === 'remote') {
    draftQueue(store).fullscreen.delete(slotKey(vaultId, itemId));
    try {
      localStorage.setItem(`${fullscreenDraftsKey(vaultId)}_${itemId}`, JSON.stringify(draft));
      store.emitChange({ kind: 'draft', action: 'upsert', id: `fullscreen:${itemId}`, payload: draft, origin });
    } catch (err) {
      fsLog.warn('Failed to save fullscreen draft to localStorage', { itemId, err });
    }
    return;
  }
  scheduleDraftWrite(store, queue => {
    queue.fullscreen.set(slotKey(vaultId, itemId), { vaultId, itemId, draft });
  });
}

export function eraseFullscreenDraft(
  store: SettingsStoreHost,
  itemId: string,
  origin: 'local' | 'remote' = 'local'
): void {
  draftQueue(store).fullscreen.delete(slotKey(store.currentVault.id, itemId));
  try {
    localStorage.removeItem(`${fullscreenDraftsKey(store.currentVault.id)}_${itemId}`);
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
  return readStoredJson<ChatMessage[]>(assistantStorageKey(store), [], value => (
    Array.isArray(value) ? value as ChatMessage[] : undefined
  ));
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

// Assistant memory: the facts the model wrote about this person, per vault
export function readMemory(store: SettingsStoreHost): MemoryItem[] {
  const raw = localStorage.getItem(memoryStorageKey(store));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MemoryItem[]) : [];
  } catch (err) {
    fsLog.warn('Failed to read assistant memory from localStorage', { err });
    return [];
  }
}

/** A quota miss is a warning and a false: memory that does not fit must not take the app down. */
export function writeMemory(store: SettingsStoreHost, items: MemoryItem[]): boolean {
  try {
    localStorage.setItem(memoryStorageKey(store), JSON.stringify(items));
    return true;
  } catch (err) {
    fsLog.error('Failed to save assistant memory to localStorage', { count: items.length, err });
    return false;
  }
}

// Workspace State
export function readWorkspaceState(store: SettingsStoreHost): WorkspaceState {
  return readStoredJson<WorkspaceState>(workspaceStateStorageKey(store), { ...DEFAULT_WORKSPACE_STATE }, value => ({
    ...DEFAULT_WORKSPACE_STATE,
    ...(value && typeof value === 'object' ? value as Partial<WorkspaceState> : {}),
  }));
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
