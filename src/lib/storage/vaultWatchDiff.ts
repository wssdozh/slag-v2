// The pure half of the vault sweep: two stamps in, the paths that need re-reading and the ones
// that are gone. No fs, no Tauri, no timers — the sweep in vaultWatch.ts owns all of that, and
// this file stays testable under plain node.

/** What a sweep remembers about one note: enough to tell a rewrite from a no-op. */
export interface NoteFileStamp {
  mtime: number;
  size: number;
}

export interface VaultFileChange {
  /** Vault-relative paths (`Проекты/SLAG/заметка.md`) that are new or were rewritten. */
  changed: string[];
  /** Paths that stayed gone long enough to count as deleted. */
  removed: string[];
  /** Vault-relative directories that appeared; the app draws folders straight from disk. */
  foldersAdded: string[];
  /** Directories that stayed gone long enough to count as deleted. */
  foldersRemoved: string[];
}

/**
 * Sorted, because the sweep's answer ends up in a log line and in a reload batch: an unstable
 * order makes two identical situations look different.
 */
export function diffNoteFiles(
  previous: Map<string, NoteFileStamp>,
  next: Map<string, NoteFileStamp>,
): { changed: string[]; removed: string[] } {
  const changed: string[] = [];
  for (const [path, stamp] of next) {
    const before = previous.get(path);
    if (!before || before.mtime !== stamp.mtime || before.size !== stamp.size) changed.push(path);
  }
  const removed: string[] = [];
  for (const path of previous.keys()) {
    if (!next.has(path)) removed.push(path);
  }
  return { changed: changed.sort(), removed: removed.sort() };
}

/** Same contract as the file diff, for the directories collected by the same walk. */
export function diffFolderPaths(previous: string[], next: string[]): { added: string[]; removed: string[] } {
  const before = new Set(previous);
  const after = new Set(next);
  const added: string[] = [];
  for (const path of after) {
    if (!before.has(path)) added.push(path);
  }
  const removed: string[] = [];
  for (const path of before) {
    if (!after.has(path)) removed.push(path);
  }
  return { added: added.sort(), removed: removed.sort() };
}
