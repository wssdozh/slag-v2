// The single state hub: vault, folders, items, overlays, sync and every action.
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
import { logger } from '../lib/logger/logger';
import { normalizeAiSettings } from '../lib/ai/connections/settings';
import { aiKeySecretName, stripAiKeys } from '../lib/ai/connections/secrets';
import { deleteSecret, setSecret } from '../lib/platform/secretStore';
import { openAppFolder } from '../lib/platform/folderOpener';
import { isPrimaryWindow, listenDesktopEvents } from '../lib/platform/windowControls';
import { syncEngine } from '../lib/sync';
import { accountClient } from '../lib/sync/account';
import { useGlobalHotkeys } from '../hooks/ui/useGlobalHotkeys';
import { useLayerStack, type AppLayer } from '../hooks/ui/useLayerStack';
import { useSuggestedActions, type ActionHistoryEntry } from '../hooks/useSuggestedActions';
import { useOverlays } from './hooks/useOverlays';
import { defaultsToMobileLayout, useMobileNav } from './hooks/useMobileNav';
import { useFeedView } from './hooks/useFeedView';
import { useBackup } from './hooks/useBackup';
import { useAssistant } from './hooks/useAssistant';
import { useAppearance } from './hooks/useAppearance';
import { useItemWrites } from './hooks/useItemWrites';
import { useFolderAdmin } from './hooks/useFolderAdmin';
import { useVaults } from './hooks/useVaults';
import { useRecurringRollover } from './hooks/useRecurringRollover';
import { useNotifyArm } from './hooks/useNotifyArm';
import { useVaultWatch } from './hooks/useVaultWatch';
import { useAppUpdates } from './hooks/useAppUpdates';
import {
  STORAGE_KEYS,
  DEFAULT_INBOX_FOLDER,
} from '../config';
import { useLocalDay } from './hooks/useLocalDay';
import { setPref } from '../lib/storage/prefs';

const uiLog = logger.scope('UI');
const appLog = logger.scope('APP');

import type { AppContextType, FolderViewSection, FolderViewTarget } from './appContext.types';
export type { ToastMessage, AttachSheetRequest, ContextMenuTarget } from './appContext.types';

const AI_SETTINGS_KEY = STORAGE_KEYS.AI_SETTINGS;


export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialWorkspace] = useState(() => storage.getWorkspaceState());
  const [vault, setVault] = useState<VaultMeta>(() => storage.getCurrentVault());
  const [vaults, setVaults] = useState<VaultMeta[]>(() => storage.getVaults());
  const [folders, setFolders] = useState<FolderMeta[]>(() => storage.getFolders());
  const [startInInbox] = useState(() => defaultsToMobileLayout());
  const [currentFolder, setCurrentFolder] = useState(() => (
    !startInInbox && folders.some(f => f.path === initialWorkspace.currentFolder)
      ? initialWorkspace.currentFolder
      : DEFAULT_INBOX_FOLDER
  ));
  const [items, setItems] = useState<SlagItem[]>(() => storage.getItems());
  const today = useLocalDay();
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
    folderSettings, setFolderSettings,
    updateCurrentFolderViewSettings, resetCurrentFolderViewSettings,
  } = useFeedView(currentFolder, initialWorkspace, startInInbox);

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
    folderMoveTarget, openFolderMoveModal, closeFolderMoveModal,
    isVaultModalOpen, setIsVaultModalOpen, openVaultModal, closeVaultModal,
    isTriageModalOpen, setIsTriageModalOpen,
    isComposerModalOpen, setIsComposerModalOpen, composerModalOptions, setComposerModalOptions,
    openComposerModal, closeComposerModal,
    contextMenu, openContextMenu, closeContextMenu,
    toasts, addToast, removeToast, confirmRequest, resolveConfirm, confirmAction,
    attachSheet, openAttachSheet, closeAttachSheet,
  } = useOverlays(initialWorkspace);

  const [folderViewTarget, setFolderViewTarget] = useState<FolderViewTarget | null>(null);
  const [folderViewSection, setFolderViewSection] = useState<FolderViewSection>('main');
  const isFolderViewModalOpen = folderViewTarget !== null;
  const openFolderViewModal = useCallback((target: FolderViewTarget) => {
    setFolderViewSection('main');
    setFolderViewTarget(target);
  }, []);
  const closeFolderViewModal = useCallback(() => {
    folderViewTarget?.anchor.focus({ preventScroll: true });
    setFolderViewTarget(null);
  }, [folderViewTarget]);

  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  const selectMobileFolder = useCallback((folder: string) => {
    if (folder !== currentFolder) {
      setReplyTarget(null);
      setActiveTagFilter(null);
      clearAiFilter();
    }
    setCurrentFolder(folder);
  }, [currentFolder, setActiveTagFilter, clearAiFilter]);
  const {
    isMobile, forceMobileMode, toggleMobileMode,
    activeMobileTab, setActiveMobileTab,
    navigateMobileFolder, goBackFromMobileFolder, isMobileFolderOpen, mobileFolderDepth,
    isMobileFolderPickerOpen, setIsMobileFolderPickerOpen,
    mobileFolderInfoOpen, setMobileFolderInfoOpen,
    mobileActionSheetItem, setMobileActionSheetItem,
    mobileDockTabs, setMobileDockTabs,
  } = useMobileNav(initialWorkspace, currentFolder, selectMobileFolder, startInInbox);

  const {
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

  const refreshItems = useCallback(() => {
    setItems(storage.getItems());
  }, []);

  // Every write has to land in the hub, whoever made it. The editor's autosave writes straight
  // into `storage.saveItem` and returns through no action of ours, so a task marked done there
  // used to reach the feed only on the next reload. The storage layer already announces each
  // change; the provider owns the lists, so it re-reads on those events.
  //
  // Folders ride here too: the disk sweep is the only thing that sees a directory the MCP server
  // made, and without this a folder created outside the app would wait for the next restart.
  // Remote bundles stay out: the sync engine packs a whole burst into one `slag-sync-updated`,
  // and one render per bundle is the point of that event.
  useEffect(() => storage.subscribeChanges((event) => {
    if (event.origin === 'remote') return;
    if (event.kind === 'item') refreshItems();
    else if (event.kind === 'folder') setFolders(storage.getFolders());
  }), [refreshItems]);

  const vaultRead = storage.getCurrentVaultRead();
  const tasksReady = useRecurringRollover(vaultRead, today, refreshData);
  useNotifyArm(items, vault, tasksReady, vaultRead);
  // The disk can move without us: the MCP server, an outside editor. The sweep brings those notes
  // into the feed and reports a note that already changed under an edit about to be saved.
  useVaultWatch({ vault, addToast });
  const appUpdate = useAppUpdates(addToast, confirmAction);

  useEffect(() => {
    // One window owns the machine. The quick composer mounts this provider too (its composer
    // needs the same actions), so without the guard every boot ran two disk scans, armed every
    // reminder twice, polled the relay twice and wrote the note index from both windows.
    if (!isPrimaryWindow()) return;
    let cancelled = false;
    const openingRead = storage.getCurrentVaultRead();
    void openingRead.then(() => {
      if (cancelled || storage.getCurrentVaultRead() !== openingRead) return;
      refreshData();
      const itemCount = storage.getItems().length;
      requestAnimationFrame(() => appLog.info('Первый кадр после чтения хранилища', {
        fromBootMs: Math.round(performance.now()), itemCount,
      }));
      void syncEngine.init();
    }).catch((error: unknown) => appLog.error('Could not open vault', error));

    let pollingAt: string | undefined;
    const updatePolling = () => {
      const url = syncEngine.canUseVaultRelay() ? syncEngine.getConfig().serverUrl : undefined;
      if (url === pollingAt) return;
      pollingAt = url;
      if (url) accountClient.startPolling(url);
      else accountClient.stopPolling();
    };
    const unsubscribeSync = syncEngine.subscribe(updatePolling);
    let wasAuthenticated = accountClient.isAuthenticated();
    const unsubscribeAccount = accountClient.subscribe(() => {
      const isAuthenticated = accountClient.isAuthenticated();
      if (isAuthenticated === wasAuthenticated) return;
      wasAuthenticated = isAuthenticated;
      if (isAuthenticated) void syncEngine.init();
      else syncEngine.disconnect();
    });
    const cleanupDesktop = listenDesktopEvents({
      onOpenComposer: () => {
        openComposerModal();
      },
      onDataChanged: () => {
        refreshData();
        // The quick window has no engine of its own: its op waits in the shared outbox, and the
        // window that holds the socket is the one that has to drain it.
        syncEngine.scheduleDebouncedPush();
      },
    });

    return () => {
      cancelled = true;
      unsubscribeAccount();
      unsubscribeSync();
      accountClient.stopPolling();
      cleanupDesktop();
    };
  }, [refreshData, openComposerModal]);

  useEffect(() => {
    const notify = () => addToast('Не удалось сохранить общие настройки', 'error');
    window.addEventListener('slag-workspace-write-failed', notify);
    return () => window.removeEventListener('slag-workspace-write-failed', notify);
  }, [addToast]);

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
    { isOpen: isFolderViewModalOpen, close: () => {
      if (folderViewSection === 'main') closeFolderViewModal();
      else setFolderViewSection('main');
    }, depth: 0 },
    { isOpen: isVaultModalOpen, close: () => setIsVaultModalOpen(false) },
    { isOpen: folderMoveTarget !== null, close: closeFolderMoveModal },
    { isOpen: isTriageModalOpen, close: () => setIsTriageModalOpen(false) },
    { isOpen: isComposerModalOpen, close: () => { setIsComposerModalOpen(false); setComposerModalOptions(null); } },
    { isOpen: isSettingsOpen, close: () => setIsSettingsOpen(false) },
    { isOpen: isSearchOpen, close: () => setIsSearchOpen(false) },
    { isOpen: isFullscreenEditorOpen, close: () => { setIsFullscreenEditorOpen(false); setSelectedItem(null); } },
    { isOpen: isMobile && mobileFolderInfoOpen, close: () => setMobileFolderInfoOpen(false) },
    { isOpen: isMobile && isMobileFolderPickerOpen, close: () => setIsMobileFolderPickerOpen(false) },
    { isOpen: replyTarget !== null && (!isMobile || (activeMobileTab === 'folders' && isMobileFolderOpen)), close: () => setReplyTarget(null) },
    { isOpen: isMobile && activeMobileTab !== 'folders', close: () => setActiveMobileTab('folders') },
    { isOpen: isMobile && isMobileFolderOpen, depth: mobileFolderDepth, close: goBackFromMobileFolder },
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
    isOverlayOpen: () => Boolean(isFullscreenEditorOpen || isComposerModalOpen || isSearchOpen || isSettingsOpen || contextMenu || isMobileFolderPickerOpen),
  });

  // scrollToItem rides down into every card, so a new identity on each save kept the markdown
  // tree below it re-rendering. The live list and folder are read from a ref instead of the deps.
  const scrollLookupRef = useRef({ items, currentFolder });
  useEffect(() => {
    scrollLookupRef.current = { items, currentFolder };
  }, [items, currentFolder]);

  const scrollToItem = useCallback((idOrTitle: string) => {
    const { items: liveItems, currentFolder: liveFolder } = scrollLookupRef.current;
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
      liveItems.find(i => i.id === cleanQuery) ||
      liveItems.find(i => i.title.toLowerCase() === queryLower || i.title.toLowerCase() === nameLower) ||
      liveItems.find(i => {
        const baseFilename = (i.filename || '').replace(/\.md$/i, '').toLowerCase();
        return baseFilename === queryLower || baseFilename === nameLower;
      }) ||
      liveItems.find(i => i.title.toLowerCase().startsWith(queryLower) || i.title.toLowerCase().startsWith(nameLower)) ||
      liveItems.find(i => {
        const baseFilename = (i.filename || '').replace(/\.md$/i, '').toLowerCase();
        return baseFilename.startsWith(queryLower) || baseFilename.startsWith(nameLower);
      }) ||
      liveItems.find(i => i.title.toLowerCase().includes(nameLower));

    if (!found) {
      addToast(`Запись «${cleanQuery}» не найдена`, 'info');
      return;
    }

    if (liveFolder !== DEFAULT_INBOX_FOLDER && liveFolder !== found.folder && !found.folder.startsWith(liveFolder + '/')) {
      setCurrentFolder(found.folder);
    }

    // Set highlighted item. FeedList observes this and anchors with centered scroll
    setHighlightedItemId(found.id);

    // Keep highlight effect for 2.4s then clear
    setTimeout(() => {
      setHighlightedItemId(prev => (prev === found.id ? null : prev));
    }, 2400);
  }, [addToast, setCurrentFolder]);

  const navigateToFolder = useCallback((folder: string, itemId?: string) => {
    if (isMobile) navigateMobileFolder(folder);
    else setCurrentFolder(folder);
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
    setCurrentFolder,
    isMobile,
    navigateMobileFolder,
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
    const updated = normalizeAiSettings({ ...aiSettings, ...newSettings });
    setAiSettings(updated);
    // Keys never reach the settings file. If the secret store refuses one, the plaintext write is
    // the fallback: keeping the old behaviour is a smaller evil than losing a key the user pasted.
    const keepPlaintext = () => setPref(AI_SETTINGS_KEY, JSON.stringify(updated));
    const onSecretFailure = (error: unknown) => {
      uiLog.error('Could not persist an AI provider key in the secret store', { error });
      keepPlaintext();
    };
    setPref(AI_SETTINGS_KEY, JSON.stringify(stripAiKeys(updated)));
    const previousKeys = new Map(aiSettings.connections.map((c) => [c.id, c.apiKey.trim()]));
    for (const connection of updated.connections) {
      const apiKey = connection.apiKey.trim();
      if (apiKey === (previousKeys.get(connection.id) ?? '')) continue;
      void (apiKey
        ? setSecret(aiKeySecretName(connection.id), apiKey)
        : deleteSecret(aiKeySecretName(connection.id))
      ).catch(onSecretFailure);
    }
    for (const id of previousKeys.keys()) {
      if (updated.connections.some((connection) => connection.id === id)) continue;
      void deleteSecret(aiKeySecretName(id)).catch(onSecretFailure);
    }
    uiLog.info(`AI settings updated: connections=${updated.connections.length}, chat=${updated.roles.chat ?? 'off'}, vision=${updated.roles.vision ?? 'off'}`);
    addToast('Настройки сохранены', 'success');
  };

  const {
    saveItem, openNewNote, updateItem, deleteItem, restoreFromTrash, moveItem,
    toggleTaskComplete, completeTaskForever,
  } = useItemWrites({
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
    saveFolder, updateFolderDescription, renameFolder, moveFolder, deleteFolder,
    openCreateFolderModal, closeFolderModal,
  } = useFolderAdmin({
    currentFolder, setCurrentFolder, refreshData, addToast,
    setIsFolderModalOpen, setFolderModalParent,
  });

  const {
    switchVault, createVault, deleteVault, pickVaultDirectory, revealVaultInExplorer,
  } = useVaults({
    vault, setVault, setVaults, setFolders, setItems,
    setCurrentFolder, setFeedViewMode, setInboxMode, setActiveTypeFilter,
    setActiveTagFilter, setActiveMobileTab, setIsMobileFolderPickerOpen, setIsKanbanMaterialsOpen,
    setSortBy, setSortOrder, setFolderSettings,
    setChatMessages, setSelectedItem, refreshData, addToast,
  });

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
        today,
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
        folderMoveTarget,
        openFolderMoveModal,
        closeFolderMoveModal,
        renameFolder,
        moveFolder,
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
        folderViewTarget,
        folderViewSection,
        setFolderViewSection,
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
        goBackFromMobileFolder,
        isMobileFolderOpen,
        isMobileFolderPickerOpen,
        setIsMobileFolderPickerOpen,
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
        appUpdate,
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
