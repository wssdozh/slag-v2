// Compare peer snapshots for diagnostics. A snapshot cannot authorize vault writes.
import { logger } from '../../logger/logger';
import { vault } from '../../storage/port';
import { buildManifest } from '../../vault/integrity/manifest';
import type { Manifest } from '../../vault/integrity/types';
import type { SyncEngine } from '../syncEngine';
import type { ManifestPeerStatus, ManifestStatus, ManifestTrigger } from '../types';
import { decideManifest, describeWire, diffWire, toWire } from './channel';
import type { ManifestDecision, PeerManifest } from './channel';
import { readPeerManifests } from './peers';
import { publishManifest } from './publish';

const syncLog = logger.scope('SYNC');

/** The snapshot the panel draws: this device's root, the verdict and one line per peer. */
function manifestStatus(
  local: Manifest,
  peers: PeerManifest[],
  decision: ManifestDecision,
  trigger: ManifestTrigger,
): ManifestStatus {
  return {
    at: new Date().toISOString(),
    root: local.root,
    remoteRoot: decision.peer?.root ?? null,
    inSync: peers.length > 0 && peers.every((peer) => peer.root === local.root),
    folders: decision.drift?.folders ?? [],
    extra: decision.drift?.extra ?? [],
    missing: decision.drift?.missing ?? [],
    action: decision.action,
    trigger,
    peers: peers.map((peer): ManifestPeerStatus => {
      const drift = diffWire(local, peer);
      return {
        deviceId: peer.deviceId, anonymous: peer.deviceId === null, at: peer.at, root: peer.root,
        inSync: drift.rootMatch, extra: drift.extra, missing: drift.missing,
      };
    }),
  };
}

/** The status object the panel subscribes to: the same one between checks. */
export function getManifest(engine: SyncEngine): ManifestStatus | null {
  return engine.status.manifest ?? null;
}

export async function syncManifest(
  engine: SyncEngine,
  trigger: ManifestTrigger = 'start',
): Promise<void> {
  const generation = engine.initGeneration;
  let local: Manifest;
  try {
    local = await buildManifest(vault().getItems(), vault().getFolders());
  } catch (error) {
    syncLog.debug('Манифест не построен', { error: String(error) });
    return;
  }
  if (generation !== engine.initGeneration) return;

  // Read the peers BEFORE publishing: a POST first leaves this device reading its own row back.
  const observedPeers = await readPeerManifests(engine);
  const peers = observedPeers ?? [];
  if (generation !== engine.initGeneration) return;

  const wire = toWire(local);
  const decision = decideManifest(local, peers);

  // Publishing fingerprints is diagnostic only; no peer is asked to synthesize vault writes.
  let published = engine.manifestPostedRoot === local.root;
  if (!published) {
    published = await publishManifest(engine, wire);
    if (generation !== engine.initGeneration) return;
    if (published) engine.manifestPostedRoot = local.root;
  }
  if (observedPeers) engine.status.manifest = manifestStatus(local, observedPeers, decision, trigger);
  engine.notify();

  if (decision.action === 'report') {
    void engine.fetchPendingBundlesHttp().catch((error: unknown) => {
      syncLog.debug('Не удалось дочитать очередь после сверки', { error: String(error) });
    });
  }

  if (!published) syncLog.debug(`${describeWire(wire)} не записан; сверка подождёт следующей попытки`);
  else if (observedPeers === null) return;
  else if (peers.length === 0) syncLog.info(`${describeWire(wire)} записан; сводок других устройств пока нет`);
  else if (decision.action === 'none') syncLog.info(`${describeWire(wire)}; корень сходится с соседями`);
  // A peer snapshot is not a deletion receipt, even when it was published after a resend.
  else if (decision.action === 'report') syncLog.debug(`${describeWire(wire)}; корень расходится с соседом`);
}
