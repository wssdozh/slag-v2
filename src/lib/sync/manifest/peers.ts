// Who else in this room published a root.
//
// The relay keeps one manifest per device now, so a check reads the other devices' rows and gets
// the per-note leaves with them. An older relay keeps one row for the whole room and reports it in
// the old shape: both answers are narrowed here and leave as one list of peers, so nothing
// downstream has to guess which relay it is talking to.
import { SYNC_INTERVALS } from '../../../config';
import { logger } from '../../logger/logger';
import { apiBase } from '../apiBase';
import { authHeaders } from '../syncConfig';
import type { SyncEngine } from '../syncEngine';
import { parseWire, WIRE_VERSION, type PeerManifest } from './channel';

const syncLog = logger.scope('SYNC');

/** The room is scoped by vault exactly like a bundle: same pair, same authorization. */
function vaultParam(engine: SyncEngine): string {
  return engine.usesAccountSync() ? engine.getSyncVaultId() : engine.currentVaultId;
}

/**
 * The room's manifest endpoint. `device` is who is asking: the relay answers with everybody else's
 * rows. Without it an old relay answers the room's single row in the old shape.
 */
export function manifestRoomUrl(engine: SyncEngine, device?: string): string {
  const vaultId = encodeURIComponent(vaultParam(engine));
  const url = `${apiBase(engine.config.serverUrl)}/api/rooms/${engine.activeRoomId}/manifest?vault=${vaultId}`;
  return device === undefined ? url : `${url}&device=${encodeURIComponent(device)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One row of a peer answer, or `null` when it is not a manifest.
 *
 * The validation is `parseWire`'s, given the version a per-device row does not carry: a row is a
 * wire minus `v`, and two shapes of the same data must not grow two sets of rules. `at` is the
 * relay's own clock and says when the row was written; a relay that does not send it leaves `null`.
 */
function readPeerRow(raw: unknown, deviceId: string | null): PeerManifest | null {
  const wire = parseWire(isRecord(raw) ? { ...raw, v: WIRE_VERSION } : raw);
  if (wire === null) return null;
  const at = isRecord(raw) && typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : null;
  return { deviceId, at, root: wire.root, folders: wire.folders, leaves: wire.leaves };
}

/** The device a row belongs to; an old client's row has none, and that is not an error. */
function rowDeviceId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const deviceId = raw.deviceId;
  return typeof deviceId === 'string' && deviceId.length > 0 ? deviceId : null;
}

/**
 * Every manifest an answer names, in both formats.
 *
 * `manifests` plus `anonymous` is the per-device answer: the rows of the devices that named
 * themselves, and the room's old single row beside them. A bare `{v, root, folders}` is an old
 * relay: it is one peer with no device id and no leaves to name notes by.
 */
export function parsePeerManifests(raw: unknown): PeerManifest[] {
  if (!isRecord(raw)) return [];
  // A version this build does not speak is refused whole, like `parseWire` refuses a row of it.
  if (raw.v !== undefined && raw.v !== WIRE_VERSION) return [];

  if (Array.isArray(raw.manifests)) {
    const peers: PeerManifest[] = [];
    for (const row of raw.manifests) {
      const peer = readPeerRow(row, rowDeviceId(row));
      if (peer !== null) peers.push(peer);
    }
    const anonymous = readPeerRow(raw.anonymous, null);
    if (anonymous !== null) peers.push(anonymous);
    return peers;
  }

  const legacy = readPeerRow(raw, null);
  return legacy === null ? [] : [legacy];
}

/**
 * The other devices' manifests, or an empty list when there is nothing to compare against.
 *
 * `null` means no new observation (not modified or a failed read). A 404 for a missing
 * manifest is an empty room, not a transport failure.
 */
export async function readPeerManifests(engine: SyncEngine): Promise<PeerManifest[] | null> {
  try {
    const response = await fetch(manifestRoomUrl(engine, engine.config.deviceId), {
      headers: authHeaders(engine),
      signal: AbortSignal.timeout(SYNC_INTERVALS.MANIFEST_TIMEOUT_MS),
    });
    if (response.status === 204) return null;
    if (response.status === 404) return [];
    if (!response.ok) {
      syncLog.debug(`Манифесты соседей не прочитаны: HTTP ${response.status}`);
      return null;
    }
    // A row naming this device is this device: comparing it with ourselves is the "in sync" lie
    // that shipped in dev.37, so it never counts as a peer.
    return parsePeerManifests(await response.json()).filter(
      (peer) => peer.deviceId !== engine.config.deviceId,
    );
  } catch (error) {
    syncLog.debug('Манифесты соседей не прочитаны: сервер не ответил', { error: String(error) });
    return null;
  }
}
