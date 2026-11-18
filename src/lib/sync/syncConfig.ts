// Where the sync config lives per vault, how requests are authorized, how a seed phrase is stored.
//
// The config is the vault's own: it sits in `state.json`'s `sync` section as one record, and it
// never carries the seed phrase — that one lives in `secretStore` and reaches this module as an
// argument. A caller loads it with `await getSecret(SECRET_KEYS.vaultSeed(vaultId))` and hands it
// over; nothing here scrapes a warm cache, because the cache is filled from the vault registry and
// that registry lives in `prefs`.
import { logger } from '../logger/logger';
import { accountClient } from './account';
import { apiBase } from './apiBase';
import {
  computeSubscription as computeSubscriptionFromAccount,
  parseStoredConfig,
  createInitialConfig,
} from './devices';
import { generateMnemonic } from './crypto';
import {
  configFromState,
  configToState,
  mergeConfigState,
} from './syncSection';
import {
  hasSectionStore,
  readFallbackJson,
  removeFallbackKey,
  sectionRecord,
  writeFallbackJson,
  writeSyncSection,
  writeSyncSectionVerified,
} from './localBookkeeping';
import type { SyncConfig, SyncStatus } from './types';
import {
  DEFAULT_SYNC_SERVER_URL,
  OFFICIAL_SYNC_DOMAINS,
  SYNC_STORAGE_KEYS,
  SYNC_INTERVALS,
} from '../../config';
import { getCachedSecret, SECRET_KEYS, setSecret } from '../platform/secretStore';

const SYNC_CONFIG_KEY = SYNC_STORAGE_KEYS.SYNC_CONFIG;
/** The config's name inside the `sync` section of `state.json`. */
const CONFIG_KEY = 'config';
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

/**
 * The config as this device holds it, built from whatever the vault's own copy has. Synchronous
 * and write-free on purpose: the engine is constructed before any of this can be read from the
 * disk, and this is the answer it gets until `hydrateConfig` has the real one.
 */
export function loadConfig(store: SyncConfigHost, seed: string | null, targetVaultId?: string): SyncConfig {
  const vid = targetVaultId || store.currentVaultId || 'default_vault';
  store.currentVaultId = vid;
  return buildConfig(seed, readConfigRecord(vid));
}

/**
 * Reads the config once, on the way into a vault: migrates the old per-key record into
 * `state.json.sync.config`, mints a seed phrase if this vault has never had one, and writes the
 * file copy without it. Returns the config the engine keeps.
 */
export async function hydrateConfig(
  store: SyncConfigHost,
  vaultId: string,
  seed: string | null,
  section: Record<string, unknown> | null
): Promise<SyncConfig> {
  store.currentVaultId = vaultId;
  const fromFile = configFromState(section?.[CONFIG_KEY]);
  const legacyKeys = fallbackConfigKeys(vaultId);
  const fromLegacy = readLegacyConfigRecord(legacyKeys);
  const stored = mergeConfigState(fromFile, fromLegacy ?? {});
  const config = buildConfig(seed, Object.keys(stored).length > 0 ? stored : null);

  if (!config.seedPhrase) {
    // The only place a key is ever minted. It goes to the secret store before the config exists,
    // so a write that fails below cannot leave a vault that believes it has a key it does not.
    config.seedPhrase = generateMnemonic(12);
    try {
      await setSecret(SECRET_KEYS.vaultSeed(vaultId), config.seedPhrase);
    } catch (error) {
      syncLog.error('Failed to persist a new vault seed', error);
    }
  }

  const record = configToState(config);
  const deviceIdChanged = config.deviceId !== fromFile.deviceId;
  const needsFile = Object.keys(fromFile).length === 0 || deviceIdChanged || fromLegacy !== null;

  if (!hasSectionStore()) {
    // No disk: the browser build keeps the exact keys and the exact strings it kept before.
    if (Object.keys(fromFile).length === 0 || deviceIdChanged) {
      for (const key of legacyKeys) writeFallbackJson(key, record);
    }
    return config;
  }

  if (needsFile && (await writeSyncSectionVerified({ [CONFIG_KEY]: record }))) {
    // The old plaintext is dropped only now, when the file demonstrably holds the new record.
    for (const key of legacyKeys) removeFallbackKey(key);
  }
  return config;
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
  persistConfig(store);
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
    const cleanUrl = apiBase(store.config.serverUrl);
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
  // Another vault's key is in the secret store, and the store is the only place it can be: the
  // config never carried one, and the old plaintext was moved out of `localStorage` at boot.
  return getCachedSecret(SECRET_KEYS.vaultSeed(vaultId));
}

export async function setVaultSeedPhrase(store: SyncConfigHost, vaultId: string, seedPhrase: string): Promise<void> {
  await setSecret(SECRET_KEYS.vaultSeed(vaultId), seedPhrase);
  if (vaultId !== store.currentVaultId) return;
  store.config = { ...store.config, seedPhrase };
  saveConfig(store, {});
}

/** The config the file and the old blob add up to; `null` means this vault has never been set up. */
function buildConfig(seed: string | null, record: Partial<SyncConfig> | null): SyncConfig {
  const hasToken = accountClient.getToken(DEFAULT_SERVER_URL) !== null;
  const sessionDeviceId = accountClient.getSession()?.deviceId;
  if (!record) {
    // An empty string, not a fresh mnemonic: minting a key is `hydrateConfig`'s decision, and a
    // config that quietly generated one here would overwrite a real key it could not see yet.
    return createInitialConfig(DEFAULT_SERVER_URL, null, hasToken, sessionDeviceId, seed ?? '');
  }
  return parseStoredConfig(JSON.stringify(record), DEFAULT_SERVER_URL, hasToken, sessionDeviceId, seed ?? undefined);
}

/** The vault's own copy: the file once it is hydrated, the fallback keys before that. */
function readConfigRecord(vaultId: string): Partial<SyncConfig> | null {
  const fromFile = configFromState(sectionRecord(vaultId, CONFIG_KEY));
  if (Object.keys(fromFile).length > 0) return fromFile;
  return readLegacyConfigRecord(fallbackConfigKeys(vaultId));
}

function fallbackConfigKeys(vaultId: string): string[] {
  return vaultId === 'default_vault'
    ? [`${SYNC_CONFIG_KEY}_${vaultId}`, SYNC_CONFIG_KEY]
    : [`${SYNC_CONFIG_KEY}_${vaultId}`];
}

/** Read once, by the migration: after it the file is the only copy of the config. */
function readLegacyConfigRecord(keys: string[]): Partial<SyncConfig> | null {
  for (const key of keys) {
    const record = configFromState(readFallbackJson<unknown>(key, null));
    if (Object.keys(record).length > 0) return record;
  }
  return null;
}

/** One writer for one config: the section when there is a disk, the old keys when there is not. */
function persistConfig(store: SyncConfigHost): void {
  const record = configToState(store.config);
  if (hasSectionStore()) {
    void writeSyncSection({ [CONFIG_KEY]: record });
    return;
  }
  for (const key of fallbackConfigKeys(store.currentVaultId)) writeFallbackJson(key, record);
}
