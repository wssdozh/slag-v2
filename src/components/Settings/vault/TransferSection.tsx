// «перенос»: the vault leaves as a ZIP or JSON and comes back through the same door.
import React from 'react';
import { useApp } from '../../../context/AppContext';
import { storage } from '../../../lib/storage';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';

export const TransferSection: React.FC = () => {
  const { confirmAction, downloadVaultZip, restoreFromZipFile, refreshData, addToast } = useApp();

  const handleExportZip = async () => {
    await downloadVaultZip();
  };

  const handleExportJson = () => {
    const jsonStr = storage.exportVaultAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slag_vault_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Резервная копия экспортирована в JSON', 'success');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.zip')) {
      const confirmed = await confirmAction({
        title: `Восстановить из «${file.name}»?`,
        description: 'Текущее содержимое хранилища заменится данными архива.',
        confirmLabel: 'Восстановить',
        isDestructive: true,
      });
      if (!confirmed) {
        e.target.value = '';
        return;
      }
      await restoreFromZipFile(file);
    } else if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const success = storage.importVaultFromJson(content);
        if (success) {
          refreshData();
          addToast('Хранилище восстановлено из JSON', 'success');
        } else {
          addToast('Ошибка формата файла', 'error');
        }
      };
      reader.readAsText(file);
    } else {
      addToast('Поддерживаются только архивы .zip и файлы .json', 'error');
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup title="Экспорт и импорт">
        <SettingsRow label="Экспорт в ZIP (заметки и медиа)" onClick={() => void handleExportZip()} testId="btn-export-zip" />
        <SettingsDivider />
        <SettingsRow label="Экспорт структуры в JSON" onClick={handleExportJson} />
        <SettingsDivider />
        <label className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-medium text-fg-primary hover:bg-surface-hover focus-within:bg-surface-hover cursor-pointer">
          Восстановить из файла (.zip / .json)
          <input type="file" accept=".zip,.json" className="sr-only" aria-label="Восстановить из файла (.zip / .json)" onChange={handleFileImport} />
        </label>
      </SettingsGroup>
    </div>
  );
};
