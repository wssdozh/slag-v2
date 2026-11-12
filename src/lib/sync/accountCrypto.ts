// Derives account and device keys, and wraps one vault key for one specific device.
import { p256 } from '@noble/curves/nist.js';
import { validateMnemonic } from './crypto';
import { bytesToBase64, base64ToBytes, toArrayBuffer } from '../media/byteCodec';
import type { LocalDeviceIdentity } from './accountTypes';
import { SYNC_CRYPTO_CONSTANTS, SYNC_STORAGE_KEYS } from '../../config';

const ACCOUNT_KEY_DOMAIN = SYNC_CRYPTO_CONSTANTS.ACCOUNT_KEY_DOMAIN;
const DEVICE_KEY_PREFIX = SYNC_STORAGE_KEYS.DEVICE_KEY_PREFIX;
const HKDF_SALT = new TextEncoder().encode(SYNC_CRYPTO_CONSTANTS.HKDF_SALT);
const HKDF_INFO = new TextEncoder().encode(SYNC_CRYPTO_CONSTANTS.HKDF_INFO);

export interface AccountIdentity {
  accountId: string;
  publicKey: string;
  signChallenge(challenge: string): string;
}

interface StoredDeviceIdentity {
  deviceId: string;
  name: string;
  platform: LocalDeviceIdentity['platform'];
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

interface VaultKeyEnvelope {
  version: 1;
  ephemeralPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)));
}

export async function generateAccountIdentity(seed: string): Promise<AccountIdentity> {
  if (!validateMnemonic(seed)) {
    throw new Error('Account seed must be a valid 12 or 24-word mnemonic');
  }

  const normalized = seed.trim().toLowerCase().split(/\s+/).join(' ');
  let privateKey: Uint8Array | null = null;
  for (let counter = 0; privateKey === null; counter++) {
    const candidate = await sha256(`${ACCOUNT_KEY_DOMAIN}\0${normalized}\0${counter}`);
    if (p256.utils.isValidSecretKey(candidate)) privateKey = candidate;
  }

  const secretKey = privateKey;
  const publicBytes = p256.getPublicKey(secretKey, true);
  const publicKey = bytesToHex(publicBytes);
  const accountId = `acc_${bytesToHex(await sha256(publicBytes)).slice(0, 24)}`;

  return {
    accountId,
    publicKey,
    signChallenge(challenge: string): string {
      const signature = p256.sign(new TextEncoder().encode(challenge), secretKey, {
        prehash: true,
        lowS: true,
        format: 'compact',
      });
      return bytesToHex(signature);
    },
  };
}

function readStoredDevice(deviceId: string): StoredDeviceIdentity | null {
  const raw = localStorage.getItem(`${DEVICE_KEY_PREFIX}${deviceId}`);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Stored device identity is not valid JSON', { cause: error });
  }

  if (
    !isRecord(parsed) ||
    parsed.deviceId !== deviceId ||
    typeof parsed.name !== 'string' ||
    !['desktop', 'mobile', 'web'].includes(String(parsed.platform)) ||
    !isRecord(parsed.publicKey) ||
    !isRecord(parsed.privateKey) ||
    typeof parsed.privateKey.d !== 'string'
  ) {
    throw new Error('Stored device identity is invalid');
  }
  return parsed as unknown as StoredDeviceIdentity;
}

export function signDeviceChallenge(deviceId: string, challenge: string): string {
  const stored = readStoredDevice(deviceId);
  if (!stored || typeof stored.privateKey.d !== 'string') {
    throw new Error('Device identity is not stored on this device');
  }
  const secretKey = base64ToBytes(stored.privateKey.d.replace(/-/g, '+').replace(/_/g, '/'));
  return bytesToHex(p256.sign(new TextEncoder().encode(challenge), secretKey, {
    prehash: true,
    lowS: true,
    format: 'compact',
  }));
}

export async function getOrCreateDeviceIdentity(
  deviceId: string,
  name: string,
  platform: LocalDeviceIdentity['platform']
): Promise<LocalDeviceIdentity> {
  if (!deviceId.trim()) throw new Error('Device ID is required');
  const stored = readStoredDevice(deviceId);
  if (stored) {
    return {
      deviceId,
      name: stored.name,
      platform: stored.platform,
      publicKey: JSON.stringify(stored.publicKey),
    };
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ]);
  const identity: StoredDeviceIdentity = { deviceId, name, platform, publicKey, privateKey };
  localStorage.setItem(`${DEVICE_KEY_PREFIX}${deviceId}`, JSON.stringify(identity));
  return { deviceId, name, platform, publicKey: JSON.stringify(publicKey) };
}

export function renameStoredDevice(deviceId: string, name: string): void {
  const stored = readStoredDevice(deviceId);
  if (!stored) return;
  stored.name = name;
  localStorage.setItem(`${DEVICE_KEY_PREFIX}${deviceId}`, JSON.stringify(stored));
}

export async function getDevicePrivateKey(deviceId: string): Promise<CryptoKey> {
  const stored = readStoredDevice(deviceId);
  if (!stored) throw new Error('Device identity is not stored on this device');
  return crypto.subtle.importKey(
    'jwk',
    stored.privateKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

async function deriveEnvelopeKey(
  privateKey: CryptoKey,
  publicJwk: JsonWebKey,
  usage: 'encrypt' | 'decrypt'
): Promise<CryptoKey> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encryptVaultKeyForDevice(
  vaultSeed: string,
  devicePublicKeyJson: string
): Promise<string> {
  let devicePublicKey: JsonWebKey;
  try {
    devicePublicKey = JSON.parse(devicePublicKeyJson) as JsonWebKey;
  } catch (error) {
    throw new Error('Device public key is not valid JSON', { cause: error });
  }

  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const key = await deriveEnvelopeKey(ephemeral.privateKey, devicePublicKey, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(vaultSeed)
  );
  const envelope: VaultKeyEnvelope = {
    version: 1,
    ephemeralPublicKey: await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(envelope)));
}

export async function decryptVaultKeyForDevice(
  deviceId: string,
  encryptedKey: string,
  _hostPublicKeyJson?: string
): Promise<string> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder().decode(base64ToBytes(encryptedKey)));
  } catch (error) {
    throw new Error('Encrypted vault key is not a valid envelope', { cause: error });
  }
  if (
    !isRecord(envelope) ||
    envelope.version !== 1 ||
    !isRecord(envelope.ephemeralPublicKey) ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('Encrypted vault key envelope is invalid');
  }

  const privateKey = await getDevicePrivateKey(deviceId);
  const key = await deriveEnvelopeKey(
    privateKey,
    envelope.ephemeralPublicKey as JsonWebKey,
    'decrypt'
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(envelope.iv)) },
    key,
    toArrayBuffer(base64ToBytes(envelope.ciphertext))
  );
  return new TextDecoder().decode(plaintext);
}
