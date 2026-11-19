// The room's own copy of this vault's manifest: publish ours, read the neighbour's, decide.
//
// The relay keeps one row per room and vault — the root and the per-folder hashes, never the
// leaves — so this module can verify *that* two devices agree without naming a single note. What
// it does with a disagreement is the bounded part: one full resend, once per peer state, and then
// a report. Nothing here loops, and nothing here turns the sync red: a manifest is a check on the
// engine, not a step of it.
import { isTauri } from '@tauri-apps/api/core';
import { SYNC_INTERVALS } from '../../config';
import { logger } from '../logger/logger';
import { isPrimaryWindow } from '../platform/windowControls';
import { vault } from '../storage/port';
import { buildManifest } from '../vault/integrity/manifest';
import type { Manifest, WireManifest } from '../vault/integrity/types';
import type { ManifestTrigger } from './types';
import { apiBase } from './apiBase';
import { MAX_WIRE_BYTES, decideManifest, describeWire, parseWire, toWire, wireBytes, wireToText } from './manifestChannel';
import { authHeaders } from './syncConfig';
import type { SyncEngine } from './syncEngine';

const syncLog = logger.scope('SYNC');

/** The room is scoped by vault exactly like a bundle: same pair, same authorization. */
function vaultParam(engine: SyncEngine): string {
  return engine.usesAccountSync() ? engine.getSyncVaultId() : engine.currentVaultId;
}

function roomUrl(engine: SyncEngine): string {
  const vaultId = encodeURIComponent(vaultParam(engine));
  return `${apiBase(engine.config.serverUrl)}/api/rooms/${engine.activeRoomId}/manifest?vault=${vaultId}`;
}

/**
 * Why this pass cannot happen. Not an error: the browser build has no vault on a disk, and an
 * index that is still being read describes a vault with no notes in it — a manifest built from
 * that would tell every device the vault emptied, which is the 2026-11-18 lesson again.
 */
function skipReason(engine: SyncEngine): string | null {
  if (!isTauri()) return 'в браузере нет хранилища на диске';
  if (!isPrimaryWindow()) return 'это не главное окно';
  if (!engine.config.enabled) return 'синхронизация выключена';
  if (!engine.activeRoomId || !engine.activeVaultKey) return 'комната ещё не готова';
  if (!vault().isHydrated()) return 'индекс ещё читается с диска';
  const initial = engine.status.initialSync;
  if (initial.vaultId === engine.currentVaultId && initial.state === 'loading') return 'идёт первая синхронизация';
  return null;
}

/**
 * Publishes this device's root and compares it with the room's.
 *
 * The leaves travel when they fit: the relay drops them today, and a build that starts keeping
 * them makes the comparison sharper without a client change. A vault large enough that they do
 * not fit goes without them — the root and the folders are what the comparison actually uses.
 */
async function postManifest(engine: SyncEngine, wire: WireManifest): Promise<boolean> {
  const body = wireBytes(wire) > MAX_WIRE_BYTES
    ? wireToText({ ...wire, leaves: undefined })
    : wireToText(wire);
  try {
    const response = await fetch(roomUrl(engine), {
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

/** The room's manifest, or `null` when there is none to read. */
async function readRemoteManifest(engine: SyncEngine): Promise<WireManifest | null> {
  try {
    const response = await fetch(roomUrl(engine), {
      headers: authHeaders(engine),
      signal: AbortSignal.timeout(SYNC_INTERVALS.MANIFEST_TIMEOUT_MS),
    });
    // `204` is "you already have the latest syncId", `404` is "nobody published yet": both mean
    // there is nothing to compare against, and neither is worth an error in the panel.
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) {
      syncLog.debug(`Манифест комнаты не прочитан: HTTP ${response.status}`);
      return null;
    }
    return parseWire(await response.json());
  } catch (error) {
    syncLog.debug('Манифест комнаты не прочитан: сервер не ответил', { error: String(error) });
    return null;
  }
}

export async function syncManifest(
  engine: SyncEngine,
  trigger: ManifestTrigger = 'start',
  manual = false,
): Promise<void> {
  const skip = skipReason(engine);
  if (skip) {
    syncLog.debug(`Сверка манифеста пропущена: ${skip}`);
    return;
  }

  const generation = engine.initGeneration;
  let local: Manifest;
  try {
    local = await buildManifest(vault().getItems(), vault().getFolders());
  } catch (error) {
    syncLog.debug('Манифест не построен', { error: String(error) });
    return;
  }
  if (generation !== engine.initGeneration) return;

  const wire = toWire(local);

  // Read the room BEFORE publishing. The relay keeps one row per room and vault, so a POST first
  // leaves this device comparing its root with the copy it has just written — a check that can
  // only ever answer "in sync". That bug shipped in dev.37 and both devices reported agreement
  // while holding 21 and 22 folders.
  const remote = await readRemoteManifest(engine);
  if (generation !== engine.initGeneration) return;

  const decision = decideManifest(local, remote, {
    // A person pressing «сверить сейчас» gets a resend even if this peer root was already answered:
    // the latch exists to stop a machine from looping, not to refuse an explicit ask.
    reconciledRoot: manual ? null : engine.manifestReconcileRoot,
    receiveOnly: engine.config.localSyncMode === 'receive-only',
  });

  if (decision.action === 'reconcile' && remote) {
    // One full resend per peer state, not per pass: the other device pulls it, both roots move to
    // the same string, and the next check finds nothing to do.
    engine.manifestReconcileRoot = remote.root;
    engine.forceFullPush = true;
    engine.scheduleDebouncedPush(0);
    syncLog.warn(`Корень разошёлся с комнатой: переотправляю состояние (${describeWire(wire)})`);
  }

  // And publish last, so the row carries what this device holds *now* — after the resend above,
  // not before it. An unchanged root makes no request: the row already says this.
  let published = engine.manifestPostedRoot === local.root;
  if (!published) {
    published = await postManifest(engine, wire);
    if (generation !== engine.initGeneration) return;
    if (published) engine.manifestPostedRoot = local.root;
  }

  engine.status.manifest = {
    at: new Date().toISOString(),
    root: local.root,
    remoteRoot: remote?.root ?? null,
    inSync: remote !== null && decision.drift?.rootMatch === true,
    folders: decision.drift?.folders ?? [],
    action: decision.action,
    trigger,
  };
  engine.notify();

  if (!published) {
    syncLog.debug(`${describeWire(wire)} не записан; сверка подождёт следующей попытки`);
    return;
  }
  if (remote === null) {
    syncLog.info(`${describeWire(wire)} записан; комната ещё не ответила своим`);
  } else if (decision.action === 'none') {
    syncLog.info(`${describeWire(wire)}; корень сходится с комнатой`);
  } else if (decision.action === 'report') {
    // Debug, not warn: one device that cannot converge (a note its neighbour keeps rejecting on
    // LWW) would otherwise write this line every check interval, forever, and drown the log.
    syncLog.debug(`${describeWire(wire)}; корень расходится с комнатой, переотправка уже была`);
  }
}
