// The vault tab: three subsections behind one switch — the disk, the backups, the way out.
import React, { useCallback, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { ResponsiveSegmented, type SegmentedOption } from '../UI/ResponsiveSegmented';
import { StorageSection } from './vault/StorageSection';
import { BackupSection } from './vault/BackupSection';
import { TransferSection } from './vault/TransferSection';

type VaultSection = 'storage' | 'backups' | 'transfer';

/**
 * The subsection the user left the tab on. Module scope is deliberate: settings unmount the
 * whole tab body when another tab is picked, and coming back should not throw the user to
 * «хранилище» again. This is session memory, not a preference — a reload starts clean.
 */
let lastSection: VaultSection = 'storage';

const SECTION_OPTIONS: SegmentedOption<VaultSection>[] = [
  {
    value: 'storage',
    label: 'хранилище',
    icon: <Icon name="entity.disk" size="sm" tone="inherit" />,
    showLabelInExpanded: true,
    showLabelInTrigger: true,
  },
  {
    value: 'backups',
    label: 'бэкапы',
    icon: <Icon name="action.archive" size="sm" tone="inherit" />,
    showLabelInExpanded: true,
    showLabelInTrigger: true,
  },
  {
    value: 'transfer',
    label: 'перенос',
    icon: <Icon name="action.upload" size="sm" tone="inherit" />,
    showLabelInExpanded: true,
    showLabelInTrigger: true,
  },
];

export const VaultSettingsTab: React.FC = () => {
  const [section, setSection] = useState<VaultSection>(lastSection);

  const handleSectionChange = useCallback((next: VaultSection) => {
    lastSection = next;
    setSection(next);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveSegmented<VaultSection>
        value={section}
        onChange={handleSectionChange}
        options={SECTION_OPTIONS}
        variant="plain"
        ariaLabel="Раздел хранилища"
        className="self-start"
      />

      {/* Every subsection stays mounted: a switch must keep the snapshot list, a picked import
          file and the already-collected usage, and must never start a count or a backup. */}
      <div hidden={section !== 'storage'} data-testid="vault-section-storage">
        <StorageSection />
      </div>
      <div hidden={section !== 'backups'} data-testid="vault-section-backups">
        <BackupSection />
      </div>
      <div hidden={section !== 'transfer'} data-testid="vault-section-transfer">
        <TransferSection />
      </div>
    </div>
  );
};
