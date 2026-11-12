import type { Orama } from '@orama/orama';
import type { SlagItem } from '../types';
import { logger } from './logger/logger';
import { SEARCH_LIMITS } from '../config';

const searchLog = logger.scope('SEARCH');

let dbInstance: Orama<any> | null = null;
let indexed = new Map<string, number>();
let isBuilding = false;
let buildPromise: Promise<void> | null = null;

type OramaModule = typeof import('@orama/orama');

// Re-resolving the same dynamic import on every sync and every query cost 29ms while the
// index itself moved in 0ms — the module handle is loaded once and kept.
let oramaModule: Promise<OramaModule> | null = null;

function loadOrama(): Promise<OramaModule> {
  if (!oramaModule) {
    oramaModule = import('@orama/orama').catch((err: unknown) => {
      // A failed load must not poison the next attempt.
      oramaModule = null;
      throw err;
    });
  }
  return oramaModule;
}

// Orama lives in its own lazy chunk (~76 kB, 25 kB gzip). On the 1000-note probe the first
// index build paid its fetch+eval before indexing a single note (31–40 ms on the dev server),
// and the palette paid that on the first ⌘K. The caller asks for it while the browser is
// idle, so the cost lands after first paint instead of on the startup path.
export async function preloadSearchEngine(): Promise<void> {
  try {
    await loadOrama();
  } catch (err) {
    searchLog.warn('Failed to preload Orama:', err);
  }
}

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

// Orama ships a stemmer for english only, and stemming is off unless one is passed at
// create(); `language: 'russian'` therefore indexes whole inflected words («правил»,
// «правилами») and there is no stem to fall back on. A typo in another grammatical case
// («прафилам») is then two edits away from every form the note actually holds, so
// tolerance 1 can never bridge it. Trimming the inflectional tail puts the comparison back
// on the stem — «прафил» vs «правил» is one edit — which is the pass that finds the note.
const RU_ENDINGS = [
  'ами', 'ями', 'ыми', 'ими', 'ого', 'его', 'ому', 'ему',
  'ах', 'ях', 'ам', 'ям', 'ов', 'ев', 'ей', 'ой', 'ий', 'ый',
  'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ом', 'ем', 'ую', 'юю',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь',
];

function stemToken(token: string): string | null {
  if (token.length < 6) return null;
  for (const ending of RU_ENDINGS) {
    if (token.endsWith(ending) && token.length - ending.length >= 4) {
      return token.slice(0, token.length - ending.length);
    }
  }
  return null;
}

// The index has no stopword list either, so «по» and «как» are ordinary tokens. In the
// per-token pass that is fatal: «по» prefix-matches «повестки» and lands in ten notes,
// while «как» matched exactly one unrelated note and scored a full 1/1 — enough to outrank
// the note the rare token actually pointed at. Filler never carries the intent, so it is
// dropped before either pass.
const RU_STOPWORDS = new Set([
  'а', 'без', 'более', 'больше', 'бы', 'был', 'была', 'были', 'было', 'быть',
  'в', 'вам', 'вас', 'ведь', 'весь', 'во', 'вот', 'все', 'всё', 'всего', 'всегда',
  'всю', 'вы', 'где', 'да', 'даже', 'для', 'до', 'его', 'ее', 'её', 'ей', 'ему',
  'если', 'есть', 'еще', 'ещё', 'же', 'за', 'зачем', 'здесь', 'и', 'из', 'или',
  'им', 'их', 'к', 'как', 'какая', 'какой', 'когда', 'кто', 'куда', 'ли', 'мне',
  'мой', 'моя', 'мы', 'на', 'над', 'нас', 'не', 'него',
  'нее', 'неё', 'ни', 'ним', 'них', 'но', 'ну', 'о', 'об', 'однако', 'он',
  'она', 'они', 'от', 'по', 'под', 'после', 'потом', 'потому', 'почти', 'при',
  'про', 'сам', 'с', 'себе', 'себя', 'сейчас', 'со', 'совсем', 'так', 'также',
  'там', 'тебе', 'тебя', 'тем', 'теперь', 'то', 'тогда', 'того', 'тоже', 'только',
  'том', 'тот', 'тут', 'ты', 'у', 'уж', 'уже', 'хоть', 'чего', 'чем', 'через',
  'что', 'чтоб', 'чтобы', 'эта', 'эти', 'это', 'этого', 'этой', 'этом', 'этот',
  'эту', 'я',
]);

async function syncIndex(items: SlagItem[]): Promise<void> {
  const started = performance.now();
  const { create, insertMultiple, remove } = await loadOrama();

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
  const contentTokens = tokens.filter(token => !RU_STOPWORDS.has(token));
  const searched = contentTokens.length > 0 ? contentTokens : tokens;
  // Typo tolerance costs ~5x and on phrases it turns a 10k vault into a second-long stall,
  // so it stays on single-token queries where it actually catches the typo.
  const tolerance = searched.length > 1 ? 0 : SEARCH_LIMITS.TYPO_TOLERANCE;

  const done = (results: SlagItem[], how: string): SlagItem[] => {
    searchLog.trace(`"${queryText}" -> ${results.length} hits via ${how} (${Math.round(performance.now() - started)}ms)`);
    return results;
  };

  try {
    const { search } = await loadOrama();

    let phrase = await search(dbInstance, {
      term: searched.join(' '),
      tolerance,
      // 0 = every word must match. Orama defaults to 1 ("any word"), which made the phrase
      // pass an OR over filler: «поищи по заметкам по прафилам как жить вообще» matched ten
      // notes through «по»/«как» alone and returned early, so the token pass never ran.
      threshold: 0,
      limit: SEARCH_LIMITS.ORAMA_PHRASE_LIMIT,
    });
    if (phrase.hits.length === 0 && searched.length === 1) {
      const stem = stemToken(searched[0]);
      if (stem) {
        phrase = await search(dbInstance, {
          term: stem,
          tolerance,
          threshold: 0,
          limit: SEARCH_LIMITS.ORAMA_PHRASE_LIMIT,
        });
      }
    }
    const byId = new Map(allItems.map(item => [item.id, item] as const));
    const inHitOrder = (ids: string[]): SlagItem[] =>
      ids.map(id => byId.get(id)).filter((item): item is SlagItem => item !== undefined);

    const phraseHits = filterByType(
      inHitOrder(phrase.hits.map(hit => (hit.document as { id: string }).id)),
      typeFilter
    );
    if (phraseHits.length > 0) return done(phraseHits, 'orama phrase');

    if (searched.length > 1) {
      // A word that matched ten notes says little, one that matched a single note says a lot:
      // scoring each hit by 1/df keeps the rare, typo-recovered token on top instead of the
      // words every note happens to share.
      const unique = [...new Set(searched)];
      const scored = new Map<string, { item: SlagItem; score: number; order: number }>();
      let order = 0;
      for (const token of unique) {
        let result = await search(dbInstance, {
          term: token,
          tolerance: SEARCH_LIMITS.TYPO_TOLERANCE,
          limit: SEARCH_LIMITS.ORAMA_KEYWORD_LIMIT,
        });
        if (result.hits.length === 0) {
          // No word in the vault is one edit away from the token as typed; try its stem.
          const stem = stemToken(token);
          if (stem) {
            result = await search(dbInstance, {
              term: stem,
              tolerance: SEARCH_LIMITS.TYPO_TOLERANCE,
              limit: SEARCH_LIMITS.ORAMA_KEYWORD_LIMIT,
            });
          }
        }
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
