/* oxlint-disable react/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  ReplyTarget,
  SlagItem,
  FolderMeta,
  VaultMeta,
  AiSettings,
} from '../types';
import { storage } from '../lib/storage';
import { logger } from '../lib/logger';
import { openAppFolder } from '../lib/folderOpener';
import { listenDesktopEvents } from '../lib/windowControls';
import { syncEngine } from '../lib/sync';
import { accountClient } from '../lib/sync/account';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useLayerStack, type AppLayer } from '../hooks/useLayerStack';
import { useSuggestedActions, type ActionHistoryEntry } from '../hooks/useSuggestedActions';
import { useOverlays } from './hooks/useOverlays';
import { useMobileNav } from './hooks/useMobileNav';
import { useFeedView } from './hooks/useFeedView';
import { useBackup } from './hooks/useBackup';
import { useAssistant } from './hooks/useAssistant';
import { useAppearance } from './hooks/useAppearance';
import { useItemActions } from './hooks/useItemActions';
import { useFolderAdmin } from './hooks/useFolderAdmin';
import { useRecurringRollover } from './hooks/useRecurringRollover';
import { crossFade } from '../lib/motion';
import {
  STORAGE_KEYS,
  DEFAULT_INBOX_FOLDER,
} from '../config';
import { evaluateRecurringTasks } from '../lib/time/recurrenceHelper';

const uiLog = logger.scope('UI');
const appLog = logger.scope('APP');

import type { AppContextType } from './appContext.types';
export type { ToastMessage, AttachSheetRequest, ContextMenuTarget } from './appContext.types';

const AI_SETTINGS_KEY = STORAGE_KEYS.AI_SETTINGS;


export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialWorkspace] = useState(() => storage.getWorkspaceState());
  const [vault, setVault] = useState<VaultMeta>(storage.getCurrentVault());
  const [vaults, setVaults] = useState<VaultMeta[]>(storage.getVaults());
  const [folders, setFolders] = useState<FolderMeta[]>(() => storage.getFolders());
  const initialCurFolder = storage.getFolders().some(f => f.path === initialWorkspace.currentFolder)
    ? initialWorkspace.currentFolder
    : DEFAULT_INBOX_FOLDER;

  const [currentFolder, setCurrentFolder] = useState<string>(initialCurFolder);
  const [items, setItems] = useState<SlagItem[]>(() => {
    const rawItems = storage.getItems();
    const { updatedItems, changedCount } = evaluateRecurringTasks(rawItems);
    if (changedCount > 0) {
      storage.saveItems(updatedItems);
      return updatedItems;
    }
    return rawItems;
  });
  const [selectedItem, setSelectedItem] = useState<SlagItem | null>(() => {
    const fsState = initialWorkspace.fullscreenEditorState;
    if (fsState?.isOpen && fsState.itemId) {
      const rawItems = storage.getItems();
      const found = rawItems.find(it => it.id === fsState.itemId);
      if (found) return found;
      if (fsState.itemId.startsWith('draft_')) {
        return {
          id: fsState.itemId,
          title: '',
          content: '',
          type: 'note',
          folder: initialWorkspace.currentFolder || DEFAULT_INBOX_FOLDER,
          tags: [],
          attachments: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
    }
    return null;
  });
  const {
    inboxMode, setInboxMode,
    feedViewMode, setFeedViewMode,
    isKanbanMaterialsOpen, setIsKanbanMaterialsOpen,
    activeTypeFilter, setActiveTypeFilter,
    activeTagFilter, setActiveTagFilter,
    isPinnedOnlyFilter, setIsPinnedOnlyFilter, togglePinnedOnlyFilter,
    sortBy, setSortBy, sortOrder, setSortOrder,
    hideCompletedTasks, setHideCompletedTasks,
    aiItemFilter, applyAiFilter, clearAiFilter,
    filteredItems, folderSettings, setFolderSettings,
    updateCurrentFolderViewSettings, resetCurrentFolderViewSettings,
  } = useFeedView(currentFolder, items, initialWorkspace);

  const {
    chatMessages, setChatMessages, isChatLoading,
    aiSettings, setAiSettings,
    sendChatMessage, clearChatMessages,
  } = useAssistant(currentFolder, folders, items, applyAiFilter);

  const {
    lightboxImages, activeLightboxIndex,
    openLightbox, closeLightbox, navigateLightbox, updateLightboxImage,
    isFullscreenEditorOpen, setIsFullscreenEditorOpen,
    isSearchOpen, setIsSearchOpen, isSettingsOpen, setIsSettingsOpen,
    settingsTab, setSettingsTab, openSettingsModal, isLogViewerOpen, setIsLogViewerOpen,
    isFolderModalOpen, setIsFolderModalOpen, folderModalParent, setFolderModalParent,
    isFolderInfoModalOpen, setIsFolderInfoModalOpen, folderInfoTarget, setFolderInfoTarget,
    isFolderViewModalOpen, setIsFolderViewModalOpen,
    openFolderInfoModal, closeFolderInfoModal,
    isVaultModalOpen, setIsVaultModalOpen, openVaultModal, closeVaultModal,
    isTriageModalOpen, setIsTriageModalOpen,
    isComposerModalOpen, setIsComposerModalOpen, composerModalOptions, setComposerModalOptions,
    openComposerModal, closeComposerModal,
    contextMenu, openContextMenu, closeContextMenu,
    toasts, addToast, removeToast, confirmRequest, resolveConfirm, confirmAction,
    attachSheet, openAttachSheet, closeAttachSheet,
  } = useOverlays(currentFolder, initialWorkspace);

  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  const {
    isMobile, forceMobileMode, toggleMobileMode,
    activeMobileTab, setActiveMobileTab,
    mobileActiveFolder, setMobileActiveFolder,
    mobileFolderInfoOpen, setMobileFolderInfoOpen,
    mobileActionSheetItem, setMobileActionSheetItem,
    mobileDockTabs, setMobileDockTabs, remapMobileFolder,
  } = useMobileNav(initialWorkspace, setCurrentFolder);

  const {
    sidebarWidth, rightPanelWidth, setSidebarWidth, setRightPanelWidth,
    uiConfig, updateUiConfig,
  } = useAppearance(isMobile);

  // Action History Stack for Undo capability (up to 20 snapshots)
  const actionHistoryRef = useRef<ActionHistoryEntry[]>([]);

  const undoLastAction = useCallback((): boolean => {
    const last = actionHistoryRef.current.pop();
    if (!last || last.itemSnapshots.length === 0) {
      addToast('Нет действий для отмены', 'info');
      return false;
    }
    for (const snap of last.itemSnapshots) {
      storage.saveItem(snap);
    }
    setItems(storage.getItems());
    addToast(`Действие «${last.description}» отменено`, 'info');
    return true;
  }, [addToast]);

  const refreshData = useCallback(() => {
    setVault(storage.getCurrentVault());
    setVaults(storage.getVaults());
    setFolders(storage.getFolders());
    setItems(storage.getItems());
  }, []);

  useRecurringRollover(refreshData);

  // Application Startup Log (guarded against React StrictMode double invocation)
  const hasLoggedInitRef = useRef(false);
  useEffect(() => {
    if (hasLoggedInitRef.current) return;
    hasLoggedInitRef.current = true;
    const currentVault = storage.getCurrentVault();
    const currentItems = storage.getItems();
    const currentFolders = storage.getFolders();
    appLog.info('SLAG v2 application initialized', {
      vault: currentVault.name,
      itemsCount: currentItems.length,
      foldersCount: currentFolders.length,
    });
    void storage.initTauriFs().then((loadedNew) => {
      if (loadedNew) {
        refreshData();
      }
    });

    accountClient.startPolling(syncEngine.getConfig().serverUrl);
    void syncEngine.init();
    let wasAuthenticated = accountClient.isAuthenticated();
    const unsubscribeAccount = accountClient.subscribe(() => {
      const isAuthenticated = accountClient.isAuthenticated();
      if (isAuthenticated === wasAuthenticated) return;
      wasAuthenticated = isAuthenticated;
      if (isAuthenticated) {
        accountClient.startPolling(syncEngine.getConfig().serverUrl);
        void syncEngine.init();
      } else {
        accountClient.stopPolling();
        syncEngine.disconnect();
      }
    });
    const handleSyncUpdate = () => {
      refreshData();
    };
    window.addEventListener('slag-sync-updated', handleSyncUpdate);

    const cleanupDesktop = listenDesktopEvents({
      onOpenComposer: () => {
        openComposerModal();
      },
      onDataChanged: () => {
        refreshData();
      },
    });

    return () => {
      unsubscribeAccount();
      accountClient.stopPolling();
      cleanupDesktop();
      window.removeEventListener('slag-sync-updated', handleSyncUpdate);
    };
  }, [refreshData, openComposerModal]);

  // Network online/offline diagnostics
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => appLog.info('Network connection restored (online)');
    const handleOffline = () => appLog.warn('Network connection lost (offline)');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // User Breadcrumbs: Folder navigation & View switching
  const prevFolderRef = useRef(currentFolder);
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      uiLog.info(`Navigated to folder: "${currentFolder}"`, {
        from: prevFolderRef.current,
        to: currentFolder,
        isInbox: currentFolder === DEFAULT_INBOX_FOLDER,
      });
      prevFolderRef.current = currentFolder;
    }
  }, [currentFolder]);

  // Workspace state persistence (per-vault)
  useEffect(() => {
    storage.saveWorkspaceState({
      currentFolder,
      feedViewMode,
      inboxMode,
      activeTypeFilter,
      activeTagFilter,
      activeMobileTab,
      isKanbanMaterialsOpen,
      fullscreenEditorState: {
        isOpen: isFullscreenEditorOpen,
        itemId: isFullscreenEditorOpen && selectedItem ? selectedItem.id : null,
      },
      sortBy,
      sortOrder,
      hideCompletedTasks,
      folderSettings,
    });
  }, [
    currentFolder,
    feedViewMode,
    inboxMode,
    activeTypeFilter,
    activeTagFilter,
    activeMobileTab,
    isKanbanMaterialsOpen,
    isFullscreenEditorOpen,
    selectedItem,
    sortBy,
    sortOrder,
    hideCompletedTasks,
    folderSettings,
  ]);

  const prevViewRef = useRef(feedViewMode);
  useEffect(() => {
    if (prevViewRef.current !== feedViewMode) {
      uiLog.debug(`Switched view mode to: "${feedViewMode}"`);
      prevViewRef.current = feedViewMode;
    }
  }, [feedViewMode]);

  // User Breadcrumbs: Modal visibility tracking
  useEffect(() => {
    if (isSearchOpen) uiLog.debug('Search modal opened (⌘K)');
  }, [isSearchOpen]);

  useEffect(() => {
    if (isTriageModalOpen) uiLog.debug('AI Triage modal opened');
  }, [isTriageModalOpen]);

  useEffect(() => {
    if (isSettingsOpen) uiLog.debug(`Settings modal opened [tab: ${settingsTab}]`);
  }, [isSettingsOpen, settingsTab]);

  useEffect(() => {
    if (isFullscreenEditorOpen) uiLog.debug('Fullscreen editor opened');
  }, [isFullscreenEditorOpen]);

  // Listen to window storage events if multi-window sync is used
  useEffect(() => {
    const handleStorage = () => refreshData();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshData]);

  const layers: AppLayer[] = [
    // Topmost: it can be asked above any dialog, and Esc must answer it, not close what is behind.
    { isOpen: confirmRequest !== null, close: () => resolveConfirm(false) },
    { isOpen: attachSheet !== null, close: closeAttachSheet },
    { isOpen: activeLightboxIndex !== null, close: closeLightbox },
    { isOpen: mobileActionSheetItem !== null, close: () => setMobileActionSheetItem(null) },
    { isOpen: contextMenu !== null, close: closeContextMenu },
    { isOpen: isLogViewerOpen, close: () => setIsLogViewerOpen(false) },
    { isOpen: isFolderModalOpen, close: () => { setIsFolderModalOpen(false); setFolderModalParent(null); } },
    { isOpen: isFolderViewModalOpen, close: () => setIsFolderViewModalOpen(false), depth: 0 },
    { isOpen: isVaultModalOpen, close: () => setIsVaultModalOpen(false) },
    { isOpen: isFolderInfoModalOpen, close: () => { setIsFolderInfoModalOpen(false); setFolderInfoTarget(null); } },
    { isOpen: isTriageModalOpen, close: () => setIsTriageModalOpen(false) },
    { isOpen: isComposerModalOpen, close: () => { setIsComposerModalOpen(false); setComposerModalOptions(null); } },
    { isOpen: isSettingsOpen, close: () => setIsSettingsOpen(false) },
    { isOpen: isSearchOpen, close: () => setIsSearchOpen(false) },
    { isOpen: replyTarget !== null, close: () => setReplyTarget(null) },
    { isOpen: isFullscreenEditorOpen, close: () => { setIsFullscreenEditorOpen(false); setSelectedItem(null); } },
    { isOpen: isMobile && mobileFolderInfoOpen, close: () => setMobileFolderInfoOpen(false) },
    {
      isOpen: isMobile && mobileActiveFolder !== null,
      depth: mobileActiveFolder ? mobileActiveFolder.split('/').length : 0,
      close: () => {
        if (!mobileActiveFolder) return;
        if (mobileActiveFolder.includes('/')) {
          setMobileActiveFolder(mobileActiveFolder.substring(0, mobileActiveFolder.lastIndexOf('/')));
        } else {
          setMobileActiveFolder(null);
        }
      },
    },
    { isOpen: isMobile && activeMobileTab !== 'folders', close: () => setActiveMobileTab('folders') },
  ];
  const { dismissTopLayer } = useLayerStack(layers, isMobile);
  const toggleAssistant = useCallback(() => {
    if (isMobile) {
      setActiveMobileTab(prev => (prev === 'assistant' ? 'folders' : 'assistant'));
    } else {
      window.dispatchEvent(new CustomEvent('slag:toggle-assistant'));
    }
  }, [isMobile, setActiveMobileTab]);

  // Global In-App Keyboard Shortcuts (Zero-Overhead native keydown)
  useGlobalHotkeys({
    openSearch: () => setIsSearchOpen(prev => !prev),
    toggleAssistant,
    toggleLogs: () => setIsLogViewerOpen(prev => !prev),
    openComposer: openComposerModal,
    openSettings: openSettingsModal,
    dismissTopLayer,
    isOverlayOpen: () => Boolean(isFullscreenEditorOpen || isComposerModalOpen || isSearchOpen || isSettingsOpen || contextMenu),
  });

  const scrollToItem = useCallback((idOrTitle: string) => {
    // Strip [[...]] brackets and optional #anchor or .md extension
    let cleanQuery = idOrTitle.trim().replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    if (cleanQuery.includes('#')) {
      cleanQuery = cleanQuery.split('#')[0].trim();
    }
    cleanQuery = cleanQuery.replace(/\.md$/i, '').trim();

    // Extract note name if query is formatted as folder path e.g. "Folder/Note"
    const noteNameFromPath = cleanQuery.includes('/')
      ? cleanQuery.slice(cleanQuery.lastIndexOf('/') + 1).trim()
      : cleanQuery;

    const queryLower = cleanQuery.toLowerCase();
    const nameLower = noteNameFromPath.toLowerCase();

    // Matching cascade: exact ID -> exact title -> exact filename -> prefix/substring match
    const found =
      items.find(i => i.id === cleanQuery) ||
      items.find(i => i.title.toLowerCase() === queryLower || i.title.toLowerCase() === nameLower) ||
      items.find(i => {
        const baseFilename = (i.filename || '').replace(/\.md$/i, '').toLowerCase();
        return baseFilename === queryLower || baseFilename === nameLower;
      }) ||
      items.find(i => i.title.toLowerCase().startsWith(queryLower) || i.title.toLowerCase().startsWith(nameLower)) ||
      items.find(i => {
        const baseFilename = (i.filename || '').replace(/\.md$/i, '').toLowerCase();
        return baseFilename.startsWith(queryLower) || baseFilename.startsWith(nameLower);
      }) ||
      items.find(i => i.title.toLowerCase().includes(nameLower));

    if (!found) {
      addToast(`Запись «${cleanQuery}» не найдена`, 'info');
      return;
    }

    if (currentFolder !== DEFAULT_INBOX_FOLDER && currentFolder !== found.folder && !found.folder.startsWith(currentFolder + '/')) {
      setCurrentFolder(found.folder);
    }

    // Set highlighted item. FeedList observes this and anchors with centered scroll
    setHighlightedItemId(found.id);

    // Keep highlight effect for 2.4s then clear
    setTimeout(() => {
      setHighlightedItemId(prev => (prev === found.id ? null : prev));
    }, 2400);
  }, [items, currentFolder, addToast]);

  const navigateToFolder = useCallback((folder: string, itemId?: string) => {
    if (currentFolder !== folder) {
      setCurrentFolder(folder);
    }
    if (isMobile) {
      setMobileActiveFolder(folder);
      setActiveMobileTab('folders');
    }
    setIsPinnedOnlyFilter(false);
    clearAiFilter();

    if (itemId) {
      setFeedViewMode('feed');
      const it = items.find(i => i.id === itemId);
      if (it) {
        if (activeTypeFilter !== 'all' && it.type !== activeTypeFilter) {
          setActiveTypeFilter('all');
        }
        if (activeTagFilter && !it.tags?.includes(activeTagFilter)) {
          setActiveTagFilter(null);
        }
        if (hideCompletedTasks && it.type === 'task' && it.status === 'done') {
          setHideCompletedTasks(false);
        }
      }
      setHighlightedItemId(null);
      requestAnimationFrame(() => {
        setHighlightedItemId(itemId);
      });
      setTimeout(() => {
        setHighlightedItemId(prev => (prev === itemId ? null : prev));
      }, 2400);
    }
  }, [
    currentFolder,
    isMobile,
    setMobileActiveFolder,
    setActiveMobileTab,
    setFeedViewMode,
    setIsPinnedOnlyFilter,
    clearAiFilter,
    items,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    hideCompletedTasks,
    setHideCompletedTasks,
  ]);

  // Global click outside for Context Menu
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => closeContextMenu();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu, closeContextMenu]);

  const saveAiSettings = (newSettings: Partial<AiSettings>) => {
    const updated = { ...aiSettings, ...newSettings };
    setAiSettings(updated);
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(updated));
    uiLog.info(`AI settings updated: provider=${updated.provider}, model=${updated.model || 'default'}`);
    addToast('Настройки сохранены', 'success');
  };

  const {
    saveItem, openNewNote, updateItem, deleteItem, restoreFromTrash, moveItem,
    toggleTaskComplete, completeTaskForever,
  } = useItemActions({
    items, currentFolder, selectedItem, setSelectedItem,
    addToast, refreshData, setIsFullscreenEditorOpen,
  });


  const { executeSuggestedAction, rejectAction } = useSuggestedActions({
    items,
    currentFolder,
    saveItem,
    updateItem,
    addToast,
    undoLastAction,
    setChatMessages,
    actionHistoryRef,
  });

  const {
    saveFolder, updateFolderDescription, renameFolder, deleteFolder,
    openCreateFolderModal, closeFolderModal,
  } = useFolderAdmin({
    currentFolder, setCurrentFolder, setFolderInfoTarget,
    remapMobileFolder, refreshData, addToast,
    setIsFolderModalOpen, setFolderModalParent,
  });

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

  const openFolderInExplorer = useCallback(async (folderPath: string) => {
    const notesBase = storage.getVaultNotesPath();
    const target = `${notesBase}/${folderPath || DEFAULT_INBOX_FOLDER}`;
    const res = await openAppFolder(target);
    addToast(res.message, res.success ? 'success' : 'info');
  }, [addToast]);

  const seedDemoData = useCallback(() => {
    storage.seedDemoData();
    refreshData();
    addToast('Созданы стартовые демо-заметки и папки', 'success');
  }, [refreshData, addToast]);

  const openFolderViewModal = useCallback(() => {
    setIsFolderViewModalOpen(true);
  }, [setIsFolderViewModalOpen]);

  const closeFolderViewModal = useCallback(() => {
    setIsFolderViewModalOpen(false);
  }, [setIsFolderViewModalOpen]);

  const {
    backupSnapshots, backupSettings, refreshBackupSnapshots, updateBackupSettings,
    createManualBackup, restoreSnapshot, deleteSnapshot, downloadSnapshot,
    downloadVaultZip, restoreFromZipFile,
  } = useBackup(addToast, refreshData);

  return (
    <AppContext.Provider
      value={{
        vault,
        vaults,
        folders,
        currentFolder,
        inboxMode,
        setInboxMode,
        feedViewMode,
        setFeedViewMode,
        isKanbanMaterialsOpen,
        setIsKanbanMaterialsOpen,
        items,
        filteredItems,
        selectedItem,
        activeTypeFilter,
        activeTagFilter,
        aiItemFilter,
        applyAiFilter,
        clearAiFilter,
        isFullscreenEditorOpen,
        isSearchOpen,
        isSettingsOpen,
        isFolderModalOpen,
        folderModalParent,
        isFolderInfoModalOpen,
        folderInfoTarget,
        openFolderInfoModal,
        closeFolderInfoModal,
        renameFolder,
        isTriageModalOpen,
        aiSettings,
        toasts,
        chatMessages,
        isChatLoading,
        sendChatMessage,
        clearChatMessages,
        executeSuggestedAction,
        rejectAction,
        lightboxImages,
        activeLightboxIndex,
        openLightbox,
        closeLightbox,
        navigateLightbox,
        updateLightboxImage,
        sidebarWidth,
        rightPanelWidth,
        setSidebarWidth,
        setRightPanelWidth,
        contextMenu,
        openContextMenu,
        closeContextMenu,
        replyTarget,
        setReplyTarget,
        highlightedItemId,
        scrollToItem,
        navigateToFolder,
        setCurrentFolder,
        setActiveTypeFilter,
        setActiveTagFilter,
        isPinnedOnlyFilter,
        setIsPinnedOnlyFilter,
        togglePinnedOnlyFilter,
        setSelectedItem,
        setIsFullscreenEditorOpen,
        setIsSearchOpen,
        setIsSettingsOpen,
        toggleAssistant,
        settingsTab,
        setSettingsTab,
        openSettingsModal,
        isLogViewerOpen,
        setIsLogViewerOpen,
        openCreateFolderModal,
        closeFolderModal,
        setIsTriageModalOpen,
        isComposerModalOpen,
        composerModalOptions,
        openComposerModal,
        closeComposerModal,
        isFolderViewModalOpen,
        setIsFolderViewModalOpen,
        openFolderViewModal,
        closeFolderViewModal,
        sortBy,
        setSortBy,
        sortOrder,
        setSortOrder,
        hideCompletedTasks,
        setHideCompletedTasks,
        folderSettings,
        updateCurrentFolderViewSettings,
        resetCurrentFolderViewSettings,
        saveItem,
        updateItem,
        openNewNote,
        deleteItem,
        restoreFromTrash,
        toggleTaskComplete,
        completeTaskForever,
        moveItem,
        saveFolder,
        updateFolderDescription,
        deleteFolder,
        switchVault,
        createVault,
        deleteVault,
        pickVaultDirectory,
        revealVaultInExplorer,
        openFolderInExplorer,
        seedDemoData,
        isVaultModalOpen,
        openVaultModal,
        closeVaultModal,
        saveAiSettings,
        addToast,
        undoLastAction,
        removeToast,
        refreshData,
        confirmAction,
        confirmRequest,
        resolveConfirm,
        attachSheet,
        openAttachSheet,
        closeAttachSheet,
        backupSnapshots,
        backupSettings,
        refreshBackupSnapshots,
        createManualBackup,
        restoreSnapshot,
        deleteSnapshot,
        downloadSnapshot,
        downloadVaultZip,
        restoreFromZipFile,
        updateBackupSettings,
        isMobile,
        activeMobileTab,
        setActiveMobileTab,
        mobileActiveFolder,
        setMobileActiveFolder,
        mobileFolderInfoOpen,
        setMobileFolderInfoOpen,
        mobileActionSheetItem,
        setMobileActionSheetItem,
        mobileDockTabs,
        setMobileDockTabs,
        dismissTopLayer,
        toggleMobileMode,
        forceMobileMode,
        uiConfig,
        updateUiConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
