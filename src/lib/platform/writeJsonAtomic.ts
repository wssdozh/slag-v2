// Installation prefs and encrypted secret snapshots use write-then-rename. Vault commits that
// need to survive a system crash use the native durableVaultFile adapter instead.
//
// The temp name carries a random suffix, and that is the whole point of it being random. It used to
// be a fixed `<file>.tmp`, which quietly assumed one writer per file — and there are two: the main
// window and the quick composer are separate webviews, each with its own queue, sharing
// `settings.json` and `secrets.json`. The loser of that race renamed a temp file the winner had
// already moved away, so it failed with "os error 2" and its settings stayed in memory. A unique
// name makes the rename impossible to collide on. The cost is that a write killed mid-rename can
// leave a `*.tmp` behind: bounded by crashes, invisible to every reader, and never the real file.
//
// The two native backends — `storage/prefsBackend.native.ts` for settings, `secretFileBackend.ts`
// for ciphertext — differ in what they keep, not in how the file lands.
import { BaseDirectory, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs';

/** Write-then-rename, pretty-printed: how a JSON file that must survive a crash is replaced. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await writeTextFile(temp, JSON.stringify(value, null, 2), { baseDir: BaseDirectory.AppData });
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
