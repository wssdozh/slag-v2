import { useCallback, useEffect, useState } from 'react';
import { listFolderEntries, listFolders, pickFolder, pickFilesFromSystem } from '../../lib/media/folderBrowser';
import { logger } from '../../lib/logger/logger';
import type { DeviceFolder, FolderEntry } from '../../types';

const pickerLog = logger.scope('MEDIA');

/**
 * The folders tab: granted folders, the files inside one of them, and the system dialog as the
 * way out. Whole-directory listings are sorted in memory, so there is nothing to page here.
 */
export function useFolderBrowser(isOpen: boolean) {
  const [folders, setFolders] = useState<DeviceFolder[]>([]);
  const [openFolder, setOpenFolder] = useState<DeviceFolder | null>(null);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void (async () => {
      setIsLoading(true);
      try {
        const granted = await listFolders();
        if (alive) setFolders(granted);
      } catch (error) {
        pickerLog.warn('Granted folders are unavailable', error);
        if (alive) setError('Не удалось прочитать выданные папки');
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen]);

  const addFolder = useCallback(async () => {
    try {
      const folder = await pickFolder();
      if (!folder) return;
      setFolders((prev) => (prev.some((item) => item.uri.uri === folder.uri.uri) ? prev : [...prev, folder]));
      setError(null);
    } catch {
      setError('Не удалось выдать папку');
    }
  }, []);

  const open = useCallback(async (folder: DeviceFolder) => {
    setOpenFolder(folder);
    setIsLoading(true);
    try {
      const loaded = await listFolderEntries(folder.uri);
      setEntries(loaded);
      setError(null);
    } catch {
      setEntries([]);
      setError('Папка больше недоступна — выдай её заново');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const back = useCallback(() => {
    setOpenFolder(null);
    setEntries([]);
    setError(null);
  }, []);

  const browseSystem = useCallback(async () => {
    try {
      return await pickFilesFromSystem();
    } catch {
      setError('Системный диалог не открылся');
      return [];
    }
  }, []);

  return {
    folders,
    openFolder,
    entries,
    isLoading,
    error,
    addFolder,
    open,
    back,
    browseSystem,
  };
}
