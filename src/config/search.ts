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
} as const;

export const SEARCH_LIMITS = {
  ORAMA_PHRASE_LIMIT: 15,
  ORAMA_KEYWORD_LIMIT: 10,
  FALLBACK_MAX_HITS: 15,
  RECENT_ITEMS_LIMIT: 8,
  TYPO_TOLERANCE: 1,
  INDEX_CONTENT_MAX_LEN: 4000,
  INDEX_ATTACH_MAX_LEN: 4000,
  MIN_WORD_LENGTH: 2,
  STEM_MIN_WORD_LENGTH: 3,
} as const;

export const SEARCH_STOP_WORDS = new Set([
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
