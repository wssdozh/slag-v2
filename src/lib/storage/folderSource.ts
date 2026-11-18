// A folder exists because its directory does. This module turns the paths found under `notes/`
// and the metadata remembered for them into the list the app draws; being pure, the rule can be
// checked without a vault.
import type { FolderMeta } from '../../types';

function normalizeFolderPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
}

function lastSegment(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

function compareFolderPaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The folders this vault has: every path on disk, in path order, with the metadata that belongs to
 * it. Metadata follows the path and never creates it — an entry left behind by a directory that is
 * gone is dropped, not resurrected.
 */
export function folderMetaFor(paths: string[], metadata: FolderMeta[], inbox: string): FolderMeta[] {
  const byPath = new Map<string, FolderMeta>();
  for (const meta of metadata) byPath.set(normalizeFolderPath(meta.path), meta);

  const folders = [...new Set(paths.map(normalizeFolderPath))]
    .filter(path => path.length > 0)
    .sort(compareFolderPaths)
    .map((path): FolderMeta => {
      const meta = byPath.get(path);
      return meta ? { ...meta, path } : { path, name: lastSegment(path), description: '' };
    });

  const inboxIndex = folders.findIndex(folder => folder.path === normalizeFolderPath(inbox));
  if (inboxIndex > 0) folders.unshift(...folders.splice(inboxIndex, 1));
  return folders;
}

/** What the sweep has to tell the list about: folders that appeared under `notes/` and those gone. */
export function diffFolderPaths(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const before = new Set(prev.map(normalizeFolderPath));
  const after = new Set(next.map(normalizeFolderPath));
  return {
    added: [...after].filter(path => !before.has(path)).sort(compareFolderPaths),
    removed: [...before].filter(path => !after.has(path)).sort(compareFolderPaths),
  };
}
