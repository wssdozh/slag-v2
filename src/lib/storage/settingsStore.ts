// The small per-vault things a reload must not lose: composer and fullscreen drafts, the assistant's
// chat and memory, and the workspace.
//
// They used to live in `localStorage`, one key per vault. A webview profile can be wiped from the
// outside — an update, "clear data", disk pressure — and the unsaved text went with it; the
// workspace was worse, because `state.json.workspace` held the same state under a second writer and
// the two could disagree. Now each of them is one section of the vault's `state.json`, written
// through the one door in `VaultFiles`, and the old keys are read once and merged into the file.
//
// Reads are synchronous by contract: they happen inside `useState(() => …)` and in the change
// events the UI reacts to. So the sections are hydrated once into a snapshot and every reader takes
// it from there. Native shared settings never fall back to legacy keys before enrollment is known:
// doing so could expose a deleted record. A vault switch invalidates the snapshot.
//
// Native never writes `localStorage` any more: the file is the store. The browser build has no
// `state.json`, so there the keys keep going to the browser backend that `prefs` owns — the same
// `localStorage` and the same names the Playwright run seeds.
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
import { isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';
import { stripAttachmentList } from './attachmentData';
import { parseSharedRegistryId } from '../sync/notes/sharedBody';
import type { SharedBody } from '../sync/notes/sharedBody';
import { sharedSettingsProjection } from './sharedProjection';
import { getPref, getPrefEntries, getPrefJson, removePref, setPref } from './prefs';
import { parseLegacyJson } from './legacyJson';
import {
  STATE_SECTIONS,
  chatFromSection,
  chatMessagesFrom,
  chatToSection,
  composerDraftsFrom,
  draftsFromSection,
  draftsToSection,
  fullscreenDraftsFrom,
  memoryFrom,
  memoryFromSection,
  memoryToSection,
  mergeChatMessages,
  mergeComposerDrafts,
  mergeFullscreenDrafts,
  mergeMemory,
  mergeTelegramThread,
  mergeWorkspaceState,
  migrationStampsFrom,
  migrationStampsToSection,
  stampMigration,
  telegramThreadFrom,
  workspaceFromState,
  type ComposerDraftMap,
  type FullscreenDraftMap,
  type MigrationStamps,
  type TelegramThreadEntry,
} from './stateSections';
import type { StorageChangeEvent } from '.';

const settingsLog = logger.scope('FS');

/**
 * A draft is the only thing saved on every keystroke, and every save is a `state.json` rewrite now.
 * So a write lands once per window at most; readers still see the pending value because the
 * snapshot already has it. `flushDraftWrites` closes the window early — the editor, the composer and
 * the page itself call it when the text is about to go out of sight.
 */
const WRITE_WINDOW_MS = 400;

type SectionName = 'drafts' | 'chat' | 'memory' | 'migrations' | 'workspace';

interface PendingDraftEvent {
  id: string;
  action: 'upsert' | 'delete';
  origin: 'local' | 'remote';
  payload?: ComposerDraft | FullscreenDraft;
  /** Set for composer drafts only: the other window is told which folder changed. */
  folderPath?: string;
}

interface WriteQueue {
  /** Sections the snapshot has changed since the last write. */
  dirty: Set<SectionName>;
  /** Draft changes waiting for a successful write; a failed one must not tell anyone it landed. */
  events: PendingDraftEvent[];
  /** Folders and notes whose draft was erased: the merge must not hand them back from the file. */
  erasedComposer: Set<string>;
  erasedFullscreen: Set<string>;
  /** A restored archive replaces the whole map; the merge would keep drafts it does not carry. */
  replaceDrafts: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  lastWriteAt: number;
}

/**
 * The slice of `VaultFiles` this module needs: read and write one section, and persist the
 * workspace through the writer that already owns it. All three are public there already; this
 * module invents no new door into `state.json`.
 */
export interface SettingsStateFiles {
  readStateSection(name: string, vault?: VaultMeta, strict?: boolean): Promise<Record<string, unknown>>;
  writeStateSection(name: string, patch: Record<string, unknown> | ((section: Record<string, unknown>) => Record<string, unknown>), vault?: VaultMeta, strict?: boolean): Promise<void>;
  flushStateToDisk(strict?: boolean): Promise<void>;
}

export interface SettingsStoreHost {
  currentVault: VaultMeta;
  instanceId: string;
  files: SettingsStateFiles;
  getDraftChannel(): BroadcastChannel | null;
  allowLegacySharedMigration(vault: VaultMeta): Promise<boolean>;
  emitChange(event: StorageChangeEvent): void;
}

// ---------------------------------------------------------------------------------------------
// The snapshot: one vault at a time, hydrated once
// ---------------------------------------------------------------------------------------------

interface SettingsSnapshot {
  vaultId: string;
  composer: ComposerDraftMap;
  fullscreen: FullscreenDraftMap;
  chat: ChatMessage[];
  telegram: TelegramThreadEntry[];
  memory: MemoryItem[];
  workspace: WorkspaceState;
  migrations: MigrationStamps;
}

let snapshot: SettingsSnapshot | null = null;
let hydration: Promise<void> | null = null;
let hydratingVaultId: string | null = null;

/**
 * Workspace changes that arrived between the switch and the file being back, one list per vault.
 * They are replayed over the state the file holds, so the first click after a switch cannot replace
 * a workspace nobody has read yet.
 */
const pendingWorkspace = new Map<string, Partial<WorkspaceState>[]>();

/**
 * The store whose vault is loaded, registered once from the service constructor. The vault import
 * runs inside the storage service and cannot be handed a store without a cycle, so it reaches the
 * draft section through this module instead.
 */
let loadedStore: SettingsStoreHost | null = null;

/** The browser build has no `state.json`; native and Android do. */
function usesStateFile(): boolean {
  return isTauri();
}

function snapshotFor(store: SettingsStoreHost): SettingsSnapshot | null {
  return snapshot && snapshot.vaultId === store.currentVault.id ? snapshot : null;
}

/** Start hydration for reads that arrive before the new vault snapshot is available. */
function ensureHydrated(store: SettingsStoreHost): void {
  if (!usesStateFile() || snapshotFor(store)) return;
  void hydrateSettings(store);
}

/**
 * Loads the sections of the vault that is loaded now. Called once from `boot()` before the first
 * render, and lazily again after a vault switch; a second call for the same vault joins the first.
 */
export function hydrateSettings(store: SettingsStoreHost): Promise<void> {
  const vaultId = store.currentVault.id;
  if (snapshot?.vaultId === vaultId) return Promise.resolve();
  if (hydration && hydratingVaultId === vaultId) return hydration;
  if (!usesStateFile()) return Promise.resolve();
  hydratingVaultId = vaultId;
  const run = loadSections(store, vaultId)
    // Keep the window open, but don't answer from unverified legacy keys.
    .catch((err: unknown) => {
      settingsLog.warn('Settings could not be read from state.json:', err);
    })
    .finally(() => {
      if (hydratingVaultId === vaultId) {
        hydratingVaultId = null;
        hydration = null;
      }
    });
  hydration = run;
  return run;
}

async function loadSections(store: SettingsStoreHost, vaultId: string): Promise<void> {
  const vault = store.currentVault;
  const mayMergeLegacy = await store.allowLegacySharedMigration(vault).catch(() => false);
  const [drafts, chat, memory, workspace, migrations] = await Promise.all([
    store.files.readStateSection(STATE_SECTIONS.drafts, vault, !mayMergeLegacy),
    store.files.readStateSection(STATE_SECTIONS.chat, vault),
    store.files.readStateSection(STATE_SECTIONS.memory, vault, !mayMergeLegacy),
    store.files.readStateSection(STATE_SECTIONS.workspace, vault, !mayMergeLegacy),
    store.files.readStateSection(STATE_SECTIONS.migrations, vault),
  ]);
  // A switch while the file was being read: this answer belongs to a vault nobody is looking at.
  if (store.currentVault.id !== vaultId) return;

  const onDisk = draftsFromSection(drafts);
  const storedChat = chatFromSection(chat);
  const storedMemory = memoryFromSection(memory);
  const storedWorkspace = workspaceFromState(workspace);
  const stamps = migrationStampsFrom(migrations);

  const legacy = mayMergeLegacy && stamps.legacyAt === 0 ? readLegacySections(store) : emptyLegacySections();
  const merged: SettingsSnapshot = {
    vaultId,
    composer: mergeComposerDrafts(onDisk.composer, legacy.composer),
    fullscreen: mergeFullscreenDrafts(onDisk.fullscreen, legacy.fullscreen),
    chat: mergeChatMessages(storedChat.messages, legacy.chat),
    // The telegram thread is named after the sync id, which only its caller knows: it migrates on
    // the first read instead, under its own stamp.
    telegram: storedChat.telegram,
    memory: mergeMemory(storedMemory, legacy.memory),
    workspace: {
      ...DEFAULT_WORKSPACE_STATE,
      ...mergeWorkspaceState(storedWorkspace, legacy.workspace),
    },
    migrations: stamps,
  };
  snapshot = merged;

  // A workspace change made while this vault was still being read — the switch happens before the
  // file is back. It goes *over* what the file said, never instead of it.
  const buffered = pendingWorkspace.get(vaultId);
  if (buffered) {
    pendingWorkspace.delete(vaultId);
    for (const partial of buffered) Object.assign(merged.workspace, partial);
    markDirty(store, 'workspace');
  }

  settingsLog.info(
    `Settings hydrated for vault "${store.currentVault.name}": ${Object.keys(merged.composer).length} drafts, ` +
      `${merged.chat.length} chat messages, ${merged.memory.length} facts`
  );

  if (mayMergeLegacy && stamps.legacyAt === 0) await persistLegacyMigration(store, merged, legacy);
}

interface LegacySections {
  composer: ComposerDraftMap;
  fullscreen: FullscreenDraftMap;
  chat: ChatMessage[];
  memory: MemoryItem[];
  workspace: Partial<WorkspaceState>;
}

function emptyLegacySections(): LegacySections {
  return { composer: {}, fullscreen: {}, chat: [], memory: [], workspace: {} };
}

/**
 * What the keys of an older build still hold for this vault: read once, then never again. The
 * values come through `prefs` like everything else — in a browser build that is the same
 * `localStorage` an older build wrote; on native `prefs` is `settings.json`, so a blob left in the
 * webview profile before `state.json` existed is not reachable here (see `.agents/tasks/no-legacy.md`).
 */
function readLegacySections(store: SettingsStoreHost): LegacySections {
  const vaultId = store.currentVault.id;
  const fullscreen: FullscreenDraftMap = {};
  const prefix = `${STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX}${vaultId}_`;
  for (const [key, raw] of getPrefEntries()) {
    if (!key.startsWith(prefix)) continue;
    const draft = fullscreenDraftsFrom({ [key.slice(prefix.length)]: parseLegacyJson(raw) });
    for (const [itemId, entry] of Object.entries(draft)) fullscreen[itemId] = entry;
  }
  return {
    composer: composerDraftsFrom(getPrefJson<unknown>(composerDraftsKey(vaultId), null)),
    fullscreen,
    chat: chatMessagesFrom(getPrefJson<unknown>(assistantKey(vaultId), null)),
    memory: memoryFrom(getPrefJson<unknown>(memoryKey(vaultId), null)),
    workspace: workspaceFromState(
      getPrefJson<unknown>(`${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${vaultId}`, null)
    ),
  };
}

/**
 * The file first, the old keys second, and only then the stamp that says the move happened. A crash
 * between the two leaves the stamp unwritten and the next start merges again — nothing is lost, and
 * the stamp is what stops a draft deleted *after* the move from coming back from the old blob.
 */
async function persistLegacyMigration(
  store: SettingsStoreHost,
  merged: SettingsSnapshot,
  legacy: LegacySections
): Promise<void> {
  const writes: Promise<void>[] = [];
  if (Object.keys(legacy.composer).length > 0 || Object.keys(legacy.fullscreen).length > 0) {
    writes.push(
      store.files.writeStateSection(
        STATE_SECTIONS.drafts,
        draftsToSection({ composer: merged.composer, fullscreen: merged.fullscreen })
      )
    );
  }
  if (legacy.chat.length > 0) {
    writes.push(store.files.writeStateSection(STATE_SECTIONS.chat, chatToSection({ messages: merged.chat, telegram: merged.telegram })));
  }
  if (legacy.memory.length > 0) {
    writes.push(store.files.writeStateSection(STATE_SECTIONS.memory, memoryToSection(merged.memory)));
  }
  if (Object.keys(legacy.workspace).length > 0) writes.push(store.files.flushStateToDisk());
  try {
    await Promise.all(writes);
    const stamped = stampMigration(merged.migrations, 'legacy', Date.now());
    await store.files.writeStateSection(STATE_SECTIONS.migrations, migrationStampsToSection(stamped));
    merged.migrations = stamped;
    if (writes.length > 0) {
      settingsLog.info('Moved the legacy drafts, chat, memory and workspace into state.json');
    }
  } catch (err) {
    settingsLog.warn('Could not move the legacy settings blob into state.json, the next start retries:', err);
  }
}

// ---------------------------------------------------------------------------------------------
// The write queue: one timer, one flush, every section the snapshot changed
// ---------------------------------------------------------------------------------------------

const writeQueues = new WeakMap<SettingsStoreHost, WriteQueue>();

function writeQueue(store: SettingsStoreHost): WriteQueue {
  let queue = writeQueues.get(store);
  if (!queue) {
    queue = {
      dirty: new Set(),
      events: [],
      erasedComposer: new Set(),
      erasedFullscreen: new Set(),
      replaceDrafts: false,
      timer: null,
      lastWriteAt: 0,
    };
    writeQueues.set(store, queue);
  }
  return queue;
}

/** Marks what changed and makes sure it lands within one window; the first write is immediate. */
function markDirty(store: SettingsStoreHost, ...sections: SectionName[]): void {
  const queue = writeQueue(store);
  for (const section of sections) queue.dirty.add(section);
  const remaining = queue.lastWriteAt + WRITE_WINDOW_MS - Date.now();
  if (remaining <= 0) {
    void flushWrites(store);
    return;
  }
  if (!queue.timer) {
    queue.timer = setTimeout(() => {
      queue.timer = null;
      void flushWrites(store);
    }, remaining);
  }
}

/**
 * Writes every section the snapshot changed. This is the only way a queued write ever lands, and it
 * is called from the places that must not lose text: a close/unmount in the hooks, the page going
 * away, and the tab being hidden or losing focus. Async on purpose — a file write cannot be
 * synchronous — so the snapshot stays the answer for a reader that arrives mid-flight.
 */
export function flushDraftWrites(store: SettingsStoreHost): void {
  void flushWrites(store);
}

const settingsWrites = new WeakMap<SettingsStoreHost, Promise<void>>();

function serializeSettingsWrite(store: SettingsStoreHost, write: () => Promise<void>): Promise<void> {
  const before = settingsWrites.get(store) ?? Promise.resolve();
  const next = before.then(write, write);
  settingsWrites.set(store, next);
  return next;
}

function flushWrites(store: SettingsStoreHost): Promise<void> {
  return serializeSettingsWrite(store, () => flushQueuedSections(store));
}

async function flushQueuedSections(store: SettingsStoreHost): Promise<void> {
  const queue = writeQueue(store);
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }
  const current = snapshotFor(store);
  if (!current) {
    // The vault switched while this text was queued. `VaultFiles` writes the vault that is loaded
    // now, so this entry has no file to land in — writing it would put one vault's draft into
    // another one's section.
    if (queue.dirty.size > 0) {
      settingsLog.warn('A vault switched before the queued settings reached its file, dropping them');
      queue.dirty.clear();
      queue.events.length = 0;
      queue.erasedComposer.clear();
      queue.erasedFullscreen.clear();
      queue.replaceDrafts = false;
    }
    return;
  }
  if (queue.dirty.size === 0) return;
  const vault = store.currentVault;
  queue.lastWriteAt = Date.now();

  const sections = new Set(queue.dirty);
  const events = queue.events.splice(0);
  const erasedComposer = new Set(queue.erasedComposer);
  const erasedFullscreen = new Set(queue.erasedFullscreen);
  const replaceDrafts = queue.replaceDrafts;
  queue.dirty.clear();
  queue.erasedComposer.clear();
  queue.erasedFullscreen.clear();
  queue.replaceDrafts = false;

  const failed = (section: SectionName, err: unknown): void => {
    settingsLog.warn(`Could not write the "${section}" section of state.json, it stays in memory:`, err);
    queue.dirty.add(section);
  };

  if (sections.has('drafts')) {
    try {
      // Read-merge-write: another window may have saved a draft for a folder this one never
      // touched, and the whole map is what lands in the section. A restore is the one exception.
      const onDisk = replaceDrafts
        ? { composer: {}, fullscreen: {} }
        : draftsFromSection(await store.files.readStateSection(STATE_SECTIONS.drafts, vault, true));
      const composer = mergeComposerDrafts(onDisk.composer, current.composer);
      for (const folderPath of erasedComposer) delete composer[folderPath];
      const fullscreen = mergeFullscreenDrafts(onDisk.fullscreen, current.fullscreen);
      for (const itemId of erasedFullscreen) delete fullscreen[itemId];
      await store.files.writeStateSection(STATE_SECTIONS.drafts, draftsToSection({ composer, fullscreen }), vault, true);
      for (const event of events) {
        store.emitChange({
          kind: 'draft',
          action: event.action,
          id: event.id,
          payload: event.payload,
          origin: event.origin,
        });
        if (event.folderPath && event.origin === 'local') {
          const draft = (event.payload as ComposerDraft | undefined) ?? null;
          postComposerDraft(store, event.folderPath, event.action === 'delete' ? null : draft, event.action);
        }
      }
    } catch (err) {
      failed('drafts', err);
      // Nothing was saved, so nothing may be announced; the entries come back for the next window.
      queue.events.unshift(...events);
      for (const folderPath of erasedComposer) queue.erasedComposer.add(folderPath);
      for (const itemId of erasedFullscreen) queue.erasedFullscreen.add(itemId);
      queue.replaceDrafts = replaceDrafts;
    }
  }

  if (sections.has('chat')) {
    try {
      const chat = chatToSection({ messages: current.chat, telegram: current.telegram });
      await store.files.writeStateSection(STATE_SECTIONS.chat, chat);
    } catch (err) {
      failed('chat', err);
    }
  }

  if (sections.has('memory')) {
    try {
      await store.files.writeStateSection(STATE_SECTIONS.memory, memoryToSection(current.memory), vault, true);
    } catch (err) {
      failed('memory', err);
    }
  }

  if (sections.has('workspace')) {
    try {
      // The one writer `state.json.workspace` already had: it reads the file, replaces that section
      // and leaves `folders` and the MCP server's own keys alone.
      if (store.currentVault.id !== vault.id) throw new Error('Vault changed before workspace flush');
      await store.files.flushStateToDisk(true);
    } catch (err) {
      failed('workspace', err);
    }
  }

  if (sections.has('migrations')) {
    try {
      await store.files.writeStateSection(STATE_SECTIONS.migrations, migrationStampsToSection(current.migrations));
    } catch (err) {
      failed('migrations', err);
    }
  }
}

export function projectSharedSettings(store: SettingsStoreHost, body: SharedBody, origin: 'local' | 'remote' = 'remote'): Promise<void> {
  const vault = store.currentVault;
  return hydrateSettings(store).then(() => serializeSettingsWrite(store, async () => {
    if (store.currentVault.id !== vault.id) throw new Error('Vault changed before shared projection');
    const current = snapshotFor(store);
    if (!usesStateFile() || !current) throw new Error('Shared settings require a hydrated vault state file');
    const projection = sharedSettingsProjection(body);
    const { section } = projection;
    // Drain old writers before replacing a member. A failed local write must not be overwritten.
    await flushQueuedSections(store);
    const assertScope = () => {
      if (snapshotFor(store) !== current) throw new Error('Vault changed during shared projection');
      if (writeQueue(store).dirty.has(section)) throw new Error('Local settings changed during shared projection');
    };
    assertScope();
    if (projection.section === 'workspace') {
      const patch = projection.patch(current.workspace);
      await store.files.writeStateSection(STATE_SECTIONS.workspace, patch, vault, true);
      assertScope();
      current.workspace = { ...current.workspace, ...patch };
    } else {
      await store.files.writeStateSection(STATE_SECTIONS[section], projection.patch, vault, true);
      assertScope();
      if (projection.section === 'memory') current.memory = projection.replace(current.memory);
      else projection.replace(current);
    }
    if (section === 'drafts') {
      const { type, key } = parseSharedRegistryId(body.id);
      const draft = type === 'composer' ? current.composer[key] : current.fullscreen[key];
      store.emitChange({ kind: 'draft', action: body.shared === null ? 'delete' : 'upsert',
        id: `${type}:${key}`, payload: draft, origin, registry: true });
    }
    window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: {
      hasWorkspaceChanged: section === 'workspace', hasMemoryChanged: section === 'memory', hasDraftsChanged: section === 'drafts',
    } }));
  }));
}

/** A window that hides, loses focus or unloads is the last moment a queued draft can land. */
export function installDraftFlushGuards(store: SettingsStoreHost): void {
  loadedStore = store;
  if (usesStateFile()) void hydrateSettings(store);
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const flush = (): void => flushDraftWrites(store);
  window.addEventListener('pagehide', flush);
  window.addEventListener('blur', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function postComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  draft: ComposerDraft | null,
  action: 'upsert' | 'delete'
): void {
  const channel = store.getDraftChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'DRAFT_CHANGED', senderId: store.instanceId, vaultId: store.currentVault.id, folderPath, draft, action });
  } catch {}
}

// ---------------------------------------------------------------------------------------------
// Composer drafts
// ---------------------------------------------------------------------------------------------

function composerDraftsKey(vaultId: string): string {
  return `${STORAGE_KEYS.DRAFTS_PREFIX}${vaultId}`;
}

export function readComposerDrafts(store: SettingsStoreHost): ComposerDraftMap {
  const current = snapshotFor(store);
  if (current) return { ...current.composer };
  ensureHydrated(store);
  return usesStateFile() ? {} : composerDraftsFrom(getPrefJson(composerDraftsKey(store.currentVault.id), null));
}

export function readComposerDraft(store: SettingsStoreHost, folderPath: string): ComposerDraft | null {
  const current = snapshotFor(store);
  if (current) return current.composer[folderPath] ?? null;
  return readComposerDrafts(store)[folderPath] ?? null;
}

export function writeComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  draft: ComposerDraft,
  origin: 'local' | 'remote' = 'local'
): void {
  const stored: ComposerDraft = { ...draft, attachments: stripAttachmentList(draft.attachments ?? []) };
  const current = snapshotFor(store);
  if (!current) {
    if (!writeBrowserDraft(store, folderPath, stored)) return;
    return afterBrowserDraft(store, folderPath, draft, origin, 'upsert');
  }
  current.composer[folderPath] = stored;
  const queue = writeQueue(store);
  queue.erasedComposer.delete(folderPath);
  queue.events.push({ id: `composer:${folderPath}`, action: 'upsert', origin, payload: draft, folderPath });
  if (origin === 'remote') queue.lastWriteAt = 0;
  markDirty(store, 'drafts');
}

/** Replaces the whole map: a restored backup or a relay bundle arrives at once. */
export function replaceComposerDrafts(
  drafts: Record<string, ComposerDraft>,
  store: SettingsStoreHost | null = loadedStore
): void {
  if (!store) {
    settingsLog.warn('Composer drafts arrived before a vault was loaded, nothing to write them into');
    return;
  }
  const stored: ComposerDraftMap = {};
  for (const [folderPath, draft] of Object.entries(composerDraftsFrom(drafts))) {
    stored[folderPath] = { ...draft, attachments: stripAttachmentList(draft.attachments ?? []) };
  }
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) {
      settingsLog.warn('Drafts arrived before the vault was hydrated, the restore is skipped');
      void hydrateSettings(store);
      return;
    }
    writeBrowserJson(composerDraftsKey(store.currentVault.id), stored);
    return;
  }
  current.composer = stored;
  const queue = writeQueue(store);
  queue.erasedComposer.clear();
  // A restore is a replacement, not a merge: what the archive does not carry is gone, not kept.
  queue.replaceDrafts = true;
  markDirty(store, 'drafts');
}

export function eraseComposerDraft(
  store: SettingsStoreHost,
  folderPath: string,
  origin: 'local' | 'remote' = 'local'
): void {
  const current = snapshotFor(store);
  if (!current) {
    if (!writeBrowserDraft(store, folderPath, null)) return;
    afterBrowserDraft(store, folderPath, null, origin, 'delete');
    return;
  }
  delete current.composer[folderPath];
  const queue = writeQueue(store);
  queue.erasedComposer.add(folderPath);
  queue.events.push({ id: `composer:${folderPath}`, action: 'delete', origin, folderPath });
  if (origin === 'remote') queue.lastWriteAt = 0;
  markDirty(store, 'drafts');
}

/** The browser build keeps the old map under the old key, through the one backend allowed to write it. */
function writeBrowserDraft(store: SettingsStoreHost, folderPath: string, draft: ComposerDraft | null): boolean {
  if (usesStateFile()) {
    settingsLog.warn('A draft arrived before the vault was hydrated, it stays queued in the editor');
    void hydrateSettings(store);
    return false;
  }
  const all = composerDraftsFrom(getPrefJson(composerDraftsKey(store.currentVault.id), null));
  if (draft) all[folderPath] = draft;
  else delete all[folderPath];
  writeBrowserJson(composerDraftsKey(store.currentVault.id), all);
  return true;
}

function afterBrowserDraft(
  store: SettingsStoreHost,
  folderPath: string,
  draft: ComposerDraft | null,
  origin: 'local' | 'remote',
  action: 'upsert' | 'delete'
): void {
  store.emitChange({
    kind: 'draft',
    action,
    id: `composer:${folderPath}`,
    payload: draft ?? undefined,
    origin,
  });
  if (origin === 'local') postComposerDraft(store, folderPath, draft, action);
}

// ---------------------------------------------------------------------------------------------
// Fullscreen drafts
// ---------------------------------------------------------------------------------------------

function fullscreenDraftsKey(vaultId: string): string {
  return `${STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX}${vaultId}`;
}

export function readFullscreenDraft(store: SettingsStoreHost, itemId: string): FullscreenDraft | null {
  const current = snapshotFor(store);
  if (current) return current.fullscreen[itemId] ?? null;
  ensureHydrated(store);
  if (usesStateFile()) return null;
  const draft = fullscreenDraftsFrom({
    [itemId]: getPrefJson(`${fullscreenDraftsKey(store.currentVault.id)}_${itemId}`, null),
  });
  return draft[itemId] ?? null;
}

export function writeFullscreenDraft(
  store: SettingsStoreHost,
  itemId: string,
  draft: FullscreenDraft,
  origin: 'local' | 'remote' = 'local'
): void {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) {
      settingsLog.warn('A fullscreen draft arrived before the vault was hydrated, it stays in the editor');
      void hydrateSettings(store);
      return;
    }
    writeBrowserJson(`${fullscreenDraftsKey(store.currentVault.id)}_${itemId}`, draft.attachments ? { ...draft, attachments: stripAttachmentList(draft.attachments) } : draft);
    store.emitChange({ kind: 'draft', action: 'upsert', id: `fullscreen:${itemId}`, payload: draft, origin });
    return;
  }
  current.fullscreen[itemId] = draft.attachments ? { ...draft, attachments: stripAttachmentList(draft.attachments) } : draft;
  writeQueue(store).erasedFullscreen.delete(itemId);
  writeQueue(store).events.push({ id: `fullscreen:${itemId}`, action: 'upsert', origin, payload: draft });
  markDirty(store, 'drafts');
}

export function eraseFullscreenDraft(
  store: SettingsStoreHost,
  itemId: string,
  origin: 'local' | 'remote' = 'local'
): void {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) {
      void hydrateSettings(store);
      return;
    }
    dropBrowserKey(`${fullscreenDraftsKey(store.currentVault.id)}_${itemId}`);
    store.emitChange({ kind: 'draft', action: 'delete', id: `fullscreen:${itemId}`, origin });
    return;
  }
  delete current.fullscreen[itemId];
  writeQueue(store).erasedFullscreen.add(itemId);
  writeQueue(store).events.push({ id: `fullscreen:${itemId}`, action: 'delete', origin });
  markDirty(store, 'drafts');
}

/** Per-machine, not per-vault: fullscreen width belongs in `settings.json`, not in the vault. */
export function readFullscreenWidth(_store: SettingsStoreHost): boolean {
  return getPref(STORAGE_KEYS.FULLSCREEN_WIDTH) === 'true';
}

export function writeFullscreenWidth(_store: SettingsStoreHost, isFullWidth: boolean): void {
  setPref(STORAGE_KEYS.FULLSCREEN_WIDTH, String(isFullWidth));
}

// ---------------------------------------------------------------------------------------------
// Assistant chat: the transcript the assistant window shows, and the bot's own thread
// ---------------------------------------------------------------------------------------------

function assistantKey(vaultId: string): string {
  return `${STORAGE_KEYS.ASSISTANT_PREFIX}${vaultId}`;
}

export function readAssistantHistory(store: SettingsStoreHost): ChatMessage[] {
  const current = snapshotFor(store);
  if (current) return [...current.chat];
  ensureHydrated(store);
  return chatMessagesFrom(getPrefJson(assistantKey(store.currentVault.id), null));
}

export function writeAssistantHistory(store: SettingsStoreHost, messages: ChatMessage[]): void {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) return;
    writeBrowserJson(assistantKey(store.currentVault.id), messages);
    return;
  }
  current.chat = mergeChatMessages(current.chat, messages);
  markDirty(store, 'chat');
}

export function eraseAssistantHistory(store: SettingsStoreHost): void {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) return;
    dropBrowserKey(assistantKey(store.currentVault.id));
  } else {
    current.chat = [];
    markDirty(store, 'chat');
  }
  settingsLog.info('Cleared assistant chat history');
}

/**
 * The short thread the telegram bot answers in. It lives in the same `chat` section as the
 * transcript, but it is named after the sync id, not the vault id, so the caller hands over the key
 * the old build wrote and this module does the one lazy merge.
 */
export function readTelegramThread(store: SettingsStoreHost, legacyKey: string): TelegramThreadEntry[] {
  const current = snapshotFor(store);
  if (!current) {
    ensureHydrated(store);
    return telegramThreadFrom(getPrefJson(legacyKey, null));
  }
  if (current.migrations.telegramAt === 0) migrateTelegramThread(store, current, legacyKey);
  return [...current.telegram];
}

export function writeTelegramThread(
  store: SettingsStoreHost,
  legacyKey: string,
  entries: TelegramThreadEntry[]
): void {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) return;
    writeBrowserJson(legacyKey, telegramThreadFrom(entries));
    return;
  }
  current.telegram = telegramThreadFrom(entries);
  markDirty(store, 'chat');
}

/** `/clear` in the bot: the thread is gone and the old key must not hand it back on the next start. */
export function clearTelegramThread(store: SettingsStoreHost, legacyKey: string): void {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) return;
    dropBrowserKey(legacyKey);
    return;
  }
  current.telegram = [];
  current.migrations = stampMigration(current.migrations, 'telegram', Date.now());
  markDirty(store, 'chat', 'migrations');
}

function migrateTelegramThread(
  store: SettingsStoreHost,
  current: SettingsSnapshot,
  legacyKey: string
): void {
  const legacy = telegramThreadFrom(getPrefJson(legacyKey, null));
  if (legacy.length > 0) {
    current.telegram = mergeTelegramThread(current.telegram, legacy);
    markDirty(store, 'chat');
  }
  current.migrations = stampMigration(current.migrations, 'telegram', Date.now());
  markDirty(store, 'migrations');
}

// ---------------------------------------------------------------------------------------------
// Assistant memory
// ---------------------------------------------------------------------------------------------

function memoryKey(vaultId: string): string {
  return `${STORAGE_KEYS.MEMORY_PREFIX}${vaultId}`;
}

export function readMemory(store: SettingsStoreHost): MemoryItem[] {
  const current = snapshotFor(store);
  if (current) return [...current.memory];
  ensureHydrated(store);
  return usesStateFile() ? [] : memoryFrom(getPrefJson(memoryKey(store.currentVault.id), null));
}

/** A file write cannot refuse a fact the way a full quota could: it lands in the snapshot, then on disk. */
export function writeMemory(store: SettingsStoreHost, items: MemoryItem[]): boolean {
  const current = snapshotFor(store);
  if (!current) {
    if (usesStateFile()) return false;
    writeBrowserJson(memoryKey(store.currentVault.id), items);
    return true;
  }
  current.memory = items;
  markDirty(store, 'memory');
  return true;
}

// ---------------------------------------------------------------------------------------------
// Workspace state: `state.json.workspace` is the only copy
// ---------------------------------------------------------------------------------------------

function workspaceKey(vaultId: string): string {
  return `${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${vaultId}`;
}

export function readWorkspaceState(store: SettingsStoreHost): WorkspaceState {
  const current = snapshotFor(store);
  if (current) return { ...current.workspace };
  ensureHydrated(store);
  return {
    ...DEFAULT_WORKSPACE_STATE,
    ...(!usesStateFile() && workspaceFromState(getPrefJson(workspaceKey(store.currentVault.id), null))),
  };
}

export function writeWorkspaceState(
  store: SettingsStoreHost,
  partialState: Partial<WorkspaceState>,
  origin: 'local' | 'remote' = 'local'
): void {
  const updated = { ...readWorkspaceState(store), ...partialState };
  const current = snapshotFor(store);
  if (current) {
    current.workspace = updated;
    markDirty(store, 'workspace');
  } else if (usesStateFile()) {
    // The switch happens before the new vault's file is back. Keeping the change and replaying it
    // over what the file says is the only honest answer: writing it now would mean writing defaults
    // over a workspace nobody has read yet.
    const buffered = pendingWorkspace.get(store.currentVault.id) ?? [];
    buffered.push(partialState);
    pendingWorkspace.set(store.currentVault.id, buffered);
    void hydrateSettings(store);
  } else {
    writeBrowserJson(workspaceKey(store.currentVault.id), updated);
  }
  store.emitChange({ kind: 'workspace', action: 'upsert', id: 'workspace_state', payload: updated, origin });
}

export function writeFolderViewSettings(
  store: SettingsStoreHost,
  folderPath: string,
  settings: Partial<FolderViewSettings>
): void {
  const workspace = readWorkspaceState(store);
  const currentSettings = workspace.folderSettings?.[folderPath] || { ...DEFAULT_FOLDER_VIEW_SETTINGS };
  const updatedSettings = { ...currentSettings, ...settings };
  const folderSettings = { ...(workspace.folderSettings || {}), [folderPath]: updatedSettings };
  writeWorkspaceState(store, { folderSettings });
}

// ---------------------------------------------------------------------------------------------
// Browser storage: the same keys, through the one backend that may touch the profile
// ---------------------------------------------------------------------------------------------

/**
 * The browser build has no `state.json`, so there the keys go to the backend `prefs` owns — the same
 * names and the same strings the Playwright run seeds.
 */function writeBrowserJson(key: string, value: unknown): void {
  try {
    setPref(key, JSON.stringify(value));
  } catch (err) {
    settingsLog.warn('Could not write the browser settings, the text stays in memory:', err);
  }
}

function dropBrowserKey(key: string): void {
  try {
    removePref(key);
  } catch (err) {
    settingsLog.warn('Could not drop the browser settings key:', err);
  }
}
