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

function comparisonValue(item: SlagItem) {
  const { updatedAt: _updatedAt, createdAt: _createdAt, ...value } = relayNote(item);
  return { ...value, subtasks: value.subtasks ?? [], isPinned: value.isPinned ?? false, isArchived: value.isArchived ?? false,
    ...(value.type === 'task' && { status: value.status ?? 'todo', priority: value.priority ?? 'none' }) };
}

function sameProperty(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameProperty(value, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys(left).every((key) => sameProperty(left[key], Object.hasOwn(right, key) ? right[key] : undefined))
    && Object.keys(right).every((key) => Object.hasOwn(left, key) || right[key] === undefined);
}

export function noteDifferences(a: SlagItem, b: SlagItem): string[] {
  const left: Record<string, unknown> = comparisonValue(a);
  const right: Record<string, unknown> = comparisonValue(b);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => !sameProperty(
    Object.hasOwn(left, key) ? left[key] : undefined, Object.hasOwn(right, key) ? right[key] : undefined));
}

export function sameNote(a: SlagItem | null, b: SlagItem | null): boolean {
  return !a || !b ? a === b : noteDifferences(a, b).length === 0;
}
