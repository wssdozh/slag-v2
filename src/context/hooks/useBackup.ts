// Backups: scheduled and manual snapshots on disk, restore, and the zip round trip.
import { useCallback, useEffect, useState } from 'react';
import type { BackupSettings, BackupSnapshotMeta } from '../../types';
import { backupService } from '../../lib/backupService';

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

/**
 * Backup and restore: snapshots on disk, the manual one, the zip round trip.
 *
 * One reason to change — the backup format and its schedule. It touches nothing
 * but `backupService`, and asks the app for two things it cannot own: telling the
 * user, and reloading the vault after a restore.
 */
export function useBackup(addToast: Toast, refreshData: () => void) {
  const [backupSnapshots, setBackupSnapshots] = useState<BackupSnapshotMeta[]>([]);
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(() => backupService.getSettings());

  const refreshBackupSnapshots = useCallback(async () => {
    try {
      const list = await backupService.getSnapshots();
      setBackupSnapshots(list);
    } catch {
      // quiet fallback
    }
  }, []);

  const updateBackupSettings = useCallback((settings: Partial<BackupSettings>) => {
    const updated = backupService.saveSettings(settings);
    setBackupSettings(updated);
  }, []);

  const createManualBackup = useCallback(async (): Promise<BackupSnapshotMeta | null> => {
    try {
      const snap = await backupService.createSnapshot('manual');
      await refreshBackupSnapshots();
      addToast(`Резервная копия создана (${snap.notesCount} заметок, ${Math.round(snap.sizeBytes / 1024)} КБ)`, 'success');
      return snap;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка создания резервной копии';
      addToast(msg, 'error');
      return null;
    }
  }, [addToast, refreshBackupSnapshots]);

  const restoreSnapshot = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await backupService.restoreSnapshot(id);
      if (success) {
        refreshData();
        addToast('Хранилище успешно восстановлено из снимка', 'success');
        return true;
      }
      addToast('Ошибка восстановления снимка', 'error');
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка восстановления';
      addToast(msg, 'error');
      return false;
    }
  }, [addToast, refreshData]);

  const deleteSnapshot = useCallback(async (id: string): Promise<void> => {
    try {
      await backupService.deleteSnapshot(id);
      await refreshBackupSnapshots();
      addToast('Снимок удалён', 'info');
    } catch {
      addToast('Ошибка удаления снимка', 'error');
    }
  }, [addToast, refreshBackupSnapshots]);

  const downloadSnapshot = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await backupService.downloadSnapshot(id);
      if (success) {
        addToast('Архив снимка скачан', 'success');
        return true;
      }
      addToast('Снимок не найден', 'error');
      return false;
    } catch {
      addToast('Ошибка скачивания снимка', 'error');
      return false;
    }
  }, [addToast]);

  const downloadVaultZip = useCallback(async (): Promise<string> => {
    try {
      const filename = await backupService.downloadCurrentVaultZip();
      addToast(`Хранилище экспортировано (${filename})`, 'success');
      return filename;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка экспорта архива';
      addToast(msg, 'error');
      return '';
    }
  }, [addToast]);

  const restoreFromZipFile = useCallback(async (file: File): Promise<{ itemsCount: number; attachmentsCount: number }> => {
    try {
      const res = await backupService.restoreFromZip(file);
      refreshData();
      addToast(`Восстановлено: ${res.itemsCount} заметок, ${res.attachmentsCount} медиа`, 'success');
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка восстановления из архива';
      addToast(msg, 'error');
      throw err;
    }
  }, [addToast, refreshData]);

  // First paint: list the snapshots and let the scheduled one run if it is due.
  useEffect(() => {
    let isMounted = true;
    backupService.getSnapshots().then((list) => {
      if (isMounted) setBackupSnapshots(list);
    }).catch(() => {});

    backupService.checkAndRunAutoBackup().then((ran) => {
      if (ran && isMounted) {
        backupService.getSnapshots().then((list) => {
          if (isMounted) setBackupSnapshots(list);
        }).catch(() => {});
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    backupSnapshots,
    backupSettings,
    refreshBackupSnapshots,
    updateBackupSettings,
    createManualBackup,
    restoreSnapshot,
    deleteSnapshot,
    downloadSnapshot,
    downloadVaultZip,
    restoreFromZipFile,
  };
}
