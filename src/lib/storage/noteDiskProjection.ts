// Compare a watcher snapshot with what the last successful write could actually round-trip.
import type { SlagItem } from '../../types/index.ts';
import { noteDifferences } from '../sync/notes/merge.ts';
import { parseMarkdownToItem, serializeItemToMarkdown } from '../vault/markdownSerializer.ts';

export function noteDiskProjection(item: SlagItem): SlagItem {
  return parseMarkdownToItem(serializeItemToMarkdown(item), item.id, item.folder, undefined, false);
}

export function editFromDisk(previous: SlagItem, parsed: SlagItem, projected = noteDiskProjection(previous)): SlagItem | undefined {
  const fields = noteDifferences(projected, parsed);
  if (!fields.length) return;
  const properties = parsed as unknown as Record<string, unknown>;
  return { ...previous, ...Object.fromEntries(fields.map((key) => [key, Object.hasOwn(properties, key) ? properties[key] : undefined])),
    filename: parsed.filename, updatedAt: parsed.updatedAt };
}
