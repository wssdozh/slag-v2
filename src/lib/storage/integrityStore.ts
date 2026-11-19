// The integrity index: a tiny inline summary, a bulk leaves file, and the codec between them and
// text. Pure on import — the Tauri fs module is reached through a dynamic `import()` inside the
// two io functions, so a plain `node --test` can read this file without a desktop runtime.
import type { IntegrityIndex } from '../vault/integrity/types';

export type { IntegrityIndex } from '../vault/integrity/types';

export function encodeIndex(index: IntegrityIndex): string {
  return JSON.stringify(index);
}

/** Null on anything that is not an index: a corrupted file is absent, not a crash. */
export function decodeIndex(raw: string): IntegrityIndex | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.root !== 'string' || typeof record.at !== 'string') return null;
    if (!record.folders || typeof record.folders !== 'object') return null;
    return parsed as IntegrityIndex;
  } catch {
    return null;
  }
}

export function encodeLeaves(leaves: Record<string, string>): string {
  return JSON.stringify(leaves, null, 2);
}

export function decodeLeaves(raw: string): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const leaves: Record<string, string> = {};
    for (const [id, hash] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hash === 'string') leaves[id] = hash;
    }
    return leaves;
  } catch {
    return null;
  }
}

/**
 * `vaults/<vault>/notes` → `vaults/<vault>/.integrity`. The index sits beside `notes/`, not inside
 * it, so the note scanner never walks over it. No `..` on purpose: Tauri joins this under AppData.
 */
export function integrityDir(vaultNotesPath: string): string {
  return `${vaultNotesPath.replace(/[/\\]notes$/, '')}/.integrity`;
}

export interface IntegrityFiles {
  index: IntegrityIndex | null;
  leaves: Record<string, string> | null;
}

export async function readIntegrity(vaultNotesPath: string): Promise<IntegrityFiles> {
  const fs = await import('@tauri-apps/plugin-fs');
  const dir = integrityDir(vaultNotesPath);
  const read = async (name: string): Promise<string | null> => {
    const path = `${dir}/${name}`;
    try {
      if (!(await fs.exists(path, { baseDir: fs.BaseDirectory.AppData }))) return null;
      return await fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppData });
    } catch {
      return null;
    }
  };

  const indexText = await read('index.json');
  const leavesText = await read('leaves.json');
  return {
    index: indexText ? decodeIndex(indexText) : null,
    leaves: leavesText ? decodeLeaves(leavesText) : null,
  };
}

export async function writeIntegrity(
  vaultNotesPath: string,
  index: IntegrityIndex,
  leaves?: Record<string, string>,
): Promise<void> {
  const fs = await import('@tauri-apps/plugin-fs');
  const dir = integrityDir(vaultNotesPath);
  const options = { baseDir: fs.BaseDirectory.AppData };
  await fs.mkdir(dir, { ...options, recursive: true });
  await fs.writeTextFile(`${dir}/index.json`, encodeIndex(index), options);
  if (leaves) await fs.writeTextFile(`${dir}/leaves.json`, encodeLeaves(leaves), options);
}
