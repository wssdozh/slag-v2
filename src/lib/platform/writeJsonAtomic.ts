// The one way a JSON file this app owns gets replaced: the next snapshot is written to `<file>.tmp`
// and renamed over the real one, so a crash mid-write leaves the previous file whole. The temp name
// is fixed rather than random, so a failed write cannot pile up temp files in `<AppData>`.
//
// The two native backends — `storage/prefsBackend.native.ts` for settings, `secretFileBackend.ts`
// for ciphertext — differ in what they keep, not in how the file lands.
import { BaseDirectory, rename, writeTextFile } from '@tauri-apps/plugin-fs';

/** Write-then-rename, pretty-printed: how a JSON file that must survive a crash is replaced. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temp = `${file}.tmp`;
  await writeTextFile(temp, JSON.stringify(value, null, 2), { baseDir: BaseDirectory.AppData });
  await rename(temp, file, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}
