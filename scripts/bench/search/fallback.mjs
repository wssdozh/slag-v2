// Faithful copy of the Level C linear scorer from src/lib/searchService.ts.
// Kept in sync by hand: the point of this benchmark is to measure exactly this code path.

export const SEARCH_WEIGHTS = {
  EXACT_TITLE: 30,
  EXACT_TAG: 20,
  EXACT_ATTACH: 20,
  EXACT_CONTENT: 15,
  TOKEN_TITLE: 15,
  TOKEN_TAG: 12,
  TOKEN_ATTACH: 12,
  TOKEN_CONTENT: 5,
  TOKEN_FOLDER: 4,
};

const FALLBACK_MAX_HITS = 15;

const STOP_WORDS = new Set([
  'по', 'как', 'жить', 'вообще', 'что', 'это', 'для', 'при', 'от', 'до', 'из', 'со',
  'ко', 'не', 'же', 'да', 'ну', 'бы', 'то', 'быть', 'все', 'всё', 'поищи', 'найди',
  'ищи', 'где', 'есть', 'мне', 'нам', 'ты', 'вы', 'он', 'она', 'они', 'их', 'его',
  'ее', 'её', 'ли', 'так', 'уже', 'еще', 'ещё', 'за', 'под', 'над', 'про', 'без',
  'о', 'об', 'обо', 'чем', 'тем', 'или', 'но', 'а', 'и', 'в', 'во', 'на', 'с', 'к',
  'там', 'тут', 'здесь', 'заметку', 'заметки', 'заметка', 'заметкам', 'таску', 'таски',
  'статью', 'статьи', 'статья', 'запись', 'записи', 'итд', 'тд', 'др', 'прочее',
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about',
  'how', 'what', 'why', 'where', 'is', 'are', 'was', 'were', 'find', 'search', 'note',
  'notes', 'task', 'tasks', 'article', 'articles', 'there', 'here',
]);

export function getStem(word) {
  const clean = word.toLowerCase().trim();
  if (clean.length <= 3) return clean;
  return clean.replace(
    /(ами|ями|оми|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ей|ам|ям|ом|ем|ую|юю|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|а|я|о|е|ы|и|у|ю|ь|ed|ing|es|s)$/i,
    ''
  );
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      if (a[i - 1] === b[j - 1]) row[j] = prev;
      else row[j] = Math.min(prev, row[j], row[j - 1]) + 1;
      prev = temp;
    }
  }
  return row[b.length];
}

export function tokenMatches(queryToken, targetToken) {
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

export function extractKeywords(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const filtered = words.filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return filtered.length > 0 ? filtered : words.filter((w) => w.length >= 2);
}

function getSearchableAttachmentText(attachments) {
  if (!attachments || attachments.length === 0) return '';
  return attachments
    .map((a) => [a.name, a.summary, a.extractedText].filter(Boolean).join(' '))
    .join(' ');
}

export function searchFallback(allItems, queryText) {
  const trimmed = queryText.trim().toLowerCase();
  const keywords = extractKeywords(trimmed);
  const scoredItems = [];

  for (const item of allItems) {
    let score = 0;
    const titleWords = extractKeywords(item.title || '');
    const contentWords = extractKeywords((item.content || '').slice(0, 1000));
    const tagWords = (item.tags || []).map((t) => t.toLowerCase());
    const attachText = getSearchableAttachmentText(item.attachments).toLowerCase();
    const attachWords = extractKeywords(attachText.slice(0, 1500));

    if (item.title?.toLowerCase().includes(trimmed)) score += SEARCH_WEIGHTS.EXACT_TITLE;
    if (item.content?.toLowerCase().includes(trimmed)) score += SEARCH_WEIGHTS.EXACT_CONTENT;
    if (attachText.includes(trimmed)) score += SEARCH_WEIGHTS.EXACT_ATTACH;
    if (item.tags?.some((t) => t.toLowerCase().includes(trimmed))) score += SEARCH_WEIGHTS.EXACT_TAG;

    for (const kw of keywords) {
      if (titleWords.some((tw) => tokenMatches(kw, tw))) score += SEARCH_WEIGHTS.TOKEN_TITLE;
      if (tagWords.some((tag) => tokenMatches(kw, tag))) score += SEARCH_WEIGHTS.TOKEN_TAG;
      if (attachWords.some((aw) => tokenMatches(kw, aw))) score += SEARCH_WEIGHTS.TOKEN_ATTACH;
      if (contentWords.some((cw) => tokenMatches(kw, cw))) score += SEARCH_WEIGHTS.TOKEN_CONTENT;
      if (item.folder && tokenMatches(kw, item.folder.toLowerCase())) score += SEARCH_WEIGHTS.TOKEN_FOLDER;
    }

    if (score > 0) scoredItems.push({ item, score });
  }

  scoredItems.sort((a, b) => b.score - a.score);
  return scoredItems.slice(0, FALLBACK_MAX_HITS).map((s) => s.item);
}
