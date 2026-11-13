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

export function loadTombstones(scope: SyncScope): Record<string, number> {
  return readStoredJson<Record<string, number>>(tombstonesKey(scope), {});
}

/** First run against a vault that already has notes: treat all of them as known. */
export function seedSyncedIds(scope: SyncScope, ids: string[]): void {
  if (localStorage.getItem(syncedIdsKey(scope))) return;
  localStorage.setItem(syncedIdsKey(scope), JSON.stringify(ids));
}
