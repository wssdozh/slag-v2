/**
 * Lookups over the chat history: wiki links and recent assistant messages.
 */
import type { SlagItem } from '../../../types';
import type { LocalFallbackParams } from './types';

type FallbackMessage = LocalFallbackParams['messages'][number];

export interface WikiLinkMatch {
  items: SlagItem[];
  titles: string[];
}

export function findItemsByWikiLinks(messages: FallbackMessage[], allItems: SlagItem[]): WikiLinkMatch | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].content;
    const wikiMatches = Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1]);
    if (wikiMatches.length > 0) {
      const items = allItems.filter((item) => wikiMatches.some((w) => w.toLowerCase() === item.title.toLowerCase()));
      if (items.length > 0) {
        return { items, titles: wikiMatches };
      }
    }
  }
  return null;
}

export function findItemByWikiLinks(messages: FallbackMessage[], allItems: SlagItem[]): SlagItem | undefined {
  return findItemsByWikiLinks(messages, allItems)?.items[0];
}

export function findRecentMessage(messages: FallbackMessage[], needles: string[]): FallbackMessage | undefined {
  return [...messages].reverse().find((m) => m.content && needles.some((needle) => m.content.includes(needle)));
}
