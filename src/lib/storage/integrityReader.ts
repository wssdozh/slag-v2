// The wall between the integrity scans and the disk: the app reads its vault through Tauri fs, the
// tests read a fake. Everything above this file works with plain `VaultReader`.
import { BaseDirectory, readDir, readTextFile, stat, type DirEntry } from '@tauri-apps/plugin-fs';
import type { FolderEntry } from '../vault/integrity/types';
import type { VaultReader } from '../vault/integrity/snapshot';

const OPTIONS = { baseDir: BaseDirectory.AppData };

/** The vault root keeps `.trash` and `.attachments` beside `notes/`, and so does a legacy copy. */
function vaultRootOf(notesPath: string): string {
  return notesPath.replace(/[/\\]notes$/, '');
}

export function tauriVaultReader(notesPath: string): VaultReader {
  const entries = async (path: string): Promise<DirEntry[]> => {
    try {
      return await readDir(path, OPTIONS);
    } catch {
      return [];
    }
  };

  const names = async (path: string): Promise<string[]> =>
    (await entries(path)).filter((entry) => !entry.isDirectory).map((entry) => entry.name);

  return {
    async listFolders() {
      const out: string[] = [];
      const walk = async (dir: string, prefix: string): Promise<void> => {
        for (const entry of await entries(dir)) {
          if (!entry.isDirectory || entry.name.startsWith('.')) continue;
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          out.push(path);
          await walk(`${dir}/${entry.name}`, path);
        }
      };
      await walk(notesPath, '');
      return out;
    },

    listNotes(folder: string) {
      return names(folder ? `${notesPath}/${folder}` : notesPath).then((all) => all.filter((name) => name.endsWith('.md')));
    },

    async readNote(relativePath: string) {
      try {
        return await readTextFile(`${notesPath}/${relativePath}`, OPTIONS);
      } catch {
        return null;
      }
    },

    async listAttachments() {
      const root = vaultRootOf(notesPath);
      return [...(await names(`${root}/.attachments`)), ...(await names(`${notesPath}/.attachments`))];
    },

    async listTrash() {
      const root = vaultRootOf(notesPath);
      const now = Date.now();
      const out: Array<{ name: string; ageMs: number }> = [];
      for (const dir of [`${root}/.trash`, `${notesPath}/.trash`]) {
        for (const name of await names(dir)) {
          let ageMs = 0;
          try {
            const info = await stat(`${dir}/${name}`, OPTIONS);
            const mtime = info.mtime ? new Date(info.mtime).getTime() : 0;
            ageMs = mtime ? Math.max(0, now - mtime) : 0;
          } catch {
            ageMs = 0;
          }
          out.push({ name, ageMs });
        }
      }
      return out;
    },

    async readStateFolders() {
      const root = vaultRootOf(notesPath);
      for (const path of [`${root}/state.json`, `${notesPath}/state.json`]) {
        try {
          const raw = await readTextFile(path, OPTIONS);
          const state: unknown = JSON.parse(raw);
          const folders = (state as { folders?: unknown }).folders;
          if (!Array.isArray(folders)) return [];
          return folders
            .filter((folder): folder is FolderEntry => Boolean(folder) && typeof (folder as FolderEntry).path === 'string')
            .map((folder) => ({ path: folder.path, name: folder.name }));
        } catch {
          continue;
        }
      }
      return [];
    },
  };
}
