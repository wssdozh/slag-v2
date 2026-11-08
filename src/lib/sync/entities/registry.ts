import type { StorageChangeEvent } from '../../storage';
import type { SyncOperation } from './types';

export function createSyncOpFromStorageEvent(event: StorageChangeEvent): SyncOperation | null {
  if (event.origin === 'remote') return null;

  // An unsaved note lives under a throwaway `draft_<timestamp>` id that changes on every open.
  // Syncing it streams one entity per keystroke and the queue never drains; it is local crash recovery only.
  if (event.kind === 'draft' && event.id.startsWith('fullscreen:draft_')) return null;

  const timestamp = Date.now();
  const opId = `op_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;

  if (event.kind === 'folder' && event.action === 'rename') {
    return {
      opId,
      kind: 'folder',
      id: event.id,
      action: 'rename',
      timestamp,
      payload: event.payload,
      oldPath: event.oldPath,
    };
  }

  return {
    opId,
    kind: event.kind,
    id: event.id,
    action: event.action,
    timestamp,
    payload: event.payload,
  };
}
