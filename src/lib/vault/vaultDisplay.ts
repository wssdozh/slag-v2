import type { VaultMeta } from '../../types';

export function getVaultDisplayName(vault: VaultMeta, vaults: VaultMeta[]): string {
  const hasDuplicateName = vaults.some(
    (candidate) =>
      candidate.id !== vault.id &&
      candidate.name.trim().toLocaleLowerCase() === vault.name.trim().toLocaleLowerCase(),
  );

  if (!hasDuplicateName) return vault.name;

  const identity = vault.syncId || vault.id;
  const compact = (id: string) => id.replace(/^vault_/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const token = compact(identity);
  let length = 4;
  while (length < token.length && vaults.some((candidate) =>
    candidate.id !== vault.id &&
    candidate.name.trim().toLocaleLowerCase() === vault.name.trim().toLocaleLowerCase() &&
    compact(candidate.syncId || candidate.id).slice(0, length) === token.slice(0, length),
  )) length++;
  return `${vault.name} · ${token.slice(0, length)}`;
}
