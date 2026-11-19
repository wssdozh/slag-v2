// Writes this device's own manifest row into the room.
//
// One POST, and always after the comparison: a row written first makes the next reader compare
// against itself and answer "in sync" to a lie. The leaves travel when they fit; a vault too large
// for them goes without, because the root and the folders are what the comparison needs.
import { SYNC_INTERVALS } from '../../../config';
import { logger } from '../../logger/logger';
import type { WireManifest } from '../../vault/integrity/types';
import { authHeaders } from '../syncConfig';
import type { SyncEngine } from '../syncEngine';
import { MAX_WIRE_BYTES, wireBytes, wireToText } from './channel';
import { manifestRoomUrl } from './peers';

const syncLog = logger.scope('SYNC');

export async function publishManifest(engine: SyncEngine, wire: WireManifest): Promise<boolean> {
  const body = wireBytes(wire) > MAX_WIRE_BYTES
    ? wireToText({ ...wire, leaves: undefined })
    : wireToText(wire);
  try {
    const response = await fetch(manifestRoomUrl(engine, engine.config.deviceId), {
      method: 'POST',
      headers: authHeaders(engine, true),
      body,
      signal: AbortSignal.timeout(SYNC_INTERVALS.MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      syncLog.debug(`Манифест не записан: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    syncLog.debug('Манифест не записан: сервер не ответил', { error: String(error) });
    return false;
  }
}
