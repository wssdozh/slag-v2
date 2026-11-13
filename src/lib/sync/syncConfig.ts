// Where the sync config lives per vault, how requests are authorized, how a seed phrase is stored.
import { vault } from '../storage/port';
import { logger } from '../logger/logger';
import { accountClient } from './account';
import {
  computeSubscription as computeSubscriptionFromAccount,
  parseStoredConfig,
  createInitialConfig,
} from './devices';
import { generateMnemonic } from './crypto';
import type { SyncConfig, SyncStatus } from './types';
import {
  DEFAULT_SYNC_SERVER_URL,
  OFFICIAL_SYNC_DOMAINS,
  SYNC_STORAGE_KEYS,
  SYNC_INTERVALS,
} from '../../config';
import { getCachedSecret, SECRET_KEYS, setSecret } from '../platform/secretStore';

const SYNC_CONFIG_KEY = SYNC_STORAGE_KEYS.SYNC_CONFIG;
const DEFAULT_SERVER_URL = DEFAULT_SYNC_SERVER_URL;

const syncLog = logger.scope('SYNC');

export interface SyncConfigHost {
  config: SyncConfig;
  status: SyncStatus;
  currentVaultId: string;
  notify(): void;
}

export function computeSubscription(store: SyncConfigHost): SyncStatus['subscription'] {
  const { config, status } = store;
  return computeSubscriptionFromAccount(
    config,
    accountClient.getState(),
    accountClient.getToken(config.serverUrl) !== null,
    status.authRequired
  );
}

export function loadConfig(store: SyncConfigHost, targetVaultId?: string): SyncConfig {
  const vid = targetVaultId || vault().getCurrentVault()?.id || 'default_vault';
  store.currentVaultId = vid;
  const key = `${SYNC_CONFIG_KEY}_${vid}`;
  const secret = getCachedSecret(SECRET_KEYS.vaultSeed(vid));
  try {
    let raw = localStorage.getItem(key);
    if (!raw && vid === 'default_vault') {
      raw = localStorage.getItem(SYNC_CONFIG_KEY);
    }
    if (raw) {
      return parseStoredConfig(
        raw,
        DEFAULT_SERVER_URL,
        accountClient.getToken(DEFAULT_SERVER_URL) !== null,
        accountClient.getSession()?.deviceId,
        secret ?? undefined
      );
    }
  } catch {
    // fallback
  }

  const seed = secret ?? generateMnemonic(12);
  const baseRaw = localStorage.getItem(SYNC_CONFIG_KEY) || localStorage.getItem(`${SYNC_CONFIG_KEY}_default_vault`);
  const initial = createInitialConfig(
    DEFAULT_SERVER_URL,
    baseRaw,
    accountClient.getToken(DEFAULT_SERVER_URL) !== null,
    accountClient.getSession()?.deviceId,
    seed
  );
  saveConfig(store, initial);
  if (!secret) {
    void setSecret(SECRET_KEYS.vaultSeed(vid), seed).catch((error: unknown) => {
      syncLog.error('Failed to persist a new vault seed', error);
    });
  }
  return initial;
}

export function saveConfig(store: SyncConfigHost, newConfig: Partial<SyncConfig>): void {
  const { seedPhrase, ...rest } = newConfig;
  store.config = { ...store.config, ...rest };
  if (typeof seedPhrase === 'string') {
    store.config.seedPhrase = seedPhrase;
    void setSecret(SECRET_KEYS.vaultSeed(store.currentVaultId), seedPhrase).catch((error: unknown) => {
      syncLog.error('Failed to persist the vault seed', error);
    });
  }
  try {
    const key = `${SYNC_CONFIG_KEY}_${store.currentVaultId}`;
    const persisted: Partial<SyncConfig> = { ...store.config };
    delete persisted.seedPhrase;
    localStorage.setItem(key, JSON.stringify(persisted));
    if (store.currentVaultId === 'default_vault') {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(persisted));
    }
  } catch (e) {
    syncLog.error('Failed to save sync config:', e);
  }
  if (store.status) {
    store.status.subscription = computeSubscription(store);
    store.notify();
  }
}

export function authHeaders(store: SyncConfigHost, includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  const token = accountClient.getToken(store.config.serverUrl);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function refreshServerAuth(store: SyncConfigHost): Promise<boolean> {
  try {
    const cleanUrl = store.config.serverUrl.replace(/\/+$/, '');
    const response = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(SYNC_INTERVALS.HEALTH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Health check failed: HTTP ${response.status}`);
    const health = await response.json();
    store.status.authRequired = Boolean(health.authRequired);
  } catch {
    const isOfficial = OFFICIAL_SYNC_DOMAINS.some((domain) => store.config.serverUrl.includes(domain));
    store.status.authRequired = isOfficial;
  }
  store.status.isAuthenticated = accountClient.getToken(store.config.serverUrl) !== null;
  store.notify();
  return !store.status.authRequired || store.status.isAuthenticated;
}

export function getVaultSeedPhrase(store: SyncConfigHost, vaultId: string): string | null {
  if (vaultId === store.currentVaultId) return store.config.seedPhrase || null;
  const cached = getCachedSecret(SECRET_KEYS.vaultSeed(vaultId));
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(`${SYNC_CONFIG_KEY}_${vaultId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.seedPhrase === 'string' && parsed.seedPhrase ? parsed.seedPhrase : null;
  } catch {
    return null;
  }
}

export async function setVaultSeedPhrase(store: SyncConfigHost, vaultId: string, seedPhrase: string): Promise<void> {
  await setSecret(SECRET_KEYS.vaultSeed(vaultId), seedPhrase);
  if (vaultId === store.currentVaultId) {
    store.config = { ...store.config, seedPhrase };
    saveConfig(store, {});
    return;
  }

  // Keep device/server metadata in that vault's config, but never write the seed back there.
  const raw = localStorage.getItem(`${SYNC_CONFIG_KEY}_${vaultId}`);
  const base = raw ? JSON.parse(raw) : store.config;
  const persisted: Partial<SyncConfig> = {
    ...base,
    deviceId: store.config.deviceId,
    deviceName: store.config.deviceName,
    serverUrl: store.config.serverUrl,
  };
  delete persisted.seedPhrase;
  localStorage.setItem(`${SYNC_CONFIG_KEY}_${vaultId}`, JSON.stringify(persisted));
}
