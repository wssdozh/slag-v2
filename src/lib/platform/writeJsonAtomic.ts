// The one way a JSON file this app owns gets replaced: the next snapshot is written beside the real
// one and renamed over it, so a crash mid-write leaves the previous file whole.
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
  const temp = `${file}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await writeTextFile(temp, JSON.stringify(value, null, 2), { baseDir: BaseDirectory.AppData });
  try {
    await rename(temp, file, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    // The snapshot did not land, so the file beside it is rubbish: leave it there and the next
    // boot reads a stray temp as "some settings" and copies it around.
    await remove(temp, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    throw err;
  }
}
