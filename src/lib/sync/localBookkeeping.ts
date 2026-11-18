// What this device sent, knows and deleted, so a push stays a diff instead of a resend.
import { SYNC_STORAGE_KEYS } from '../../config';
import { readStoredJson } from '../storage/readJson';
import { logger } from '../logger/logger';
import { mergeTombstones, sanitizeTombstones, tombstonesFromState, tombstonesToState } from './tombstones';
import type { TombstoneMap, TombstonesSection } from './tombstones';

/**
 * What this device already sent, already knows and already deleted.
 *
 * Sync keeps three ledgers so a push is a diff, not a full resend: hashes of the last state per
 * entity, ids the relay has seen, and tombstones for deletes. They change when the dedupe rules
 * change — nothing here knows about websockets, bundles or accounts.
 *
 * Two of them are caches: losing the hashes or the known ids costs traffic, the next push rebuilds
 * them. Tombstones are not. A deleted note has no file left to compare against, so a lost tombstone
 * means the relay quietly hands the note back — which is why they are hydrated from the vault's
 * `state.json` and `localStorage` stops being written for them.
 */

const bookkeepingLog = logger.scope('SYNC');

/** The `state.json` section tombstones live in; the store adapter names it, nothing else does. */
export const SYNC_SECTION = 'sync';

export interface SyncScope {
  vaultId: string;
  /** Account rooms keep their own checkpoint: a new mapping must resend everything. */
  roomId: string | null;
  accountSync: boolean;
}

const LAST_STATE_HASH_KEY = SYNC_STORAGE_KEYS.LAST_STATE_HASH;

export function stateHashKey(scope: SyncScope, vaultId?: string): string {
  const vid = vaultId || scope.vaultId;
  return scope.accountSync && scope.roomId
    ? `${LAST_STATE_HASH_KEY}_${vid}_${scope.roomId}`
    : `${LAST_STATE_HASH_KEY}_${vid}`;
}

export function syncedIdsKey(scope: SyncScope, vaultId?: string): string {
  return `slag_sync_synced_ids_${vaultId || scope.vaultId}`;
}

export function tombstonesKey(scope: SyncScope, vaultId?: string): string {
  return `slag_sync_tombstones_${vaultId || scope.vaultId}`;
}

export function sentHashesKey(scope: SyncScope, vaultId?: string): string {
  return `slag_sync_sent_hashes_${vaultId || scope.vaultId}_${scope.roomId || 'local'}`;
}

/** How far this device has pulled. A dropped pull resumes instead of re-reading the room. */
export function cursorKey(scope: SyncScope, vaultId?: string): string {
  return `slag_sync_cursor_${vaultId || scope.vaultId}_${scope.roomId || 'local'}`;
}

/** When this device last asked the room for a file: one request per id per day, not per push. */
export function attachmentRequestsKey(scope: SyncScope, vaultId?: string): string {
  return `slag_sync_attachment_requests_${vaultId || scope.vaultId}_${scope.roomId || 'local'}`;
}

export const ATTACHMENT_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function loadCursor(scope: SyncScope): number {
  const raw = localStorage.getItem(cursorKey(scope));
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveCursor(scope: SyncScope, cursor: number): void {
  localStorage.setItem(cursorKey(scope), String(cursor));
}

export function loadSentHashes(scope: SyncScope): Record<string, string> {
  return readStoredJson<Record<string, string>>(sentHashesKey(scope), {});
}

export function saveSentHashes(scope: SyncScope, hashes: Record<string, string>): void {
  try {
    localStorage.setItem(sentHashesKey(scope), JSON.stringify(hashes));
  } catch {
    // Quota exceeded: the next push simply resends a few unchanged entities.
  }
}

export function loadAttachmentRequests(scope: SyncScope): Record<string, number> {
  return readStoredJson<Record<string, number>>(attachmentRequestsKey(scope), {});
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
  try {
    localStorage.setItem(attachmentRequestsKey(scope), JSON.stringify(requests));
  } catch {
    // Quota exceeded: the next scan asks again, which costs one small bundle.
  }
}

export function loadSyncedIds(scope: SyncScope): Set<string> {
  return readStoredJson<Set<string>>(syncedIdsKey(scope), new Set(), value => (
    Array.isArray(value) ? new Set(value as string[]) : undefined
  ));
}

/**
 * Where tombstones live once they are off `localStorage`: the `sync` section of the vault's
 * `state.json`. It does not name a vault on purpose — the engine, which is the only thing that
 * knows a switch happened, decides whether a queued write still belongs to the loaded vault.
 */
export interface TombstoneStore {
  read(): Promise<unknown>;
  write(section: TombstonesSection): Promise<void>;
}

/**
 * The tombstones the disk has. `null` means "not hydrated yet": a first run, an older build, a web
 * build with no filesystem — and then every reader falls back to `localStorage`, exactly as before.
 */
let tombstoneSnapshot: TombstoneMap | null = null;
let tombstoneStore: TombstoneStore | null = null;
let hydratedVaultId: string | null = null;

export function loadTombstones(scope: SyncScope): TombstoneMap {
  // Synchronous by contract: pushes and incoming bundles read the ledger inside their own sync
  // paths. A copy goes out, so a caller mutating what it got cannot change the snapshot under a
  // write it never made. The snapshot belongs to one vault: between a switch and the hydration
  // that follows it, the honest answer is the old storage, not another vault's deletes.
  if (tombstoneSnapshot && hydratedVaultId === scope.vaultId) return { ...tombstoneSnapshot };
  return sanitizeTombstones(readStoredJson<unknown>(tombstonesKey(scope), {}));
}

/**
 * Moves the ledger onto the disk: once per vault, and before the first pull or push, because a
 * pull without it accepts a stale copy of a note this device deleted and a push without it says
 * nothing about that note at all. The old `localStorage` blob is merged in, not replaced.
 */
export async function hydrateTombstones(scope: SyncScope, store: TombstoneStore): Promise<void> {
  if (tombstoneSnapshot && hydratedVaultId === scope.vaultId) return;
  const legacyKey = tombstonesKey(scope);
  const legacy = sanitizeTombstones(readStoredJson<unknown>(legacyKey, {}));

  let stored: TombstoneMap;
  try {
    stored = tombstonesFromState(await store.read());
  } catch (err) {
    // No readable disk means no new home: stay on the old one instead of pretending to move.
    bookkeepingLog.warn('Tombstones stay in localStorage, the sync section could not be read:', err);
    tombstoneSnapshot = null;
    tombstoneStore = null;
    hydratedVaultId = null;
    return;
  }

  const merged = mergeTombstones(stored, legacy);
  if (Object.keys(legacy).length > 0) {
    try {
      await store.write(tombstonesToState(merged));
    } catch (err) {
      bookkeepingLog.warn('Could not move the tombstones to disk, keeping the localStorage copy:', err);
      tombstoneSnapshot = merged;
      tombstoneStore = null;
      return;
    }
  }

  // Section or not, the file is the truth from here on: a stale blob would merge back a tombstone
  // that a restore on another device has already dropped.
  localStorage.removeItem(legacyKey);
  tombstoneSnapshot = merged;
  tombstoneStore = store;
  hydratedVaultId = scope.vaultId;
}

/**
 * Replaces the ledger with what the caller just learned about deletes. The map is complete on
 * every call, so the write is not awaited: a push is not worth a disk round trip, and a save that
 * fails is carried again by the next one.
 */
export function saveTombstones(scope: SyncScope, tombstones: TombstoneMap): void {
  const clean = sanitizeTombstones(tombstones);
  tombstoneSnapshot = clean;
  if (!tombstoneStore) {
    try {
      localStorage.setItem(tombstonesKey(scope), JSON.stringify(clean));
    } catch {
      // Quota exceeded: a tombstone only survives in memory this session, so the next push may
      // resend one delete for an id it already knew.
    }
    return;
  }
  void tombstoneStore.write(tombstonesToState(clean)).catch((err: unknown) => {
    bookkeepingLog.warn('Could not save the tombstones to disk:', err);
  });
}

/** A new seed phrase or a new server is a new room: the deletes of the old one mean nothing there. */
export function clearTombstones(scope: SyncScope): void {
  tombstoneSnapshot = {};
  localStorage.removeItem(tombstonesKey(scope));
  if (!tombstoneStore) return;
  void tombstoneStore.write(tombstonesToState({})).catch((err: unknown) => {
    bookkeepingLog.warn('Could not clear the tombstones on disk:', err);
  });
}

/** First run against a vault that already has notes: treat all of them as known. */
export function seedSyncedIds(scope: SyncScope, ids: string[]): void {
  if (localStorage.getItem(syncedIdsKey(scope))) return;
  localStorage.setItem(syncedIdsKey(scope), JSON.stringify(ids));
}
