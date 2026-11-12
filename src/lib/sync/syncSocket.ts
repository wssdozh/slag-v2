import { authHeaders } from './syncConfig';
import type { SyncTransport } from './transport';
import type { SyncConfig, SyncStatus } from './types';

export interface SyncSocketHost {
  config: SyncConfig;
  status: SyncStatus;
  currentVaultId: string;
  notify(): void;
  activeRoomId: string | null;
  transport: SyncTransport;
  usesAccountSync(): boolean;
  getSyncVaultId(): string;
}

export function connectSocket(store: SyncSocketHost): void {
  store.transport.connect({
    serverUrl: store.config.serverUrl,
    deviceId: store.config.deviceId,
    vaultId: store.usesAccountSync() ? store.getSyncVaultId() : store.currentVaultId,
    roomId: store.activeRoomId || '',
    enabled: store.config.enabled,
  });
}

export async function handleIncoming(store: SyncSocketHost, data: string): Promise<void> {
  await store.transport.handleIncomingMessage(data);
}

export async function acknowledgeBundle(store: SyncSocketHost, bundleId: string): Promise<void> {
  await store.transport.sendAck({
    bundleId,
    roomId: store.activeRoomId,
    serverUrl: store.config.serverUrl,
    vaultId: store.usesAccountSync() ? store.getSyncVaultId() : store.currentVaultId,
    deviceId: store.config.deviceId,
    authHeaders: (includeJson) => authHeaders(store, includeJson),
  });
}
