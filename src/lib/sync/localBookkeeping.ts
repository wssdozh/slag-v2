// What this device sent, knows and deleted, so a push stays a diff instead of a resend.
import { SYNC_STORAGE_KEYS } from '../../config';
import { readStoredJson } from '../storage/readJson';

/**
 * What this device already sent, already knows and already deleted.
 *
 * Sync keeps three localStorage ledgers so a push is a diff, not a full resend:
 * hashes of the last state per entity, ids the relay has seen, and tombstones for
 * deletes. They change when the dedupe rules change — nothing here knows about
 * websockets, bundles or accounts.
 */

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

export function loadSyncedIds(scope: SyncScope): Set<string> {
  return readStoredJson<Set<string>>(syncedIdsKey(scope), new Set(), value => (
    Array.isArray(value) ? new Set(value as string[]) : undefined
  ));
}

export function loadTombstones(scope: SyncScope): Record<string, number> {
  return readStoredJson<Record<string, number>>(tombstonesKey(scope), {});
}

/** First run against a vault that already has notes: treat all of them as known. */
export function seedSyncedIds(scope: SyncScope, ids: string[]): void {
  if (localStorage.getItem(syncedIdsKey(scope))) return;
  localStorage.setItem(syncedIdsKey(scope), JSON.stringify(ids));
}
