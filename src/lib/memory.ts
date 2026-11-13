// The assistant's own memory: what it knows about the person, how it ages, how it ranks.
//
// One reason to change — what a fact is and how it is scored. Persistence is `storage`,
// duplicate detection is a stem comparison, and nothing here calls the model: the model
// only ever supplies `text` and, optionally, the id it means to replace.
import type { MemoryItem, MemoryKind } from '../types';
import { storage } from './storage';
import { logger } from './logger/logger';
import { RU_ENDINGS, RU_STOPWORDS } from './searchService';
import { formatTag, isStopTag } from './ai/tags';

const log = logger.scope('AI');

export const MEMORY_LIMIT = 500;
export const MEMORY_PROMPT_LIMIT = 8;
export const MEMORY_TAG_PROMPT_LIMIT = 8;
const MEMORY_TEXT_MAX = 200;
const DAY_MS = 86_400_000;
const TOMBSTONE_TTL_MS = 30 * DAY_MS;
// Retrieval reinforcement is written back at most every ten minutes: a counter that ticks on
// every prompt would queue a sync op per turn for a number nobody reads in real time.
const TOUCH_PERSIST_INTERVAL_MS = 10 * 60_000;

export const MEMORY_KINDS: readonly MemoryKind[] = ['rule', 'pref', 'fact', 'event', 'note'];

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  rule: 'правило',
  pref: 'предпочтение',
  fact: 'факт',
  event: 'событие',
  note: 'заметка',
};

/** How much a kind outweighs another when the person's own words are equally relevant. */
const KIND_WEIGHT: Record<MemoryKind, number> = { rule: 1.2, pref: 1, fact: 0.9, event: 0.7, note: 0.6 };

/** Days a fact stays worth injecting on its own. Rules and preferences never rot. */
const KIND_TTL_DAYS: Record<MemoryKind, number> = { rule: 0, pref: 0, fact: 0, event: 120, note: 180 };

/** The model rates 1..5; the kind sets the floor, so a rule cannot arrive as "meh". */
const KIND_MIN_IMPORTANCE: Record<MemoryKind, number> = { rule: 4, pref: 3, fact: 3, event: 2, note: 2 };

function stemWord(word: string): string {
  if (word.length < 4) return word;
  for (const ending of RU_ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) {
      return word.slice(0, word.length - ending.length);
    }
  }
  return word;
}

/** «не» is a stopword for the vault search; in memory it is the whole meaning. */
const NEGATIONS = new Set(['не', 'нет', 'никогда', 'нельзя', 'без']);
const NEGATION = '¬';

/** Stems of the meaningful words: the comparison key for duplicates and for matching. */
export function normalizeWords(text: string): string[] {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const tokens: string[] = [];
  for (const word of words) {
    if (NEGATIONS.has(word)) {
      tokens.push(NEGATION);
      continue;
    }
    if (word.length > 1 && !RU_STOPWORDS.has(word)) tokens.push(stemWord(word));
  }
  return tokens;
}

export function normalizedOf(text: string): string {
  return normalizeWords(text).join(' ');
}

function overlapOf(terms: string[], normalized: string): number {
  if (terms.length === 0) return 0;
  const words = new Set(normalized.split(' '));
  let hits = 0;
  for (const term of terms) {
    if (words.has(term)) {
      hits += 1;
      continue;
    }
    // ponytail: a four-letter stem prefix instead of embeddings. «созвониться» has to reach
    // «созвон» or the fact is unreachable from the phrasing people actually use. Upgrade:
    // a small local embedding when false positives start outnumbering the misses.
    if (term.length >= 5) {
      const prefix = term.slice(0, 4);
      if (words.has(prefix) || [...words].some((word) => word.startsWith(prefix))) hits += 1;
    }
  }
  // «что я люблю» must not answer with «не люблю холодец»: same words, opposite meaning.
  // A mismatch halves the score instead of dropping the fact, so a lone negated memory still
  // surfaces when nothing else matches.
  const polarityMismatch = terms.includes(NEGATION) !== words.has(NEGATION);
  return (hits / terms.length) * (polarityMismatch ? 0.5 : 1);
}

/** Importance is static, freshness and reinforcement are not: never store the sum. */
export function scoreMemory(item: MemoryItem, overlap: number, now = Date.now()): number {
  const days = Math.max(0, (now - item.updatedAt) / DAY_MS);
  const recency = Math.exp(-days / 90);
  const reinforcement = Math.min(1, item.usedCount / 8);
  const importance = item.importance / 5;
  return (0.5 * overlap + 0.25 * importance + 0.15 * recency + 0.1 * reinforcement) * KIND_WEIGHT[item.kind];
}

export function isLiveMemory(item: MemoryItem, now = Date.now()): boolean {
  if (item.deletedAt || item.validTo) return false;
  const ttlDays = KIND_TTL_DAYS[item.kind];
  if (!item.isPinned && ttlDays > 0 && now - item.updatedAt > ttlDays * DAY_MS) return false;
  return true;
}

export interface MemoryQuery {
  query?: string;
  kind?: MemoryKind;
  tag?: string;
  limit?: number;
}

/** Live facts, best first. A fact with no word in common is never injected, pinned ones always. */
export function selectMemory(items: MemoryItem[], query: MemoryQuery = {}, now = Date.now()): MemoryItem[] {
  const limit = query.limit ?? MEMORY_PROMPT_LIMIT;
  const terms = query.query ? normalizeWords(query.query) : [];
  const wantedTag = query.tag ? query.tag.toLowerCase().trim() : null;

  return items
    .filter((item) => isLiveMemory(item, now))
    .filter((item) => !query.kind || item.kind === query.kind)
    .filter((item) => !wantedTag || (item.tag ?? '') === wantedTag)
    .map((item) => {
      const overlap = terms.length === 0 ? 0 : overlapOf(terms, item.normalized);
      return { item, overlap, score: scoreMemory(item, overlap, now) };
    })
    .filter((entry) => entry.item.isPinned || terms.length === 0 || entry.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * Tags come from the vault's own dictionary first, memory's second. A new tag is allowed,
 * but it has to survive normalization and the stop list, so "заметка" never becomes a topic.
 */
export function resolveMemoryTag(raw: string, vocabulary: string[]): string | null {
  const clean = formatTag(raw, 'lowercase');
  if (!clean || isStopTag(clean)) return null;
  const exact = vocabulary.find((tag) => tag === clean);
  if (exact) return exact;

  const stem = stemWord(clean);
  const byStem = vocabulary.find((tag) => stemWord(tag) === stem);
  return byStem ?? clean;
}

export interface RememberInput {
  text: string;
  kind?: MemoryKind;
  tag?: string;
  importance?: number;
  /** The fact this one contradicts, as shown in the prompt. */
  replaces?: string;
}

export interface RememberResult {
  items: MemoryItem[];
  item: MemoryItem;
  status: 'created' | 'merged' | 'replaced';
  superseded?: MemoryItem;
}

function clampImportance(raw: unknown, kind: MemoryKind): number {
  const value = Math.round(Number(raw));
  const bounded = Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : 3;
  return Math.max(bounded, KIND_MIN_IMPORTANCE[kind]);
}

function newMemoryId(now: number): string {
  return `m_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Drops the least valuable unpinned rows until the list fits, tombstones first. */
function enforceLimit(items: MemoryItem[], protectedId: string | undefined, now: number): MemoryItem[] {
  const kept = items.filter((item) => item.deletedAt === undefined || now - item.deletedAt < TOMBSTONE_TTL_MS);
  if (kept.length <= MEMORY_LIMIT) return kept;

  const victims = kept
    .filter((item) => !item.isPinned && item.id !== protectedId)
    .map((item) => ({ id: item.id, score: scoreMemory(item, 0, now) }))
    .sort((a, b) => a.score - b.score);
  const drop = new Set(victims.slice(0, kept.length - MEMORY_LIMIT).map((victim) => victim.id));
  return kept.filter((item) => !drop.has(item.id));
}

export function applyRemember(
  items: MemoryItem[],
  input: RememberInput,
  vocabulary: string[],
  now = Date.now()
): RememberResult | null {
  const text = (input.text ?? '').trim().slice(0, MEMORY_TEXT_MAX);
  const words = normalizeWords(text);
  // «не и в на» is a negation marker with nothing to negate: still no fact.
  const normalized = words.join(' ');
  if (!text || !words.some((word) => word !== NEGATION)) return null;

  const kind: MemoryKind = input.kind && MEMORY_KINDS.includes(input.kind) ? input.kind : 'note';
  const importance = clampImportance(input.importance, kind);
  const tag = input.tag ? resolveMemoryTag(input.tag, vocabulary) : null;

  const same = items.find((item) => item.normalized === normalized && isLiveMemory(item, now));
  if (same) {
    const merged: MemoryItem = {
      ...same,
      mentions: same.mentions + 1,
      importance: Math.max(same.importance, importance),
      tag: same.tag ?? tag,
      updatedAt: now,
      usedAt: now,
    };
    return {
      items: items.map((item) => (item.id === same.id ? merged : item)),
      item: merged,
      status: 'merged',
    };
  }

  const created: MemoryItem = {
    id: newMemoryId(now),
    text,
    normalized,
    kind,
    tag,
    importance,
    mentions: 1,
    usedCount: 0,
    createdAt: now,
    updatedAt: now,
    usedAt: now,
    isPinned: false,
  };

  let superseded: MemoryItem | undefined;
  let next = items;
  const previous = input.replaces ? items.find((item) => item.id === input.replaces && isLiveMemory(item, now)) : undefined;
  if (previous) {
    superseded = { ...previous, validTo: now, supersededBy: created.id, updatedAt: now };
    next = next.map((item) => (item.id === previous.id ? superseded as MemoryItem : item));
  }

  return {
    items: enforceLimit([...next, created], created.id, now),
    item: created,
    status: previous ? 'replaced' : 'created',
    superseded,
  };
}

export function applyForget(items: MemoryItem[], idOrText: string, now = Date.now()): { items: MemoryItem[]; removed: boolean } {
  const needle = idOrText.trim();
  if (!needle) return { items, removed: false };
  const normalized = normalizedOf(needle);
  const target = items.find(
    (item) => isLiveMemory(item, now) && (item.id === needle || (normalized !== '' && item.normalized === normalized))
  );
  if (!target) return { items, removed: false };
  return {
    items: items.map((item) => (item.id === target.id ? { ...item, deletedAt: now } : item)),
    removed: true,
  };
}

/** Retrieval is rehearsal: the counter is what makes a remembered fact outrank a lucky one. */
export function applyTouch(items: MemoryItem[], ids: string[], now = Date.now()): MemoryItem[] {
  const touched = new Set(ids);
  if (touched.size === 0) return items;
  return items.map((item) =>
    touched.has(item.id)
      ? { ...item, usedCount: item.usedCount + 1, usedAt: now }
      : item
  );
}

function memoryTagVocabulary(): string[] {
  const memoryTags = storage.getMemory().map((item) => item.tag).filter((tag): tag is string => Boolean(tag));
  return Array.from(new Set([...storage.getAllExistingTags(), ...memoryTags]));
}

let lastTouchPersistAt = 0;

export const memoryService = {
  all(): MemoryItem[] {
    return storage.getMemory().filter((item) => !item.deletedAt);
  },

  remember(input: RememberInput): RememberResult | null {
    const result = applyRemember(storage.getMemory(), input, memoryTagVocabulary(), Date.now());
    if (!result) return null;
    storage.saveMemory(result.items);
    log.info(`Memory ${result.status}: "${result.item.text.slice(0, 60)}"`, {
      kind: result.item.kind,
      tag: result.item.tag,
      importance: result.item.importance,
    });
    return result;
  },

  forget(idOrText: string): boolean {
    const result = applyForget(storage.getMemory(), idOrText, Date.now());
    if (!result.removed) return false;
    storage.saveMemory(result.items);
    log.info('Memory forgotten', { needle: idOrText.slice(0, 40) });
    return true;
  },

  recall(query: MemoryQuery): MemoryItem[] {
    return selectMemory(storage.getMemory(), query);
  },

  /** What goes into the prompt: matches for this turn plus whatever is pinned. */
  forPrompt(text: string, limit = MEMORY_PROMPT_LIMIT): MemoryItem[] {
    return selectMemory(storage.getMemory(), { query: text, limit });
  },

  touch(ids: string[]): void {
    if (ids.length === 0) return;
    const now = Date.now();
    if (now - lastTouchPersistAt < TOUCH_PERSIST_INTERVAL_MS) return;
    lastTouchPersistAt = now;
    storage.saveMemory(applyTouch(storage.getMemory(), ids, now));
  },

  /** Topics worth showing the model so it reuses them instead of inventing new ones. */
  tagsForPrompt(limit = MEMORY_TAG_PROMPT_LIMIT): string[] {
    const counts = new Map<string, number>();
    for (const item of storage.getMemory()) {
      if (!item.tag || !isLiveMemory(item)) continue;
      counts.set(item.tag, (counts.get(item.tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
  },

  clear(): void {
    // Tombstoned rather than erased: wiping the key would leave every other device with the
    // facts they already received, and a plain "empty list" never travels.
    const now = Date.now();
    const items = storage.getMemory().map((item) => (item.deletedAt ? item : { ...item, deletedAt: now }));
    storage.saveMemory(items);
    log.info('Memory cleared');
  },
};
