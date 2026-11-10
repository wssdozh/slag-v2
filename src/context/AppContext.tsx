/* oxlint-disable react/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  ReplyTarget,
  SlagItem,
  SlagAttachment,
  FolderMeta,
  VaultMeta,
  AiSettings,
  SlagItemType,
  SlagItemStatus,
  InboxMode,
  LightboxImage,
  FeedViewMode,
  AiItemFilter,
  ChatMessage,
  SuggestedAction,
  MobileTabId,
  AppUiConfig,
  DeviceUiConfig,
  BackupSnapshotMeta,
  BackupSettings,
  SortField,
  SortOrder,
  FolderViewSettings,
  ConfirmOptions,
} from '../types';
import { storage } from '../lib/storage';
import { applyTaskCompletion } from '../lib/taskCompletion';
import { backupService } from '../lib/backupService';
import { sendAssistantChat } from '../lib/aiService';
import { logger } from '../lib/logger';
import { openAppFolder } from '../lib/folderOpener';
import { listenDesktopEvents, isDesktopApp, isMobilePlatform } from '../lib/windowControls';
import { syncEngine } from '../lib/sync';
import { accountClient } from '../lib/sync/account';
import { useIsMobile } from '../hooks/layout/useIsMobile';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { useLayerStack, type AppLayer } from '../hooks/useLayerStack';
import { useSuggestedActions, type ActionHistoryEntry } from '../hooks/useSuggestedActions';
import { crossFade, swapScreen, type ScreenSwap } from '../lib/motion';
import { getFontScaleMultiplier, getFontFamilyConfig } from '../config/typography';
import type { SettingsTabId } from '../config/settingsTabs';
import {
  STORAGE_KEYS,
  DEFAULT_INBOX_FOLDER,
  UI_LAYOUT,
  UI_BREAKPOINTS,
  ACCENT_COLORS,
  AI_ENDPOINTS,
  DEFAULT_AI_MODELS,
} from '../config';
import {
  evaluateRecurringTasks,
  getISODateString,
} from '../lib/time/recurrenceHelper';
import {
  parseSubtasksFromContent,
  toggleCheckboxInContent,
  setAllCheckboxesInContent,
} from '../lib/taskUtils';

const uiLog = logger.scope('UI');
const appLog = logger.scope('APP');

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
  action?: {
    kind: 'undo' | 'restore';
    label: string;
    onClick: () => void;
  };
}

/** A surface asking for attachments: it passes only the place they should land. */
export interface AttachSheetRequest {
  onAdd: (attachments: SlagAttachment[]) => void;
}

export interface ContextMenuTarget {
  x: number;
  y: number;
  type: 'item' | 'folder' | 'feed';
  item?: SlagItem;
  folder?: FolderMeta;
}

interface AppContextType {
  vault: VaultMeta;
  vaults: VaultMeta[];
  folders: FolderMeta[];
  currentFolder: string;
  inboxMode: InboxMode;
  setInboxMode: (mode: InboxMode) => void;
  feedViewMode: FeedViewMode;
  setFeedViewMode: (mode: FeedViewMode | ((prev: FeedViewMode) => FeedViewMode)) => void;
  isKanbanMaterialsOpen: boolean;
  setIsKanbanMaterialsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  items: SlagItem[];
  filteredItems: SlagItem[];
  selectedItem: SlagItem | null;
  activeTypeFilter: SlagItemType | 'all';
  activeTagFilter: string | null;
  isPinnedOnlyFilter: boolean;
  setIsPinnedOnlyFilter: (active: boolean) => void;
  togglePinnedOnlyFilter: () => void;
  aiItemFilter: AiItemFilter | null;
  applyAiFilter: (itemIds: string[], queryLabel: string) => void;
  clearAiFilter: () => void;
  isFullscreenEditorOpen: boolean;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;
  toggleAssistant: () => void;
  isLogViewerOpen: boolean;
  isFolderModalOpen: boolean;
  folderModalParent: string | null;
  isTriageModalOpen: boolean;
  aiSettings: AiSettings;
  toasts: ToastMessage[];

  // Assistant Chat State
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  sendChatMessage: (text: string) => Promise<void>;
  clearChatMessages: () => void;
  executeSuggestedAction: (action: SuggestedAction, messageId?: string) => SlagItem | void;
  rejectAction: (messageId: string) => void;

  // Lightbox Gallery
  lightboxImages: LightboxImage[];
  activeLightboxIndex: number | null;
  openLightbox: (images: LightboxImage[], index?: number) => void;
  closeLightbox: () => void;
  navigateLightbox: (newIndex: number) => void;
  updateLightboxImage: (id: string, updates: Partial<LightboxImage>) => void;

  // Layout & Resizing
  sidebarWidth: number;
  rightPanelWidth: number;
  setSidebarWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;

  // Context Menu
  contextMenu: ContextMenuTarget | null;
  openContextMenu: (target: ContextMenuTarget) => void;
  closeContextMenu: () => void;

  // Replies & Linking
  replyTarget: ReplyTarget | null;
  setReplyTarget: (target: ReplyTarget | null) => void;
  highlightedItemId: string | null;
  scrollToItem: (idOrTitle: string) => void;
  navigateToFolder: (folder: string, itemId?: string) => void;

  // Actions
  setCurrentFolder: (folder: string) => void;
  setActiveTypeFilter: (type: SlagItemType | 'all') => void;
  setActiveTagFilter: (tag: string | null) => void;
  setSelectedItem: (item: SlagItem | null) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  setIsSearchOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  settingsTab: SettingsTabId;
  setSettingsTab: (tab: SettingsTabId) => void;
  openSettingsModal: (tab?: SettingsTabId) => void;
  setIsLogViewerOpen: (open: boolean) => void;
  openCreateFolderModal: (parentPath?: string) => void;
  closeFolderModal: () => void;
  isFolderInfoModalOpen: boolean;
  folderInfoTarget: string | null;
  openFolderInfoModal: (folderPath?: string) => void;
  closeFolderInfoModal: () => void;
  renameFolder: (oldPath: string, updatedFolder: FolderMeta) => void;
  setIsTriageModalOpen: (open: boolean) => void;
  isComposerModalOpen: boolean;
  composerModalOptions: { type?: SlagItemType; status?: SlagItemStatus; folder?: string; dueDate?: string; reminder?: string } | null;
  openComposerModal: (options?: { type?: SlagItemType; status?: SlagItemStatus; folder?: string; dueDate?: string; reminder?: string }) => void;
  closeComposerModal: () => void;

  // Folder View & Filter Settings (Todoist / Linear style)
  isFolderViewModalOpen: boolean;
  setIsFolderViewModalOpen: (open: boolean) => void;
  openFolderViewModal: () => void;
  closeFolderViewModal: () => void;
  sortBy: SortField;
  setSortBy: (sort: SortField) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  hideCompletedTasks: boolean;
  setHideCompletedTasks: (hide: boolean) => void;
  folderSettings: Record<string, FolderViewSettings>;
  updateCurrentFolderViewSettings: (partial: Partial<FolderViewSettings>) => void;
  resetCurrentFolderViewSettings: () => void;
  
  // Storage operations
  saveItem: (item: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }) => SlagItem;
  updateItem: (item: SlagItem) => void;
  openNewNote: (folder: string) => void;
  deleteItem: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  toggleTaskComplete: (itemId: string, subtaskId?: string) => void;
  completeTaskForever: (itemId: string) => void;
  moveItem: (itemId: string, targetFolder: string) => void;
  saveFolder: (folder: FolderMeta) => void;
  updateFolderDescription: (path: string, description: string) => void;
  deleteFolder: (path: string) => void;
  switchVault: (vaultId: string) => void;
  createVault: (name: string, mode?: 'indexeddb' | 'fsa' | 'tauri', path?: string, id?: string) => void;
  deleteVault: (vaultId: string) => void;
  pickVaultDirectory: () => Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null>;
  revealVaultInExplorer: () => Promise<void>;
  openFolderInExplorer: (folderPath: string) => Promise<void>;
  seedDemoData: () => void;
  isVaultModalOpen: boolean;
  openVaultModal: () => void;
  closeVaultModal: () => void;
  saveAiSettings: (settings: Partial<AiSettings>) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: ToastMessage['action']) => void;
  undoLastAction: () => boolean;
  removeToast: (id: string) => void;
  refreshData: () => void;

  // The app's own question for irreversible actions, instead of window.confirm
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
  confirmRequest: ConfirmOptions | null;
  resolveConfirm: (confirmed: boolean) => void;

  // Attaching media: one sheet, the surface only says where the result lands
  attachSheet: AttachSheetRequest | null;
  openAttachSheet: (onAdd: (attachments: SlagAttachment[]) => void) => void;
  closeAttachSheet: () => void;

  // Backup operations & state
  backupSnapshots: BackupSnapshotMeta[];
  backupSettings: BackupSettings;
  refreshBackupSnapshots: () => Promise<void>;
  createManualBackup: () => Promise<BackupSnapshotMeta | null>;
  restoreSnapshot: (id: string) => Promise<boolean>;
  deleteSnapshot: (id: string) => Promise<void>;
  downloadSnapshot: (id: string) => Promise<boolean>;
  downloadVaultZip: () => Promise<string>;
  restoreFromZipFile: (file: File) => Promise<{ itemsCount: number; attachmentsCount: number }>;
  updateBackupSettings: (settings: Partial<BackupSettings>) => void;

  // Mobile Navigation & Touch Actions
  isMobile: boolean;
  activeMobileTab: MobileTabId;
  setActiveMobileTab: React.Dispatch<React.SetStateAction<MobileTabId>>;
  mobileActiveFolder: string | null;
  setMobileActiveFolder: (folder: string | null) => void;
  mobileFolderInfoOpen: boolean;
  setMobileFolderInfoOpen: (open: boolean) => void;
  mobileActionSheetItem: SlagItem | null;
  setMobileActionSheetItem: (item: SlagItem | null) => void;
  mobileDockTabs: MobileTabId[];
  setMobileDockTabs: (tabs: MobileTabId[]) => void;
  dismissTopLayer: () => boolean;
  toggleMobileMode: () => void;
  forceMobileMode: boolean | null;
  uiConfig: AppUiConfig;
  updateUiConfig: (device: 'desktop' | 'mobile', updates: Partial<DeviceUiConfig>) => void;
}

const AI_SETTINGS_KEY = STORAGE_KEYS.AI_SETTINGS;
const SIDEBAR_WIDTH_KEY = STORAGE_KEYS.SIDEBAR_WIDTH;
const RIGHT_PANEL_WIDTH_KEY = STORAGE_KEYS.RIGHT_PANEL_WIDTH;
const MOBILE_DOCK_TABS_KEY = STORAGE_KEYS.MOBILE_DOCK_TABS;
const UI_CONFIG_KEY = STORAGE_KEYS.UI_CONFIG;

const DEFAULT_UI_CONFIG: AppUiConfig = {
  desktop: {
    fontScale: 'normal',
    density: 'normal',
    fontFamily: 'inter',
    accent: 'blue',
  },
  mobile: {
    fontScale: 'normal',
    density: 'spacious',
    fontFamily: 'inter',
    accent: 'blue',
  },
};

const DEFAULT_MOBILE_DOCK_TABS: MobileTabId[] = ['folders', 'tasks', 'assistant', 'settings'];

const DEFAULT_AI_SETTINGS: AiSettings = {
  sourceMode: 'subscription',
  subscriptionModel: 'fast',
  provider: 'groq',
  groqApiKey: '',
  kieApiKey: '',
  kieBaseUrl: AI_ENDPOINTS.DEFAULT_KIE_BASE_URL,
  geminiApiKey: '',
  model: DEFAULT_AI_MODELS.GROQ_DEFAULT,
  reasoningEffort: 'low',
  autoTagging: true,
  autoTriage: true,
  webSearchEnabled: false,
  maxTagsPerNote: 3,
  allowNewTags: true,
  tagCaseStyle: 'lowercase',
};

export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialWorkspace] = useState(() => storage.getWorkspaceState());
  const [vault, setVault] = useState<VaultMeta>(storage.getCurrentVault());
  const [vaults, setVaults] = useState<VaultMeta[]>(storage.getVaults());
  const [folders, setFolders] = useState<FolderMeta[]>(() => storage.getFolders());
  const initialCurFolder = storage.getFolders().some(f => f.path === initialWorkspace.currentFolder)
    ? initialWorkspace.currentFolder
    : DEFAULT_INBOX_FOLDER;
  const initialFolderSetting = (initialWorkspace.folderSettings || {})[initialCurFolder];

  const [currentFolder, setCurrentFolder] = useState<string>(initialCurFolder);
  const [inboxMode, setInboxMode] = useState<InboxMode>(() => initialFolderSetting?.inboxMode || initialWorkspace.inboxMode || 'all');
  const [feedViewMode, setFeedViewMode] = useState<FeedViewMode>(() => initialFolderSetting?.viewMode || initialWorkspace.feedViewMode || 'feed');
  const [isKanbanMaterialsOpen, setIsKanbanMaterialsOpen] = useState<boolean>(() => {
    if (typeof initialWorkspace.isKanbanMaterialsOpen === 'boolean') {
      return initialWorkspace.isKanbanMaterialsOpen;
    }
    const isMobileInitial = typeof window !== 'undefined' && (window.innerWidth < UI_BREAKPOINTS.MOBILE || isMobilePlatform());
    return !isMobileInitial;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => storage.getAssistantHistory());
  const [isChatLoading, setIsChatLoading] = useState(false);
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
  const [folderSettings, setFolderSettings] = useState<Record<string, FolderViewSettings>>(
    () => initialWorkspace.folderSettings || {}
  );

  const [activeTypeFilter, setActiveTypeFilter] = useState<SlagItemType | 'all'>(() => initialFolderSetting?.typeFilter || initialWorkspace.activeTypeFilter || 'all');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(() => initialWorkspace.activeTagFilter ?? null);
  const [isPinnedOnlyFilter, setIsPinnedOnlyFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortField>(() => initialFolderSetting?.sortBy || initialWorkspace.sortBy || 'createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => initialFolderSetting?.sortOrder || initialWorkspace.sortOrder || 'asc');
  const [hideCompletedTasks, setHideCompletedTasks] = useState<boolean>(() => initialFolderSetting?.hideCompletedTasks ?? initialWorkspace.hideCompletedTasks ?? false);
  const [isFolderViewModalOpen, setIsFolderViewModalOpen] = useState(false);
  const [aiItemFilter, setAiItemFilter] = useState<AiItemFilter | null>(null);

  const togglePinnedOnlyFilter = useCallback(() => {
    setIsPinnedOnlyFilter(prev => !prev);
  }, []);

  // Restore folder-specific view settings & reset ephemeral pinned filter whenever switching folders (React pure adjustment pattern)
  const [prevFolderForFolderSettings, setPrevFolderForFolderSettings] = useState(currentFolder);
  if (prevFolderForFolderSettings !== currentFolder) {
    setPrevFolderForFolderSettings(currentFolder);
    setIsPinnedOnlyFilter(false);

    const saved = folderSettings[currentFolder];
    if (saved) {
      setFeedViewMode(saved.viewMode);
      setActiveTypeFilter(saved.typeFilter);
      if (saved.inboxMode) setInboxMode(saved.inboxMode);
      setSortBy(saved.sortBy);
      setSortOrder(saved.sortOrder);
      setHideCompletedTasks(saved.hideCompletedTasks ?? false);
    } else {
      setFeedViewMode('feed');
      setActiveTypeFilter('all');
      if (currentFolder === DEFAULT_INBOX_FOLDER) {
        setInboxMode('all');
      }
      setSortBy('createdAt');
      setSortOrder('asc');
      setHideCompletedTasks(false);
    }
  }

  const applyAiFilter = useCallback((itemIds: string[], queryLabel: string) => {
    setAiItemFilter({ itemIds, queryLabel });
  }, []);

  const clearAiFilter = useCallback(() => {
    setAiItemFilter(null);
  }, []);

  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((images: LightboxImage[], index: number = 0) => {
    setLightboxImages(images);
    setActiveLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setActiveLightboxIndex(null);
    setLightboxImages([]);
  }, []);

  const navigateLightbox = useCallback((newIndex: number) => {
    setActiveLightboxIndex(newIndex);
  }, []);

  const updateLightboxImage = useCallback((id: string, updates: Partial<LightboxImage>) => {
    setLightboxImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img));
  }, []);
  
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState<boolean>(() => {
    const fsState = initialWorkspace.fullscreenEditorState;
    if (fsState?.isOpen && fsState.itemId) {
      const rawItems = storage.getItems();
      return rawItems.some(it => it.id === fsState.itemId) || fsState.itemId.startsWith('draft_');
    }
    return false;
  });
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('account');

  const openSettingsModal = useCallback((tab?: SettingsTabId) => {
    if (tab) setSettingsTab(tab);
    setIsSettingsOpen(true);
  }, []);

  const [isLogViewerOpen, setIsLogViewerOpen] = useState<boolean>(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [folderModalParent, setFolderModalParent] = useState<string | null>(null);
  const [isFolderInfoModalOpen, setIsFolderInfoModalOpen] = useState<boolean>(false);
  const [folderInfoTarget, setFolderInfoTarget] = useState<string | null>(null);

  const openFolderInfoModal = useCallback((folderPath?: string) => {
    setFolderInfoTarget(folderPath || currentFolder);
    setIsFolderInfoModalOpen(true);
  }, [currentFolder]);

  const closeFolderInfoModal = useCallback(() => {
    setIsFolderInfoModalOpen(false);
    setFolderInfoTarget(null);
  }, []);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState<boolean>(false);
  const openVaultModal = useCallback(() => {
    setIsVaultModalOpen(true);
  }, []);
  const closeVaultModal = useCallback(() => {
    setIsVaultModalOpen(false);
  }, []);
  const [isTriageModalOpen, setIsTriageModalOpen] = useState<boolean>(false);
  const [isComposerModalOpen, setIsComposerModalOpen] = useState<boolean>(false);
  const [composerModalOptions, setComposerModalOptions] = useState<{
    type?: SlagItemType;
    status?: SlagItemStatus;
    folder?: string;
    dueDate?: string;
    reminder?: string;
  } | null>(null);

  const openComposerModal = useCallback((options?: {
    type?: SlagItemType;
    status?: SlagItemStatus;
    folder?: string;
    dueDate?: string;
    reminder?: string;
  }) => {
    setComposerModalOptions(options || null);
    setIsComposerModalOpen(true);
  }, []);

  const closeComposerModal = useCallback(() => {
    setIsComposerModalOpen(false);
    setComposerModalOptions(null);
  }, []);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // Resizable panel widths
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Number(saved) : 256;
  });

  const [rightPanelWidth, setRightPanelWidthState] = useState<number>(() => {
    const saved = localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
    return saved ? Number(saved) : 288;
  });

  const setSidebarWidth = (w: number) => {
    const clamped = Math.max(UI_LAYOUT.SIDEBAR_MIN_WIDTH, Math.min(UI_LAYOUT.SIDEBAR_MAX_WIDTH, w));
    setSidebarWidthState(clamped);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  };

  const setRightPanelWidth = (w: number) => {
    const clamped = Math.max(UI_LAYOUT.RIGHT_PANEL_MIN_WIDTH, Math.min(UI_LAYOUT.RIGHT_PANEL_MAX_WIDTH, w));
    setRightPanelWidthState(clamped);
    localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(clamped));
  };

  // Mobile navigation & touch state: desktop and standalone popouts never default to phone layout
  const isMobileScreen = useIsMobile(UI_BREAKPOINTS.MOBILE);
  const [forceMobileMode, setForceMobileMode] = useState<boolean | null>(null);
  const isDesktop = isDesktopApp();
  const isStandalone = typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('panel'));
  const isMobile = !isStandalone && (forceMobileMode !== null ? forceMobileMode : (isMobilePlatform() || (!isDesktop && isMobileScreen)));

  const toggleMobileMode = useCallback(() => {
    setForceMobileMode(prev => {
      if (prev === null) return !isMobileScreen;
      return !prev;
    });
  }, [isMobileScreen]);

  const [activeMobileTab, setActiveMobileTabState] = useState<MobileTabId>(() => initialWorkspace.activeMobileTab || 'folders');
  const [mobileActiveFolder, setMobileActiveFolderState] = useState<string | null>(null);
  const [mobileFolderInfoOpen, setMobileFolderInfoOpenState] = useState<boolean>(false);
  const [mobileActionSheetItem, setMobileActionSheetItem] = useState<SlagItem | null>(null);
  const [mobileDockTabs, setMobileDockTabsState] = useState<MobileTabId[]>(() => {
    try {
      const saved = localStorage.getItem(MOBILE_DOCK_TABS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return DEFAULT_MOBILE_DOCK_TABS;
  });

  const setMobileDockTabs = useCallback((tabs: MobileTabId[]) => {
    setMobileDockTabsState(tabs);
    try {
      localStorage.setItem(MOBILE_DOCK_TABS_KEY, JSON.stringify(tabs));
    } catch {
      // Ignore
    }
  }, []);

  // Tabs are peers (cross-fade or directional slide), entering a folder is a push, leaving is a pop.
  // The depth and active tab live in refs so setters stay stable for the dock and Escape.
  const mobileFolderRef = useRef<string | null>(null);
  const activeTabRef = useRef<MobileTabId>(initialWorkspace.activeMobileTab || 'folders');
  useEffect(() => {
    activeTabRef.current = activeMobileTab;
  }, [activeMobileTab]);

  const folderDepth = (path: string | null) => (path ? path.split('/').length : 0);

  const setActiveMobileTab = useCallback((next: React.SetStateAction<MobileTabId>) => {
    const prev = activeTabRef.current;
    const resolvedNext = typeof next === 'function' ? next(prev) : next;
    const prevIdx = mobileDockTabs.indexOf(prev);
    const nextIdx = mobileDockTabs.indexOf(resolvedNext);
    const kind: ScreenSwap =
      prevIdx !== -1 && nextIdx !== -1 && prevIdx !== nextIdx
        ? nextIdx > prevIdx ? 'tab-next' : 'tab-prev'
        : 'tab';

    swapScreen(kind, () => setActiveMobileTabState(resolvedNext));
  }, [mobileDockTabs]);

  const setMobileActiveFolder = useCallback((folder: string | null) => {
    const previous = mobileFolderRef.current;
    mobileFolderRef.current = folder;
    // Depth decides the direction: deeper is a push, shallower a pop, and a sibling
    // folder is a lateral move, not a step back.
    const previousDepth = previous === null ? 0 : folderDepth(previous);
    const nextDepth = folder === null ? 0 : folderDepth(folder);
    const kind: ScreenSwap =
      folder === null || nextDepth < previousDepth
        ? 'pop'
        : previous === null || nextDepth > previousDepth
          ? 'push'
          : 'tab';
    swapScreen(kind, () => {
      setMobileActiveFolderState(folder);
      if (folder) {
        setCurrentFolder(folder);
      }
    });
  }, []);

  const setMobileFolderInfoOpen = useCallback((open: boolean) => {
    swapScreen(open ? 'push' : 'pop', () => setMobileFolderInfoOpenState(open));
  }, []);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // One pending question at a time. The resolver lives in a ref so a re-render cannot drop it.
  const [confirmRequest, setConfirmRequest] = useState<ConfirmOptions | null>(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const resolveConfirm = useCallback((confirmed: boolean) => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirmAction = useCallback((options: ConfirmOptions) => {
    // A second question replaces the first: answering the stale one would answer the wrong thing.
    confirmResolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmRequest(options);
    });
  }, []);

  const [attachSheet, setAttachSheet] = useState<AttachSheetRequest | null>(null);
  const openAttachSheet = useCallback((onAdd: (attachments: SlagAttachment[]) => void) => {
    setAttachSheet({ onAdd });
  }, []);
  const closeAttachSheet = useCallback(() => setAttachSheet(null), []);

  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    try {
      const saved = localStorage.getItem(AI_SETTINGS_KEY);
      return saved ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(saved) } : DEFAULT_AI_SETTINGS;
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  });

  const [uiConfig, setUiConfig] = useState<AppUiConfig>(() => {
    try {
      const saved = localStorage.getItem(UI_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          desktop: { ...DEFAULT_UI_CONFIG.desktop, ...parsed.desktop },
          mobile: { ...DEFAULT_UI_CONFIG.mobile, ...parsed.mobile },
        };
      }
      return DEFAULT_UI_CONFIG;
    } catch {
      return DEFAULT_UI_CONFIG;
    }
  });

  const updateUiConfig = useCallback((device: 'desktop' | 'mobile', updates: Partial<DeviceUiConfig>) => {
    setUiConfig(prev => {
      const next: AppUiConfig = {
        ...prev,
        [device]: {
          ...prev[device],
          ...updates,
        },
      };
      try {
        localStorage.setItem(UI_CONFIG_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Dynamically apply density, font and accent CSS properties to document root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const currentDevice = isMobile ? 'mobile' : 'desktop';
    const cfg = uiConfig[currentDevice];

    document.documentElement.dataset.density = cfg.density;

    const scaleNum = getFontScaleMultiplier(cfg.fontScale);
    document.documentElement.style.setProperty('--slag-font-scale', String(scaleNum));

    const fontCfg = getFontFamilyConfig(cfg.fontFamily);
    document.documentElement.style.setProperty('--slag-font-sans', fontCfg.cssSans);
    document.documentElement.style.setProperty('--slag-font-mono', fontCfg.cssMono);

    // One hex repaints the whole accent family: theme.css derives strong/subtle/media from it.
    const accent = ACCENT_COLORS[cfg.accent] ?? ACCENT_COLORS.blue;
    document.documentElement.style.setProperty('--color-accent', accent.hex);
  }, [isMobile, uiConfig]);

  // Action History Stack for Undo capability (up to 20 snapshots)
  const actionHistoryRef = useRef<ActionHistoryEntry[]>([]);

  const addToast = useCallback((
    text: string,
    type: 'info' | 'success' | 'error' = 'info',
    action?: ToastMessage['action']
  ) => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev.slice(-2), { id, text, type, action }]);
    logger.log(type === 'error' ? 'error' : 'info', 'UI', `Toast: ${text}`);
  }, []);

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

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshData = useCallback(() => {
    setVault(storage.getCurrentVault());
    setVaults(storage.getVaults());
    setFolders(storage.getFolders());
    setItems(storage.getItems());
  }, []);

  const runRecurringEvaluation = useCallback(() => {
    const currentItems = storage.getItems();
    const { updatedItems, changedCount } = evaluateRecurringTasks(currentItems);
    if (changedCount > 0) {
      storage.saveItems(updatedItems);
      refreshData();
      appLog.info(`Recurring tasks evaluated: ${changedCount} tasks rolled over/respawned`);
    }
  }, [refreshData]);

  // Midnight transition and tab visibility wakeup listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timerId: number | undefined;

    const scheduleMidnightCheck = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const delayMs = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timerId = window.setTimeout(() => {
        runRecurringEvaluation();
        scheduleMidnightCheck();
      }, delayMs);
    };

    scheduleMidnightCheck();

    let lastCheckedDate = getISODateString(new Date());
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentDate = getISODateString(new Date());
        if (currentDate !== lastCheckedDate) {
          lastCheckedDate = currentDate;
          runRecurringEvaluation();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runRecurringEvaluation]);

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

  // Assistant history persistence in Vault
  useEffect(() => {
    storage.saveAssistantHistory(chatMessages);
  }, [chatMessages]);

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

  const openContextMenu = useCallback((target: ContextMenuTarget) => {
    setContextMenu(target);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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

  const saveItem = useCallback((itemData: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }): SlagItem => {
    const newItem: SlagItem = {
      id: itemData.id || 'item_' + Date.now(),
      type: itemData.type,
      title: itemData.title,
      content: itemData.content,
      folder: itemData.folder || currentFolder,
      tags: itemData.tags || [],
      attachments: itemData.attachments || [],
      createdAt: itemData.createdAt || Date.now(),
      updatedAt: Date.now(),
      isPinned: itemData.isPinned || false,
      isArchived: itemData.isArchived || false,
      status: itemData.status || (itemData.type === 'task' ? 'todo' : undefined),
      kanbanColumn: itemData.kanbanColumn,
      priority: itemData.priority || (itemData.type === 'task' ? 'none' : undefined),
      dueDate: itemData.dueDate,
      reminder: itemData.reminder,
      duration: itemData.duration,
      recurrence: itemData.recurrence,
      subtasks: itemData.subtasks || [],
      readingTimeMinutes: itemData.readingTimeMinutes || (itemData.type === 'article' ? Math.max(1, Math.round(itemData.content.split(/\s+/).length / 200)) : undefined),
      summary: itemData.summary,
      replyToId: itemData.replyToId,
      linkedItemIds: itemData.linkedItemIds,
    };

    const saved = storage.saveItem(newItem);
    refreshData();
    return saved;
  }, [currentFolder, refreshData]);

  const openNewNote = useCallback((folder: string) => {
    const now = Date.now();
    setSelectedItem({
      id: 'draft_' + now, title: '', content: '', type: 'note',
      folder: folder || DEFAULT_INBOX_FOLDER, tags: [], attachments: [], createdAt: now, updatedAt: now,
    });
    setIsFullscreenEditorOpen(true);
  }, []);

  const updateItem = useCallback((item: SlagItem) => {
    const previous = storage.getItems().find(existing => existing.id === item.id);
    const updated = previous ? applyTaskCompletion(previous, item) : item;
    const saved = storage.saveItem(updated);
    if (selectedItem?.id === item.id) {
      setSelectedItem(saved);
    }
    refreshData();
  }, [selectedItem, refreshData]);

  const deleteItem = useCallback((id: string) => {
    storage.deleteItem(id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
    refreshData();
    // Единственный источник уведомления об удалении: слой модели, а не каждый вызывающий.
    addToast('Запись в корзине', 'info', {
      kind: 'restore',
      label: 'Вернуть',
      onClick: () => {
        storage.restoreFromTrash(id);
        refreshData();
      },
    });
  }, [selectedItem, refreshData, addToast]);

  const restoreFromTrash = useCallback((id: string) => {
    const restored = storage.restoreFromTrash(id);
    if (restored) {
      uiLog.info(`Restored note "${restored.title || id}" from .trash to "${restored.folder}"`, {
        itemId: id,
        folder: restored.folder,
      });
      refreshData();
      addToast(`Запись «${restored.title}» восстановлена`, 'success');
    }
  }, [refreshData, addToast]);

  const moveItem = useCallback((itemId: string, targetFolder: string) => {
    const item = items.find(i => i.id === itemId);
    const prevFolder = item?.folder || DEFAULT_INBOX_FOLDER;
    uiLog.info(`Moved note "${item?.title || itemId}" to folder "${targetFolder}"`, {
      itemId,
      title: item?.title,
      from: prevFolder,
      to: targetFolder,
    });
    storage.moveItem(itemId, targetFolder);
    refreshData();
    addToast(`Перемещено в «${targetFolder}»`, 'success');
  }, [items, refreshData, addToast]);

  const toggleTaskComplete = useCallback((itemId: string, subtaskId?: string) => {
    const item = storage.getItems().find(i => i.id === itemId);
    if (!item) return;

    if (subtaskId && (item.subtasks || item.content)) {
      const currentSubtasks = item.subtasks && item.subtasks.length > 0
        ? item.subtasks
        : parseSubtasksFromContent(item.content);

      let updatedContent = item.content;
      if (updatedContent && /^\s*[-*+]\s*\[[ xX]\]/m.test(updatedContent)) {
        updatedContent = toggleCheckboxInContent(updatedContent, subtaskId, currentSubtasks);
      }

      const parsed = parseSubtasksFromContent(updatedContent);
      const updatedSubtasks = parsed.length > 0
        ? parsed
        : currentSubtasks.map(st => (st.id === subtaskId ? { ...st, completed: !st.completed } : st));

      const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every(st => st.completed);
      const newStatus = allDone ? 'done' : item.status === 'done' ? 'in_progress' : item.status;

      updateItem({
        ...item,
        content: updatedContent,
        subtasks: updatedSubtasks,
        status: newStatus,
      });
    } else {
      const isCurrentlyDone = item.status === 'done';
      const newStatus = isCurrentlyDone ? 'todo' : 'done';
      const updatedContent = setAllCheckboxesInContent(item.content, newStatus === 'done');
      const parsed = parseSubtasksFromContent(updatedContent);
      const updatedSubtasks = parsed.length > 0
        ? parsed
        : item.subtasks?.map(st => ({
            ...st,
            completed: newStatus === 'done',
          }));

      updateItem({
        ...item,
        content: updatedContent,
        status: newStatus,
        subtasks: updatedSubtasks,
      });

      if (newStatus === 'done') {
        const completed = storage.getItems().find(existing => existing.id === itemId);
        const toastText = item.recurrence && completed && completed.streak !== undefined
          ? `Таска выполнена (🔥 ${completed.streak})`
          : 'Таска выполнена';
        addToast(toastText, 'success');
      } else {
        addToast('Таска возобновлена', 'info');
      }
    }
  }, [updateItem, addToast]);

  const completeTaskForever = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updatedContent = setAllCheckboxesInContent(item.content, true);
    const parsed = parseSubtasksFromContent(updatedContent);
    const updatedSubtasks = parsed.length > 0
      ? parsed
      : item.subtasks?.map(st => ({
          ...st,
          completed: true,
        }));

    updateItem({
      ...item,
      content: updatedContent,
      subtasks: updatedSubtasks,
      status: 'done',
      recurrence: undefined,
    });
    addToast('Задача навсегда завершена', 'success');
  }, [items, updateItem, addToast]);

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

  const sendChatMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: userText.trim(),
      createdAt: Date.now(),
    };

    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setIsChatLoading(true);

    try {
      const response = await sendAssistantChat({
        messages: newHistory.map(m => {
          let content = m.content || '';
          const actionItems = m.suggestedActions || (m.suggestedAction ? [m.suggestedAction] : []);
          if (!content.trim() || content.startsWith('[Подготовлен черновик')) {
            if (actionItems.length > 0) {
              content = actionItems.map(sa => `[Подготовлено действие: «${sa.title}»]`).join('\n');
            }
          }
          return { role: m.role, content: content.trim() || '[Сообщение]' };
        }),
        currentFolder,
        settings: aiSettings,
        folders,
        allItems: items,
      });

      if (response.feedFilter) {
        applyAiFilter(response.feedFilter.itemIds, response.feedFilter.queryLabel);
      }

      let resolvedContent = response.content;
      if (!resolvedContent.trim() && response.suggestedAction) {
        resolvedContent = `[Подготовлен черновик ${response.suggestedAction.itemType || 'note'}: «${response.suggestedAction.title}»:\n${response.suggestedAction.content || ''}]`;
      }

      const assistantMsg: ChatMessage = {
        id: 'msg_res_' + Date.now(),
        role: 'assistant',
        content: resolvedContent,
        createdAt: Date.now(),
        reasoning: response.reasoning,
        reasoningTimeMs: response.reasoningTimeMs,
        toolCalls: response.toolCalls,
        suggestedAction: response.suggestedAction,
        suggestedActions: response.suggestedActions,
      };

      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        content: `Ошибка обращения к ИИ: ${err.message || 'Сбой сети'}`,
        createdAt: Date.now(),
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatMessages, currentFolder, aiSettings, folders, items, applyAiFilter]);

  const clearChatMessages = useCallback(() => {
    storage.clearAssistantHistory();
    setChatMessages([]);
  }, []);

  const saveFolder = (folder: FolderMeta) => {
    storage.saveFolder(folder);
    refreshData();
    setIsFolderModalOpen(false);
    setFolderModalParent(null);
    addToast(`Папка «${folder.name}» сохранена`, 'success');
  };

  const updateFolderDescription = useCallback((path: string, description: string) => {
    storage.updateFolderDescription(path, description);
    refreshData();
    addToast('Описание папки обновлено', 'success');
  }, [refreshData, addToast]);

  const renameFolder = useCallback((oldPath: string, updatedFolder: FolderMeta) => {
    storage.renameFolder(oldPath, updatedFolder);
    const remap = (value: string | null): string | null =>
      value && (value === oldPath || value.startsWith(oldPath + '/'))
        ? updatedFolder.path + value.slice(oldPath.length)
        : value;
    if (currentFolder === oldPath || currentFolder.startsWith(oldPath + '/')) {
      const newCurrent = updatedFolder.path + currentFolder.slice(oldPath.length);
      setCurrentFolder(newCurrent);
    }
    // The profile modal and the phone screen point at the old path; follow the move.
    setFolderInfoTarget(previous => remap(previous));
    setMobileActiveFolderState(previous => remap(previous));
    mobileFolderRef.current = remap(mobileFolderRef.current);
    refreshData();
    addToast(`Папка переименована в «${updatedFolder.name}»`, 'success');
  }, [currentFolder, refreshData, addToast]);

  const deleteFolder = (path: string) => {
    if (path === DEFAULT_INBOX_FOLDER) {
      addToast(`Папку «${DEFAULT_INBOX_FOLDER}» нельзя удалить`, 'error');
      return;
    }
    storage.deleteFolder(path);
    if (currentFolder === path || currentFolder.startsWith(path + '/')) {
      setCurrentFolder(DEFAULT_INBOX_FOLDER);
    }
    refreshData();
    addToast('Папка удалена, заметки перемещены во Входящие', 'info');
  };

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

  const openCreateFolderModal = (parentPath?: string) => {
    setFolderModalParent(parentPath ?? null);
    setIsFolderModalOpen(true);
  };

  const closeFolderModal = () => {
    setIsFolderModalOpen(false);
    setFolderModalParent(null);
  };

  const openFolderViewModal = useCallback(() => {
    setIsFolderViewModalOpen(true);
  }, []);

  const closeFolderViewModal = useCallback(() => {
    setIsFolderViewModalOpen(false);
  }, []);

  const updateCurrentFolderViewSettings = useCallback(
    (partial: Partial<FolderViewSettings>) => {
      if (partial.viewMode !== undefined) setFeedViewMode(partial.viewMode);
      if (partial.typeFilter !== undefined) setActiveTypeFilter(partial.typeFilter);
      if (partial.inboxMode !== undefined) setInboxMode(partial.inboxMode);
      if (partial.sortBy !== undefined) setSortBy(partial.sortBy);
      if (partial.sortOrder !== undefined) setSortOrder(partial.sortOrder);
      if (partial.hideCompletedTasks !== undefined) setHideCompletedTasks(partial.hideCompletedTasks);

      setFolderSettings(prev => {
        const current = prev[currentFolder] || {
          viewMode: partial.viewMode ?? feedViewMode,
          typeFilter: partial.typeFilter ?? activeTypeFilter,
          inboxMode: partial.inboxMode ?? inboxMode,
          sortBy: partial.sortBy ?? sortBy,
          sortOrder: partial.sortOrder ?? sortOrder,
          hideCompletedTasks: partial.hideCompletedTasks ?? hideCompletedTasks,
        };
        const updated: FolderViewSettings = { ...current, ...partial };
        const next = { ...prev, [currentFolder]: updated };
        storage.saveFolderViewSettings(currentFolder, updated);
        return next;
      });
    },
    [currentFolder, feedViewMode, activeTypeFilter, inboxMode, sortBy, sortOrder, hideCompletedTasks]
  );

  const resetCurrentFolderViewSettings = useCallback(() => {
    setFeedViewMode('feed');
    setActiveTypeFilter('all');
    if (currentFolder === DEFAULT_INBOX_FOLDER) setInboxMode('all');
    setSortBy('createdAt');
    setSortOrder('asc');
    setHideCompletedTasks(false);

    setFolderSettings(prev => {
      const next = { ...prev };
      delete next[currentFolder];
      const ws = storage.getWorkspaceState();
      const updatedFolderSettings = { ...(ws.folderSettings || {}) };
      delete updatedFolderSettings[currentFolder];
      storage.saveWorkspaceState({ folderSettings: updatedFolderSettings });
      return next;
    });
  }, [currentFolder]);

  // Filter items by current folder, hybrid inbox mode, type filter, tag filter, and sort (memoized to prevent layout churn)
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      let matchesFolder = false;
      if (aiItemFilter) {
        matchesFolder = true;
      } else if (currentFolder === DEFAULT_INBOX_FOLDER) {
        if (inboxMode === 'unsorted') {
          matchesFolder = item.folder === DEFAULT_INBOX_FOLDER;
        } else if (inboxMode === 'all') {
          matchesFolder = true;
        } else if (inboxMode === 'sorted') {
          matchesFolder = item.folder !== DEFAULT_INBOX_FOLDER;
        }
      } else {
        matchesFolder = item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
      }

      if (!matchesFolder) return false;

      if (activeTypeFilter !== 'all' && item.type !== activeTypeFilter) {
        return false;
      }

      if (activeTagFilter && !item.tags.includes(activeTagFilter)) {
        return false;
      }

      if (isPinnedOnlyFilter && !item.isPinned) {
        return false;
      }

      if (aiItemFilter && !aiItemFilter.itemIds.includes(item.id)) {
        return false;
      }

      if (hideCompletedTasks && item.type === 'task' && item.status === 'done') {
        return false;
      }

      return true;
    }).sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'updatedAt':
          cmp = (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt);
          break;
        case 'title': {
          const titleA = a.title || a.content || '';
          const titleB = b.title || b.content || '';
          cmp = titleA.localeCompare(titleB, 'ru', { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'dueDate': {
          const dueA = a.dueDate ? new Date(a.dueDate).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
          const dueB = b.dueDate ? new Date(b.dueDate).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
          cmp = dueA - dueB;
          break;
        }
        case 'createdAt':
        default:
          cmp = a.createdAt - b.createdAt;
          break;
      }
      if (cmp === 0) {
        cmp = a.createdAt - b.createdAt;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [
    items,
    aiItemFilter,
    currentFolder,
    inboxMode,
    activeTypeFilter,
    activeTagFilter,
    isPinnedOnlyFilter,
    hideCompletedTasks,
    sortBy,
    sortOrder,
  ]);

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

  useEffect(() => {
    let isMounted = true;
    backupService.getSnapshots().then(list => {
      if (isMounted) setBackupSnapshots(list);
    }).catch(() => {});

    backupService.checkAndRunAutoBackup().then(ran => {
      if (ran && isMounted) {
        backupService.getSnapshots().then(list => {
          if (isMounted) setBackupSnapshots(list);
        }).catch(() => {});
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

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
