/**
 * Native settings: one JSON object of key → string in `<AppData>/settings.json`.
 *
 * This is not the vault's `state.json`: that file belongs to a vault and has other writers, this
 * one belongs to the installation and only `prefs.ts` writes it.
 *
 * A missing or broken file is an empty snapshot — settings fall back to their defaults — and a
 * failed read is a warning, never a reason to keep the app from opening.
 */
import { BaseDirectory, exists, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { logger } from '../logger/logger';
import type { PrefsBackend } from './prefs';

const fsLog = logger.scope('FS');
const SETTINGS_FILE = 'settings.json';
// The next snapshot is written here first and renamed over the real file: a crash mid-write leaves
// the previous settings whole. The name is fixed, so a failed write cannot pile up temp files.
const SETTINGS_TEMP = 'settings.json.tmp';

/** The file as it sits on disk. Broken JSON answers empty; an unreadable file throws to the caller. */
async function readSettings(): Promise<Record<string, string>> {
  if (!(await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppData }))) return {};
  const text = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fsLog.warn(`${SETTINGS_FILE} is not valid JSON, starting with empty settings`);
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const snapshot: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') snapshot[key] = value;
  }
  return snapshot;
}

async function writeSettings(snapshot: Record<string, string>): Promise<void> {
  await writeTextFile(SETTINGS_TEMP, JSON.stringify(snapshot, null, 2), { baseDir: BaseDirectory.AppData });
  await rename(SETTINGS_TEMP, SETTINGS_FILE, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

export const prefsBackend: PrefsBackend = {
  async load() {
    try {
      return await readSettings();
    } catch (err) {
      fsLog.warn(`Could not read ${SETTINGS_FILE}; settings start empty:`, err);
      return {};
    }
  },

  /**
   * Read, merge, write: the file is shared with whatever already lives in it, and a delta must not
   * drop the keys another window wrote since this one loaded.
   */
  async save(changes) {
    const snapshot = await readSettings();
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) delete snapshot[key];
      else snapshot[key] = value;
    }
    await writeSettings(snapshot);
  },
};
