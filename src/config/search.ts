// Tuning for the Orama index and the palette: result counts, typo tolerance, text caps.
export const SEARCH_LIMITS = {
  ORAMA_PHRASE_LIMIT: 15,
  ORAMA_KEYWORD_LIMIT: 10,
  RECENT_ITEMS_LIMIT: 8,
  TYPO_TOLERANCE: 1,
  INDEX_CONTENT_MAX_LEN: 4000,
  INDEX_ATTACH_MAX_LEN: 4000,
} as const;
