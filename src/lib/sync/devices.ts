// Normalizes device records from the account and derives the subscription shown in settings.
import type { DeviceProfile, DeviceSyncMode, SyncConfig, SyncStatus } from './types';
import type { AccountState } from './account';
import { generateDeviceId, generateMnemonic } from './crypto';

export function normalizeTrustedDevice(device: DeviceProfile, allowedVaultsFallback?: string[]): DeviceProfile {
  return {
    ...device,
    syncMode: device.syncMode || 'read-write',
    canRunAiLease: device.canRunAiLease ?? false,
    allowedVaults: device.allowedVaults ?? allowedVaultsFallback,
  };
}

export function touchDeviceLastSeen(devices: DeviceProfile[], deviceId: string, lastSeen: string = 'Только что'): DeviceProfile[] {
  return devices.map((d) => (d.id === deviceId ? { ...d, lastSeenAt: lastSeen } : d));
}

export function normalizeTrustedDevicesFromAccount(accountState: AccountState, currentDeviceId: string): DeviceProfile[] {
  return accountState.devices
    .filter((device) => device.status === 'active' && device.id !== currentDeviceId)
    .map((device) => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      publicKey: device.publicKey,
      isCurrent: false,
      pairedAt: device.createdAt || '',
      lastSeenAt: device.lastSeenAt || '',
      allowedVaults: accountState.vaults
        .filter((vault) => vault.grants.some((grant) => grant.deviceId === device.id && grant.status === 'accepted'))
        .map((vault) => vault.id),
    }));
}

export function computeSubscription(
  cfg: SyncConfig,
  accountState: AccountState,
  isAuthenticated: boolean,
  authRequired: boolean
): SyncStatus['subscription'] {
  const account = isAuthenticated ? accountState.account : null;
  const activeCount = 1 + cfg.trustedDevices.length;
  if (account) {
    return {
      ...account,
      expiresFormatted: account.expiresAt ? new Date(account.expiresAt).toLocaleDateString('ru-RU') : 'Бессрочно',
      activeDevices: accountState.devices.filter((device) => device.status === 'active').length,
      isExpiringSoon: false,
    };
  }
  if (!authRequired) {
    return {
      plan: 'self-hosted',
      planLabel: 'Self-hosted релей',
      expiresAt: null,
      expiresFormatted: 'Бессрочно',
      maxDevices: 999,
      activeDevices: activeCount,
      maxCacheMb: 999999,
      usedCacheMb: 0,
      hasAiLease: true,
      isExpiringSoon: false,
    };
  }

  return {
    plan: 'free',
    planLabel: 'SLAG ID · требуется вход',
    expiresAt: null,
    expiresFormatted: '—',
    maxDevices: 0,
    activeDevices: 0,
    maxCacheMb: 0,
    usedCacheMb: 0,
    hasAiLease: false,
  };
}

export function createDefaultDeviceName(): string {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? 'Мой телефон'
    : 'Мой ПК';
}

export function parseStoredConfig(
  raw: string,
  defaultServerUrl: string,
  accountTokenPresent: boolean,
  accountSessionDeviceId?: string,
  seedPhrase?: string
): SyncConfig {
  const parsed = JSON.parse(raw);
  return {
    enabled: parsed.enabled ?? true,
    serverUrl: parsed.serverUrl || defaultServerUrl,
    deviceId: accountTokenPresent
      ? (accountSessionDeviceId || parsed.deviceId || generateDeviceId())
      : parsed.deviceId || generateDeviceId(),
    deviceName: parsed.deviceName || 'Это устройство',
    seedPhrase: seedPhrase ?? parsed.seedPhrase ?? '',
    autoSync: parsed.autoSync ?? true,
    subscriptionPlan: parsed.subscriptionPlan || 'smile',
    bgSyncIntervalMinutes: parsed.bgSyncIntervalMinutes ?? 0,
    localSyncMode: parsed.localSyncMode || 'read-write',
    canRunAiLease: parsed.canRunAiLease ?? true,
    trustedDevices: parsed.trustedDevices || [],
  };
}

export function createInitialConfig(
  defaultServerUrl: string,
  baseRaw: string | null,
  accountTokenPresent: boolean,
  accountSessionDeviceId?: string,
  seedPhrase?: string
): SyncConfig {
  let inheritedDeviceId = generateDeviceId();
  let inheritedDeviceName = createDefaultDeviceName();
  let inheritedServerUrl = defaultServerUrl;
  let inheritedPlan: 'free' | 'smile' | 'angry' = 'smile';
  let inheritedBgSync: 0 | 10 | 30 = 0;

  if (baseRaw) {
    try {
      const base = JSON.parse(baseRaw);
      if (base.deviceId) inheritedDeviceId = base.deviceId;
      if (base.deviceName) inheritedDeviceName = base.deviceName;
      if (base.serverUrl) inheritedServerUrl = base.serverUrl;
      if (base.subscriptionPlan) inheritedPlan = base.subscriptionPlan;
      if (typeof base.bgSyncIntervalMinutes === 'number') inheritedBgSync = base.bgSyncIntervalMinutes;
    } catch {
      // ignore
    }
  }

  return {
    enabled: true,
    serverUrl: inheritedServerUrl,
    deviceId: accountTokenPresent
      ? (accountSessionDeviceId || inheritedDeviceId)
      : inheritedDeviceId,
    deviceName: inheritedDeviceName,
    seedPhrase: seedPhrase ?? generateMnemonic(12),
    autoSync: true,
    subscriptionPlan: inheritedPlan,
    bgSyncIntervalMinutes: inheritedBgSync,
    localSyncMode: 'read-write',
    canRunAiLease: true,
    trustedDevices: [],
  };
}

export function addTrustedDeviceToConfig(config: SyncConfig, device: DeviceProfile): SyncConfig {
  const list = config.trustedDevices.filter((d) => d.id !== device.id);
  list.push(normalizeTrustedDevice(device));
  return {
    ...config,
    trustedDevices: list,
  };
}

export function setDeviceAllowedVaultsInConfig(
  config: SyncConfig,
  deviceId: string,
  allowedVaults: string[]
): SyncConfig {
  const list = config.trustedDevices.map((d) =>
    d.id === deviceId ? { ...d, allowedVaults } : d
  );
  return {
    ...config,
    trustedDevices: list,
  };
}

export function removeTrustedDeviceFromConfig(config: SyncConfig, deviceId: string): SyncConfig {
  const list = config.trustedDevices.filter((d) => d.id !== deviceId);
  return {
    ...config,
    trustedDevices: list,
  };
}

export function renameDeviceInConfig(config: SyncConfig, deviceId: string, newName: string): SyncConfig {
  const clean = newName.trim();
  if (deviceId === config.deviceId) {
    return {
      ...config,
      deviceName: clean || 'Это устройство',
    };
  }
  const list = config.trustedDevices.map((d) =>
    d.id === deviceId ? { ...d, name: clean || d.name } : d
  );
  return {
    ...config,
    trustedDevices: list,
  };
}

export function setDeviceSyncModeInConfig(
  config: SyncConfig,
  deviceId: string,
  mode: DeviceSyncMode
): SyncConfig {
  if (deviceId === config.deviceId) {
    return {
      ...config,
      localSyncMode: mode,
    };
  }
  const list = config.trustedDevices.map((d) =>
    d.id === deviceId ? { ...d, syncMode: mode } : d
  );
  return {
    ...config,
    trustedDevices: list,
  };
}
