// Secrets at rest for builds without an OS keychain: AES-GCM envelopes under a non-extractable
// master key that never leaves IndexedDB. The ciphertext lives where the build keeps files —
// `localStorage` in a browser, `<AppData>/secrets.json` in a native one — so a native build no
// longer writes the webview profile. This module is the only place that knows the difference.
//
// The master key is not serialized and cannot be: an envelope without it is noise, which is why the
// store may be copied between machines without leaking plaintext.
import { isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';
import { base64ToBytes, bytesToBase64, toArrayBuffer } from '../media/byteCodec';
import type { SecretEnvelope, SecretEnvelopeStore } from './secretFileBackend';

const storeLog = logger.scope('SYNC');

const DB_NAME = 'slag-secret-store';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const MASTER_KEY_ID = 'master';
/** The name the web build has always used; the one-time move looks for exactly this prefix. */
const ENCRYPTED_SECRET_PREFIX = 'slag_secure_v1:';

let masterKey: CryptoKey | null = null;
let envelopeStorePromise: Promise<SecretEnvelopeStore> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) {
        request.result.createObjectStore(KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function readMasterKey(db: IDBDatabase): Promise<CryptoKey | null> {
  const transaction = db.transaction(KEY_STORE, 'readonly');
  const value = await requestToPromise(transaction.objectStore(KEY_STORE).get(MASTER_KEY_ID));
  return value instanceof CryptoKey ? value : null;
}

async function createMasterKey(db: IDBDatabase): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  try {
    const transaction = db.transaction(KEY_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(KEY_STORE).add(key, MASTER_KEY_ID));
    return key;
  } catch (error) {
    // Two windows can race on the very first write. The loser reads the winner's key.
    const existing = await readMasterKey(db);
    if (existing) return existing;
    throw error;
  }
}

async function getMasterKey(): Promise<CryptoKey> {
  if (masterKey) return masterKey;
  const db = await openDatabase();
  try {
    const existing = await readMasterKey(db);
    masterKey = existing ?? (await createMasterKey(db));
    return masterKey;
  } finally {
    db.close();
  }
}

/** `null` for a value that is not an envelope: half a record opens nothing. */
function parseEnvelope(raw: string, key: string): SecretEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    storeLog.warn('Encrypted secret is not valid JSON', { key, error });
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as SecretEnvelope).v !== 1 ||
    typeof (parsed as SecretEnvelope).iv !== 'string' ||
    typeof (parsed as SecretEnvelope).data !== 'string'
  ) {
    storeLog.warn('Encrypted secret has an unsupported shape', { key });
    return null;
  }
  return {
    v: 1,
    iv: (parsed as SecretEnvelope).iv,
    data: (parsed as SecretEnvelope).data,
  };
}

/** The browser store: a browser has no file system, and the profile is the only place left. */
const profileEnvelopeStore: SecretEnvelopeStore = {
  async get(key) {
    const raw = localStorage.getItem(`${ENCRYPTED_SECRET_PREFIX}${key}`);
    return raw ? parseEnvelope(raw, key) : null;
  },

  async set(key, envelope) {
    localStorage.setItem(`${ENCRYPTED_SECRET_PREFIX}${key}`, JSON.stringify(envelope));
  },

  async delete(key) {
    localStorage.removeItem(`${ENCRYPTED_SECRET_PREFIX}${key}`);
  },
};

/**
 * The only `localStorage` read on a native path, and it runs once: before this build the ciphertext
 * of a native AES store sat in the webview profile. An upgrade copies the envelopes into the file —
 * same envelope, same master key, nothing decrypted — and deletes them, so a device that already had
 * keys keeps them instead of being asked for a seed phrase. A browser build never gets here: there
 * the profile is not a legacy store, it is the store.
 */
async function moveProfileEnvelopes(target: SecretEnvelopeStore): Promise<void> {
  try {
    const legacy = new Map<string, SecretEnvelope>();
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (!name?.startsWith(ENCRYPTED_SECRET_PREFIX)) continue;
      const raw = localStorage.getItem(name);
      const envelope = raw ? parseEnvelope(raw, name.slice(ENCRYPTED_SECRET_PREFIX.length)) : null;
      if (envelope) legacy.set(name.slice(ENCRYPTED_SECRET_PREFIX.length), envelope);
    }
    if (legacy.size === 0) return;

    for (const [key, envelope] of legacy) await target.set(key, envelope);
    for (const key of legacy.keys()) localStorage.removeItem(`${ENCRYPTED_SECRET_PREFIX}${key}`);
    storeLog.info(`Moved ${legacy.size} encrypted secret(s) from the webview profile into secrets.json`);
  } catch (error) {
    // The keys stay where they were: a partial copy must not delete the only readable envelope.
    storeLog.warn('Could not move the encrypted secrets out of the webview profile', error);
  }
}

async function createEnvelopeStore(): Promise<SecretEnvelopeStore> {
  if (!isTauri()) return profileEnvelopeStore;
  const { fileEnvelopeStore, hasSecretEnvelopes } = await import('./secretFileBackend');
  const target = fileEnvelopeStore();
  if (!(await hasSecretEnvelopes())) await moveProfileEnvelopes(target);
  return target;
}

function envelopeStore(): Promise<SecretEnvelopeStore> {
  envelopeStorePromise ??= createEnvelopeStore();
  return envelopeStorePromise;
}

export async function getLocalSecret(key: string): Promise<string | null> {
  const store = await envelopeStore();
  const envelope = await store.get(key);
  if (!envelope) return null;

  try {
    const cryptoKey = await getMasterKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(envelope.iv)) },
      cryptoKey,
      toArrayBuffer(base64ToBytes(envelope.data))
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    storeLog.warn('Encrypted secret could not be decrypted', { key, error });
    return null;
  }
}

export async function setLocalSecret(key: string, value: string): Promise<void> {
  const cryptoKey = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    cryptoKey,
    new TextEncoder().encode(value)
  );
  const envelope: SecretEnvelope = {
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(ciphertext),
  };
  const store = await envelopeStore();
  await store.set(key, envelope);
}

export async function deleteLocalSecret(key: string): Promise<void> {
  const store = await envelopeStore();
  await store.delete(key);
}
