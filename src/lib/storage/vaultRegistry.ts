// Which vault the app is looking at: the registry kept in `prefs` (`settings.json` natively, the
// prefs backend in a browser build), and the switch between them.
import type { VaultMeta } from '../../types';
import { STORAGE_KEYS, DEFAULT_VAULT_META } from '../../config';
import { logger } from '../logger/logger';
import { getPrefJson, setPref } from './prefs';
import {
  normalizeVaultRegistry,
  removeVaultMeta,
  toVaultMeta,
  upsertVaultMeta,
} from './vaultRegistryModel';
import { mergeDiscoveredVaults } from './vaultDiscovery';
import { isTauri } from '@tauri-apps/api/core';
import { readDir, remove, BaseDirectory } from '@tauri-apps/plugin-fs';

const fsLog = logger.scope('FS');

// The keys keep their names: e2e fixtures seed them, and `secretStore` reads the same ids back.
const VAULTS_KEY = STORAGE_KEYS.VAULTS;
const CURRENT_VAULT_KEY = STORAGE_KEYS.CURRENT_VAULT;

export interface VaultRegistryHost {
  currentVault: VaultMeta;
  syncCurrentVaultFs(): Promise<boolean>;
}

export function initCurrentVault(store: VaultRegistryHost): VaultMeta {
  const saved = getPrefJson<VaultMeta | undefined>(CURRENT_VAULT_KEY, undefined, toVaultMeta);
  if (saved) {
    store.currentVault = saved;
    return saved;
  }
  const defaultVault: VaultMeta = { ...DEFAULT_VAULT_META };
  store.currentVault = defaultVault;
  setPref(CURRENT_VAULT_KEY, JSON.stringify(defaultVault));
  saveVaultMeta(store, defaultVault);
  return defaultVault;
}

export function getVaults(store: VaultRegistryHost): VaultMeta[] {
  const vaults = getPrefJson<VaultMeta[]>(VAULTS_KEY, [], normalizeVaultRegistry);
  return vaults.length > 0 ? vaults : (store.currentVault ? [store.currentVault] : []);
}

export function saveVaultMeta(store: VaultRegistryHost, vault: VaultMeta): void {
  if (!vault || !vault.id) return;
  setPref(VAULTS_KEY, JSON.stringify(upsertVaultMeta(getVaults(store), vault)));
}

/**
 * The registry is the only thing that knows the vaults, and a native settings file can be wiped
 * from the outside: it comes back as a lone `default_vault` while the directories sit untouched
 * under `vaults/`. Read that directory once and add what the list lost. Nothing is dropped here —
 * deleting a vault is its own flow — and the scan is best-effort: on the first run there is no
 * directory yet, which is not a failure worth stopping the start for.
 */
export async function discoverVaults(store: VaultRegistryHost): Promise<VaultMeta[]> {
  const stored = getVaults(store);
  if (!isTauri()) return stored;
  let dirs: string[] = [];
  try {
    const entries = await readDir('vaults', { baseDir: BaseDirectory.AppData });
    dirs = entries.filter(entry => entry.isDirectory === true).map(entry => entry.name);
  } catch (err) {
    fsLog.warn('Vault discovery skipped: no vaults directory to scan yet', { error: String(err) });
    return stored;
  }
  const merged = mergeDiscoveredVaults(stored, dirs);
  if (merged === stored) return stored;
  setPref(VAULTS_KEY, JSON.stringify(merged));
  fsLog.info(`Restored ${merged.length - stored.length} vault(s) from disk: ${merged.slice(stored.length).map(entry => entry.id).join(', ')}`);
  return merged;
}

export function ensureVaultSyncId(store: VaultRegistryHost, vaultId: string): string {
  const vault = getVaults(store).find((entry) => entry.id === vaultId);
  if (!vault) throw new Error('Хранилище не найдено');
  if (vault.syncId) return vault.syncId;
  const syncId = vault.id === 'default_vault' ? `vault_${crypto.randomUUID()}` : vault.id;
  const updated = { ...vault, syncId };
  saveVaultMeta(store, updated);
  if (store.currentVault.id === vaultId) {
    store.currentVault = { ...store.currentVault, syncId };
    setPref(CURRENT_VAULT_KEY, JSON.stringify(store.currentVault));
  }
  return syncId;
}

export function switchVault(store: VaultRegistryHost, vaultId: string): VaultMeta {
  const vaults = getVaults(store);
  const target = vaults.find(v => v.id === vaultId);
  if (target) {
    store.currentVault = { ...target, isCurrent: true };
    setPref(CURRENT_VAULT_KEY, JSON.stringify(store.currentVault));
    fsLog.info(`Switched vault to "${store.currentVault.name}" (${store.currentVault.id})`);
    void store.syncCurrentVaultFs();
    return store.currentVault;
  }
  return store.currentVault;
}

export function createVault(
  store: VaultRegistryHost,
  name: string,
  mode: 'indexeddb' | 'fsa' | 'tauri' = isTauri() ? 'tauri' : 'indexeddb',
  path?: string,
  id?: string
): VaultMeta {
  const resolvedMode = isTauri() && mode === 'indexeddb' ? 'tauri' : mode;
  const newVault: VaultMeta = {
    id: id?.trim() || `vault_${crypto.randomUUID()}`,
    name,
    mode: resolvedMode,
    path,
    isCurrent: true,
  };
  saveVaultMeta(store, newVault);
  fsLog.info(`Created new vault "${name}" (${newVault.id}) [${resolvedMode}]${path ? ` at ${path}` : ''}`);
  return switchVault(store, newVault.id);
}

export function deleteVault(store: VaultRegistryHost, vaultId: string): boolean {
  if (vaultId === 'default_vault') {
    return false; // Cannot delete default root vault
  }
  if (vaultId === store.currentVault.id) {
    switchVault(store, 'default_vault');
  }
  // The list forgets the vault; the notes, folders and drafts it owned are its directory, and
  // nothing outside that directory is touched.
  setPref(VAULTS_KEY, JSON.stringify(removeVaultMeta(getVaults(store), vaultId)));
  if (isTauri()) {
    try {
      const vaultDir = `vaults/${vaultId}`;
      void remove(vaultDir, { baseDir: BaseDirectory.AppData, recursive: true });
    } catch (err) {
      fsLog.warn(`Failed to clean up vault directory on disk:`, err);
    }
  }
  fsLog.info(`Deleted vault "${vaultId}"`);
  return true;
}

export async function pickVaultDirectory(): Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Выберите папку хранилища',
      });
      if (selected && typeof selected === 'string') {
        const folderName = selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Папка';
        return { name: folderName, path: selected, mode: 'tauri' };
      }
      return null;
    } catch (err) {
      fsLog.error('Tauri folder picker error:', err);
      return null;
    }
  }

  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      return { name: dirHandle.name || 'Локальный Vault', mode: 'fsa' };
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        fsLog.warn('showDirectoryPicker error:', err);
      }
      return null;
    }
  }

  return null;
}
