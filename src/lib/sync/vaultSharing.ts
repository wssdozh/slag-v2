// Hands a vault key to another device and accepts one, so the vault opens on both.
import type { VaultMeta } from '../../types';
import type { AccountDevice } from './accountTypes';
import type { DeviceSyncMode } from './types';
import { accountClient } from './account';
import { decryptVaultKeyForDevice, encryptVaultKeyForDevice } from './accountCrypto';
import { validateMnemonic } from './crypto';
import { storage } from '../storage';
import { syncEngine } from './syncEngine';

export function getLocalVaultId(syncId: string): string {
  const vault = storage.getVaults().find((entry) => (entry.syncId || entry.id) === syncId);
  if (!vault) throw new Error('Хранилище не установлено на этом устройстве');
  return vault.id;
}

interface VaultUiActions {
  createVault: (name: string, mode?: 'indexeddb' | 'fsa' | 'tauri', path?: string, id?: string) => void;
  switchVault: (vaultId: string) => void;
}

export async function shareVaultWithDevice(
  vault: VaultMeta,
  device: AccountDevice,
  mode: DeviceSyncMode,
): Promise<void> {
  const session = accountClient.getSession();
  if (session && device.id === session.deviceId) throw new Error('Это хранилище уже находится на текущем устройстве');
  const syncId = storage.ensureVaultSyncId(vault.id);
  const serverVault = accountClient.getState().vaults.find((entry) => entry.id === syncId);
  const existingGrant = serverVault ? serverVault.grants.find((entry) => entry.deviceId === device.id) : undefined;
  if (existingGrant && existingGrant.status !== 'revoked' && existingGrant.mode === mode) return;
  const seedPhrase = syncEngine.getVaultSeedPhrase(vault.id);
  if (!seedPhrase) {
    throw new Error('Ключ хранилища доступен только на устройстве, где оно подключено');
  }

  const encryptedKey = await encryptVaultKeyForDevice(seedPhrase, device.publicKey);
  await accountClient.registerVault(syncId, vault.name);
  await accountClient.grantVault(syncId, device.id, mode, encryptedKey);
  if (syncEngine.getCurrentVaultId() === vault.id) await syncEngine.init();
}

export async function acceptSharedVault(
  shared: { vaultId: string; vaultName: string; encryptedKey: string },
  deviceId: string,
  actions: VaultUiActions,
): Promise<'created' | 'merged'> {
  const result = await installSharedVault(shared, deviceId, actions, false);
  try {
    await accountClient.acceptVault(shared.vaultId);
    actions.switchVault(getLocalVaultId(shared.vaultId));
  } catch (error) {
    syncEngine.failInitialSync(error);
    throw error;
  }
  return result;
}

export async function installSharedVault(
  shared: { vaultId: string; vaultName: string; encryptedKey: string },
  deviceId: string,
  actions: VaultUiActions,
  connect = true,
): Promise<'created' | 'merged'> {
  const seedPhrase = await decryptVaultKeyForDevice(deviceId, shared.encryptedKey);
  if (!validateMnemonic(seedPhrase)) {
    throw new Error('Не удалось расшифровать ключ хранилища');
  }

  const existing = storage.getVaults().find((vault) => (vault.syncId || vault.id) === shared.vaultId);
  const localId = existing ? existing.id : shared.vaultId;
  await syncEngine.setVaultSeedPhrase(localId, seedPhrase);

  if (existing) {
    if (connect) actions.switchVault(existing.id);
  } else {
    syncEngine.beginInitialSync(localId);
    actions.createVault(shared.vaultName, 'indexeddb', undefined, shared.vaultId);
    if (connect) await syncEngine.switchVault(shared.vaultId);
  }

  return existing ? 'merged' : 'created';
}
