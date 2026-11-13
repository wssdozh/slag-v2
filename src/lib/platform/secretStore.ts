// One place for sync secrets at rest. Desktop uses the OS keychain, web/Android uses an
// AES-GCM store whose key never leaves IndexedDB. Consumers read the synchronous cache.
import { logger } from '../logger/logger';
import { isTauriEnvironment } from './platform';
import {
  deleteLocalSecret,
  ENCRYPTED_SECRET_PREFIX,
  getLocalSecret,
  setLocalSecret,
} from './encryptedLocalStore';
import { STORAGE_KEYS, SYNC_STORAGE_KEYS } from '../../config';

const storeLog = logger.scope('SYNC');

const MODE_KEY = 'slag_secret_mode';
const PROBE_KEY = '__probe__';

export const SECRET_KEYS = {
  accountSession: 'account-session',
  vaultSeed: (vaultId: string) => `vault-seed:${vaultId}`,
  deviceKey: (deviceId: string) => `device-key:${deviceId}`,
} as const;

export type SecretStoreMode = 'os' | 'local' | 'file';

export interface SecretBackend {
  mode: SecretStoreMode;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface LegacySecret {
  key: string;
  value: string;
  remove: () => void;
}

export class SecretStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}

export class SecretMigrationError extends Error {
  readonly failedKeys: string[];

  constructor(failedKeys: string[]) {
    super('Не удалось перенести ключи синхронизации в защищённое хранилище');
    this.name = 'SecretMigrationError';
    this.failedKeys = failedKeys;
  }
}

const cache = new Map<string, string>();
const queues = new Map<string, Promise<void>>();
let backend: SecretBackend | null = null;
let override: SecretBackend | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;

/**
 * A runtime that brings its own secret storage (the headless node keeps a 0600 file) uses this
 * instead of the keychain/IndexedDB probe. Must be called before `initSecretStore()`.
 */
export function installSecretBackend(custom: SecretBackend): void {
  override = custom;
}

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(key, next.then(() => undefined, () => undefined));
  return next;
}

function osBackend(invoke: typeof import('@tauri-apps/api/core').invoke): SecretBackend {
  return {
    mode: 'os',
    get: (key) => invoke<string | null>('secret_get', { key }),
    set: (key, value) => invoke<void>('secret_set', { key, value }),
    delete: (key) => invoke<void>('secret_delete', { key }),
  };
}

function localBackend(): SecretBackend {
  return {
    mode: 'local',
    get: getLocalSecret,
    set: setLocalSecret,
    delete: async (key) => deleteLocalSecret(key),
  };
}

async function probeOsBackend(): Promise<SecretBackend | null> {
  if (!isTauriEnvironment()) return null;
  // Android keeps the encrypted IndexedDB fallback: the desktop `keyring` commands are not
  // registered there, and a copied `os` marker must not lock the app out.
  if (/Android/i.test(navigator.userAgent)) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string | null>('secret_get', { key: PROBE_KEY });
    return osBackend(invoke);
  } catch (error) {
    storeLog.warn('OS credential store is unavailable, using encrypted local fallback', { error });
    return null;
  }
}

function readStoredMode(): SecretStoreMode | null {
  const value = localStorage.getItem(MODE_KEY);
  return value === 'os' || value === 'local' ? value : null;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function vaultIdFromConfigKey(key: string): string | null {
  if (key === SYNC_STORAGE_KEYS.SYNC_CONFIG) return 'default_vault';
  const prefix = `${SYNC_STORAGE_KEYS.SYNC_CONFIG}_`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

function collectLegacySecrets(): LegacySecret[] {
  const collected: LegacySecret[] = [];
  if (typeof localStorage === 'undefined') return collected;

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key) continue;

    if (key === SYNC_STORAGE_KEYS.ACCOUNT_SESSION) {
      const raw = localStorage.getItem(key);
      if (raw) {
        collected.push({ key: SECRET_KEYS.accountSession, value: raw, remove: () => localStorage.removeItem(key) });
      }
      continue;
    }

    if (key.startsWith(SYNC_STORAGE_KEYS.DEVICE_KEY_PREFIX)) {
      const raw = localStorage.getItem(key);
      const deviceId = key.slice(SYNC_STORAGE_KEYS.DEVICE_KEY_PREFIX.length);
      if (raw && deviceId) {
        collected.push({
          key: SECRET_KEYS.deviceKey(deviceId),
          value: raw,
          remove: () => localStorage.removeItem(key),
        });
      }
      continue;
    }

    const vaultId = vaultIdFromConfigKey(key);
    if (!vaultId) continue;
    const parsed = parseJson(localStorage.getItem(key));
    const seed = parsed?.seedPhrase;
    if (typeof seed !== 'string' || !seed.trim()) continue;
    collected.push({
      key: SECRET_KEYS.vaultSeed(vaultId),
      value: seed,
      remove: () => {
        const current = parseJson(localStorage.getItem(key));
        if (!current) return;
        delete current.seedPhrase;
        localStorage.setItem(key, JSON.stringify(current));
      },
    });
  }

  return collected;
}

function knownVaultIds(): Set<string> {
  const ids = new Set<string>(['default_vault']);
  if (typeof localStorage === 'undefined') return ids;

  const registry = parseJson(localStorage.getItem(STORAGE_KEYS.VAULTS));
  const rawVaults = registry && Array.isArray(registry) ? registry : [];
  for (const entry of rawVaults) {
    if (typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string') {
      ids.add((entry as { id: string }).id);
    }
  }

  const current = parseJson(localStorage.getItem(STORAGE_KEYS.CURRENT_VAULT));
  if (typeof current?.id === 'string') ids.add(current.id);

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key) continue;
    const vaultId = vaultIdFromConfigKey(key);
    if (vaultId) ids.add(vaultId);
  }

  return ids;
}

function knownDeviceIds(): Set<string> {
  const ids = new Set<string>();
  if (typeof localStorage === 'undefined') return ids;

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key) continue;
    const vaultId = vaultIdFromConfigKey(key);
    if (!vaultId) continue;
    const parsed = parseJson(localStorage.getItem(key));
    if (typeof parsed?.deviceId === 'string' && parsed.deviceId) ids.add(parsed.deviceId);
  }

  const session = parseJson(localStorage.getItem(SYNC_STORAGE_KEYS.ACCOUNT_SESSION))
    ?? parseJson(cache.get(SECRET_KEYS.accountSession) ?? null);
  if (typeof session?.deviceId === 'string' && session.deviceId) ids.add(session.deviceId);
  return ids;
}

async function migrateEncryptedLocalToOs(target: SecretBackend): Promise<boolean> {
  const entries: Array<{ key: string; value: string }> = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(ENCRYPTED_SECRET_PREFIX)) continue;
    const secretKey = key.slice(ENCRYPTED_SECRET_PREFIX.length);
    const value = await getLocalSecret(secretKey);
    if (value !== null) entries.push({ key: secretKey, value });
  }

  // Write every value before deleting anything: a partial move must not leave a key only
  // in the store we are about to stop using.
  for (const entry of entries) {
    try {
      await target.set(entry.key, entry.value);
    } catch (error) {
      storeLog.warn('Could not move encrypted local secret into the OS store', { key: entry.key, error });
      return false;
    }
  }
  for (const entry of entries) deleteLocalSecret(entry.key);
  return true;
}

async function migrateLegacy(target: SecretBackend): Promise<void> {
  const legacy = collectLegacySecrets();
  const failed: string[] = [];

  for (const entry of legacy) {
    try {
      const existing = await target.get(entry.key);
      if (existing === null) await target.set(entry.key, entry.value);
      cache.set(entry.key, existing ?? entry.value);
      entry.remove();
    } catch (error) {
      storeLog.error('Could not migrate a legacy sync secret', { key: entry.key, error });
      failed.push(entry.key);
    }
  }

  if (failed.length) throw new SecretMigrationError(failed);
}

async function preload(target: SecretBackend): Promise<void> {
  const keys = new Set<string>([SECRET_KEYS.accountSession]);
  for (const vaultId of knownVaultIds()) keys.add(SECRET_KEYS.vaultSeed(vaultId));
  for (const deviceId of knownDeviceIds()) keys.add(SECRET_KEYS.deviceKey(deviceId));

  for (const key of keys) {
    try {
      const value = await target.get(key);
      if (value !== null) cache.set(key, value);
    } catch (error) {
      storeLog.error('Could not preload a sync secret', { key, error });
      throw new SecretStoreUnavailableError('Не удалось прочитать ключи синхронизации');
    }
  }
}

async function doInitSecretStore(): Promise<void> {
  if (override) {
    backend = override;
    await migrateLegacy(backend);
    await preload(backend);
    ready = true;
    return;
  }
  let storedMode = readStoredMode();
  if (/Android/i.test(navigator.userAgent) && storedMode === 'os') {
    // A desktop data directory copied onto Android has no keyring entries.
    storedMode = null;
    localStorage.removeItem(MODE_KEY);
  }
  const os = await probeOsBackend();

  if (storedMode === 'os' && !os) {
    throw new SecretStoreUnavailableError(
      'Системное хранилище ключей недоступно. Разблокируйте связку ключей и повторите.'
    );
  }

  if (os && (storedMode === null || storedMode === 'local')) {
    const moved = await migrateEncryptedLocalToOs(os);
    if (moved) {
      backend = os;
      localStorage.setItem(MODE_KEY, 'os');
    } else {
      backend = localBackend();
      localStorage.setItem(MODE_KEY, 'local');
    }
  } else if (os) {
    backend = os;
  } else {
    backend = localBackend();
    if (storedMode !== 'local') localStorage.setItem(MODE_KEY, 'local');
  }

  await migrateLegacy(backend);
  await preload(backend);
  ready = true;
}

export function initSecretStore(): Promise<void> {
  if (ready) return Promise.resolve();
  if (!initPromise) {
    initPromise = doInitSecretStore().catch((error: unknown) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export function getSecretStoreMode(): SecretStoreMode | null {
  return backend?.mode ?? null;
}

function readLegacySecret(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  if (key === SECRET_KEYS.accountSession) {
    return localStorage.getItem(SYNC_STORAGE_KEYS.ACCOUNT_SESSION);
  }
  if (key.startsWith('device-key:')) {
    return localStorage.getItem(SYNC_STORAGE_KEYS.DEVICE_KEY_PREFIX + key.slice('device-key:'.length));
  }
  if (key.startsWith('vault-seed:')) {
    const vaultId = key.slice('vault-seed:'.length);
    const vaultKey = `${SYNC_STORAGE_KEYS.SYNC_CONFIG}_${vaultId}`;
    const raw = localStorage.getItem(vaultKey)
      ?? (vaultId === 'default_vault' ? localStorage.getItem(SYNC_STORAGE_KEYS.SYNC_CONFIG) : null);
    const seed = parseJson(raw)?.seedPhrase;
    return typeof seed === 'string' && seed ? seed : null;
  }
  return null;
}

export function getCachedSecret(key: string): string | null {
  // A module can be imported before boot (the demo playground does this). Reads fall back
  // to the legacy plaintext only until the migration has completed; writes never do.
  if (!ready) return readLegacySecret(key);
  return cache.get(key) ?? null;
}

export async function getSecret(key: string): Promise<string | null> {
  if (!ready) await initSecretStore();
  if (!backend) throw new SecretStoreUnavailableError('Secret store is not initialized');
  if (cache.has(key)) return cache.get(key) ?? null;
  const value = await backend.get(key);
  if (value !== null) cache.set(key, value);
  return value;
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (!ready) await initSecretStore();
  if (!backend) throw new SecretStoreUnavailableError('Secret store is not initialized');
  cache.set(key, value);
  const target = backend;
  await enqueue(key, () => target.set(key, value));
}

export async function deleteSecret(key: string): Promise<void> {
  if (!ready) await initSecretStore();
  if (!backend) throw new SecretStoreUnavailableError('Secret store is not initialized');
  cache.delete(key);
  const target = backend;
  await enqueue(key, () => target.delete(key));
}
