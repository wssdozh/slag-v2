// JSON must survive an OS crash, not just an interrupted process. Markdown projection below
// still uses Tauri FS's write-and-rename; both paths stage beside the target with a unique name.
import { invoke } from '@tauri-apps/api/core';
import { BaseDirectory, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs';

/** Native sync-to-disk before replacing a JSON snapshot. Never fall back to a weaker write. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await invoke('durable_atomic_write', { relativeTarget: file, content: JSON.stringify(value, null, 2) });
}

export async function writeAppDataTextAtomic(file: string, text: string): Promise<void> {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await writeTextFile(temp, text, { baseDir: BaseDirectory.AppData });
  try {
    await rename(temp, file, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    // Keep the old snapshot and remove the failed temporary replacement.
    await remove(temp, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    throw err;
  }
}
