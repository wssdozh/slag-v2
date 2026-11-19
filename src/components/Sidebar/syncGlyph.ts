// The rail's sync glyph: one shape per state.
//
// A colour alone says nothing to anyone who has not memorised the palette, and the old single
// arrow told the same story while offline, diverged and finished. The shapes are chosen so the
// answer arrives before the tooltip: a crossed cloud is "not connected", a check is "both copies
// agree", and cloud-with-a-bang is the state a spinner cannot express — connected, but the roots
// disagree.
import { anonymousOnlyDrift } from '../../lib/sync/types';
import type { SyncStatus } from '../../lib/sync/types';
import type { IconName } from '../UI/icons/icons';

export interface SyncGlyph {
  name: IconName;
  className: string;
  title: string;
}

const OPEN_SETTINGS = ' · Клик: открыть настройки';

/** What the sidebar draws for this status, and what it says on hover. */
export function syncGlyph(status: SyncStatus): SyncGlyph {
  if (status.authRequired && !status.isAuthenticated) {
    return {
      name: 'system.syncOffline',
      className: 'text-warning',
      title: `Синхронизация: войдите в SLAG ID${OPEN_SETTINGS}`,
    };
  }
  if (status.state === 'syncing') {
    return {
      name: 'system.sync',
      className: 'animate-spin text-warning',
      title: 'Синхронизация: идёт обмен',
    };
  }
  if (status.state === 'error') {
    return {
      name: 'system.syncError',
      className: 'text-danger',
      title: `Ошибка синхронизации${status.error ? `: ${status.error}` : ''}${OPEN_SETTINGS}`,
    };
  }
  if (status.state === 'offline') {
    return {
      name: 'system.syncOffline',
      className: 'text-fg-dim',
      title: `Синхронизация: офлайн${OPEN_SETTINGS}`,
    };
  }
  if (status.state === 'connected') {
    // A finished sync is not the same promise as an agreed one: the last comparison can say the
    // two devices hold different vaults while the connection itself is perfectly healthy.
    if (status.manifest?.action === 'report') {
      return {
        name: 'system.syncDiverged',
        className: 'text-danger',
        title: `Копии разошлись${OPEN_SETTINGS}`,
      };
    }
    // The room's old single row stopped updating: it disagrees forever and nobody can be asked
    // through it. That is "no data about the peer", not an alert — the shape says "checking".
    if (status.manifest && anonymousOnlyDrift(status.manifest.peers)) {
      return {
        name: 'system.sync',
        className: 'text-fg-secondary',
        title: `Синхронизация: нет данных о соседе${OPEN_SETTINGS}`,
      };
    }
    return {
      name: 'system.syncOk',
      className: 'text-success',
      title: `Синхронизировано (${status.pingMs ?? 1} ms)${OPEN_SETTINGS}`,
    };
  }
  return {
    name: 'system.syncIdle',
    className: 'text-fg-dim',
    title: `Синхронизация выключена${OPEN_SETTINGS}`,
  };
}
