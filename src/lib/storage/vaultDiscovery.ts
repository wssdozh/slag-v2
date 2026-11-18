// The vault list lives in localStorage only, and a native webview profile can be cleared from the
// outside. The registry is then a single `default_vault` while its directories sit untouched under
// `vaults/`. This module turns what is on disk into entries for the list; being pure, the rule can
// be checked without a filesystem, and the caller owns reading the directory and writing the result.
import type { VaultMeta } from '../../types';

/** The directory of `default_vault` is `main`: it is the vault the app is already showing. */
const DEFAULT_VAULT_DIR = 'main';

/**
 * The registry plus a vault for every directory the registry does not know yet. Only union: an
 * entry whose directory is gone stays where it is — dropping a vault is the user's own flow, not a
 * side effect of a scan. Known entries keep their order and every field (`syncId` included); new
 * ones land at the end, named after their directory.
 */
export function mergeDiscoveredVaults(stored: VaultMeta[], dirs: string[]): VaultMeta[] {
  const known = new Set(stored.map(vault => vault.id));
  const added: VaultMeta[] = [];

  for (const dir of dirs) {
    if (dir.length === 0 || dir === DEFAULT_VAULT_DIR || known.has(dir)) continue;
    known.add(dir);
    added.push({ id: dir, name: dir, mode: 'tauri', isCurrent: false });
  }

  return added.length > 0 ? [...stored, ...added] : stored;
}
