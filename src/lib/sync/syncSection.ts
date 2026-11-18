// The shape of `state.json`'s `sync` section: which keys it holds, what each may contain, how two
// copies merge, and what the config record may never carry.
//
// Pure on purpose, like `tombstones.ts`: no Tauri, no `localStorage`, no logger, and every import
// carries its extension, so `node --test` reads this file as is instead of testing a copy of these
// rules. What the values *mean* — which room a cursor belongs to, when a seed is minted — is the
// caller's business.
import { mergeTombstones, tombstonesFromState } from './tombstones.ts';
import type { TombstoneMap } from './tombstones.ts';
import type { SyncOperation } from './entities/types.ts';
import type { DeviceProfile, SyncConfig } from './types.ts';

/**
 * The section as this device holds it in memory: one map per ledger, one entry per room where a
 * checkpoint is per room. The config is deliberately not part of this shape — its record has its
 * own rules below, and the only thing the ledgers need to know about it is that it is a sibling
 * key in the same section.
 */
export interface SyncSectionState {
  /** What was deleted and when: the one ledger whose loss hands a deleted note back. */
  tombstones: TombstoneMap;
  /** How far this device has pulled, per room. */
  cursor: Record<string, number>;
  /** Hashes of the last state this device sent, per room. */
  sentHashes: Record<string, Record<string, string>>;
  /** Ids the relay has seen. A missing one looks like a note this device never had. */
  syncedIds: string[];
  /** When a file was last asked for, per room. */
  attachmentRequests: Record<string, Record<string, number>>;
  /** When this vault deleted a draft: a peer replaying the text must lose it. */
  draftTombstones: Record<string, number>;
  /** The root hash each room last received. A miss costs one full push. */
  stateHash: Record<string, string>;
  /** Unsent operations. Not a cache: a folder delete exists nowhere else. */
  outbox: SyncOperation[];
  /** A first pull that has not drained yet, so a restart resumes instead of editing half a vault. */
  initialSync: boolean;
}

const OUTBOX_KINDS: ReadonlySet<string> = new Set(['item', 'folder', 'workspace', 'trash', 'attachment', 'draft', 'memory']);
const OUTBOX_ACTIONS: ReadonlySet<string> = new Set(['upsert', 'delete', 'rename', 'restore', 'purge']);

export function emptySection(): SyncSectionState {
  return {
    tombstones: {},
    cursor: {},
    sentHashes: {},
    syncedIds: [],
    attachmentRequests: {},
    draftTombstones: {},
    stateHash: {},
    outbox: [],
    initialSync: false,
  };
}

/** A missing file, an older build and a hand-edited section all read as "nothing here yet". */
export function sectionFromState(value: unknown): SyncSectionState {
  if (!isRecord(value)) return emptySection();
  return {
    tombstones: tombstonesFromState(value),
    cursor: sanitizeNumbers(value.cursor),
    sentHashes: sanitizeRoomRecords(value.sentHashes, sanitizeHashRecord),
    syncedIds: sanitizeIds(value.syncedIds),
    attachmentRequests: sanitizeRoomRecords(value.attachmentRequests, sanitizeNumbers),
    draftTombstones: sanitizeNumbers(value.draftTombstones),
    stateHash: sanitizeRecords(value.stateHash, (entry) => (typeof entry === 'string' && entry ? entry : undefined)),
    outbox: sanitizeOutbox(value.outbox),
    initialSync: value.initialSync === true,
  };
}

/**
 * What one write puts in the file. Every ledger under its own key, because `writeStateSection`
 * merges at the top level: a write that carried a sibling's key would be a second opinion about
 * somebody else's data.
 */
export function sectionToPatch(state: SyncSectionState): Record<string, unknown> {
  return {
    tombstones: state.tombstones,
    cursor: state.cursor,
    sentHashes: state.sentHashes,
    syncedIds: state.syncedIds,
    attachmentRequests: state.attachmentRequests,
    draftTombstones: state.draftTombstones,
    stateHash: state.stateHash,
    outbox: state.outbox,
    initialSync: state.initialSync,
  };
}

/**
 * Two copies of the section into one. The file wins per entry — it is the newer copy — while the
 * old `localStorage` blob only fills what the file has never had. This is the migration rule too:
 * a move that dies halfway drops nothing, and running it twice adds nothing.
 */
export function mergeSectionState(stored: Partial<SyncSectionState>, legacy: Partial<SyncSectionState>): SyncSectionState {
  return {
    tombstones: mergeTombstones(stored.tombstones ?? {}, legacy.tombstones ?? {}),
    cursor: mergeNumbers(stored.cursor ?? {}, legacy.cursor ?? {}),
    sentHashes: mergeRoomRecords(stored.sentHashes ?? {}, legacy.sentHashes ?? {}),
    syncedIds: mergeIds(stored.syncedIds ?? [], legacy.syncedIds ?? []),
    attachmentRequests: mergeRoomRecords(stored.attachmentRequests ?? {}, legacy.attachmentRequests ?? {}),
    draftTombstones: mergeNumbers(stored.draftTombstones ?? {}, legacy.draftTombstones ?? {}),
    stateHash: { ...legacy.stateHash, ...stored.stateHash },
    outbox: mergeOutbox(stored.outbox ?? [], legacy.outbox ?? []),
    initialSync: stored.initialSync === true || legacy.initialSync === true,
  };
}

/** The later stamp wins: a cursor never goes back, and neither does a delete. */
export function mergeNumbers(stored: Record<string, number>, legacy: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = { ...sanitizeNumbers(legacy) };
  for (const [key, value] of Object.entries(sanitizeNumbers(stored))) {
    merged[key] = Math.max(merged[key] ?? 0, value);
  }
  return merged;
}

/** Ids only add up: a forgotten one would look like a note this device has never heard of. */
export function mergeIds(stored: string[], legacy: string[]): string[] {
  const merged = sanitizeIds(stored);
  const seen = new Set(merged);
  for (const id of sanitizeIds(legacy)) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/** One op per `opId`: the same unsent change is the same change, whichever copy it came from. */
export function mergeOutbox(stored: SyncOperation[], legacy: SyncOperation[]): SyncOperation[] {
  const merged = sanitizeOutbox(stored);
  const seen = new Set(merged.map((op) => op.opId));
  for (const op of sanitizeOutbox(legacy)) {
    if (seen.has(op.opId)) continue;
    seen.add(op.opId);
    merged.push(op);
  }
  return merged;
}

/** Only what a number can be here: a finite positive stamp or a cursor. Junk is dropped. */
export function sanitizeNumbers(value: unknown): Record<string, number> {
  return sanitizeRecords(value, (entry) => (
    typeof entry === 'number' && Number.isFinite(entry) && entry > 0 ? entry : undefined
  ));
}

/** Ids only: an empty string or a number is not an id the relay has seen. */
export function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

/** An op is seven named fields; half an op would be replayed as a change nobody asked for. */
export function sanitizeOutbox(value: unknown): SyncOperation[] {
  if (!Array.isArray(value)) return [];
  const ops: SyncOperation[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { opId, kind, id, action, timestamp } = entry;
    if (typeof opId !== 'string' || !opId || seen.has(opId)) continue;
    if (typeof kind !== 'string' || !OUTBOX_KINDS.has(kind)) continue;
    if (typeof id !== 'string' || !id) continue;
    if (typeof action !== 'string' || !OUTBOX_ACTIONS.has(action)) continue;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
    seen.add(opId);
    const op: SyncOperation = { opId, kind: kind as SyncOperation['kind'], id, action: action as SyncOperation['action'], timestamp };
    if (entry.payload !== undefined) op.payload = entry.payload;
    if (typeof entry.oldPath === 'string' && entry.oldPath) op.oldPath = entry.oldPath;
    ops.push(op);
  }
  return ops;
}

// ── the config's corner ────────────────────────────────────────────────────────────────────────
//
// The section holds one config per vault. Its shape lives here for the same reason the ledgers'
// does, and because the one rule that matters about it is a shape rule: the seed phrase is not a
// field of it, so it cannot reach a file by somebody spreading an object that grew one.

export function configToState(config: Partial<SyncConfig>): Record<string, unknown> {
  const state: Record<string, unknown> = {
    enabled: config.enabled !== false,
    serverUrl: stringOr(config.serverUrl, ''),
    deviceId: stringOr(config.deviceId, ''),
    deviceName: stringOr(config.deviceName, ''),
    autoSync: config.autoSync !== false,
    trustedDevices: sanitizeDevices(config.trustedDevices),
  };
  if (config.subscriptionPlan !== undefined) state.subscriptionPlan = config.subscriptionPlan;
  if (config.bgSyncIntervalMinutes !== undefined) state.bgSyncIntervalMinutes = config.bgSyncIntervalMinutes;
  if (config.localSyncMode !== undefined) state.localSyncMode = config.localSyncMode;
  if (config.canRunAiLease !== undefined) state.canRunAiLease = config.canRunAiLease;
  return state;
}

/** A missing key, junk and an older build all read as "this field was never stored". */
export function configFromState(value: unknown): Partial<SyncConfig> {
  if (!isRecord(value)) return {};
  const config: Partial<SyncConfig> = {};
  if (typeof value.enabled === 'boolean') config.enabled = value.enabled;
  if (typeof value.serverUrl === 'string' && value.serverUrl) config.serverUrl = value.serverUrl;
  if (typeof value.deviceId === 'string' && value.deviceId) config.deviceId = value.deviceId;
  if (typeof value.deviceName === 'string' && value.deviceName) config.deviceName = value.deviceName;
  if (typeof value.autoSync === 'boolean') config.autoSync = value.autoSync;
  if (value.subscriptionPlan === 'free' || value.subscriptionPlan === 'smile' || value.subscriptionPlan === 'angry') {
    config.subscriptionPlan = value.subscriptionPlan;
  }
  if (value.bgSyncIntervalMinutes === 0 || value.bgSyncIntervalMinutes === 10 || value.bgSyncIntervalMinutes === 30) {
    config.bgSyncIntervalMinutes = value.bgSyncIntervalMinutes;
  }
  if (value.localSyncMode === 'read-write' || value.localSyncMode === 'receive-only') {
    config.localSyncMode = value.localSyncMode;
  }
  if (typeof value.canRunAiLease === 'boolean') config.canRunAiLease = value.canRunAiLease;
  if (Array.isArray(value.trustedDevices)) config.trustedDevices = sanitizeDevices(value.trustedDevices);
  return config;
}

/** The file wins field by field, and the old blob only fills what the file never had. */
export function mergeConfigState(stored: Partial<SyncConfig>, legacy: Partial<SyncConfig>): Partial<SyncConfig> {
  return { ...legacy, ...stored };
}

/** A payload map: every value is a hash this device already sent. */
function sanitizeHashRecord(value: unknown): Record<string, string> {
  return sanitizeRecords(value, (entry) => (typeof entry === 'string' && entry ? entry : undefined));
}

/** One ledger per room: a room key with junk under it is no room at all. */
function sanitizeRoomRecords<T>(value: unknown, sanitize: (entry: unknown) => Record<string, T>): Record<string, Record<string, T>> {
  const rooms: Record<string, Record<string, T>> = {};
  if (!isRecord(value)) return rooms;
  for (const [room, entry] of Object.entries(value)) {
    if (!room || !isRecord(entry)) continue;
    rooms[room] = sanitize(entry);
  }
  return rooms;
}

function sanitizeRecords<T>(value: unknown, sanitize: (entry: unknown) => T | undefined): Record<string, T> {
  const records: Record<string, T> = {};
  if (!isRecord(value)) return records;
  for (const [key, entry] of Object.entries(value)) {
    if (!key) continue;
    const clean = sanitize(entry);
    if (clean !== undefined) records[key] = clean;
  }
  return records;
}

function mergeRoomRecords<T>(stored: Record<string, Record<string, T>>, legacy: Record<string, Record<string, T>>): Record<string, Record<string, T>> {
  const merged: Record<string, Record<string, T>> = {};
  for (const [room, entries] of Object.entries(legacy)) merged[room] = { ...entries };
  for (const [room, entries] of Object.entries(stored)) merged[room] = { ...merged[room], ...entries };
  return merged;
}

/** A device record the config can keep: an id, a name, and the fields a pairing wrote. */
function sanitizeDevices(value: unknown): DeviceProfile[] {
  if (!Array.isArray(value)) return [];
  const devices: DeviceProfile[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.id !== 'string' || !entry.id) continue;
    if (typeof entry.name !== 'string' || !entry.name) continue;
    devices.push({
      id: entry.id,
      name: entry.name,
      platform: entry.platform === 'mobile' || entry.platform === 'web' ? entry.platform : 'desktop',
      isCurrent: entry.isCurrent === true,
      syncMode: entry.syncMode === 'receive-only' ? 'receive-only' : 'read-write',
      canRunAiLease: entry.canRunAiLease === true,
      publicKey: typeof entry.publicKey === 'string' ? entry.publicKey : undefined,
      pairedAt: typeof entry.pairedAt === 'string' ? entry.pairedAt : '',
      lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : '',
      allowedVaults: Array.isArray(entry.allowedVaults)
        ? entry.allowedVaults.filter((path): path is string => typeof path === 'string')
        : undefined,
    });
  }
  return devices;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
