import type { SlagItem } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

/**
 * Read-only derivations over the vault. They change when the taxonomy changes,
 * not when persistence does — so they do not belong inside the storage service.
 *
 * The inbox is a folder path in the model but "the whole vault" in every report,
 * which is the one rule both helpers have to agree on.
 */

export interface VaultStats {
  totalItems: number;
  notesCount: number;
  tasksCount: number;
  articlesCount: number;
  tags: Record<string, number>;
  folders: Record<string, number>;
  scope: string;
}

export function collectExistingTags(items: SlagItem[]): string[] {
  const tagSet = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags || []) tagSet.add(tag.toLowerCase().trim());
  }
  return Array.from(tagSet).sort();
}

export function computeVaultStats(items: SlagItem[], folderScope?: string): VaultStats {
  const scoped =
    folderScope && folderScope !== DEFAULT_INBOX_FOLDER
      ? items.filter((item) => item.folder === folderScope)
      : items;

  const tags: Record<string, number> = {};
  const folders: Record<string, number> = {};
  let notesCount = 0;
  let tasksCount = 0;
  let articlesCount = 0;

  for (const item of scoped) {
    if (item.type === 'note') notesCount++;
    else if (item.type === 'task') tasksCount++;
    else if (item.type === 'article') articlesCount++;

    const folderName = item.folder || DEFAULT_INBOX_FOLDER;
    folders[folderName] = (folders[folderName] || 0) + 1;

    for (const tag of item.tags || []) {
      const clean = tag.toLowerCase().trim();
      if (clean) tags[clean] = (tags[clean] || 0) + 1;
    }
  }

  return {
    totalItems: scoped.length,
    notesCount,
    tasksCount,
    articlesCount,
    tags,
    folders,
    scope: folderScope || 'Все хранилище',
  };
}
