import { create, insert, search, type Orama } from '@orama/orama';
import type { SlagItem } from '../types';
import { logger } from './logger';

const searchLog = logger.scope('SEARCH');
let dbInstance: Orama<any> | null = null;

// Stop words for Russian and English to clean noisy conversational queries
const STOP_WORDS = new Set([
  // Russian prepositions, particles, conversational noise, query verbs & entity mentions
  'по', 'как', 'жить', 'вообще', 'что', 'это', 'для', 'при', 'от', 'до', 'из', 'со',
  'ко', 'не', 'же', 'да', 'ну', 'бы', 'то', 'быть', 'все', 'всё', 'поищи', 'найди',
  'ищи', 'где', 'есть', 'мне', 'нам', 'ты', 'вы', 'он', 'она', 'они', 'их', 'его',
  'ее', 'её', 'ли', 'так', 'уже', 'еще', 'ещё', 'за', 'под', 'над', 'про', 'без',
  'о', 'об', 'обо', 'чем', 'тем', 'или', 'но', 'а', 'и', 'в', 'во', 'на', 'с', 'к',
  'там', 'тут', 'здесь', 'заметку', 'заметки', 'заметка', 'заметкам', 'таску', 'таски',
  'статью', 'статьи', 'статья', 'запись', 'записи', 'итд', 'тд', 'др', 'прочее',
  // English common stop words
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about',
  'how', 'what', 'why', 'where', 'is', 'are', 'was', 'were', 'find', 'search', 'note',
  'notes', 'task', 'tasks', 'article', 'articles', 'there', 'here',
]);

/**
 * Strips common inflections/suffixes for simple Russian & English stemming.
 */
export function getStem(word: string): string {
  const clean = word.toLowerCase().trim();
  if (clean.length <= 3) return clean;
  // Russian noun/adjective inflections and English suffixes
  return clean.replace(
    /(ами|ями|оми|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ей|ам|ям|ом|ем|ую|юю|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|а|я|о|е|ы|и|у|ю|ь|ed|ing|es|s)$/i,
    ''
  );
}

/**
 * Fast Levenshtein distance between two short strings.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev;
      } else {
        row[j] = Math.min(prev, row[j], row[j - 1]) + 1;
      }
      prev = temp;
    }
  }
  return row[b.length];
}

/**
 * Checks if a query token matches a document token with stem & typo tolerance.
 */
export function tokenMatches(queryToken: string, targetToken: string): boolean {
  const q = queryToken.toLowerCase();
  const t = targetToken.toLowerCase();

  if (q === t) return true;
  if (t.includes(q) || q.includes(t)) return true;

  const qStem = getStem(q);
  const tStem = getStem(t);
  if (qStem && tStem) {
    if (qStem === tStem || tStem.startsWith(qStem) || qStem.startsWith(tStem)) return true;
    if (qStem.length >= 5 && tStem.length >= 5) {
      if (levenshtein(qStem, tStem) <= 2) return true;
    } else if (qStem.length >= 4 && tStem.length >= 4) {
      if (levenshtein(qStem, tStem) <= 1) return true;
    }
  }

  if (q.length >= 4 && t.length >= 4) {
    const maxDist = q.length > 6 && t.length > 6 ? 2 : 1;
    if (Math.abs(q.length - t.length) <= maxDist) {
      if (levenshtein(q, t) <= maxDist) return true;
    }
  }

  return false;
}

/**
 * Extracts meaningful keyword tokens from natural language query.
 */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);

  const filtered = words.filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  return filtered.length > 0 ? filtered : words.filter(w => w.length >= 2);
}

export function getSearchableAttachmentText(attachments?: SlagItem['attachments']): string {
  if (!attachments || attachments.length === 0) return '';
  return attachments
    .map(a => [a.name, a.summary, a.extractedText].filter(Boolean).join(' '))
    .join(' ');
}

export async function initSearchIndex(items: SlagItem[]) {
  const endTimer = searchLog.time(`Indexing ${items.length} items in Orama`);
  try {
    const db = await create({
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

    for (const item of items) {
      await insert(db, {
        id: item.id,
        type: item.type,
        title: item.title || '',
        content: item.content || '',
        tags: item.tags || [],
        folder: item.folder || '',
        attachmentsText: getSearchableAttachmentText(item.attachments),
      });
    }

    dbInstance = db;
    endTimer(`Orama index initialized successfully with ${items.length} items`);
    return db;
  } catch (err) {
    searchLog.error('Failed to init Orama search:', err);
    return null;
  }
}

export async function querySearch(
  queryText: string,
  allItems: SlagItem[],
  typeFilter?: string
): Promise<SlagItem[]> {
  const trimmed = queryText.trim().toLowerCase();
  if (!trimmed) {
    // Return recent items
    return allItems
      .filter(i => (!typeFilter || typeFilter === 'all' ? true : i.type === typeFilter))
      .slice(0, 8);
  }

  const startMs = performance.now();
  const keywords = extractKeywords(trimmed);

  // 1. Level A: Try Orama index exact phrase search
  if (dbInstance) {
    try {
      const searchResult = await search(dbInstance, {
        term: trimmed,
        tolerance: 1, // typo tolerance
        limit: 15,
      });

      if (searchResult.hits.length > 0) {
        const hitIds = new Set(searchResult.hits.map(h => (h.document as any).id));
        const matched = allItems.filter(i => hitIds.has(i.id));
        const filtered = typeFilter && typeFilter !== 'all'
          ? matched.filter(i => i.type === typeFilter)
          : matched;

        if (filtered.length > 0) {
          const duration = performance.now() - startMs;
          searchLog.debug(`Exact phrase "${queryText}" yielded ${filtered.length} hits via Orama (${Math.round(duration)}ms)`);
          return filtered;
        }
      }

      // Level B: If full phrase gave 0 hits, try search for individual keywords in Orama
      if (keywords.length > 1) {
        const keywordHitIds = new Set<string>();
        for (const kw of keywords) {
          const kwResult = await search(dbInstance, {
            term: kw,
            tolerance: 1,
            limit: 10,
          });
          kwResult.hits.forEach(h => keywordHitIds.add((h.document as any).id));
        }

        if (keywordHitIds.size > 0) {
          const matched = allItems.filter(i => keywordHitIds.has(i.id));
          const filtered = typeFilter && typeFilter !== 'all'
            ? matched.filter(i => i.type === typeFilter)
            : matched;

          if (filtered.length > 0) {
            const duration = performance.now() - startMs;
            searchLog.debug(`Keywords [${keywords.join(', ')}] yielded ${filtered.length} hits via Orama multi-term (${Math.round(duration)}ms)`);
            return filtered;
          }
        }
      }
    } catch (err) {
      searchLog.warn(`Orama query error for "${queryText}", falling back to fuzzy memory search:`, err);
    }
  }

  // 2. Level C: Intelligent Tokenized Fuzzy & Stem Scorer across memory
  const scoredItems: Array<{ item: SlagItem; score: number }> = [];

  for (const item of allItems) {
    if (typeFilter && typeFilter !== 'all' && item.type !== typeFilter) continue;

    let score = 0;
    const titleWords = extractKeywords(item.title || '');
    const contentWords = extractKeywords((item.content || '').slice(0, 1000));
    const tagWords = (item.tags || []).map(t => t.toLowerCase());
    const attachText = getSearchableAttachmentText(item.attachments).toLowerCase();
    const attachWords = extractKeywords(attachText.slice(0, 1500));

    // Exact full substring bonuses
    if (item.title?.toLowerCase().includes(trimmed)) score += 30;
    if (item.content?.toLowerCase().includes(trimmed)) score += 15;
    if (attachText.includes(trimmed)) score += 20;
    if (item.tags?.some(t => t.toLowerCase().includes(trimmed))) score += 20;

    // Token-by-token fuzzy matching
    for (const kw of keywords) {
      // Title match (high weight)
      if (titleWords.some(tw => tokenMatches(kw, tw))) {
        score += 15;
      }
      // Tag match (medium-high weight)
      if (tagWords.some(tag => tokenMatches(kw, tag))) {
        score += 12;
      }
      // Attachment transcription/OCR match
      if (attachWords.some(aw => tokenMatches(kw, aw))) {
        score += 12;
      }
      // Content match (context weight)
      if (contentWords.some(cw => tokenMatches(kw, cw))) {
        score += 5;
      }
      // Folder match
      if (item.folder && tokenMatches(kw, item.folder.toLowerCase())) {
        score += 4;
      }
    }

    if (score > 0) {
      scoredItems.push({ item, score });
    }
  }

  scoredItems.sort((a, b) => b.score - a.score);
  const fallbackResults = scoredItems.slice(0, 15).map(s => s.item);

  const duration = performance.now() - startMs;
  searchLog.debug(`Query "${queryText}" [tokens: ${keywords.join(', ')}] yielded ${fallbackResults.length} hits via tokenized scorer (${Math.round(duration)}ms)`);
  return fallbackResults;
}

