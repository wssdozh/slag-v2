// Web/Android secret store: AES-GCM ciphertext in localStorage, non-extractable key in IndexedDB.
// This is the fallback when the desktop OS keychain is unavailable; it never writes plaintext.
import { logger } from '../logger/logger';
import { base64ToBytes, bytesToBase64, toArrayBuffer } from '../media/byteCodec';

const storeLog = logger.scope('SYNC');

const DB_NAME = 'slag-secret-store';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const MASTER_KEY_ID = 'master';
export const ENCRYPTED_SECRET_PREFIX = 'slag_secure_v1:';

interface EncryptedSecret {
  v: 1;
  iv: string;
  data: string;
}

let masterKey: CryptoKey | null = null;

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

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EncryptedSecret).v === 1 &&
    typeof (value as EncryptedSecret).iv === 'string' &&
    typeof (value as EncryptedSecret).data === 'string'
  );
}

export async function getLocalSecret(key: string): Promise<string | null> {
  const raw = localStorage.getItem(`${ENCRYPTED_SECRET_PREFIX}${key}`);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    storeLog.warn('Encrypted secret is not valid JSON', { key, error });
    return null;
  }
  if (!isEncryptedSecret(parsed)) {
    storeLog.warn('Encrypted secret has an unsupported shape', { key });
    return null;
  }

  try {
    const cryptoKey = await getMasterKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(parsed.iv)) },
      cryptoKey,
      toArrayBuffer(base64ToBytes(parsed.data))
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
  const envelope: EncryptedSecret = {
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(ciphertext),
  };
  localStorage.setItem(`${ENCRYPTED_SECRET_PREFIX}${key}`, JSON.stringify(envelope));
}

export function deleteLocalSecret(key: string): void {
  localStorage.removeItem(`${ENCRYPTED_SECRET_PREFIX}${key}`);
}
