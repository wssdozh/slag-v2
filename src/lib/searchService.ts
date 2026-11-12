import type { Orama } from '@orama/orama';
import type { SlagItem } from '../types';
import { logger } from './logger';
import { SEARCH_LIMITS } from '../config';

const searchLog = logger.scope('SEARCH');

let dbInstance: Orama<any> | null = null;
let indexed = new Map<string, number>();
let isBuilding = false;
let buildPromise: Promise<void> | null = null;

// ponytail: orama in js holds up to ~10k notes; 100k is a different engine (fts5 in rust),
// not a bigger index. Chunked build keeps the first index from freezing the modal.
const BUILD_CHUNK = 500;

export function getSearchableAttachmentText(attachments?: SlagItem['attachments']): string {
  if (!attachments || attachments.length === 0) return '';
  return attachments.map(a => [a.name, a.summary, a.extractedText].filter(Boolean).join(' ')).join(' ');
}

function toDocument(item: SlagItem) {
  return {
    id: item.id,
    type: item.type,
    title: item.title || '',
    content: (item.content || '').slice(0, SEARCH_LIMITS.INDEX_CONTENT_MAX_LEN),
    tags: item.tags || [],
    folder: item.folder || '',
    attachmentsText: getSearchableAttachmentText(item.attachments).slice(0, SEARCH_LIMITS.INDEX_ATTACH_MAX_LEN),
  };
}

function filterByType(items: SlagItem[], typeFilter?: string): SlagItem[] {
  if (!typeFilter || typeFilter === 'all') return items;
  return items.filter(item => item.type === typeFilter);
}

async function syncIndex(items: SlagItem[]): Promise<void> {
  const started = performance.now();
  const { create, insertMultiple, remove } = await import('@orama/orama');

  if (!dbInstance) {
    // The default english splitter treats cyrillic as a separator and indexes nothing
    // at all, so every russian query used to fall through to a full linear scan.
    const db = await create({
      language: 'russian',
      schema: {
        id: 'string',
        type: 'string',
        title: 'string',
        content: 'string',
        tags: 'string[]',
        folder: 'string',
        attachmentsText: 'string',
      },
    });

    for (let offset = 0; offset < items.length; offset += BUILD_CHUNK) {
      await insertMultiple(db, items.slice(offset, offset + BUILD_CHUNK).map(toDocument));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    dbInstance = db;
    indexed = new Map(items.map(item => [item.id, item.updatedAt]));
    searchLog.info(`Orama index built with ${items.length} items in ${Math.round(performance.now() - started)}ms`);
    return;
  }

  const next = new Map<string, number>();
  const changed: SlagItem[] = [];
  for (const item of items) {
    next.set(item.id, item.updatedAt);
    if (indexed.get(item.id) !== item.updatedAt) changed.push(item);
  }
  const removed = [...indexed.keys()].filter(id => !next.has(id));

  for (const id of removed) await remove(dbInstance, id);
  for (const item of changed) {
    if (indexed.has(item.id)) await remove(dbInstance, item.id);
  }
  if (changed.length > 0) await insertMultiple(dbInstance, changed.map(toDocument));

  indexed = next;
  searchLog.info(
    `Orama index synced: ${changed.length} changed, ${removed.length} removed in ${Math.round(performance.now() - started)}ms`
  );
}

export async function initSearchIndex(items: SlagItem[]): Promise<Orama<any> | null> {
  if (isBuilding) return dbInstance;

  isBuilding = true;
  const build = (async () => {
    try {
      await syncIndex(items);
    } catch (err) {
      searchLog.error('Failed to sync Orama search index:', err);
    } finally {
      isBuilding = false;
      buildPromise = null;
    }
  })();

  buildPromise = build;
  await build;
  return dbInstance;
}

export async function querySearch(
  queryText: string,
  allItems: SlagItem[],
  typeFilter?: string
): Promise<SlagItem[]> {
  const trimmed = queryText.trim().toLowerCase();
  if (!trimmed) {
    return filterByType(allItems, typeFilter).slice(0, SEARCH_LIMITS.RECENT_ITEMS_LIMIT);
  }

  // A query that lands while the index is being built/synced waits for it instead of
  // returning stale (or empty) results for the note the user just saved. The index is
  // built lazily, and ⌘K was its only trigger — the materials dock and the assistant
  // tool searched an empty index until someone happened to open the search modal.
  if (buildPromise) await buildPromise;
  else if (!dbInstance) await initSearchIndex(allItems);
  if (!dbInstance) return [];

  const started = performance.now();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  // Typo tolerance costs ~5x and on phrases it turns a 10k vault into a second-long stall,
  // so it stays on single-token queries where it actually catches the typo.
  const tolerance = tokens.length > 1 ? 0 : SEARCH_LIMITS.TYPO_TOLERANCE;

  const done = (results: SlagItem[], how: string): SlagItem[] => {
    searchLog.trace(`"${queryText}" -> ${results.length} hits via ${how} (${Math.round(performance.now() - started)}ms)`);
    return results;
  };

  try {
    const { search } = await import('@orama/orama');

    const phrase = await search(dbInstance, {
      term: trimmed,
      tolerance,
      limit: SEARCH_LIMITS.ORAMA_PHRASE_LIMIT,
    });
    const byId = new Map(allItems.map(item => [item.id, item] as const));
    const inHitOrder = (ids: string[]): SlagItem[] =>
      ids.map(id => byId.get(id)).filter((item): item is SlagItem => item !== undefined);

    const phraseHits = filterByType(
      inHitOrder(phrase.hits.map(hit => (hit.document as { id: string }).id)),
      typeFilter
    );
    if (phraseHits.length > 0) return done(phraseHits, 'orama phrase');

    if (tokens.length > 1) {
      // A filler word ("по", "как") matches most of the vault, a typo-matched one matches two
      // notes. Scoring each hit by how rare the token it matched is keeps the second group on
      // top, which is what "relevance" has to mean for a phrase query.
      const unique = [...new Set(tokens)];
      const scored = new Map<string, { item: SlagItem; score: number; order: number }>();
      let order = 0;
      for (const token of unique) {
        const result = await search(dbInstance, {
          term: token,
          tolerance: SEARCH_LIMITS.TYPO_TOLERANCE,
          limit: SEARCH_LIMITS.ORAMA_KEYWORD_LIMIT,
        });
        const weight = 1 / Math.max(1, result.hits.length);
        for (const hit of result.hits) {
          const id = (hit.document as { id: string }).id;
          const item = byId.get(id);
          if (!item) continue;
          const entry = scored.get(id);
          if (entry) entry.score += weight;
          else scored.set(id, { item, score: weight, order: order++ });
        }
      }
      const ranked = [...scored.values()]
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map(entry => entry.item);
      const keywordHits = filterByType(ranked, typeFilter);
      if (keywordHits.length > 0) return done(keywordHits, 'orama keywords');
    }
  } catch (err) {
    searchLog.warn(`Orama query failed for "${queryText}":`, err);
  }

  return done([], 'nothing');
}
