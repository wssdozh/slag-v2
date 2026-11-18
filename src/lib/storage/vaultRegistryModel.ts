// The vault registry as a value: what a stored list means, and how one entry joins or leaves it.
// No files, no settings, no localStorage — the caller owns reading and writing the string, and the
// rule stays checkable under plain node without a webview or a Tauri runtime.
import type { VaultMeta } from '../../types';

/** What older builds called the default vault; the name now matches its directory, `main`. */
const LEGACY_DEFAULT_VAULT_NAME = 'Основное хранилище (Vault)';

/**
 * An entry as the registry keeps it, or nothing. A record without an id is not a vault, and a
 * vault whose name is missing or still the old default one gets the name the app shows today.
 */
export function toVaultMeta(value: unknown): VaultMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined;

  const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : record.id;
  const isLegacyDefaultName =
    record.id === 'default_vault' && (name === record.id || name === LEGACY_DEFAULT_VAULT_NAME);

  const vault: VaultMeta = {
    id: record.id,
    name: isLegacyDefaultName ? 'main' : name,
    mode: record.mode === 'fsa' || record.mode === 'tauri' || record.mode === 'indexeddb'
      ? record.mode
      : 'indexeddb',
  };
  if (typeof record.path === 'string' && record.path.length > 0) vault.path = record.path;
  if (typeof record.syncId === 'string' && record.syncId.length > 0) vault.syncId = record.syncId;
  if (typeof record.isCurrent === 'boolean') vault.isCurrent = record.isCurrent;
  return vault;
}

/**
 * A stored list: junk entries dropped, an id kept once, first occurrence in place. `undefined` says
 * "not a registry at all", which is what a typed read turns into its fallback.
 */
export function normalizeVaultRegistry(value: unknown): VaultMeta[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const vaults: VaultMeta[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const vault = toVaultMeta(entry);
    if (!vault || seen.has(vault.id)) continue;
    seen.add(vault.id);
    vaults.push(vault);
  }
  return vaults;
}

/** One vault written into the list: an id that is already there is replaced where it stands. */
export function upsertVaultMeta(list: VaultMeta[], vault: VaultMeta): VaultMeta[] {
  const index = list.findIndex((entry) => entry.id === vault.id);
  if (index < 0) return [...list, vault];
  const next = [...list];
  next[index] = vault;
  return next;
}

/** The list without one vault. Deleting a vault is its own flow; this only knows the list. */
export function removeVaultMeta(list: VaultMeta[], vaultId: string): VaultMeta[] {
  return list.filter((vault) => vault.id !== vaultId);
}
