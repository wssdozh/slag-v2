// What this device sent, knows and deleted — read from `state.json`'s `sync` section, written back
// through one coalescing queue, and migrated out of `localStorage` once per vault.
//
// Most of it is a cache: losing the hashes or the cursor costs traffic, not data. Tombstones are
// not — a deleted note has no file left to compare against, so a lost tombstone means the relay
// quietly hands the note back. That is why the section is hydrated once per vault, and why the old
// `localStorage` blob is merged in and only then deleted, after the file demonstrably has it.
//
// The *shape* of the section is `syncSection.ts` (pure, read by `node --test` as is); this file is
// where it lives on a disk. Imports carry their extension so that test can read this file too.
import { SYNC_STORAGE_KEYS } from '../../config/sync.ts';
import { readStoredJson } from '../storage/readJson.ts';
import { sanitizeTombstones } from './tombstones.ts';
import type { TombstoneMap } from './tombstones.ts';
import type { SyncOperation } from './entities/types.ts';
import { emptySection, mergeSectionState, sanitizeIds, sanitizeNumbers, sanitizeOutbox, sectionFromState, sectionToPatch } from './syncSection.ts';
import type { SyncSectionState } from './syncSection.ts';

/** The `state.json` section this module owns; the store adapter names it, nothing else does. */
export const SYNC_SECTION = 'sync';

export interface SyncScope {
  vaultId: string;
  /** Account rooms keep their own checkpoint: a new mapping must resend everything. */
  roomId: string | null;
  accountSync: boolean;
}

const LAST_STATE_HASH_KEY = SYNC_STORAGE_KEYS.LAST_STATE_HASH;
const DRAFT_TOMB_PREFIX = SYNC_STORAGE_KEYS.DRAFT_TOMB_PREFIX;
const INITIAL_SYNC_PREFIX = 'slag_initial_sync_';
const OUTBOX_PREFIX = 'slag_sync_outbox_';
const SYNCED_IDS_PREFIX = 'slag_sync_synced_ids_';
const TOMBSTONES_PREFIX = 'slag_sync_tombstones_';
const CURSOR_PREFIX = 'slag_sync_cursor_';
const SENT_HASHES_PREFIX = 'slag_sync_sent_hashes_';
const ATTACHMENT_REQUESTS_PREFIX = 'slag_sync_attachment_requests_';

/** One room's slot in the section. A room is where a checkpoint belongs, not a vault. */
function roomOf(scope: SyncScope): string {
  return scope.roomId || 'local';
}

export function stateHashKey(scope: SyncScope, vaultId?: string): string {
  const vid = vaultId || scope.vaultId;
  return scope.accountSync && scope.roomId
    ? `${LAST_STATE_HASH_KEY}_${vid}_${scope.roomId}`
    : `${LAST_STATE_HASH_KEY}_${vid}`;
}

export function syncedIdsKey(scope: SyncScope, vaultId?: string): string {
  return `${SYNCED_IDS_PREFIX}${vaultId || scope.vaultId}`;
}

export function tombstonesKey(scope: SyncScope, vaultId?: string): string {
  return `${TOMBSTONES_PREFIX}${vaultId || scope.vaultId}`;
}

export function sentHashesKey(scope: SyncScope, vaultId?: string): string {
  return `${SENT_HASHES_PREFIX}${vaultId || scope.vaultId}_${scope.roomId || 'local'}`;
}

/** How far this device has pulled. A dropped pull resumes instead of re-reading the room. */
export function cursorKey(scope: SyncScope, vaultId?: string): string {
  return `${CURSOR_PREFIX}${vaultId || scope.vaultId}_${scope.roomId || 'local'}`;
}

/** When this device last asked the room for a file: one request per id per day, not per push. */
export function attachmentRequestsKey(scope: SyncScope, vaultId?: string): string {
  return `${ATTACHMENT_REQUESTS_PREFIX}${vaultId || scope.vaultId}_${scope.roomId || 'local'}`;
}

export const ATTACHMENT_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * The store the section lives in: the vault's `state.json`, through the one door that writes it.
 * `write` is expected to resolve once the patch is on its way; the door itself logs a failed
 * write instead of throwing, so the migration proves its own write by reading the file back.
 */
export interface SyncSectionStore {
  read(): Promise<Record<string, unknown>>;
  write(patch: Record<string, unknown>): Promise<void>;
}

/** `null` means "not hydrated yet": a first run, a web build, the headless node's storage shim. */
let section: SyncSectionState | null = null;
let sectionVaultId: string | null = null;
let sectionRaw: Record<string, unknown> = {};
let sectionStore: SyncSectionStore | null = null;
let pendingPatch: Record<string, unknown> | null = null;
let flushChain: Promise<void> = Promise.resolve();

/**
 * The app logger pulls the config barrel and the icon set behind it. `node --test` reads this file
 * as is, so it is loaded only when a write actually failed — every caller here already has it in
 * its own graph, so the cost is a microtask, not a second copy of anything.
 */
function warn(message: string, error: unknown): void {
  void import('../logger/logger.ts').then(({ logger }) => logger.scope('SYNC').warn(message, error));
}

/**
 * The browser build, the Playwright run and the headless node still answer from `localStorage`:
 * the section only exists where there is a disk. These five are the whole allowance in this wave —
 * nothing else in the sync modules names the webview profile, and no caller of the ledgers does.
 */
export function readFallbackJson<T>(key: string, fallback: T, revive?: (value: unknown) => T | undefined): T {
  return readStoredJson<T>(key, fallback, revive);
}

export function writeFallbackJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded: the ledger only survives in memory this session, so the next push may resend
    // one change it already sent. That is traffic, not a lost note.
  }
}

/** Plain text, for the keys that were never JSON: a hash, and the initial-sync marker. */
export function readFallbackText(key: string): string | null {
  return localStorage.getItem(key);
}

export function writeFallbackText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Same bargain as above: the in-memory copy is still right for this session.
  }
}

export function removeFallbackKey(key: string): void {
  localStorage.removeItem(key);
}

function onDisk(vaultId: string): boolean {
  return section !== null && sectionVaultId === vaultId;
}

/** The section as the file had it, for the config's own hydrate in `syncConfig.ts`. */
export function sectionRecord(vaultId: string, key: string): unknown {
  return sectionVaultId === vaultId ? sectionRaw[key] : undefined;
}

export function hasSectionStore(): boolean {
  return sectionStore !== null;
}

/**
 * Writes into the section through one queue: a burst of saves is one file write, not one per save.
 * The promise resolves after a flush that included this patch, which is what the migration's
 * "write the file, then delete the old key" order needs.
 */
export function writeSyncSection(patch: Record<string, unknown>): Promise<void> {
  if (!sectionStore) return Promise.resolve();
  pendingPatch = { ...(pendingPatch ?? {}), ...patch };
  flushChain = flushChain.then(flushQueue, flushQueue);
  return flushChain;
}

async function flushQueue(): Promise<void> {
  while (pendingPatch) {
    const patch = pendingPatch;
    pendingPatch = null;
    const store = sectionStore;
    if (!store) return;
    try {
      await store.write(patch);
    } catch (error) {
      warn('Could not save the sync ledgers to state.json:', error);
    }
  }
}

/**
 * The one door to `state.json` logs a failed write and resolves — it is the app's settings file,
 * and a folder rename must not throw into a keystroke. So the only proof the file has a patch is
 * reading it back, and the migration pays for that one read: it deletes the old `localStorage` key
 * only when the file demonstrably holds the new one.
 */
export async function writeSyncSectionVerified(patch: Record<string, unknown>): Promise<boolean> {
  const store = sectionStore;
  if (!store) return false;
  await writeSyncSection(patch);
  let written: Record<string, unknown>;
  try {
    written = await store.read();
  } catch {
    return false;
  }
  return Object.entries(patch).every(([key, value]) => sameJson(written[key], value));
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * The ledgers on the disk, once per vault, before the first pull or push. A pull that starts
 * without the tombstones accepts a stale copy of a note this device deleted; a push that starts
 * without them says nothing about that note at all. The old blob is merged in, not replaced, and
 * removed only once the file has it.
 */
export interface SectionHydration {
  /** The section as the file has it: the config's hydrate reads its own key out of this. */
  section: Record<string, unknown>;
  /** False when the file refused the write: the old copy is still in `localStorage`. */
  persisted: boolean;
  error: unknown | null;
}

export async function hydrateSyncSection(scope: SyncScope, store: SyncSectionStore): Promise<SectionHydration> {
  if (onDisk(scope.vaultId)) {
    return { section: sectionRaw, persisted: sectionStore !== null, error: null };
  }

  let raw: Record<string, unknown>;
  try {
    raw = await store.read();
  } catch (error) {
    // No readable disk means no new home: stay on the old one instead of pretending to move.
    resetSection();
    return { section: {}, persisted: false, error };
  }

  const stored = sectionFromState(raw);
  const legacy = readLegacySection(scope.vaultId);
  const merged = mergeSectionState(stored, legacy.state);
  section = merged;
  sectionVaultId = scope.vaultId;
  sectionRaw = raw;
  sectionStore = store;

  if (legacy.keys.length === 0) return { section: raw, persisted: true, error: null };

  const patch = sectionToPatch(merged);
  if (!(await writeSyncSectionVerified(patch))) {
    // The merged copy is in memory, but the file never demonstrably took it: the old keys stay
    // for the next run instead of being deleted against a write that did not land.
    sectionStore = null;
    return { section: raw, persisted: false, error: 'state.json did not take the sync section' };
  }

  for (const key of legacy.keys) removeFallbackKey(key);
  sectionRaw = { ...raw, ...patch };
  return { section: sectionRaw, persisted: true, error: null };
}

/** A vault switch that found nothing to hydrate must not leave another vault's ledgers behind. */
function resetSection(): void {
  section = null;
  sectionVaultId = null;
  sectionRaw = {};
  sectionStore = null;
  pendingPatch = null;
}

/**
 * The old keys, read once. Every ledger was one `localStorage` entry whose name carried the vault
 * (and usually the room), so the vault id is enough to find them all — the room is derived later,
 * after the seed, and a migration must not wait for it.
 */
function readLegacySection(vaultId: string): { state: SyncSectionState; keys: string[] } {
  const keys: string[] = [];
  const state = emptySection();
  if (typeof localStorage === 'undefined') return { state, keys };

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key === INITIAL_SYNC_PREFIX + vaultId) {
      state.initialSync = localStorage.getItem(key) === 'pending';
      keys.push(key);
      continue;
    }
    if (key === OUTBOX_PREFIX + vaultId) {
      state.outbox = sanitizeOutbox(readStoredJson<unknown>(key, []));
      keys.push(key);
      continue;
    }
    if (key === SYNCED_IDS_PREFIX + vaultId) {
      state.syncedIds = sanitizeIds(readStoredJson<unknown>(key, []));
      keys.push(key);
      continue;
    }
    if (key === TOMBSTONES_PREFIX + vaultId) {
      state.tombstones = sanitizeTombstones(readStoredJson<unknown>(key, {}));
      keys.push(key);
      continue;
    }
    // The old checkpoint had two names: the global one, and `<vault>` for a self-hosted room.
    if (key === LAST_STATE_HASH_KEY && vaultId === 'default_vault') {
      const value = localStorage.getItem(key) || '';
      if (value) state.stateHash.local = value;
      keys.push(key);
      continue;
    }
    if (key === `${LAST_STATE_HASH_KEY}_${vaultId}`) {
      const value = localStorage.getItem(key) || '';
      if (value) state.stateHash.local = value;
      keys.push(key);
      continue;
    }
    if (key.startsWith(DRAFT_TOMB_PREFIX + vaultId + '_')) {
      const draftId = key.slice((DRAFT_TOMB_PREFIX + vaultId + '_').length);
      const deletedAt = positiveNumber(localStorage.getItem(key));
      if (draftId && deletedAt > 0) state.draftTombstones[draftId] = deletedAt;
      keys.push(key);
      continue;
    }
    const cursor = legacyRoomEntry(key, CURSOR_PREFIX, vaultId);
    if (cursor) {
      const value = positiveNumber(localStorage.getItem(key));
      if (value > 0) state.cursor[cursor.room] = value;
      keys.push(key);
      continue;
    }
    const sent = legacyRoomEntry(key, SENT_HASHES_PREFIX, vaultId);
    if (sent) {
      state.sentHashes[sent.room] = readRecord(readStoredJson<unknown>(key, {}));
      keys.push(key);
      continue;
    }
    const requests = legacyRoomEntry(key, ATTACHMENT_REQUESTS_PREFIX, vaultId);
    if (requests) {
      state.attachmentRequests[requests.room] = sanitizeNumbers(readStoredJson<unknown>(key, {}));
      keys.push(key);
      continue;
    }
    const hash = legacyRoomEntry(key, `${LAST_STATE_HASH_KEY}_`, vaultId);
    if (hash) {
      const value = localStorage.getItem(key) || '';
      if (value) state.stateHash[hash.room] = value;
      keys.push(key);
    }
  }

  return { state, keys };
}

/**
 * `slag_sync_cursor_<vault>_<room>` — the name the old code gave every per-room ledger. A key that
 * belongs to another vault, or one this build never wrote, is not ours to migrate.
 */
function legacyRoomEntry(key: string, prefix: string, vaultId: string): { room: string } | null {
  const head = `${prefix}${vaultId}_`;
  if (!key.startsWith(head)) return null;
  const room = key.slice(head.length);
  return room ? { room } : null;
}

/** Hashes are strings under ids: anything else in the old blob is not one this device sent. */
function readRecord(value: unknown): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return hashes;
  for (const [key, entry] of Object.entries(value)) {
    if (key && typeof entry === 'string' && entry) hashes[key] = entry;
  }
  return hashes;
}

/** A key value that is a stamp: anything else is a half-written entry, not a checkpoint. */
function positiveNumber(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function loadCursor(scope: SyncScope): number {
  if (onDisk(scope.vaultId)) return section?.cursor[roomOf(scope)] ?? 0;
  const value = Number(readFallbackJson<unknown>(cursorKey(scope), 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveCursor(scope: SyncScope, cursor: number): void {
  const value = Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0;
  if (onDisk(scope.vaultId) && section) {
    section.cursor[roomOf(scope)] = value;
    void writeSyncSection({ cursor: section.cursor });
    return;
  }
  writeFallbackJson(cursorKey(scope), value);
}

export function loadSentHashes(scope: SyncScope): Record<string, string> {
  if (onDisk(scope.vaultId)) return { ...(section?.sentHashes[roomOf(scope)] ?? {}) };
  return readRecord(readStoredJson<unknown>(sentHashesKey(scope), {}));
}

export function saveSentHashes(scope: SyncScope, hashes: Record<string, string>): void {
  const clean = readRecord(hashes);
  if (onDisk(scope.vaultId) && section) {
    section.sentHashes[roomOf(scope)] = clean;
    void writeSyncSection({ sentHashes: section.sentHashes });
    return;
  }
  writeFallbackJson(sentHashesKey(scope), clean);
}

export function loadSyncedIds(scope: SyncScope): Set<string> {
  if (onDisk(scope.vaultId)) return new Set(section?.syncedIds ?? []);
  return new Set(sanitizeIds(readStoredJson<unknown>(syncedIdsKey(scope), [])));
}

/** First run against a vault that already has notes: treat all of them as known. */
export function seedSyncedIds(scope: SyncScope, ids: string[]): void {
  if (loadSyncedIds(scope).size > 0) return;
  saveSyncedIds(scope, ids);
}

export function saveSyncedIds(scope: SyncScope, ids: Iterable<string>): void {
  const clean = sanitizeIds([...ids]);
  if (onDisk(scope.vaultId) && section) {
    section.syncedIds = clean;
    void writeSyncSection({ syncedIds: clean });
    return;
  }
  writeFallbackJson(syncedIdsKey(scope), clean);
}

export function loadAttachmentRequests(scope: SyncScope): Record<string, number> {
  if (onDisk(scope.vaultId)) return { ...(section?.attachmentRequests[roomOf(scope)] ?? {}) };
  return sanitizeNumbers(readStoredJson<unknown>(attachmentRequestsKey(scope), {}));
}

/**
 * Stamped when a request actually leaves in a bundle, not when it is queued: a push that fails
 * before the relay sees it must not buy the file another day of silence.
 */
export function markAttachmentRequestSent(scope: SyncScope, attachmentId: string, at = Date.now()): void {
  const requests = loadAttachmentRequests(scope);
  for (const [key, sentAt] of Object.entries(requests)) {
    if (at - sentAt > ATTACHMENT_REQUEST_COOLDOWN_MS) delete requests[key];
  }
  requests[`att:${attachmentId}`] = at;
  if (onDisk(scope.vaultId) && section) {
    section.attachmentRequests[roomOf(scope)] = requests;
    void writeSyncSection({ attachmentRequests: section.attachmentRequests });
    return;
  }
  writeFallbackJson(attachmentRequestsKey(scope), requests);
}

/** A draft this vault deleted: a peer that still holds the text must not replay it on catch-up. */
export function loadDraftTombstone(scope: SyncScope, draftId: string): number {
  if (onDisk(scope.vaultId)) return section?.draftTombstones[draftId] ?? 0;
  return positiveNumber(readFallbackText(`${DRAFT_TOMB_PREFIX}${scope.vaultId}_${draftId}`));
}

export function saveDraftTombstone(scope: SyncScope, draftId: string, deletedAt: number): void {
  if (onDisk(scope.vaultId) && section) {
    section.draftTombstones[draftId] = deletedAt;
    void writeSyncSection({ draftTombstones: section.draftTombstones });
    return;
  }
  writeFallbackText(`${DRAFT_TOMB_PREFIX}${scope.vaultId}_${draftId}`, String(deletedAt));
}

/** The old build kept this one aside for a self-hosted default vault; the section has a room. */
function keepsLegacyDefaultHash(scope: SyncScope): boolean {
  return !scope.accountSync && scope.vaultId === 'default_vault';
}

/** The root hash this room last received. A miss costs one full push, never a lost note. */
export function loadStateHash(scope: SyncScope): string | null {
  if (onDisk(scope.vaultId) && section) {
    return section.stateHash[roomOf(scope)] ?? section.stateHash.local ?? null;
  }
  return readFallbackText(stateHashKey(scope))
    ?? (keepsLegacyDefaultHash(scope) ? readFallbackText(LAST_STATE_HASH_KEY) : null);
}

export function saveStateHash(scope: SyncScope, hash: string): void {
  if (onDisk(scope.vaultId) && section) {
    section.stateHash[roomOf(scope)] = hash;
    if (keepsLegacyDefaultHash(scope)) section.stateHash.local = hash;
    void writeSyncSection({ stateHash: section.stateHash });
    return;
  }
  writeFallbackText(stateHashKey(scope), hash);
  if (keepsLegacyDefaultHash(scope)) writeFallbackText(LAST_STATE_HASH_KEY, hash);
}

/**
 * The first pull of a vault has not drained yet: a restart must resume it instead of letting the
 * user edit a half-pulled vault. The marker is the only thing here that is not a cache, and it
 * belongs to the vault, not to a room.
 */
export function isInitialSyncPending(vaultId: string): boolean {
  if (onDisk(vaultId)) return section?.initialSync === true;
  return readFallbackText(INITIAL_SYNC_PREFIX + vaultId) === 'pending';
}

export function setInitialSyncPending(vaultId: string, pending: boolean): void {
  if (onDisk(vaultId) && section) {
    section.initialSync = pending;
    void writeSyncSection({ initialSync: pending });
    return;
  }
  if (pending) writeFallbackText(INITIAL_SYNC_PREFIX + vaultId, 'pending');
  else removeFallbackKey(INITIAL_SYNC_PREFIX + vaultId);
}

export function loadTombstones(scope: SyncScope): TombstoneMap {
  // Synchronous by contract: pushes and incoming bundles read the ledger inside their own sync
  // paths. A copy goes out, so a caller mutating what it got cannot change the snapshot under a
  // write it never made. The snapshot belongs to one vault: between a switch and the hydration
  // that follows it, the honest answer is the old storage, not another vault's deletes.
  if (onDisk(scope.vaultId) && section) return { ...section.tombstones };
  return sanitizeTombstones(readStoredJson<unknown>(tombstonesKey(scope), {}));
}

/**
 * Replaces the ledger with what the caller just learned about deletes. The map is complete on
 * every call, so the write is not awaited: a push is not worth a disk round trip, and a save that
 * fails is carried again by the next one.
 */
export function saveTombstones(scope: SyncScope, tombstones: TombstoneMap): void {
  const clean = sanitizeTombstones(tombstones);
  if (onDisk(scope.vaultId) && section) {
    section.tombstones = clean;
    void writeSyncSection({ tombstones: clean });
    return;
  }
  writeFallbackJson(tombstonesKey(scope), clean);
}

/** A new seed phrase or a new server is a new room: the ledgers of the old one mean nothing there. */
export function clearSyncLedgers(scope: SyncScope): void {
  if (onDisk(scope.vaultId) && section) {
    section.tombstones = {};
    section.cursor[roomOf(scope)] = 0;
    section.sentHashes[roomOf(scope)] = {};
    section.syncedIds = [];
    section.stateHash = {};
    section.outbox = [];
    void writeSyncSection(sectionToPatch(section));
    return;
  }
  removeFallbackKey(tombstonesKey(scope));
  removeFallbackKey(syncedIdsKey(scope));
  removeFallbackKey(cursorKey(scope));
  removeFallbackKey(sentHashesKey(scope));
  removeFallbackKey(stateHashKey(scope));
  removeFallbackKey(OUTBOX_PREFIX + scope.vaultId);
  // The checkpoint the old build kept aside for a self-hosted default vault goes with them.
  if (scope.vaultId === 'default_vault') removeFallbackKey(LAST_STATE_HASH_KEY);
}

export function loadOutbox(vaultId: string): SyncOperation[] {
  if (onDisk(vaultId)) return [...(section?.outbox ?? [])];
  return sanitizeOutbox(readStoredJson<unknown>(OUTBOX_PREFIX + vaultId, []));
}

export function saveOutbox(vaultId: string, ops: SyncOperation[]): void {
  const clean = sanitizeOutbox(ops);
  if (onDisk(vaultId) && section) {
    section.outbox = clean;
    void writeSyncSection({ outbox: clean });
    return;
  }
  writeFallbackJson(OUTBOX_PREFIX + vaultId, clean);
}

export function clearOutbox(vaultId: string): void {
  saveOutbox(vaultId, []);
}
