// Durable replacement for the standalone Node writers: the MCP server and the headless node.
//
// A note is never truncated in place. The bytes go to a fresh random sibling temp file opened
// exclusively, are flushed to the device, and only then rename over the target, so a crash either
// leaves the old file or the new one, never half a file. On POSIX the parent directory is synced
// afterwards too, which is what makes the new directory entry survive a power cut.
//
// Windows is a narrower promise. Node's rename is MoveFileExW without MOVEFILE_WRITE_THROUGH: the
// contents are synced before the replace and the replace itself is atomic on NTFS, but the
// metadata flush of that rename is left to the OS. Do not promise write-through there.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type DurableBytes = string | Uint8Array;

/** A sibling of the target, so rename stays on one filesystem; a leading dot keeps it out of scans. */
function tempPathFor(file: string): string {
  return path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
}

/** POSIX: sync the directory entry. Windows: documented narrow guarantee, see the header. */
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await fsp.open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function syncDirectorySync(dir: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export async function writeFileDurable(file: string, data: DurableBytes): Promise<void> {
  const temp = tempPathFor(file);
  try {
    const handle = await fsp.open(temp, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.rename(temp, file);
  } catch (error) {
    await fsp.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
  await syncDirectory(path.dirname(file));
}

export function writeFileDurableSync(file: string, data: DurableBytes): void {
  const temp = tempPathFor(file);
  let fd: number | null = null;
  try {
    fd = fs.openSync(temp, 'wx');
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temp, file);
  } catch (error) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // The handle is already gone with the failed write; nothing left to release.
      }
    }
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // A temp file that cannot be removed is reported by the caller's error below.
    }
    throw error;
  }
  syncDirectorySync(path.dirname(file));
}
