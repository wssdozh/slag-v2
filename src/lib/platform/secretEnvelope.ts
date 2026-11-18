// The AES-GCM envelope both secret stores keep: the same fields in a browser profile and in
// `<AppData>/secrets.json`. Only the place differs, and that is `encryptedLocalStore.ts`'s business.
//
// Pure on purpose and free of Tauri: the browser build reaches this file without pulling the native
// file backend in, and the native one without pulling IndexedDB.

/** One AES-GCM envelope: the format version, the nonce and the ciphertext. */
export interface SecretEnvelope {
  v: 1;
  iv: string;
  data: string;
}

/** Where the encrypted store keeps its envelopes: the file here, `localStorage` in a browser. */
export interface SecretEnvelopeStore {
  get(key: string): Promise<SecretEnvelope | null>;
  set(key: string, envelope: SecretEnvelope): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Half an envelope is not one: a missing field reads as "nothing stored under this key". */
export function readEnvelope(value: unknown): SecretEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Partial<SecretEnvelope>;
  return entry.v === 1 && typeof entry.iv === 'string' && typeof entry.data === 'string'
    ? { v: 1, iv: entry.iv, data: entry.data }
    : null;
}
