// Three-way merge of decrypted note data. The caller, not this function, handles conflicts.
import type { SlagAttachment, SlagItem } from '../../../types/index.ts';

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

type Hunk = { start: number; end: number; lines: string[] };

function changes(a: string[], b: string[]): Hunk[] | null {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let iEnd = a.length;
  let jEnd = b.length;
  while (iEnd > start && jEnd > start && a[iEnd - 1] === b[jEnd - 1]) { iEnd--; jEnd--; }
  const n = iEnd - start;
  const m = jEnd - start;
  if (n === 0 || m === 0) return n === m ? [] : [{ start, end: iEnd, lines: b.slice(start, jEnd) }];
  // ponytail: cap exact LCS to ~1 MB per diff; very large diverging ranges stay conflicts.
  if ((n + 1) * (m + 1) > 250_000) return null;
  const stride = m + 1;
  const dp = new Uint32Array((n + 1) * stride);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * stride + j] = a[start + i] === b[start + j] ? 1 + dp[(i + 1) * stride + j + 1]
        : Math.max(dp[(i + 1) * stride + j], dp[i * stride + j + 1]);
    }
  }
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let pending: Hunk | undefined;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      if (pending) hunks.push(pending);
      pending = undefined;
      i++; j++;
    } else {
      pending ??= { start: start + i, end: start + i, lines: [] };
      if (j < m && (i === n || dp[i * stride + j + 1] > dp[(i + 1) * stride + j])) pending.lines.push(b[start + j++]);
      else pending.end = start + ++i;
    }
  }
  if (pending) hunks.push(pending);
  return hunks;
}

function overlaps(a: Hunk, b: Hunk): boolean {
  if (a.start === b.start) return true;
  return a.start < b.end && b.start < a.end;
}

function mergeText(base: string, local: string, remote: string) {
  const lines = base.split('\n');
  const mine = changes(lines, local.split('\n'));
  const theirs = changes(lines, remote.split('\n'));
  if (!mine || !theirs) return { text: remote, conflict: true };
  const selected = [...theirs];
  let conflict = false;
  let j = 0;
  for (const hunk of mine) {
    while (j < theirs.length && theirs[j].start < hunk.start && theirs[j].end <= hunk.start) j++;
    if (j < theirs.length && overlaps(hunk, theirs[j])) {
      if (!equal(hunk, theirs[j])) conflict = true;
    } else selected.push(hunk);
  }
  const out: string[] = [];
  let position = 0;
  for (const hunk of selected.sort((a, b) => a.start - b.start)) {
    for (; position < hunk.start; position++) out.push(lines[position]);
    for (const line of hunk.lines) out.push(line);
    position = hunk.end;
  }
  for (; position < lines.length; position++) out.push(lines[position]);
  return { text: out.join('\n'), conflict };
}

export function mergeNote(base: SlagItem, local: SlagItem, remote: SlagItem): { item: SlagItem; conflicts: string[] } {
  const original = relayNote(base);
  const mine = relayNote(local);
  const current = relayNote(remote);
  const result: SlagItem = { ...current, updatedAt: Math.max(mine.updatedAt, current.updatedAt) };
  const conflicts: string[] = [];
  function choose<T>(field: string, b: T, l: T, r: T): T {
    if (equal(l, b) || equal(l, r)) return r;
    if (equal(r, b)) return l;
    conflicts.push(field);
    return r;
  }
  function keyed<T>(field: string, b: T[], l: T[], r: T[], key: (value: T) => string): T[] {
    const byKey = (list: T[]) => new Map(list.map((value) => [key(value), value]));
    const bm = byKey(b), lm = byKey(l), rm = byKey(r);
    const out: T[] = [];
    for (const id of new Set([...rm.keys(), ...lm.keys(), ...bm.keys()])) {
      const value = choose(`${field}.${id}`, bm.get(id), lm.get(id), rm.get(id));
      if (value !== undefined) out.push(value);
    }
    return out;
  }
  const special = new Set(['id', 'createdAt', 'updatedAt', 'filename', 'content', 'tags', 'attachments', 'customProps']);
  function field<K extends keyof SlagItem>(key: K) {
    result[key] = choose(key, original[key], mine[key], current[key]);
  }
  for (const key of new Set([...Object.keys(original), ...Object.keys(mine), ...Object.keys(current)])) {
    if (!special.has(key)) field(key as keyof SlagItem);
  }
  if (mine.content === original.content || mine.content === current.content) result.content = current.content;
  else if (current.content === original.content) result.content = mine.content;
  else {
    const { text, conflict } = mergeText(original.content, mine.content, current.content);
    result.content = text;
    if (conflict) conflicts.push('content');
  }
  result.tags = keyed('tags', original.tags, mine.tags, current.tags, (tag) => tag);
  result.attachments = keyed('attachments', original.attachments, mine.attachments, current.attachments, (a: SlagAttachment) => a.id);
  const b = original.customProps ?? {}, l = mine.customProps ?? {}, r = current.customProps ?? {};
  const props = Object.fromEntries([...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])]
    .map((key) => [key, choose(`customProps.${key}`, b[key] as unknown, l[key] as unknown, r[key] as unknown)] as const)
    .filter(([, val]) => val !== undefined));
  if (Object.keys(props).length > 0) result.customProps = props;
  else delete result.customProps;
  for (const key of Object.keys(result) as (keyof SlagItem)[]) if (result[key] === undefined) delete result[key];
  return { item: result, conflicts };
}
