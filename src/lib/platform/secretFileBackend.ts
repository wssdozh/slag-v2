/**
 * Native ciphertext at rest: one flat map of `secretKey → { v, iv, data }` in `<AppData>/secrets.json`.
 *
 * The envelope is the AES-GCM one from `encryptedLocalStore.ts`, unchanged: this module only moves
 * where it sits. The master key stays in IndexedDB and is not extractable, so the file alone opens
 * nothing — which is why it may travel with a backup or a copied data directory without leaking a
 * seed phrase.
 *
 * A browser build never reaches this: there the profile is the store. A missing or broken file is an
 * empty store and a warning, never a reason to keep the app from opening. Writing is the same
 * write-then-rename `prefsBackend.native.ts` uses, through `writeJsonAtomic`.
 */
import { BaseDirectory, exists, readTextFile } from '@tauri-apps/plugin-fs';
import { logger } from '../logger/logger';
import { writeJsonAtomic } from './writeJsonAtomic';

const fsLog = logger.scope('SYNC');

const SECRETS_FILE = 'secrets.json';

/** One AES-GCM envelope, the same shape the browser profile keeps. */
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

type SecretEnvelopeMap = Record<string, SecretEnvelope>;

/** Half an envelope is not one: a missing field reads as "nothing stored under this key". */
function readEnvelope(value: unknown): SecretEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Partial<SecretEnvelope>;
  return entry.v === 1 && typeof entry.iv === 'string' && typeof entry.data === 'string'
    ? { v: 1, iv: entry.iv, data: entry.data }
    : null;
}

/** The file as it sits on disk. Broken JSON answers empty; an unreadable file throws to the caller. */
async function readSecrets(): Promise<SecretEnvelopeMap> {
  if (!(await exists(SECRETS_FILE, { baseDir: BaseDirectory.AppData }))) return {};
  const text = await readTextFile(SECRETS_FILE, { baseDir: BaseDirectory.AppData });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fsLog.warn(`${SECRETS_FILE} is not valid JSON, starting with an empty secret store`);
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const envelopes: SecretEnvelopeMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    const envelope = readEnvelope(value);
    if (envelope) envelopes[key] = envelope;
  }
  return envelopes;
}

/**
 * Is there anything in the file? The one-time move off the webview profile asks before copying, so
 * a store that already has envelopes is never overwritten by older ones. An unreadable file answers
 * `true`: the move stays away from a file it could not read.
 */
export async function hasSecretEnvelopes(): Promise<boolean> {
  try {
    return Object.keys(await readSecrets()).length > 0;
  } catch (error) {
    fsLog.warn(`Could not read ${SECRETS_FILE}; skipping the move from the webview profile:`, error);
    return true;
  }
}

/**
 * The store itself. Every write is read-merge-write: the file is shared with whoever else runs
 * against this data directory, and one secret must not drop another. A failed read is a warning and
 * a miss, not a crash — a missing key asks for a seed phrase, it does not take the app down.
 */
export function fileEnvelopeStore(): SecretEnvelopeStore {
  return {
    async get(key) {
      try {
        return (await readSecrets())[key] ?? null;
      } catch (error) {
        fsLog.warn(`Could not read ${SECRETS_FILE}; the secret counts as missing:`, error);
        return null;
      }
    },

    async set(key, envelope) {
      const envelopes = await readSecrets();
      envelopes[key] = envelope;
      await writeJsonAtomic(SECRETS_FILE, envelopes);
    },

    async delete(key) {
      const envelopes = await readSecrets();
      if (!(key in envelopes)) return;
      delete envelopes[key];
      await writeJsonAtomic(SECRETS_FILE, envelopes);
    },
  };
}
