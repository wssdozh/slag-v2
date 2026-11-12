// Who may read this vault: the trusted-device list mirrored into the sync config, and the
// account's verdict on which of those devices still holds a grant.
import {
  addTrustedDeviceToConfig,
  setDeviceAllowedVaultsInConfig,
  removeTrustedDeviceFromConfig,
  renameDeviceInConfig,
  setDeviceSyncModeInConfig,
  normalizeTrustedDevicesFromAccount,
} from './devices';
import type { AccountState } from './account';
import type { DeviceProfile, DeviceSyncMode, SyncConfig, SyncStatus } from './types';

export interface DeviceAdminHost {
  config: SyncConfig;
  status: SyncStatus;
  activeRoomId: string | null;
  ws: WebSocket | null;
  notify(): void;
  saveConfig(newConfig: Partial<SyncConfig>): void;
  usesAccountSync(): boolean;
  getSyncVaultId(): string;
  disconnect(): void;
}

/**
 * The account owns the answer to "who has access": its device list replaces the local one, and a
 * grant that is not `accepted` means this device no longer belongs to the vault.
 */
export function applyAccountDevices(host: DeviceAdminHost, accountState: AccountState): void {
  if (!host.usesAccountSync()) return;
  host.config.trustedDevices = normalizeTrustedDevicesFromAccount(accountState, host.config.deviceId);
  const ownVault = accountState.vaults.find((vault) => vault.id === host.getSyncVaultId());
  const ownGrant = ownVault && ownVault.grants.find((grant) => grant.deviceId === host.config.deviceId);
  if (ownGrant && ownGrant.status === 'accepted') host.config.localSyncMode = ownGrant.mode;
  if (!host.status.isAuthenticated || !ownGrant || ownGrant.status !== 'accepted') {
    if (host.activeRoomId || host.ws) host.disconnect();
  }
  host.notify();
}

export function addTrustedDevice(host: DeviceAdminHost, device: DeviceProfile): void {
  host.saveConfig(addTrustedDeviceToConfig(host.config, device));
}

export function setDeviceAllowedVaults(host: DeviceAdminHost, deviceId: string, allowedVaults: string[]): void {
  host.saveConfig(setDeviceAllowedVaultsInConfig(host.config, deviceId, allowedVaults));
}

export function removeTrustedDevice(host: DeviceAdminHost, deviceId: string): void {
  host.saveConfig(removeTrustedDeviceFromConfig(host.config, deviceId));
}

export function renameDevice(host: DeviceAdminHost, deviceId: string, newName: string): void {
  host.saveConfig(renameDeviceInConfig(host.config, deviceId, newName));
}

export function setDeviceSyncMode(host: DeviceAdminHost, deviceId: string, mode: DeviceSyncMode): void {
  host.saveConfig(setDeviceSyncModeInConfig(host.config, deviceId, mode));
}
