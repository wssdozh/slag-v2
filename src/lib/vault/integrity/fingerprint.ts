// One line per note that a device can compare byte for byte.
//
// Canonical form: same meaning, same string. Key order is the only thing an in-memory object is
// free to change, so it is the only thing thrown away here — plus the two fields that carry no
// meaning across devices: where the file sat (`filename`) and the inline copy of it (`dataUrl`).

import type { SlagItem } from '../../../types/index.ts';

/** JSON the way canonical form keeps it: no `undefined`, no class instances. */
type Canonical = string | number | boolean | null | Canonical[] | { [key: string]: Canonical };

const encoder = new TextEncoder();

/**
 * Line endings and trailing blanks are editor noise, not content: a note saved on Windows and the
 * same note saved on Linux must not look like two different notes.
 */
function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
}

/**
 * `filename` only makes sense at the root of a note; `dataUrl` only inside an attachment.
 * Anywhere deeper they are ordinary data and stay.
 */
function isVolatile(parentKey: string, key: string): boolean {
  if (key === 'filename') return parentKey === '';
  return key === 'dataUrl' && parentKey === 'attachments';
}

function sortValue(value: unknown, parentKey: string): Canonical | undefined {
  if (typeof value === 'string') return normalizeText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    // Order inside an array is meaning: tags, attachments, subtasks. Kept as is. The parent key
    // travels with each element, so an attachment's `dataUrl` stays visible to `isVolatile`.
    return value.map((entry) => sortValue(entry, parentKey) ?? null);
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, Canonical> = {};
    for (const key of Object.keys(source).sort()) {
      if (isVolatile(parentKey, key)) continue;
      const child = sortValue(source[key], key);
      if (child !== undefined) sorted[key] = child;
    }
    return sorted;
  }
  return undefined;
}

/** Stable representation of a note: sorted keys at every level, arrays in order. */
export function canonicalJson(item: SlagItem): string {
  return JSON.stringify(sortValue(item, '') ?? {});
}

function toHex(buffer: ArrayBuffer): string {
  let hex = '';
  for (const byte of new Uint8Array(buffer)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Hex digest of the canonical form: SHA-256 alone, HMAC-SHA256 when the vault has a key. */
export async function fingerprint(canonical: string, key?: CryptoKey): Promise<string> {
  const data = encoder.encode(canonical);
  if (key) return toHex(await crypto.subtle.sign('HMAC', key, data));
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/** The same digest, named for what the aggregates use it for: a hash of a list. */
export async function sha256Hex(text: string): Promise<string> {
  return fingerprint(text);
}
