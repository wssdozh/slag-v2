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
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { storage } from '../../lib/storage';
import { discoverVaults } from '../../lib/storage/vaultRegistry';
import { syncEngine } from '../../lib/sync';
import { accountClient } from '../../lib/sync/account';
import { swapScreen } from '../../lib/motion';
import { openAppFolder } from '../../lib/platform/folderOpener';
import { logger } from '../../lib/logger/logger';
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
    setSortBy, setSortOrder, setFolderSettings,
    setChatMessages, setSelectedItem, refreshData, addToast,
  } = deps;

  // A wiped native profile costs the registry, not the directories: the scan tells the list what is
  // actually on disk. It lives in the registry module, with the rest of the filesystem work.
  useEffect(() => {
    let cancelled = false;
    void discoverVaults(storage)
      .then((merged) => {
        if (!cancelled) setVaults(merged);
      })
      .catch((error: unknown) => {
        fsLog.warn('Vault discovery failed, the registry stands as it is', { error: String(error) });
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
