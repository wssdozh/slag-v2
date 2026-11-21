// «перенос»: the vault leaves as a ZIP or JSON and comes back through the same door.
import React from 'react';
import { useApp } from '../../../context/AppContext';
import { storage } from '../../../lib/storage';
import { canExportMigrationSnapshot, exportMigrationSnapshot } from '../../../lib/sync/notes/migrationExport';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';

export const TransferSection: React.FC = () => {
  const { confirmAction, downloadVaultZip, restoreFromZipFile, refreshData, addToast } = useApp();
  const [isExportingMigration, setIsExportingMigration] = React.useState(false);

  const handleMigrationExport = async () => {
    setIsExportingMigration(true);
    try {
      if (await exportMigrationSnapshot()) addToast('Снимок синхронизации сохранён', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Не удалось сохранить снимок синхронизации', 'error');
    } finally {
      setIsExportingMigration(false);
    }
  };

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
      try {
        await restoreFromZipFile(file);
      } catch {
        // useBackup already surfaced the failure to the user.
      }
    } else if (file.name.endsWith('.json')) {
      const vault = storage.getCurrentVault();
      try {
        if (!await storage.importVaultFromJson(await file.text(), vault)) throw new Error('Ошибка формата файла');
        refreshData();
        addToast('Хранилище восстановлено из JSON', 'success');
      } catch (error) {
        addToast(error instanceof Error ? error.message : 'Не удалось импортировать файл', 'error');
      }
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
        {canExportMigrationSnapshot() && <>
          <SettingsDivider />
          <SettingsRow
            label="Снимок для перехода на реестр"
            description={isExportingMigration ? 'Подготовка архива…' : 'Локальный архив с заметками и корзиной. Не для восстановления.'}
            disabled={isExportingMigration}
            onClick={() => void handleMigrationExport()}
            testId="btn-export-migration"
          />
        </>}
        <SettingsDivider />
        <label className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-medium text-fg-primary hover:bg-surface-hover focus-within:bg-surface-hover cursor-pointer">
          Восстановить из файла (.zip / .json)
          <input type="file" accept=".zip,.json" className="sr-only" aria-label="Восстановить из файла (.zip / .json)" onChange={handleFileImport} />
        </label>
      </SettingsGroup>
    </div>
  );
};
