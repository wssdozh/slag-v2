// Keep the rail quiet during background traffic; comparison details belong in the panel.
import type { SyncStatus } from '../../lib/sync/types';
import type { IconName } from '../UI/icons/icons';

interface SyncGlyph {
  name: IconName;
  className: string;
  title: string;
}

export function syncGlyph(status: SyncStatus, enabled: boolean, mobile = false): SyncGlyph {
  if (status.authRequired && !status.isAuthenticated) {
    return { name: 'system.syncOffline', className: 'text-warning', title: 'Войдите в SLAG ID' };
  }
  if (status.state === 'error') {
    return { name: 'system.syncError', className: 'text-danger', title: status.error || 'Ошибка синхронизации' };
  }
  if (status.state === 'offline') {
    return { name: 'system.syncOffline', className: 'text-fg-dim', title: 'Нет связи с релеем' };
  }
  if (mobile && (status.state === 'syncing' || status.initialSync.state === 'loading')) {
    return { name: 'system.sync', className: 'text-fg-primary', title: 'Идёт синхронизация' };
  }
  if (enabled || status.state !== 'idle' || status.currentRoomId) {
    return { name: mobile ? 'system.syncIdle' : 'system.sync', className: 'text-fg-primary', title: 'Синхронизация включена' };
  }
  return { name: 'system.syncOffline', className: 'text-fg-secondary', title: 'Синхронизация выключена' };
}
