// The vault itself: backups, snapshots, export and import, and the folders on disk.
import React, { useState } from 'react';
import { Archive, Download, History, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import { openAppFolder } from '../../lib/platform/folderOpener';
import { IconButton } from '../UI/IconButton';
import {
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
  SettingsSwitch,
} from './SettingsUI';

export const VaultSettingsTab: React.FC = () => {
  const {
    backupSnapshots,
    backupSettings,
    createManualBackup,
    restoreSnapshot,
    confirmAction,
    deleteSnapshot,
    downloadSnapshot,
    downloadVaultZip,
    restoreFromZipFile,
    updateBackupSettings,
    revealVaultInExplorer,
    refreshData,
    addToast,
    isMobile,
  } = useApp();

  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      await createManualBackup();
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Восстановить из снимка?',
      description: 'Текущее содержимое хранилища заменится данными снимка. Несохранённые изменения пропадут.',
      confirmLabel: 'Восстановить',
      isDestructive: true,
    });
    if (!confirmed) return;
    setIsRestoring(true);
    try {
      await restoreSnapshot(id);
    } finally {
      setIsRestoring(false);
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
      setIsRestoring(true);
      try {
        await restoreFromZipFile(file);
      } finally {
        setIsRestoring(false);
      }
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

  const handleOpenNotesFolder = async () => {
    await revealVaultInExplorer();
  };

  const handleOpenBackupsFolder = async () => {
    const res = await openAppFolder('backups');
    addToast(res.message, res.success ? 'success' : 'info');
  };

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup title="Резервное копирование">
        <SettingsRow
          label="Автобэкап раз в сутки"
          description="Хранятся последние 7 снимков"
          right={<SettingsSwitch checked={backupSettings.autoBackupEnabled} onChange={(checked) => updateBackupSettings({ autoBackupEnabled: checked })} label="Автобэкап раз в сутки" />}
        />
        <SettingsDivider />
        <SettingsRow
          label="Последний снимок"
          description={backupSettings.lastBackupAt ? <span className="font-mono">{new Date(backupSettings.lastBackupAt).toLocaleString('ru-RU')}</span> : 'Ещё не создан'}
          right={<IconButton size="lg" data-testid="btn-create-snapshot" aria-label="Создать снимок" title="Создать снимок" aria-busy={isCreatingSnapshot} disabled={isCreatingSnapshot} onClick={() => void handleCreateSnapshot()}><Plus className={`w-4 h-4 ${isCreatingSnapshot ? 'motion-safe:animate-pulse' : ''}`} /></IconButton>}
        />
      </SettingsGroup>

      <SettingsGroup title={`Точки восстановления (${backupSnapshots.length})`}>
        {backupSnapshots.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-fg-dim">
            Точек восстановления пока нет. Создайте первый снимок или дождитесь автобэкапа.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {backupSnapshots.map((snap) => {
              const dateStr = new Date(snap.createdAt).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
              const sizeKb = Math.round(snap.sizeBytes / 1024);
              return (
                <SettingsRow
                  key={snap.id}
                  testId={`snapshot-item-${snap.id}`}
                  icon={<Archive className="w-3.5 h-3.5" />}
                  label={
                    <span className="flex items-baseline gap-2">
                      <span className="truncate">{dateStr}</span>
                      <span className="shrink-0 font-mono text-2xs text-fg-muted">
                        {snap.trigger === 'auto' ? 'Авто' : 'Ручной'}
                      </span>
                    </span>
                  }
                  description={<span className="font-mono">{snap.notesCount} зам. · {snap.attachmentsCount} мед. · {sizeKb} КБ</span>}
                  right={
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid={`btn-restore-snapshot-${snap.id}`}
                        onClick={() => handleRestoreSnapshot(snap.id)}
                        disabled={isRestoring}
                        className="px-1.5 py-1 rounded-md font-medium text-fg-secondary hover:text-fg-primary hover:bg-surface-hover transition-colors disabled:opacity-50 cursor-pointer"
                        title="Восстановить хранилище из этого снимка"
                        aria-label={`Восстановить хранилище из снимка ${dateStr}`}
                      >
                        <History className="w-4 h-4 sm:hidden" />
                        <span className="hidden text-xs sm:inline">Восстановить</span>
                      </button>
                      <IconButton size="lg" aria-label="Скачать ZIP архива" title="Скачать ZIP архива" onClick={() => downloadSnapshot(snap.id)}>
                        <Download className="w-4 h-4" />
                      </IconButton>
                      <IconButton size="lg" variant="danger" aria-label="Удалить снимок" title="Удалить снимок" onClick={() => deleteSnapshot(snap.id)}>
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </SettingsGroup>

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
