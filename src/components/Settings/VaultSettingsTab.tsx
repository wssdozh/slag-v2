// The vault tab: the disk, the backups, the way out. On a desktop the rail owns the switch —
// the three blocks sit under «Хранилище & Бэкап» like subfolders under a folder. A phone has no
// rail to nest into, so there the blocks fold in place.
import React, { useCallback, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { IconName } from '../UI/icons/icons';
import { StorageSection } from './vault/StorageSection';
import { BackupSection } from './vault/BackupSection';
import { TransferSection } from './vault/TransferSection';
import { VAULT_SECTIONS, type VaultSection } from './vault/sections';

/** Which folds a phone left open. Module scope: the tab body unmounts on a tab switch. */
let lastOpen: Record<VaultSection, boolean> = { storage: true, backups: false, transfer: false };

interface VaultSettingsTabProps {
  /** Set by the desktop rail's nested items; without it the tab drives itself with folds. */
  section?: VaultSection;
}

const SectionBody: React.FC<{ id: VaultSection }> = ({ id }) => {
  if (id === 'storage') return <StorageSection />;
  if (id === 'backups') return <BackupSection />;
  return <TransferSection />;
};

export const VaultSettingsTab: React.FC<VaultSettingsTabProps> = ({ section }) => {
  const [open, setOpen] = useState<Record<VaultSection, boolean>>(lastOpen);

  const toggle = useCallback((id: VaultSection) => {
    setOpen((current) => {
      const next = { ...current, [id]: !current[id] };
      lastOpen = next;
      return next;
    });
  }, []);

  // Desktop: the rail picked the block, nothing to fold here.
  if (section) {
    return (
      <div className="flex flex-col gap-3" data-testid={`vault-section-${section}`}>
        <SectionBody id={section} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {VAULT_SECTIONS.map(({ id, label, icon }) => {
        const isOpen = open[id];
        return (
          <div key={id} className="flex flex-col">
            <button
              type="button"
              data-testid={`vault-subtab-${id}`}
              aria-expanded={isOpen}
              onClick={() => toggle(id)}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors cursor-pointer"
            >
              <Icon name={isOpen ? 'nav.down' : 'nav.next'} size="sm" tone="inherit" />
              <Icon name={icon as IconName} size="sm" tone="inherit" />
              <span>{label}</span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 pt-1 pb-3" data-testid={`vault-section-${id}`}>
                <SectionBody id={id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
