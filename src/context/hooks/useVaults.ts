import { useCallback } from 'react';
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
import { syncEngine } from '../../lib/sync';
import { accountClient } from '../../lib/sync/account';
import { crossFade } from '../../lib/motion';
import { openAppFolder } from '../../lib/folderOpener';
import type { ToastMessage } from '../appContext.types';

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

  const switchVault = (vaultId: string) => {
    // One cross-fade over the whole swap, so the feed does not blink between vaults.
    crossFade(() => {
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
