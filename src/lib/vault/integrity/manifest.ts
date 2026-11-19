// A vault reduced to three levels of hashes: one line per note, one per folder, one root.
//
// Comparing roots answers "am I in sync" in one string; a disagreeing folder is the only branch
// worth walking. Building is cheap because it only reads the notes it is handed — no disk, no app.

import type { FolderMeta, SlagItem } from '../../../types/index.ts';
import type { DriftReport, Manifest } from './types.ts';
import { canonicalJson, fingerprint, sha256Hex } from './fingerprint.ts';

/** Insertion order of a map is not a promise; a manifest's key order should be. */
function sortRecord(record: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key];
  return sorted;
}

/**
 * Hash the whole vault.
 *
 * `folders` is a hint, not the truth: a note whose folder is missing from that list still lands
 * under its own path, and a listed folder with no notes still gets the hash of an empty string.
 * A folder that vanishes from the list must not silently vanish from the manifest.
 *
 * ponytail: one pass over every note per build — O(n), and at 5000 notes that is ~180 ms. Fine
 * for a check that runs on open. If it ever gets hot, upgrade to an incremental bump: fingerprint
 * only the notes whose `updatedAt` moved and re-hash their folder plus the root.
 */
export async function buildManifest(
  items: SlagItem[],
  folders: FolderMeta[],
  key?: CryptoKey,
): Promise<Manifest> {
  const leaves: Record<string, string> = {};
  const linesByFolder = new Map<string, string[]>();

  for (const item of items) {
    const leaf = await fingerprint(canonicalJson(item), key);
    leaves[item.id] = leaf;
    const lines = linesByFolder.get(item.folder);
    if (lines) lines.push(`${item.id}:${leaf}`);
    else linesByFolder.set(item.folder, [`${item.id}:${leaf}`]);
  }

  for (const folder of folders) {
    if (!linesByFolder.has(folder.path)) linesByFolder.set(folder.path, []);
  }

  const folderHashes: Record<string, string> = {};
  for (const [path, lines] of linesByFolder) {
    folderHashes[path] = await sha256Hex(lines.sort().join('\n'));
  }

  const rootLines = Object.keys(folderHashes)
    .sort()
    .map((path) => `${path}:${folderHashes[path]}`);

  return {
    root: await sha256Hex(rootLines.join('\n')),
    folders: sortRecord(folderHashes),
    leaves: sortRecord(leaves),
  };
}

/**
 * What differs between this device and the reference. Report only: `extra` means "I have
 * something the reference does not", which is a fact to show a person, never a licence to delete.
 */
export function compare(local: Manifest, remote: Manifest): DriftReport {
  const folderPaths = new Set([...Object.keys(local.folders), ...Object.keys(remote.folders)]);
  const folders = [...folderPaths]
    .filter((path) => local.folders[path] !== remote.folders[path])
    .sort();

  const localIds = new Set(Object.keys(local.leaves));
  const remoteIds = new Set(Object.keys(remote.leaves));

  const missing: string[] = [];
  const conflict: string[] = [];
  for (const id of remoteIds) {
    const localLeaf = local.leaves[id];
    if (localLeaf === undefined) missing.push(id);
    else if (localLeaf !== remote.leaves[id]) conflict.push(id);
  }

  const extra = [...localIds].filter((id) => !remoteIds.has(id));

  return {
    rootMatch: local.root === remote.root,
    folders,
    missing: missing.sort(),
    extra: extra.sort(),
    conflict: conflict.sort(),
  };
}
