// When the room is compared: one timer, the earliest deadline anybody asked for.
//
// A push confirms in a burst and the room's rows keep only the latest root, so checking after every
// bundle would double the request rate and learn nothing new. The heartbeat asks on its own slow
// clock, and the earliest ask wins: an edit, a heartbeat and a recheck that land together are one
// check, not three.
import { isTauri } from '@tauri-apps/api/core';
import { SYNC_INTERVALS } from '../../../config';
import { logger } from '../../logger/logger';
import { isPrimaryWindow } from '../../platform/windowControls';
import { vault } from '../../storage/port';
import type { SyncEngine } from '../syncEngine';
import type { ManifestTrigger } from '../types';
import { readManifestAutoCheck } from './prefs';
import { syncManifest } from './sync';

const syncLog = logger.scope('SYNC');

/** One engine per app, so one timer: `disconnect` takes it down with the room it belonged to. */
let timer: ReturnType<typeof setTimeout> | null = null;
let deadline = 0;
let lastCheckAt = 0;

/**
 * The floor between two GETs. A heartbeat tick that lands the instant a push-driven check has
 * fired is not a second reason to ask: the relay's rows cannot have changed in between.
 */
const MIN_INTERVAL_MS = SYNC_INTERVALS.MANIFEST_RECHECK_MS;

/** Why this pass cannot happen. An index still being read describes an empty vault, and a manifest
 * built from that tells every device the vault emptied — the 2026-11-18 lesson again. */
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
 * One manifest check, on the earliest deadline anybody asked for.
 *
 * `init` asks for it immediately — that is the check that catches a device that fell behind while
 * it was asleep. `manual` ignores the automatic check setting and reports immediately.
 */
export function scheduleManifestCheck(
  engine: SyncEngine,
  delayMs: number = SYNC_INTERVALS.MANIFEST_CHECK_DEBOUNCE_MS,
  trigger: ManifestTrigger = 'push',
): void {
  if (trigger !== 'manual' && !readManifestAutoCheck()) {
    syncLog.debug('Сверка манифеста выключена в настройках хранилища');
    return;
  }
  // Manual is a person asking now: the floor below is a rate limit for machines, not for them.
  const next = trigger === 'manual' ? Date.now() : Math.max(Date.now() + delayMs, lastCheckAt + MIN_INTERVAL_MS);
  if (timer) {
    if (deadline <= next) return;
    clearTimeout(timer);
  }
  deadline = next;
  timer = setTimeout(() => {
    timer = null;
    deadline = 0;
    lastCheckAt = Date.now();
    const skip = skipReason(engine);
    if (skip) {
      syncLog.debug(`Сверка манифеста пропущена: ${skip}`);
      return;
    }
    void syncManifest(engine, trigger);
  }, next - Date.now());
}

/** The panel's «сверить сейчас»: one check now. */
export function requestManifestCheck(engine: SyncEngine): void {
  scheduleManifestCheck(engine, 0, 'manual');
}

/** The room this timer belonged to is gone: its check must not fire into the next one. */
export function clearManifestCheck(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  deadline = 0;
  lastCheckAt = 0;
}
