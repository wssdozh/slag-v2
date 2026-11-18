// One place for sync secrets at rest. Desktop uses the OS keychain; a build without one uses the
// AES-GCM store from `encryptedLocalStore.ts`, whose ciphertext is a file on a native runtime and
// `localStorage` in a browser. Consumers read the synchronous cache, which `initSecretStore()` fills
// in `boot()` before the first render.
import { logger } from '../logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import { deleteLocalSecret, getLocalSecret, setLocalSecret } from './encryptedLocalStore';
import { STORAGE_KEYS } from '../../config';
import { aiKeySecretName, splitAiKeys } from '../ai/connections/secrets';
import { getPref, getPrefJson, setPref } from '../storage/prefs';

const storeLog = logger.scope('SYNC');

/**
 * Which backend the previous run chose. A preference, not a secret: the ciphertext is the secret,
 * and a marker that disagreed with the probe was always overwritten rather than trusted.
 */
const MODE_PREF = 'slag_secret_mode';
const PROBE_KEY = '__probe__';

export const SECRET_KEYS = {
  accountSession: 'account-session',
  vaultSeed: (vaultId: string) => `vault-seed:${vaultId}`,
  deviceKey: (deviceId: string) => `device-key:${deviceId}`,
  /** Provider API key of one AI connection; the name lives in the ai domain, the store only holds it. */
  aiKey: (connectionId: string) => aiKeySecretName(connectionId),
} as const;

/**
 * `os` — the OS keychain. `local` — the AES-GCM store: ciphertext in `<AppData>/secrets.json` on a
 * native runtime, in the webview profile in a browser. `file` — a runtime that installs its own
 * file store (`src/node/secrets.ts`) and brings its own path.
 */
export interface SecretBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
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
    get: (key) => invoke<string | null>('secret_get', { key }),
    set: (key, value) => invoke<void>('secret_set', { key, value }),
    delete: (key) => invoke<void>('secret_delete', { key }),
  };
}

function encryptedBackend(): SecretBackend {
  return {
    get: getLocalSecret,
    set: setLocalSecret,
    delete: deleteLocalSecret,
  };
}

async function probeOsBackend(): Promise<SecretBackend | null> {
  if (!isTauri()) return null;
  // Android keeps the encrypted store: the desktop `keyring` commands are not registered there,
  // and a copied `os` marker must not lock the app out.
  if (/Android/i.test(navigator.userAgent)) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string | null>('secret_get', { key: PROBE_KEY });
    return osBackend(invoke);
  } catch (error) {
    storeLog.warn('OS credential store is unavailable, using the encrypted store', { error });
    return null;
  }
}

function readStoredMode(): 'os' | 'local' | null {
  const value = getPref(MODE_PREF);
  return value === 'os' || value === 'local' ? value : null;
}

function rememberMode(mode: 'os' | 'local'): void {
  setPref(MODE_PREF, mode);
}

/**
 * Which store this run uses.
 *
 * The probe answers "is there a keychain", not "where are the keys": a boot with a locked keychain
 * fills the encrypted store, and a later boot that finds the keychain working again would leave
 * those keys unreadable. So a store that is in use keeps them, and the marker says which one that
 * is. With no marker — a first run, a wiped settings file — the probe decides.
 */
async function resolveBackend(): Promise<SecretBackend> {
  const storedMode = readStoredMode();
  const os = await probeOsBackend();
  if (os && storedMode !== 'local') {
    if (storedMode !== 'os') rememberMode('os');
    return os;
  }
  if (storedMode === 'os') {
    // A wiped keychain or a data directory copied to another machine. The same answer as on
    // Android: an encrypted store and a warning, not a session with no sync.
    storeLog.warn('OS credential store was in use but is gone, falling back to the encrypted store');
  }
  if (storedMode !== 'local') rememberMode('local');
  return encryptedBackend();
}

/**
 * Connection ids of the saved AI settings. The settings themselves are the app's business — the
 * store only needs the names to preload, so it reads the same `prefs` entry the app writes.
 */
function aiConnectionIds(): string[] {
  const parsed = getPrefJson<{ connections?: unknown }>(STORAGE_KEYS.AI_SETTINGS, {});
  const connections = Array.isArray(parsed.connections) ? parsed.connections : [];
  const ids: string[] = [];
  for (const entry of connections) {
    if (typeof entry !== 'object' || entry === null) continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id === 'string' && id) ids.push(id);
  }
  return ids;
}

/**
 * Vault ids the registry knows. Their seeds are worth a warm cache because sharing a vault asks for
 * another vault's seed synchronously; a vault the registry never heard of has no seed to find. The
 * list is `prefs`, not a scan of anything: the registry has one owner and this is a reader.
 */
function knownVaultIds(): string[] {
  const ids = new Set<string>(['default_vault']);
  const registry = getPrefJson<unknown>(STORAGE_KEYS.VAULTS, []);
  for (const entry of Array.isArray(registry) ? registry : []) {
    if (typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string') {
      ids.add((entry as { id: string }).id);
    }
  }
  const current = getPrefJson<unknown>(STORAGE_KEYS.CURRENT_VAULT, null);
  if (typeof current === 'object' && current !== null && typeof (current as { id?: unknown }).id === 'string') {
    ids.add((current as { id: string }).id);
  }
  return [...ids];
}

/**
 * The old shape kept provider keys in the settings JSON in plain text. Move them into the store,
 * then rewrite the settings without them — everything that is not a key is left as it was. Once
 * the plaintext is gone this does nothing, so a second boot writes nothing.
 */
async function migrateAiKeys(target: SecretBackend): Promise<void> {
  const saved = getPrefJson<unknown>(STORAGE_KEYS.AI_SETTINGS, null);
  if (saved === null) return;
  const { keys, settings } = splitAiKeys(saved);
  if (!keys.length || !settings) return;

  const failed: string[] = [];
  for (const entry of keys) {
    try {
      const existing = await target.get(entry.key);
      if (existing === null) await target.set(entry.key, entry.value);
      cache.set(entry.key, existing ?? entry.value);
    } catch (error) {
      storeLog.error('Could not move an AI provider key into the secret store', { key: entry.key, error });
      failed.push(entry.key);
    }
  }

  // Rewriting the settings while a key is still only in the plaintext would lose it, so keep
  // the old plaintext and let the next boot try again.
  if (failed.length) {
    storeLog.warn('AI provider keys stayed in the settings: the secret store refused them', { keys: failed });
    return;
  }
  setPref(STORAGE_KEYS.AI_SETTINGS, JSON.stringify(settings));
}

/**
 * The cache exists for the readers that cannot wait: the account session is read while its module
 * is being imported, a shared vault asks for another vault's seed, and `loadAiSettings` resolves
 * keys during render. Everything else goes through `getSecret`.
 */
async function preload(target: SecretBackend): Promise<void> {
  const keys = new Set<string>([SECRET_KEYS.accountSession]);
  for (const vaultId of knownVaultIds()) keys.add(SECRET_KEYS.vaultSeed(vaultId));
  for (const connectionId of aiConnectionIds()) keys.add(SECRET_KEYS.aiKey(connectionId));

  for (const key of keys) {
    try {
      const value = await target.get(key);
      if (value !== null) cache.set(key, value);
    } catch (error) {
      storeLog.error('Could not preload a sync secret', { key, error });
      throw new Error('Не удалось прочитать ключи синхронизации');
    }
  }
}

async function doInitSecretStore(): Promise<void> {
  backend = override ?? (await resolveBackend());
  await migrateAiKeys(backend);
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

/**
 * The warm cache, and only it. A module can be imported before boot — `syncEngine` builds its
 * config at load — so an early read answers `null`; nothing else is scraped to fill the gap, which
 * is exactly what keeps the plaintext out of the picture. `boot()` awaits the init before rendering.
 */
export function getCachedSecret(key: string): string | null {
  return cache.get(key) ?? null;
}

export async function getSecret(key: string): Promise<string | null> {
  if (!ready) await initSecretStore();
  if (!backend) throw new Error('Secret store is not initialized');
  if (cache.has(key)) return cache.get(key) ?? null;
  const value = await backend.get(key);
  if (value !== null) cache.set(key, value);
  return value;
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (!ready) await initSecretStore();
  if (!backend) throw new Error('Secret store is not initialized');
  cache.set(key, value);
  const target = backend;
  await enqueue(key, () => target.set(key, value));
}

export async function deleteSecret(key: string): Promise<void> {
  if (!ready) await initSecretStore();
  if (!backend) throw new Error('Secret store is not initialized');
  cache.delete(key);
  const target = backend;
  await enqueue(key, () => target.delete(key));
}
