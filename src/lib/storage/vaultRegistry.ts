// Which vault the app is looking at: the registry kept in localStorage, and the switch between them.
import type { VaultMeta } from '../../types';
import { STORAGE_KEYS, DEFAULT_VAULT_META } from '../../config';
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import { remove, BaseDirectory } from '@tauri-apps/plugin-fs';

const fsLog = logger.scope('FS');

const VAULTS_KEY = STORAGE_KEYS.VAULTS;
const CURRENT_VAULT_KEY = STORAGE_KEYS.CURRENT_VAULT;
const ITEMS_STORAGE_PREFIX = STORAGE_KEYS.ITEMS_PREFIX;
const FOLDERS_STORAGE_PREFIX = STORAGE_KEYS.FOLDERS_PREFIX;
const DRAFTS_STORAGE_PREFIX = STORAGE_KEYS.DRAFTS_PREFIX;
const ASSISTANT_STORAGE_PREFIX = STORAGE_KEYS.ASSISTANT_PREFIX;
const WORKSPACE_STATE_PREFIX = STORAGE_KEYS.WORKSPACE_STATE_PREFIX;

export interface VaultRegistryHost {
  currentVault: VaultMeta;
  initDefaultsIfNeeded(): void;
  syncCurrentVaultFs(): Promise<boolean>;
}

export function initCurrentVault(store: VaultRegistryHost): VaultMeta {
  const saved = localStorage.getItem(CURRENT_VAULT_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && parsed.id) {
        // Auto-migrate old default vault name to 'main'
        if (parsed.id === 'default_vault' && (parsed.name === 'Основное хранилище (Vault)' || !parsed.name)) {
          parsed.name = 'main';
          localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(parsed));
        }
        store.currentVault = parsed;
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  const defaultVault: VaultMeta = { ...DEFAULT_VAULT_META };
  store.currentVault = defaultVault;
  localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(defaultVault));
  saveVaultMeta(store, defaultVault);
  return defaultVault;
}

export function getVaults(store: VaultRegistryHost): VaultMeta[] {
  const raw = localStorage.getItem(VAULTS_KEY);
  if (!raw) return store.currentVault ? [store.currentVault] : [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      let changed = false;
      const vaults = parsed
        .filter(v => v && typeof v === 'object' && v.id)
        .map(v => {
          if (v.id === 'default_vault' && (v.name === 'Основное хранилище (Vault)' || !v.name)) {
            changed = true;
            return { ...v, name: 'main' };
          }
          return v;
        });
      if (changed) {
        localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
      }
      return vaults.length > 0 ? vaults : (store.currentVault ? [store.currentVault] : []);
    }
    return store.currentVault ? [store.currentVault] : [];
  } catch {
    return store.currentVault ? [store.currentVault] : [];
  }
}

export function saveVaultMeta(store: VaultRegistryHost, vault: VaultMeta): void {
  if (!vault || !vault.id) return;
  const list = getVaults(store).filter(v => v && v.id !== vault.id);
  list.push(vault);
  localStorage.setItem(VAULTS_KEY, JSON.stringify(list));
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
    localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(store.currentVault));
  }
  return syncId;
}

export function switchVault(store: VaultRegistryHost, vaultId: string): VaultMeta {
  const vaults = getVaults(store);
  const target = vaults.find(v => v.id === vaultId);
  if (target) {
    store.currentVault = { ...target, isCurrent: true };
    localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(store.currentVault));
    store.initDefaultsIfNeeded();
    fsLog.info(`Switched vault to "${store.currentVault.name}" (${store.currentVault.id})`);
    if (isTauri()) {
      void store.syncCurrentVaultFs();
    }
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
  const vaults = getVaults(store).filter(v => v.id !== vaultId);
  localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
  try {
    localStorage.removeItem(`${ITEMS_STORAGE_PREFIX}${vaultId}`);
    localStorage.removeItem(`${FOLDERS_STORAGE_PREFIX}${vaultId}`);
    localStorage.removeItem(`${DRAFTS_STORAGE_PREFIX}${vaultId}`);
    localStorage.removeItem(`${ASSISTANT_STORAGE_PREFIX}${vaultId}`);
    localStorage.removeItem(`${WORKSPACE_STATE_PREFIX}${vaultId}`);
  } catch {
    // ignore
  }
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
