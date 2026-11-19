// The three blocks of the vault tab, named once: the rail shows them as nested items, the phone
// keeps them as folds inside the pane.
export type VaultSection = 'storage' | 'integrity' | 'backups' | 'transfer';

export const VAULT_SECTIONS = [
  { id: 'storage', label: 'хранилище', icon: 'entity.disk' },
  { id: 'integrity', label: 'состояние', icon: 'status.checked' },
  { id: 'backups', label: 'бэкапы', icon: 'action.archive' },
  { id: 'transfer', label: 'перенос', icon: 'action.upload' },
] as const;
