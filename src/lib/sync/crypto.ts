import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { BIP39_WORDS } from './bip39Words';
import type { SyncBundle, EncryptedBundle } from './types';
import { bytesToBase64, base64ToBytes, toArrayBuffer } from '../byteCodec';

const VAULT_SALT = new TextEncoder().encode('slag-vault-salt-v1');
const ROOM_SALT = new TextEncoder().encode('slag-relay-room-v1');

/** Generates a cryptographically secure 12-word recovery seed phrase */
export function generateMnemonic(wordCount = 12): string {
  const randomIndices = new Uint16Array(wordCount);
  crypto.getRandomValues(randomIndices);
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = randomIndices[i] % BIP39_WORDS.length;
    words.push(BIP39_WORDS[idx]);
  }
  return words.join(' ');
}

/** Validates whether a phrase consists of valid BIP-39 words */
export function validateMnemonic(phrase: string): boolean {
  if (!phrase) return false;
  const parts = phrase.trim().toLowerCase().split(/\s+/);
  if (parts.length !== 12 && parts.length !== 24) return false;
  return parts.every((w) => BIP39_WORDS.includes(w));
}

/** Derives an AES-GCM 256-bit CryptoKey from a mnemonic phrase using PBKDF2 */
export async function deriveVaultKey(mnemonic: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const normalized = mnemonic.trim().toLowerCase();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(normalized),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: VAULT_SALT,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Derives a blind room ID for relay routing without exposing the vault key */
export async function deriveRoomId(mnemonic: string): Promise<string> {
  const enc = new TextEncoder();
  const normalized = mnemonic.trim().toLowerCase();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(normalized),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const rawBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: ROOM_SALT,
      iterations: 10_000,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  const bytes = new Uint8Array(rawBits);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `room_${hex.slice(0, 32)}`;
}

/** Encrypts and compresses a SyncBundle */
export async function encryptBundle(bundle: SyncBundle, key: CryptoKey): Promise<EncryptedBundle> {
  const jsonStr = JSON.stringify(bundle);
  const uncompressed = strToU8(jsonStr);
  const compressed = gzipSync(uncompressed);
  const compressedBuffer = toArrayBuffer(compressed);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ivBuffer = toArrayBuffer(iv);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    compressedBuffer
  );

  return {
    bundleId: bundle.bundleId,
    fromDeviceId: bundle.fromDeviceId,
    sequence: bundle.sequence,
    timestamp: bundle.timestamp,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertextBuffer),
  };
}

/** Decrypts and decompresses an EncryptedBundle */
export async function decryptBundle(encrypted: EncryptedBundle, key: CryptoKey): Promise<SyncBundle> {
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext)
  );

  const decompressed = gunzipSync(new Uint8Array(decryptedBuffer));
  const jsonStr = strFromU8(decompressed);
  return JSON.parse(jsonStr) as SyncBundle;
}

/** Computes SHA-256 hash of a string or byte array */
export async function computeHash(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  const hashArr = Array.from(new Uint8Array(digest));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Computes deterministic Merkle Root hash of current local state */
export async function computeStateRootHash(
  items: Array<{ id: string; updatedAt?: number | string }>,
  folders: Array<{ path: string; name: string }>
): Promise<string> {
  const sortedItemTokens = items
    .map((it) => `${it.id}:${it.updatedAt ?? ''}`)
    .sort()
    .join('|');
  const sortedFolderTokens = folders
    .map((f) => `${f.path}:${f.name}`)
    .sort()
    .join('|');

  return computeHash(`items:[${sortedItemTokens}]|folders:[${sortedFolderTokens}]`);
}

/** Generates a human-friendly unique device ID like 'slag-7f3a-9c2b' */
export function generateDeviceId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(rand).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `slag-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
