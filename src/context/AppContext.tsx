/* oxlint-disable react/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  SlagItem,
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
  DeviceUiConfig
} from '../types';
import { storage } from '../lib/storage';
import { sendAssistantChat } from '../lib/aiService';
import { logger } from '../lib/logger';
import { useIsMobile } from '../hooks/useIsMobile';

const uiLog = logger.scope('UI');
const appLog = logger.scope('APP');

interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
  action?: {
    label: string;
    onClick: () => void;
  };
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
  items: SlagItem[];
  filteredItems: SlagItem[];
  selectedItem: SlagItem | null;
  activeTypeFilter: SlagItemType | 'all';
  activeTagFilter: string | null;
  aiItemFilter: AiItemFilter | null;
  applyAiFilter: (itemIds: string[], queryLabel: string) => void;
  clearAiFilter: () => void;
  isFullscreenEditorOpen: boolean;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;
  isLogViewerOpen: boolean;
  isFolderModalOpen: boolean;
  editingFolder: FolderMeta | null;
  isTriageModalOpen: boolean;
  aiSettings: AiSettings;
  toasts: ToastMessage[];

  // Assistant Chat State
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  sendChatMessage: (text: string) => Promise<void>;
  clearChatMessages: () => void;
  createNoteFromAction: (action: SuggestedAction, messageId?: string) => SlagItem | void;
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
  replyTarget: SlagItem | null;
  setReplyTarget: (item: SlagItem | null) => void;
  highlightedItemId: string | null;
  scrollToItem: (idOrTitle: string) => void;

  // Actions
  setCurrentFolder: (folder: string) => void;
  setActiveTypeFilter: (type: SlagItemType | 'all') => void;
  setActiveTagFilter: (tag: string | null) => void;
  setSelectedItem: (item: SlagItem | null) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  setIsSearchOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  settingsTab: 'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs';
  setSettingsTab: (tab: 'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs') => void;
  openSettingsModal: (tab?: 'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs') => void;
  setIsLogViewerOpen: (open: boolean) => void;
  openCreateFolderModal: (parentPath?: string) => void;
  openEditFolderModal: (folder: FolderMeta) => void;
  closeFolderModal: () => void;
  setIsTriageModalOpen: (open: boolean) => void;
  isComposerModalOpen: boolean;
  composerModalOptions: { type?: SlagItemType; status?: SlagItemStatus; folder?: string; dueDate?: string; reminder?: string } | null;
  openComposerModal: (options?: { type?: SlagItemType; status?: SlagItemStatus; folder?: string; dueDate?: string; reminder?: string }) => void;
  closeComposerModal: () => void;
  
  // Storage operations
  saveItem: (item: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }) => SlagItem;
  updateItem: (item: SlagItem) => void;
  deleteItem: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  toggleTaskComplete: (itemId: string, subtaskId?: string) => void;
  moveItem: (itemId: string, targetFolder: string) => void;
  saveFolder: (folder: FolderMeta) => void;
  deleteFolder: (path: string) => void;
  switchVault: (vaultId: string) => void;
  createVault: (name: string) => void;
  saveAiSettings: (settings: Partial<AiSettings>) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  undoLastAction: () => boolean;
  removeToast: (id: string) => void;
  refreshData: () => void;

  // Mobile Navigation & Touch Actions
  isMobile: boolean;
  activeMobileTab: MobileTabId;
  setActiveMobileTab: (tab: MobileTabId) => void;
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

const AI_SETTINGS_KEY = 'slag_ai_settings_v2';
const SIDEBAR_WIDTH_KEY = 'slag_sidebar_width_v2';
const RIGHT_PANEL_WIDTH_KEY = 'slag_right_panel_width_v2';
const MOBILE_DOCK_TABS_KEY = 'slag_mobile_dock_tabs_v2';
const UI_CONFIG_KEY = 'slag_ui_config_v2';

const DEFAULT_UI_CONFIG: AppUiConfig = {
  desktop: {
    fontScale: 'normal',
    density: 'normal',
  },
  mobile: {
    fontScale: 'normal',
    density: 'spacious',
  },
};

const DEFAULT_MOBILE_DOCK_TABS: MobileTabId[] = ['folders', 'tasks', 'assistant', 'settings'];

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'groq',
  groqApiKey: '',
  kieApiKey: '',
  kieBaseUrl: 'https://api.kie.ai',
  geminiApiKey: '',
  model: 'openai/gpt-oss-120b',
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
  const [vault, setVault] = useState<VaultMeta>(storage.getCurrentVault());
  const [vaults, setVaults] = useState<VaultMeta[]>(storage.getVaults());
  const [folders, setFolders] = useState<FolderMeta[]>(storage.getFolders());
  const [currentFolder, setCurrentFolder] = useState<string>('Входящие');
  const [inboxMode, setInboxMode] = useState<InboxMode>('all');
  const [feedViewMode, setFeedViewMode] = useState<FeedViewMode>('feed');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [items, setItems] = useState<SlagItem[]>(() => storage.getItems());
  const [selectedItem, setSelectedItem] = useState<SlagItem | null>(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState<SlagItemType | 'all'>('all');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [aiItemFilter, setAiItemFilter] = useState<AiItemFilter | null>(null);

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
  
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs'>('ai');

  const openSettingsModal = useCallback((tab?: 'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs') => {
    if (tab) setSettingsTab(tab);
    setIsSettingsOpen(true);
  }, []);

  const [isLogViewerOpen, setIsLogViewerOpen] = useState<boolean>(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<FolderMeta | null>(null);
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
  const [replyTarget, setReplyTarget] = useState<SlagItem | null>(null);
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
    const clamped = Math.max(180, Math.min(480, w));
    setSidebarWidthState(clamped);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  };

  const setRightPanelWidth = (w: number) => {
    const clamped = Math.max(220, Math.min(520, w));
    setRightPanelWidthState(clamped);
    localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(clamped));
  };

  // Mobile navigation & touch state
  const isMobileScreen = useIsMobile(768);
  const [forceMobileMode, setForceMobileMode] = useState<boolean | null>(null);
  const isMobile = forceMobileMode !== null ? forceMobileMode : isMobileScreen;

  const toggleMobileMode = useCallback(() => {
    setForceMobileMode(prev => {
      if (prev === null) return !isMobileScreen;
      return !prev;
    });
  }, [isMobileScreen]);

  const [activeMobileTab, setActiveMobileTab] = useState<MobileTabId>('folders');
  const [mobileActiveFolder, setMobileActiveFolderState] = useState<string | null>(null);
  const [mobileFolderInfoOpen, setMobileFolderInfoOpen] = useState<boolean>(false);
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

  const setMobileActiveFolder = useCallback((folder: string | null) => {
    setMobileActiveFolderState(folder);
    if (folder) {
      setCurrentFolder(folder);
    }
  }, []);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  // Dynamically apply density and font scale CSS properties to document root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const currentDevice = isMobile ? 'mobile' : 'desktop';
    const cfg = uiConfig[currentDevice];

    document.documentElement.dataset.density = cfg.density;

    const scaleNum = cfg.fontScale === 'small' ? 0.9 : cfg.fontScale === 'large' ? 1.15 : 1.0;
    document.documentElement.style.setProperty('--slag-font-scale', String(scaleNum));
  }, [isMobile, uiConfig]);

  // Action History Stack for Undo capability (up to 20 snapshots)
  interface ActionHistoryEntry {
    id: string;
    timestamp: number;
    description: string;
    itemSnapshots: SlagItem[];
  }
  const actionHistoryRef = useRef<ActionHistoryEntry[]>([]);

  const addToast = useCallback((
    text: string,
    type: 'info' | 'success' | 'error' = 'info',
    action?: { label: string; onClick: () => void }
  ) => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, text, type, action }]);
    logger.log(type === 'error' ? 'error' : 'info', 'UI', `Toast: ${text}`);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? 4500 : 2800);
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
  }, []);

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
      uiLog.debug(`Navigated to folder: "${currentFolder}"`);
      prevFolderRef.current = currentFolder;
    }
  }, [currentFolder]);

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

  // Strict Layered Dismiss Stack (LIFO) for Escape key, Android Hardware Back & Swipes
  const dismissTopLayer = useCallback((): boolean => {
    if (activeLightboxIndex !== null) {
      closeLightbox();
      return true;
    }
    if (mobileActionSheetItem !== null) {
      setMobileActionSheetItem(null);
      return true;
    }
    if (contextMenu !== null) {
      closeContextMenu();
      return true;
    }
    if (isLogViewerOpen) {
      setIsLogViewerOpen(false);
      return true;
    }
    if (isFolderModalOpen) {
      setIsFolderModalOpen(false);
      setEditingFolder(null);
      return true;
    }
    if (isTriageModalOpen) {
      setIsTriageModalOpen(false);
      return true;
    }
    if (isComposerModalOpen) {
      setIsComposerModalOpen(false);
      setComposerModalOptions(null);
      return true;
    }
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }
    if (isSearchOpen) {
      setIsSearchOpen(false);
      return true;
    }
    if (replyTarget !== null) {
      setReplyTarget(null);
      return true;
    }
    if (isFullscreenEditorOpen) {
      setIsFullscreenEditorOpen(false);
      return true;
    }
    if (mobileFolderInfoOpen) {
      setMobileFolderInfoOpen(false);
      return true;
    }
    if (mobileActiveFolder !== null) {
      if (mobileActiveFolder.includes('/')) {
        const parent = mobileActiveFolder.substring(0, mobileActiveFolder.lastIndexOf('/'));
        setMobileActiveFolder(parent);
      } else {
        setMobileActiveFolder(null);
      }
      return true;
    }
    if (activeMobileTab !== 'folders') {
      setActiveMobileTab('folders');
      return true;
    }
    return false;
  }, [
    activeLightboxIndex,
    closeLightbox,
    mobileActionSheetItem,
    contextMenu,
    closeContextMenu,
    isLogViewerOpen,
    isFolderModalOpen,
    isTriageModalOpen,
    isComposerModalOpen,
    isSettingsOpen,
    isSearchOpen,
    replyTarget,
    isFullscreenEditorOpen,
    mobileFolderInfoOpen,
    mobileActiveFolder,
    setMobileActiveFolder,
    activeMobileTab,
  ]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё')) {
        e.preventDefault();
        setIsLogViewerOpen(prev => !prev);
        return;
      }

      if (
        (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = document.activeElement?.getAttribute('contenteditable') === 'true';
        if (
          activeTag !== 'input' &&
          activeTag !== 'textarea' &&
          !isEditable &&
          !isFullscreenEditorOpen &&
          !isComposerModalOpen &&
          !isSearchOpen &&
          !isSettingsOpen
        ) {
          e.preventDefault();
          openComposerModal({ type: 'task' });
          return;
        }
      }

      if (e.key === 'Escape') {
        if (dismissTopLayer()) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dismissTopLayer, openComposerModal, isFullscreenEditorOpen, isComposerModalOpen, isSearchOpen, isSettingsOpen]);

  // Android Back Gesture & PopState Handler
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.history.replaceState({ slagApp: true }, '');
    } catch {
      // Ignore
    }

    const handlePopState = () => {
      const handled = dismissTopLayer();
      if (handled) {
        try {
          window.history.pushState({ slagApp: true }, '');
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dismissTopLayer]);

  const scrollToItem = useCallback((idOrTitle: string) => {
    const cleanQuery = idOrTitle.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
    const found = items.find(i => 
      i.id === cleanQuery || 
      i.title.toLowerCase() === cleanQuery.toLowerCase() ||
      i.title.toLowerCase().startsWith(cleanQuery.toLowerCase())
    );

    if (!found) {
      addToast(`Запись «${cleanQuery}» не найдена`, 'info');
      return;
    }

    if (currentFolder !== found.folder && !found.folder.startsWith(currentFolder + '/')) {
      setCurrentFolder(found.folder);
    }

    setHighlightedItemId(found.id);

    setTimeout(() => {
      const el = document.getElementById(`item-${found.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);

    setTimeout(() => {
      setHighlightedItemId(prev => (prev === found.id ? null : prev));
    }, 2400);
  }, [items, currentFolder, addToast]);

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

  const updateItem = useCallback((item: SlagItem) => {
    storage.saveItem(item);
    if (selectedItem?.id === item.id) {
      setSelectedItem(item);
    }
    refreshData();
  }, [selectedItem, refreshData]);

  const deleteItem = useCallback((id: string) => {
    storage.deleteItem(id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
    refreshData();
    addToast('Запись перемещена в корзину .trash', 'info');
  }, [selectedItem, refreshData, addToast]);

  const restoreFromTrash = useCallback((id: string) => {
    const restored = storage.restoreFromTrash(id);
    if (restored) {
      refreshData();
      addToast(`Запись «${restored.title}» восстановлена`, 'success');
    }
  }, [refreshData, addToast]);

  const moveItem = useCallback((itemId: string, targetFolder: string) => {
    storage.moveItem(itemId, targetFolder);
    refreshData();
    addToast(`Перемещено в «${targetFolder}»`, 'success');
  }, [refreshData, addToast]);

  const toggleTaskComplete = useCallback((itemId: string, subtaskId?: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    if (subtaskId && item.subtasks) {
      const updatedSubtasks = item.subtasks.map(st => 
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      );
      const allDone = updatedSubtasks.every(st => st.completed);
      updateItem({
        ...item,
        subtasks: updatedSubtasks,
        status: allDone ? 'done' : item.status === 'done' ? 'in_progress' : item.status,
      });
    } else {
      const newStatus = item.status === 'done' ? 'todo' : 'done';
      const updatedSubtasks = item.subtasks?.map(st => ({
        ...st,
        completed: newStatus === 'done',
      }));
      updateItem({
        ...item,
        status: newStatus,
        subtasks: updatedSubtasks,
      });
      addToast(newStatus === 'done' ? 'Задача выполнена' : 'Задача возобновлена', 'success');
    }
  }, [items, updateItem, addToast]);

  const executeSuggestedAction = useCallback((action: SuggestedAction, messageId?: string): SlagItem | void => {
    if (action.actionState === 'executing' || action.actionState === 'applied') {
      return;
    }

    if (messageId) {
      setChatMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const updatedSingle = m.suggestedAction
          ? { ...m.suggestedAction, actionState: 'executing' as const }
          : undefined;
        const updatedList = m.suggestedActions
          ? m.suggestedActions.map(act => act === action || act.title === action.title ? { ...act, actionState: 'executing' as const } : act)
          : undefined;
        return {
          ...m,
          suggestedAction: updatedSingle,
          suggestedActions: updatedList,
        };
      }));
    }

    let savedItem: SlagItem | void = undefined;

    // 1. Create Note / Task / Schedule Task
    if (action.type === 'create_note' || action.type === 'schedule_task') {
      const targetFolder = action.folder || currentFolder;
      const targetType = action.itemType || (action.type === 'schedule_task' ? 'task' : 'note');

      // Prevent duplicate creation if matching item already exists (by targetItemId, appliedItemId, or exact title + folder + type)
      const existing = items.find(i =>
        (action.appliedItemId && i.id === action.appliedItemId) ||
        (action.targetItemId && i.id === action.targetItemId) ||
        (i.title.trim().toLowerCase() === action.title.trim().toLowerCase() && i.folder === targetFolder && i.type === targetType)
      );

      if (existing) {
        const updated: SlagItem = {
          ...existing,
          title: action.title.trim() || existing.title,
          content: action.content !== undefined && action.content !== '' ? action.content : existing.content,
          tags: action.tags && action.tags.length > 0 ? Array.from(new Set([...existing.tags, ...action.tags])) : existing.tags,
          dueDate: action.dueDate !== undefined ? action.dueDate : existing.dueDate,
          reminder: action.reminder !== undefined ? action.reminder : existing.reminder,
          priority: action.priority !== undefined ? action.priority : existing.priority,
          status: action.status !== undefined ? action.status : existing.status,
          subtasks: action.subtasks && action.subtasks.length > 0 ? [...(existing.subtasks || []), ...action.subtasks] : existing.subtasks,
          updatedAt: Date.now(),
        };
        updateItem(updated);
        savedItem = updated;
        addToast(`Запись «${updated.title}» обновлена`, 'success');
      } else {
        const saved = saveItem({
          type: targetType,
          title: action.title.trim(),
          content: action.content || '',
          folder: targetFolder,
          tags: action.tags || [],
          dueDate: action.dueDate,
          reminder: action.reminder,
          priority: action.priority,
          status: action.status,
          subtasks: action.subtasks,
        });
        savedItem = saved;
        addToast(`Запись «${saved.title}» сохранена`, 'success');
      }
    }

    // 2. Decompose Task (add subtasks to target task)
    else if (action.type === 'decompose_task') {
      const lowerActionTitle = action.title.toLowerCase();
      const target = items.find(i =>
        i.type === 'task' && (
          i.id === action.targetItemId ||
          i.title.toLowerCase() === lowerActionTitle ||
          i.title.toLowerCase().includes(lowerActionTitle) ||
          lowerActionTitle.includes(i.title.toLowerCase())
        )
      );
      if (target) {
        const existingSubtasks = target.subtasks || [];
        const newSubtasks = action.subtasks || [];
        const merged = [...existingSubtasks, ...newSubtasks];
        const updated = { ...target, subtasks: merged, updatedAt: Date.now() };
        updateItem(updated);
        savedItem = updated;
        addToast(`К задаче «${target.title}» добавлено ${newSubtasks.length} подзадач`, 'success');
      } else {
        const created = saveItem({
          type: 'task',
          title: action.title.trim(),
          content: action.content || '',
          folder: action.folder || currentFolder,
          tags: ['задачи'],
          subtasks: action.subtasks || [],
        });
        savedItem = created;
        addToast(`Создана задача «${created.title}» с ${action.subtasks?.length || 0} подзадачами`, 'success');
      }
    }

    // 3. Update Task Status
    else if (action.type === 'update_task_status') {
      const target = items.find(i => i.id === action.targetItemId || i.title.toLowerCase() === action.title.toLowerCase());
      if (target && action.status) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Смена статуса «${target.title}»`,
          itemSnapshots: [{ ...target }],
        });
        const updated = { ...target, status: action.status, updatedAt: Date.now() };
        updateItem(updated);
        savedItem = updated;
        addToast(`Статус задачи изменен на «${action.status}»`, 'success', {
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    // 4. Reschedule Task
    else if (action.type === 'reschedule_task') {
      const target = items.find(i => i.id === action.targetItemId || i.title.toLowerCase() === action.title.toLowerCase());
      if (target) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Перенос «${target.title}»`,
          itemSnapshots: [{ ...target }],
        });
        const updated = {
          ...target,
          dueDate: action.dueDate,
          reminder: action.reminder,
          priority: action.priority || target.priority,
          updatedAt: Date.now(),
        };
        updateItem(updated);
        savedItem = updated;
        addToast(action.dueDate ? `Задача перенесена на ${action.dueDate}` : 'Срок задачи снят', 'success', {
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    // 4b. Batch Reschedule Tasks
    else if (action.type === 'batch_reschedule') {
      const batch = action.batchItems || [];
      const snapshots: SlagItem[] = [];
      let updatedCount = 0;
      for (const item of batch) {
        const target = items.find(i => i.id === item.targetItemId || i.title.toLowerCase() === item.title.toLowerCase());
        if (target) {
          snapshots.push({ ...target });
          const updated = {
            ...target,
            dueDate: item.dueDate,
            reminder: item.reminder,
            priority: item.priority || target.priority,
            updatedAt: Date.now(),
          };
          updateItem(updated);
          savedItem = updated;
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Пакетный перенос ${updatedCount} задач`,
          itemSnapshots: snapshots,
        });
        addToast(`Перенесено задач: ${updatedCount}`, 'success', {
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    // 4c. Append Content to Note
    else if (action.type === 'append_to_note') {
      const target = items.find(i => i.id === action.targetItemId || i.title.toLowerCase() === action.title.toLowerCase());
      if (target && action.content) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Дополнение «${target.title}»`,
          itemSnapshots: [{ ...target }],
        });
        const newContent = target.content ? `${target.content}\n\n${action.content}` : action.content;
        const updated = {
          ...target,
          content: newContent,
          updatedAt: Date.now(),
        };
        updateItem(updated);
        savedItem = updated;
        addToast(`Заметка «${target.title}» дополнена`, 'success', {
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    // 5. Move Note to Folder
    else if (action.type === 'move_note') {
      const target = items.find(i => i.id === action.targetItemId || i.title.toLowerCase() === action.title.toLowerCase());
      if (target && action.folder) {
        moveItem(target.id, action.folder);
        savedItem = { ...target, folder: action.folder, updatedAt: Date.now() };
        addToast(`Запись перенесена в «${action.folder}»`, 'success');
      }
    }

    if (messageId && (savedItem || action.type === 'batch_reschedule')) {
      const finalSavedId = savedItem?.id;
      setChatMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const updatedSingle = m.suggestedAction
          ? {
              ...m.suggestedAction,
              actionState: 'applied' as const,
              appliedItemId: finalSavedId,
            }
          : undefined;
        const updatedList = m.suggestedActions
          ? m.suggestedActions.map(act => act === action || act.title === action.title
              ? { ...act, actionState: 'applied' as const, appliedItemId: finalSavedId }
              : act)
          : undefined;
        return {
          ...m,
          suggestedAction: updatedSingle,
          suggestedActions: updatedList,
        };
      }));
    }

    return savedItem;
  }, [currentFolder, saveItem, updateItem, moveItem, items, addToast, undoLastAction]);

  const rejectAction = useCallback((messageId: string) => {
    setChatMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      return {
        ...m,
        suggestedAction: m.suggestedAction ? { ...m.suggestedAction, actionState: 'rejected' as const } : undefined,
        suggestedActions: m.suggestedActions ? m.suggestedActions.map(a => ({ ...a, actionState: 'rejected' as const })) : undefined,
      };
    }));
    addToast('Действие отклонено', 'info');
  }, [addToast]);

  const createNoteFromAction = useCallback((action: SuggestedAction, messageId?: string): SlagItem | void => {
    return executeSuggestedAction(action, messageId);
  }, [executeSuggestedAction]);

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
    setChatMessages([]);
  }, []);

  const saveFolder = (folder: FolderMeta) => {
    storage.saveFolder(folder);
    refreshData();
    setIsFolderModalOpen(false);
    setEditingFolder(null);
    addToast(`Папка «${folder.name}» сохранена`, 'success');
  };

  const deleteFolder = (path: string) => {
    if (path === 'Входящие') {
      addToast('Папку «Входящие» нельзя удалить', 'error');
      return;
    }
    storage.deleteFolder(path);
    if (currentFolder === path || currentFolder.startsWith(path + '/')) {
      setCurrentFolder('Входящие');
    }
    refreshData();
    addToast('Папка удалена, заметки перемещены во Входящие', 'info');
  };

  const switchVault = (vaultId: string) => {
    storage.switchVault(vaultId);
    setCurrentFolder('Входящие');
    setSelectedItem(null);
    refreshData();
    addToast('Хранилище переключено', 'info');
  };

  const createVault = (name: string) => {
    storage.createVault(name);
    setCurrentFolder('Входящие');
    setSelectedItem(null);
    refreshData();
    addToast(`Создано хранилище «${name}»`, 'success');
  };

  const openCreateFolderModal = (parentPath?: string) => {
    setEditingFolder(parentPath ? { path: `${parentPath}/`, name: '', description: '', icon: 'Folder' } : null);
    setIsFolderModalOpen(true);
  };

  const openEditFolderModal = (folder: FolderMeta) => {
    setEditingFolder(folder);
    setIsFolderModalOpen(true);
  };

  const closeFolderModal = () => {
    setIsFolderModalOpen(false);
    setEditingFolder(null);
  };

  // Filter items by current folder, hybrid inbox mode, type filter, and tag filter
  const filteredItems = items.filter(item => {
    let matchesFolder = false;
    if (aiItemFilter) {
      matchesFolder = true;
    } else if (currentFolder === 'Входящие') {
      if (inboxMode === 'unsorted') {
        matchesFolder = item.folder === 'Входящие';
      } else if (inboxMode === 'all') {
        matchesFolder = true;
      } else if (inboxMode === 'sorted') {
        matchesFolder = item.folder !== 'Входящие';
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

    if (aiItemFilter && !aiItemFilter.itemIds.includes(item.id)) {
      return false;
    }

    return true;
  }).sort((a, b) => {
    // Pinned items prioritize on top
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    return a.createdAt - b.createdAt;
  });

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
        editingFolder,
        isTriageModalOpen,
        aiSettings,
        toasts,
        chatMessages,
        isChatLoading,
        sendChatMessage,
        clearChatMessages,
        createNoteFromAction,
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
        setCurrentFolder,
        setActiveTypeFilter,
        setActiveTagFilter,
        setSelectedItem,
        setIsFullscreenEditorOpen,
        setIsSearchOpen,
        setIsSettingsOpen,
        settingsTab,
        setSettingsTab,
        openSettingsModal,
        isLogViewerOpen,
        setIsLogViewerOpen,
        openCreateFolderModal,
        openEditFolderModal,
        closeFolderModal,
        setIsTriageModalOpen,
        isComposerModalOpen,
        composerModalOptions,
        openComposerModal,
        closeComposerModal,
        saveItem,
        updateItem,
        deleteItem,
        restoreFromTrash,
        toggleTaskComplete,
        moveItem,
        saveFolder,
        deleteFolder,
        switchVault,
        createVault,
        saveAiSettings,
        addToast,
        undoLastAction,
        removeToast,
        refreshData,
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
