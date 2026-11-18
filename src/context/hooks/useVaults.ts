// A vault's own writes: switch, create, delete, pick its folder and reveal it on disk.
import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ChatMessage,
  FeedViewMode,
  FolderMeta,
  FolderViewSettings,
  InboxMode,
  MobileTabId,
  SlagItem,
  SlagItemType,
  SortField,
  SortOrder,
  VaultMeta,
} from '../../types';
import { DEFAULT_INBOX_FOLDER, STORAGE_KEYS } from '../../config';
import { storage } from '../../lib/storage';
import { mergeDiscoveredVaults } from '../../lib/storage/vaultDiscovery';
import { syncEngine } from '../../lib/sync';
import { accountClient } from '../../lib/sync/account';
import { swapScreen } from '../../lib/motion';
import { openAppFolder } from '../../lib/platform/folderOpener';
import { logger } from '../../lib/logger/logger';
import { isTauri } from '@tauri-apps/api/core';
import { readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { ToastMessage } from '../appContext.types';

const fsLog = logger.scope('FS');

/**
 * What a vault can do: switch to it, create it, delete it, pick its folder on disk,
 * and reveal it in the file manager.
 *
 * One reason to change — the set of storage backends and their registry. Switching
 * a vault replaces the whole workspace, so the provider hands the setters in; the
 * vault list and the current vault stay owned by the provider.
 */
export function useVaults(deps: {
  vault: VaultMeta;
  setVault: Dispatch<SetStateAction<VaultMeta>>;
  setVaults: Dispatch<SetStateAction<VaultMeta[]>>;
  setFolders: Dispatch<SetStateAction<FolderMeta[]>>;
  setItems: Dispatch<SetStateAction<SlagItem[]>>;
  setCurrentFolder: Dispatch<SetStateAction<string>>;
  setFeedViewMode: Dispatch<SetStateAction<FeedViewMode>>;
  setInboxMode: Dispatch<SetStateAction<InboxMode>>;
  setActiveTypeFilter: Dispatch<SetStateAction<SlagItemType | 'all'>>;
  setActiveTagFilter: Dispatch<SetStateAction<string | null>>;
  setActiveMobileTab: Dispatch<SetStateAction<MobileTabId>>;
  setIsKanbanMaterialsOpen: Dispatch<SetStateAction<boolean>>;
  setSortBy: Dispatch<SetStateAction<SortField>>;
  setSortOrder: Dispatch<SetStateAction<SortOrder>>;
  setHideCompletedTasks: Dispatch<SetStateAction<boolean>>;
  setFolderSettings: Dispatch<SetStateAction<Record<string, FolderViewSettings>>>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSelectedItem: Dispatch<SetStateAction<SlagItem | null>>;
  refreshData: () => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: ToastMessage['action']) => void;
}): {
  switchVault: (vaultId: string) => void;
  createVault: (name: string, mode?: 'indexeddb' | 'fsa' | 'tauri', path?: string, id?: string) => void;
  deleteVault: (vaultId: string) => void;
  pickVaultDirectory: () => Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null>;
  revealVaultInExplorer: () => Promise<void>;
} {
  const {
    vault, setVault, setVaults, setFolders, setItems,
    setCurrentFolder, setFeedViewMode, setInboxMode, setActiveTypeFilter,
    setActiveTagFilter, setActiveMobileTab, setIsKanbanMaterialsOpen,
    setSortBy, setSortOrder, setHideCompletedTasks, setFolderSettings,
    setChatMessages, setSelectedItem, refreshData, addToast,
  } = deps;

  // A native webview profile can be wiped from the outside, and the registry is the only thing that
  // knows the vaults: it comes back as a lone `default_vault` while the directories still sit under
  // `vaults/`. Scan them once on start and add what the registry lost. Nothing is ever dropped from
  // the list here — deleting a vault is its own flow. The scan is best-effort: on the first run the
  // directory does not exist yet, and that is not a failure worth stopping the start for.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void readDir('vaults', { baseDir: BaseDirectory.AppData })
      .then((entries) => {
        if (cancelled) return;
        const stored = storage.getVaults();
        const dirs = entries.filter(entry => entry.isDirectory === true).map(entry => entry.name);
        const merged = mergeDiscoveredVaults(stored, dirs);
        if (merged.length === stored.length) return;
        localStorage.setItem(STORAGE_KEYS.VAULTS, JSON.stringify(merged));
        setVaults(merged);
        fsLog.info(`Restored ${merged.length - stored.length} vault(s) from disk: ${merged.slice(stored.length).map(entry => entry.id).join(', ')}`);
      })
      .catch((error: unknown) => {
        fsLog.warn('Vault discovery skipped: no vaults directory to scan yet', { error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [setVaults]);

  const switchVault = (vaultId: string) => {
    // One cross-fade over the whole swap, so the feed does not blink between vaults.
    swapScreen('tab', () => {
      storage.switchVault(vaultId);
      const newWs = storage.getWorkspaceState();
      setCurrentFolder(newWs.currentFolder || DEFAULT_INBOX_FOLDER);
      setFeedViewMode(newWs.feedViewMode || 'feed');
      setInboxMode(newWs.inboxMode || 'all');
      setActiveTypeFilter(newWs.activeTypeFilter || 'all');
      setActiveTagFilter(newWs.activeTagFilter || null);
      setActiveMobileTab(newWs.activeMobileTab || 'folders');
      setIsKanbanMaterialsOpen(typeof newWs.isKanbanMaterialsOpen === 'boolean' ? newWs.isKanbanMaterialsOpen : true);
      setSortBy(newWs.sortBy || 'createdAt');
      setSortOrder(newWs.sortOrder || 'asc');
      setHideCompletedTasks(newWs.hideCompletedTasks ?? false);
      setFolderSettings(newWs.folderSettings || {});
      setChatMessages(storage.getAssistantHistory());
      setSelectedItem(null);
      refreshData();
    });
    void syncEngine.switchVault(vaultId);
    addToast('Хранилище переключено', 'info');
  };

  const createVault = (name: string, mode?: 'indexeddb' | 'fsa' | 'tauri', path?: string, id?: string) => {
    const newMeta = storage.createVault(name, mode, path, id);
    if (!id && accountClient.isAuthenticated()) {
      void accountClient.registerVault(storage.ensureVaultSyncId(newMeta.id), newMeta.name)
        .then(() => syncEngine.switchVault(newMeta.id))
        .catch((error) => addToast(`Хранилище создано локально, но не зарегистрировано: ${error.message}`, 'error'));
    } else if (!id) {
      void syncEngine.switchVault(newMeta.id);
    }
    setCurrentFolder(DEFAULT_INBOX_FOLDER);
    setSelectedItem(null);
    refreshData();
    addToast(`Создано хранилище «${name}»`, 'success');
  };

  const deleteVault = (vaultId: string) => {
    const wasCurrent = vault.id === vaultId;
    const success = storage.deleteVault(vaultId);
    if (success) {
      if (wasCurrent) {
        void syncEngine.switchVault('default_vault');
        setVault(storage.getCurrentVault());
        setFolders(storage.getFolders());
        setItems(storage.getItems());
        setCurrentFolder(DEFAULT_INBOX_FOLDER);
        setSelectedItem(null);
      }
      setVaults(storage.getVaults());
      refreshData();
      addToast('Хранилище удалено', 'info');
    } else {
      addToast('Нельзя удалить системное хранилище', 'error');
    }
  };

  const pickVaultDirectory = useCallback(async () => {
    return await storage.pickDirectory();
  }, []);

  const revealVaultInExplorer = useCallback(async () => {
    const target = storage.getVaultNotesPath();
    const res = await openAppFolder(target);
    addToast(res.message, res.success ? 'success' : 'info');
  }, [addToast]);

  return {
    switchVault,
    createVault,
    deleteVault,
    pickVaultDirectory,
    revealVaultInExplorer,
  };
}
