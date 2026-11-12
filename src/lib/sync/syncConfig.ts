import { storage } from '../storage';
import { logger } from '../logger';
import { accountClient } from './account';
import {
  computeSubscription as computeSubscriptionFromAccount,
  parseStoredConfig,
  createInitialConfig,
} from './devices';
import type { SyncConfig, SyncStatus } from './types';
import {
  DEFAULT_SYNC_SERVER_URL,
  OFFICIAL_SYNC_DOMAINS,
  SYNC_STORAGE_KEYS,
  SYNC_INTERVALS,
} from '../../config';

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
  const vid = targetVaultId || (typeof storage !== 'undefined' && storage.getCurrentVault ? storage.getCurrentVault()?.id : 'default_vault') || 'default_vault';
  store.currentVaultId = vid;
  const key = `${SYNC_CONFIG_KEY}_${vid}`;
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
        accountClient.getSession()?.deviceId
      );
    }
  } catch {
    // fallback
  }

  const baseRaw = localStorage.getItem(SYNC_CONFIG_KEY) || localStorage.getItem(`${SYNC_CONFIG_KEY}_default_vault`);
  const initial = createInitialConfig(
    DEFAULT_SERVER_URL,
    baseRaw,
    accountClient.getToken(DEFAULT_SERVER_URL) !== null,
    accountClient.getSession()?.deviceId
  );
  saveConfig(store, initial);
  return initial;
}

export function saveConfig(store: SyncConfigHost, newConfig: Partial<SyncConfig>): void {
  store.config = { ...store.config, ...newConfig };
  try {
    const key = `${SYNC_CONFIG_KEY}_${store.currentVaultId}`;
    localStorage.setItem(key, JSON.stringify(store.config));
    if (store.currentVaultId === 'default_vault') {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(store.config));
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
  if (vaultId === store.currentVaultId) return store.config.seedPhrase;
  try {
    const raw = localStorage.getItem(`${SYNC_CONFIG_KEY}_${vaultId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.seedPhrase === 'string' ? parsed.seedPhrase : null;
  } catch {
    return null;
  }
}

export function setVaultSeedPhrase(store: SyncConfigHost, vaultId: string, seedPhrase: string): void {
  if (vaultId === store.currentVaultId) {
    saveConfig(store, { seedPhrase });
    return;
  }
  const raw = localStorage.getItem(`${SYNC_CONFIG_KEY}_${vaultId}`);
  const base = raw ? JSON.parse(raw) : store.config;
  localStorage.setItem(`${SYNC_CONFIG_KEY}_${vaultId}`, JSON.stringify({
    ...base,
    deviceId: store.config.deviceId,
    deviceName: store.config.deviceName,
    serverUrl: store.config.serverUrl,
    seedPhrase,
  }));
}
