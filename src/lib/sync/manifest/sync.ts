// The room's own copy of this vault's manifest: build → peers → decide → react → publish → status.
// One resend per peer root, then a report. The peer that diverged is who the resend is aimed at.
import { SYNC_INTERVALS } from '../../../config';
import { logger } from '../../logger/logger';
import { vault } from '../../storage/port';
import { buildManifest } from '../../vault/integrity/manifest';
import type { Manifest } from '../../vault/integrity/types';
import type { SyncEngine } from '../syncEngine';
import type { ManifestPeerStatus, ManifestStatus, ManifestTrigger } from '../types';
import { decideManifest, describeWire, diffWire, leavesToRequest, toWire } from './channel';
import type { ManifestDecision, PeerManifest } from './channel';
import { readPeerManifests, requestMissingNotes } from './peers';
import { publishManifest } from './publish';
import { resolveRejected } from './resolve';

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
      return { deviceId: peer.deviceId, root: peer.root, inSync: drift.rootMatch, extra: drift.extra, missing: drift.missing };
    }),
  };
}

/** The refused notes go to the trash, which a person can undo; a delete could not be. */
export function trashRejectedNotes(ids: string[]): void {
  if (ids.length === 0) return;
  for (const id of ids) vault().moveToTrash(id);
  syncLog.warn(`Убрал в корзину ${ids.length} заметок, которых сосед не принял: ${ids.join(', ')}`);
}

/** The status object the panel subscribes to: the same one between checks. */
export function getManifest(engine: SyncEngine): ManifestStatus | null {
  return engine.status.manifest ?? null;
}

export async function syncManifest(
  engine: SyncEngine,
  trigger: ManifestTrigger = 'start',
  manual = false,
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

  // Read the peers BEFORE publishing: a POST first leaves this device reading its own row back and
  // answering "in sync" to itself — the bug of dev.37, 86 of those a day.
  const peers = await readPeerManifests(engine);
  if (generation !== engine.initGeneration) return;

  const wire = toWire(local);
  const decision = decideManifest(local, peers, {
    // A person pressing «сверить сейчас» gets a resend even if this peer root was already answered:
    // the latch stops a machine from looping, not a person from asking.
    reconciledRoot: manual ? null : engine.manifestReconcileRoot,
    receiveOnly: engine.config.localSyncMode === 'receive-only',
  });

  if (decision.action === 'reconcile' && decision.peer) {
    // One resend per peer state; the recheck confirms it landed instead of waiting for an edit.
    engine.manifestReconcileRoot = decision.peer.root;
    engine.manifestResentAt = Date.now();
    engine.forceFullPush = true;
    engine.scheduleDebouncedPush(0);
    engine.scheduleManifestCheck(SYNC_INTERVALS.MANIFEST_RECHECK_MS, 'push');
    syncLog.warn(`Корень разошёлся с соседом: переотправляю состояние (${describeWire(wire)})`);
  }

  // Publish last: the row carries what this device holds now, after the resend above.
  let published = engine.manifestPostedRoot === local.root;
  if (!published) {
    published = await publishManifest(engine, wire);
    if (generation !== engine.initGeneration) return;
    if (published) engine.manifestPostedRoot = local.root;
  }
  engine.status.manifest = manifestStatus(local, peers, decision, trigger);
  engine.notify();

  // Named notes are asked for by id; the answer is an ordinary bundle, so `applyBundle` stays the
  // only way in.
  if (decision.peer && decision.drift) {
    const ids = leavesToRequest(decision.drift, decision.peer);
    if (ids.length > 0) void requestMissingNotes(engine, decision.peer, ids);
  }

  if (!published) syncLog.debug(`${describeWire(wire)} не записан; сверка подождёт следующей попытки`);
  else if (peers.length === 0) syncLog.info(`${describeWire(wire)} записан; других устройств в комнате пока нет`);
  else if (decision.action === 'none') syncLog.info(`${describeWire(wire)}; корень сходится с соседями`);
  // Debug, not warn: a device that cannot converge would otherwise write this line every check
  // interval, forever, and drown the log.
  else if (decision.action === 'report') syncLog.debug(`${describeWire(wire)}; корень расходится с соседом`);

  if (published && decision.action === 'report') {
    const ids = resolveRejected(engine, local, decision);
    if (ids.length > 0) trashRejectedNotes(ids);
  }
}
