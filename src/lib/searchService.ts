import { create, insert, search, type Orama } from '@orama/orama';
import type { SlagItem } from '../types';

let dbInstance: Orama<any> | null = null;

export async function initSearchIndex(items: SlagItem[]) {
  try {
    const db = await create({
      schema: {
        id: 'string',
        type: 'string',
        title: 'string',
        content: 'string',
        tags: 'string[]',
        folder: 'string',
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
      });
    }

    dbInstance = db;
    return db;
  } catch (err) {
    console.error('Failed to init Orama search:', err);
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

  // 1. Try Orama index search
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
        if (typeFilter && typeFilter !== 'all') {
          return matched.filter(i => i.type === typeFilter);
        }
        return matched;
      }
    } catch {
      // fallback to fuzzy in-memory filter
    }
  }

  // 2. Direct fast fuzzy fallback
  return allItems.filter(item => {
    if (typeFilter && typeFilter !== 'all' && item.type !== typeFilter) return false;
    const titleMatch = item.title.toLowerCase().includes(trimmed);
    const contentMatch = item.content.toLowerCase().includes(trimmed);
    const tagMatch = item.tags.some(t => t.toLowerCase().includes(trimmed));
    const folderMatch = item.folder.toLowerCase().includes(trimmed);
    return titleMatch || contentMatch || tagMatch || folderMatch;
  }).slice(0, 15);
}
