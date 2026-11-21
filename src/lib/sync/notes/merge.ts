// Normalize note data for the relay and compare semantic payloads.
import type { SlagItem } from '../../../types/index.ts';

export function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((val: unknown, i) => equal(val, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

export function relayNote(item: SlagItem): SlagItem {
  const { filename, ...clean } = item;
  void filename;
  return { ...clean, attachments: item.attachments.map(({ dataUrl, ...metadata }) => {
    void dataUrl;
    return metadata;
  }) };
}

export function sameNote(a: SlagItem | null, b: SlagItem | null): boolean {
  if (!a || !b) return a === b;
  return equal({ ...relayNote(a), updatedAt: 0, createdAt: 0 }, { ...relayNote(b), updatedAt: 0, createdAt: 0 });
}
