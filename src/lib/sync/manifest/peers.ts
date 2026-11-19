// Who else in this room published a root, and what to ask them for.
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
 * `204` is "you already have the latest syncId", `404` is "nobody published yet": both mean the
 * room answered nothing, and neither is worth an error in the panel.
 */
export async function readPeerManifests(engine: SyncEngine): Promise<PeerManifest[]> {
  try {
    const response = await fetch(manifestRoomUrl(engine, engine.config.deviceId), {
      headers: authHeaders(engine),
      signal: AbortSignal.timeout(SYNC_INTERVALS.MANIFEST_TIMEOUT_MS),
    });
    if (response.status === 204 || response.status === 404) return [];
    if (!response.ok) {
      syncLog.debug(`Манифесты соседей не прочитаны: HTTP ${response.status}`);
      return [];
    }
    // A row naming this device is this device: comparing it with ourselves is the "in sync" lie
    // that shipped in dev.37, so it never counts as a peer.
    return parsePeerManifests(await response.json()).filter(
      (peer) => peer.deviceId !== engine.config.deviceId,
    );
  } catch (error) {
    syncLog.debug('Манифесты соседей не прочитаны: сервер не ответил', { error: String(error) });
    return [];
  }
}

/**
 * Asks one peer for the notes only it has, by id.
 *
 * The answer is an ordinary bundle and `applyBundle` is its only receiver: this is a request for
 * state that already travels the room's normal path, not a second sync channel. An old client has
 * no device id to address, so there is nobody to ask — that divergence stays a report.
 */
export async function requestMissingNotes(
  engine: SyncEngine,
  peer: PeerManifest,
  ids: string[],
): Promise<void> {
  if (peer.deviceId === null || ids.length === 0 || peer.leaves === undefined) return;
  const url = `${apiBase(engine.config.serverUrl)}/api/rooms/${engine.activeRoomId}/sync-request`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(engine, true),
      body: JSON.stringify({ type: 'note_request', to: peer.deviceId, ids }),
      signal: AbortSignal.timeout(SYNC_INTERVALS.MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // A relay older than this app answers 404: a fact about the deployment, not about the vault.
      syncLog.debug(`Запрос недостающих заметок не принят: HTTP ${response.status}`);
      return;
    }
    syncLog.info(`Попросил у устройства ${peer.deviceId} ${ids.length} заметок, которых у меня нет`);
  } catch (error) {
    syncLog.debug('Запрос недостающих заметок не отправлен: сервер не ответил', { error: String(error) });
  }
}
