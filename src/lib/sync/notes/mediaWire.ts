import { SYNC_ATTACHMENT_MAX_BYTES } from '../../../config/sync.ts';
import { toArrayBuffer } from '../../media/byteCodec.ts';
import type { NoteKeys } from './wire.ts';

const ivBytes = 12;
const tagBytes = 16;
export const REGISTRY_MEDIA_MAX_BYTES = SYNC_ATTACHMENT_MAX_BYTES + ivBytes + tagBytes;
const encoder = new TextEncoder();

async function blobId(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function context(room: string, generation: number): Uint8Array<ArrayBuffer> {
  if (!room || !Number.isSafeInteger(generation) || generation <= 0) throw new Error('Invalid registry media scope');
  return encoder.encode(JSON.stringify(['slag-registry-media-v1', room, generation]));
}

/** Raw wire body: nonce, AES-GCM ciphertext and tag. The address hashes all bytes. */
export async function sealRegistryMedia(keys: NoteKeys, room: string, generation: number, source: Uint8Array) {
  if (source.byteLength > SYNC_ATTACHMENT_MAX_BYTES) throw new Error('Registry media exceeds the size limit');
  const aad = context(room, generation);
  const plain = toArrayBuffer(source);
  // A room-scoped keyed fingerprint gives the same envelope after a restart without storing a
  // second copy of the file in the journal. Only equality within one room/generation is visible.
  const fingerprint = new Uint8Array(await crypto.subtle.digest('SHA-256', plain));
  const label = new Uint8Array(aad.length + fingerprint.length);
  label.set(aad);
  label.set(fingerprint, aad.length);
  const iv = new Uint8Array(await crypto.subtle.sign('HMAC', keys.mediaNonceKey, label)).slice(0, ivBytes);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, keys.mediaKey, plain);
  const bytes = new Uint8Array(ivBytes + encrypted.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(encrypted), ivBytes);
  return { id: await blobId(bytes), bytes };
}

export async function openRegistryMedia(keys: NoteKeys, room: string, generation: number, id: string, bytes: Uint8Array): Promise<Uint8Array> {
  if (!/^[a-f0-9]{64}$/.test(id) || bytes.byteLength < ivBytes + tagBytes || bytes.byteLength > REGISTRY_MEDIA_MAX_BYTES) {
    throw new Error('Invalid registry media envelope');
  }
  // Copy once across the async boundary: the checked bytes must be exactly the bytes decrypted.
  const wire = new Uint8Array(bytes);
  if (await blobId(wire) !== id) throw new Error('Registry media address mismatch');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wire.subarray(0, ivBytes),
    additionalData: context(room, generation) }, keys.mediaKey, wire.subarray(ivBytes)));
}
