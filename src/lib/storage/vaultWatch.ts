// Notices .md files and folders that appeared, changed or vanished under the vault folder — the
// MCP server, an editor, a shell script. Nothing tells the app about them: the index lives in
// memory and is rebuilt from disk only at startup. A stat sweep on a timer is enough there, and
// it costs no native watcher: no new crate, no rebuild, and the same code path on desktop and
// phone.
import { isTauri } from '@tauri-apps/api/core';
import { readDir, stat, BaseDirectory } from '@tauri-apps/plugin-fs';
import { isAndroidApp } from '../platform/deviceAccess';
import { logger } from '../logger/logger';
import { diffFolderPaths, diffNoteFiles, type NoteFileStamp, type VaultFileChange } from './vaultWatchDiff';

export type { NoteFileStamp, VaultFileChange } from './vaultWatchDiff';

const watchLog = logger.scope('FS');

export interface VaultWatchOptions {
  /** Absolute path of the vault's `notes` folder, as the storage service knows it. */
  notesPath: string;
  /** How often the folder is stamped. Two seconds is invisible to a person and cheap for a phone. */
  intervalMs?: number;
  /** Sweeps a file has to miss in a row before it counts as deleted; a rename writes before it removes. */
  missingSweeps?: number;
  onChanged: (change: VaultFileChange) => void;
}

export interface VaultWatch {
  stop(): void;
  pause(): void;
  resume(): void;
}

/** The sweep only makes sense where the app owns the files and the platform has them. */
export function canWatchVault(): boolean {
  return isTauri() && !isAndroidApp();
}

/** What one sweep saw: every note as vault-relative path → stamp, plus every directory path. */
export interface VaultSnapshot {
  files: Map<string, NoteFileStamp>;
  folders: string[];
}

/**
 * Every note and folder under `notesPath`. Folders ride along on the directory walk itself, so
 * watching them costs no extra pass and no extra stat — the sweep just now remembers them too.
 */
export async function snapshotVault(notesPath: string): Promise<VaultSnapshot> {
  const snapshot: VaultSnapshot = { files: new Map(), folders: [] };
  await walkDirectory(notesPath, '', snapshot);
  return snapshot;
}

async function walkDirectory(directory: string, relative: string, snapshot: VaultSnapshot): Promise<void> {
  let entries;
  try {
    entries = await readDir(directory, { baseDir: BaseDirectory.AppData });
  } catch (error) {
    watchLog.warn('vault sweep could not read a directory', { directory, error: String(error) });
    return;
  }

  const notes: { path: string; name: string }[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const folder = relative ? `${relative}/${entry.name}` : entry.name;
      snapshot.folders.push(folder);
      await walkDirectory(`${directory}/${entry.name}`, folder, snapshot);
    } else if (entry.isFile && entry.name.endsWith('.md')) {
      notes.push({ path: `${directory}/${entry.name}`, name: relative ? `${relative}/${entry.name}` : entry.name });
    }
  }

  // One stat per note, in small batches: a serial loop over a five-thousand-note vault would
  // overrun the sweep interval, and an unbounded Promise.all would flood the IPC bridge.
  const CONCURRENCY = 16;
  for (let index = 0; index < notes.length; index += CONCURRENCY) {
    const batch = notes.slice(index, index + CONCURRENCY);
    await Promise.all(batch.map(async note => {
      try {
        const info = await stat(note.path, { baseDir: BaseDirectory.AppData });
        snapshot.files.set(note.name, { mtime: info.mtime?.getTime() ?? 0, size: info.size });
      } catch {
        // Removed between the directory listing and the stat: the next sweep reports it as gone.
      }
    }));
  }
}

/**
 * A rename writes the new path before it drops the old one, so a path has to miss `missingSweeps`
 * sweeps in a row before it counts as deleted — the same rule for notes and for folders, or a
 * rename would flicker half a tree out of the sidebar.
 */
function confirmRemovals(gone: string[], missing: Map<string, number>, missingSweeps: number): string[] {
  const confirmed: string[] = [];
  for (const path of gone) {
    const count = (missing.get(path) ?? 0) + 1;
    if (count >= missingSweeps) {
      confirmed.push(path);
      missing.delete(path);
    } else {
      missing.set(path, count);
    }
  }
  return confirmed;
}

/**
 * Starts the sweep and returns the handle. The first snapshot is the baseline: notes written
 * before the app opened are already in the index, and reporting them would be a false alarm.
 */
export async function startVaultWatch(options: VaultWatchOptions): Promise<VaultWatch> {
  const { notesPath, intervalMs = 2000, missingSweeps = 2, onChanged } = options;

  let previous: VaultSnapshot = { files: new Map(), folders: [] };
  try {
    previous = await snapshotVault(notesPath);
  } catch (error) {
    watchLog.warn('vault watch started without a baseline', { error: String(error) });
  }

  const missingFiles = new Map<string, number>();
  const missingFolders = new Map<string, number>();
  let stopped = false;
  let paused = false;
  let running = false;

  const sweep = async () => {
    if (stopped || paused || running) return;
    running = true;
    try {
      const next = await snapshotVault(notesPath);
      if (stopped) return;
      const files = diffNoteFiles(previous.files, next.files);
      const folders = diffFolderPaths(previous.folders, next.folders);

      for (const path of files.changed) missingFiles.delete(path);
      const removed = confirmRemovals(files.removed, missingFiles, missingSweeps);

      for (const path of folders.added) missingFolders.delete(path);
      const foldersRemoved = confirmRemovals(folders.removed, missingFolders, missingSweeps);

      // Unconfirmed deletions stay in the baseline, otherwise the next sweep would never see
      // them again and a note moved by an outside editor would linger in the feed forever.
      const baseline: VaultSnapshot = { files: new Map(next.files), folders: [...next.folders] };
      for (const path of missingFiles.keys()) {
        const stamp = previous.files.get(path);
        if (stamp) baseline.files.set(path, stamp);
      }
      for (const path of missingFolders.keys()) {
        if (previous.folders.includes(path)) baseline.folders.push(path);
      }
      previous = baseline;

      if (files.changed.length === 0 && removed.length === 0 && folders.added.length === 0 && foldersRemoved.length === 0) return;
      watchLog.debug('vault changed on disk', {
        changed: files.changed.length,
        removed: removed.length,
        foldersAdded: folders.added.length,
        foldersRemoved: foldersRemoved.length,
      });
      onChanged({
        changed: files.changed,
        removed,
        foldersAdded: folders.added,
        foldersRemoved,
      });
    } catch (error) {
      watchLog.warn('vault sweep failed', { error: String(error) });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => { void sweep(); }, intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
  };
}
