// The vault tab: three foldable blocks — the disk, the backups, the way out. The folds behave
// like the sidebar's folders: one row with a chevron, the content appears under it.
import React, { useCallback, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { IconName } from '../UI/icons/icons';
import { StorageSection } from './vault/StorageSection';
import { BackupSection } from './vault/BackupSection';
import { TransferSection } from './vault/TransferSection';

type VaultSection = 'storage' | 'backups' | 'transfer';

/**
 * Which folds the user left open. Module scope is deliberate: settings unmount the whole tab
 * body when another tab is picked, and coming back should not slam the folds shut.
 */
let lastOpen: Record<VaultSection, boolean> = {
  storage: true,
  backups: false,
  transfer: false,
};

const SECTIONS = [
  { id: 'storage', label: 'хранилище', icon: 'entity.disk' },
  { id: 'backups', label: 'бэкапы', icon: 'action.archive' },
  { id: 'transfer', label: 'перенос', icon: 'action.upload' },
] as const satisfies readonly { id: VaultSection; label: string; icon: IconName }[];

export const VaultSettingsTab: React.FC = () => {
  const [open, setOpen] = useState<Record<VaultSection, boolean>>(lastOpen);

  const toggle = useCallback((id: VaultSection) => {
    setOpen((current) => {
      const next = { ...current, [id]: !current[id] };
      lastOpen = next;
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-1">
      {SECTIONS.map(({ id, label, icon }) => {
        const isOpen = open[id];
        return (
          <div key={id} className="flex flex-col">
            <button
              type="button"
              data-testid={`vault-fold-${id}`}
              aria-expanded={isOpen}
              onClick={() => toggle(id)}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors cursor-pointer"
            >
              <Icon name={isOpen ? 'nav.down' : 'nav.next'} size="sm" tone="inherit" />
              <Icon name={icon} size="sm" tone="inherit" />
              <span>{label}</span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 pt-1 pb-3" data-testid={`vault-section-${id}`}>
                {id === 'storage' && <StorageSection />}
                {id === 'backups' && <BackupSection />}
                {id === 'transfer' && <TransferSection />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
