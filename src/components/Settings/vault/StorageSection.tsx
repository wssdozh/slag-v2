// «хранилище»: how much the store occupies and where its folders live on disk.
import React from 'react';
import { useApp } from '../../../context/AppContext';
import { openAppFolder } from '../../../lib/platform/folderOpener';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';
import { StorageUsageSection } from './StorageUsageSection';

export const StorageSection: React.FC = () => {
  const { revealVaultInExplorer, addToast, isMobile } = useApp();

  const handleOpenNotesFolder = async () => {
    await revealVaultInExplorer();
  };

  const handleOpenBackupsFolder = async () => {
    const res = await openAppFolder('backups');
    addToast(res.message, res.success ? 'success' : 'info');
  };

  return (
    <div className="flex flex-col gap-3">
      <StorageUsageSection />
      {!isMobile && (
        <SettingsGroup title="Системные каталоги">
          <SettingsRow label="Открыть папку заметок на диске" onClick={() => void handleOpenNotesFolder()} external />
          <SettingsDivider />
          <SettingsRow label="Открыть папку бэкапов на диске" onClick={() => void handleOpenBackupsFolder()} external />
        </SettingsGroup>
      )}
    </div>
  );
};
