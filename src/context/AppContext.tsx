/* oxlint-disable react/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ItemUpdates,
  MobileTabId,
  AppUiConfig,
  DeviceUiConfig,
  BackupSnapshotMeta,
  BackupSettings,
} from '../types';
import { storage } from '../lib/storage';
import { backupService } from '../lib/backupService';
import { sendAssistantChat } from '../lib/aiService';
import { logger } from '../lib/logger';
import { openAppFolder } from '../lib/folderOpener';
import { listenDesktopEvents, isDesktopApp } from '../lib/windowControls';
import { useIsMobile } from '../hooks/useIsMobile';
import { getFontScaleMultiplier, getFontFamilyConfig } from '../config/typography';
import {
  evaluateRecurringTasks,
  getISODateString,
} from '../lib/recurrenceHelper';
import {
  parseSubtasksFromContent,
  toggleCheckboxInContent,
  setAllCheckboxesInContent,
  migrateLegacySubtasksToContent,
} from '../lib/taskUtils';

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
  isKanbanMaterialsOpen: boolean;
  setIsKanbanMaterialsOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  toggleAssistant: () => void;
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
  
  // Storage operations
  saveItem: (item: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }) => SlagItem;
  updateItem: (item: SlagItem) => void;
  deleteItem: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  toggleTaskComplete: (itemId: string, subtaskId?: string) => void;
  completeTaskForever: (itemId: string) => void;
  moveItem: (itemId: string, targetFolder: string) => void;
  saveFolder: (folder: FolderMeta) => void;
  deleteFolder: (path: string) => void;
  switchVault: (vaultId: string) => void;
  createVault: (name: string, mode?: 'indexeddb' | 'fsa' | 'tauri', path?: string) => void;
  deleteVault: (vaultId: string) => void;
  pickVaultDirectory: () => Promise<{ name: string; path?: string; mode: 'tauri' | 'fsa' } | null>;
  revealVaultInExplorer: () => Promise<void>;
  seedDemoData: () => void;
  isVaultModalOpen: boolean;
  openVaultModal: () => void;
  closeVaultModal: () => void;
  saveAiSettings: (settings: Partial<AiSettings>) => void;
  addToast: (text: string, type?: 'info' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  undoLastAction: () => boolean;
  removeToast: (id: string) => void;
  refreshData: () => void;

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
    fontFamily: 'inter',
  },
  mobile: {
    fontScale: 'normal',
    density: 'spacious',
    fontFamily: 'inter',
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

export function applyItemUpdates(target: SlagItem, updates: ItemUpdates): SlagItem {
  let content = target.content;
  if (updates.content !== undefined) {
    content = updates.content;
  }
  if (updates.appendContent) {
    content = content ? `${content}\n\n${updates.appendContent}` : updates.appendContent;
  }

  let subtasks = target.subtasks;
  if (updates.subtasks !== undefined && Array.isArray(updates.subtasks) && updates.subtasks.length > 0) {
    const first = updates.subtasks[0];
    const newChecklines = typeof first === 'string'
      ? (updates.subtasks as string[]).map(st => `- [ ] ${st}`)
      : (updates.subtasks as Array<{ id?: string; title: string; completed?: boolean }>).map(
          st => `- [${st.completed ? 'x' : ' '}] ${st.title}`
        );
    content = content ? `${content}\n\n${newChecklines.join('\n')}` : newChecklines.join('\n');
    const parsed = parseSubtasksFromContent(content);
    subtasks = parsed.length > 0 ? parsed : subtasks;
  }

  let tags = target.tags || [];
  if (updates.tags !== undefined) {
    tags = updates.tags;
  } else {
    if (updates.addTags && updates.addTags.length > 0) {
      tags = Array.from(new Set([...tags, ...updates.addTags]));
    }
    if (updates.removeTags && updates.removeTags.length > 0) {
      const removeSet = new Set(updates.removeTags.map(t => t.toLowerCase()));
      tags = tags.filter(t => !removeSet.has(t.toLowerCase()));
    }
  }

  const SPECIAL_KEYS = new Set([
    'title', 'content', 'appendContent', 'tags', 'addTags', 'removeTags', 'subtasks', 'dueDate', 'reminder', 'customProps'
  ]);

  const result: SlagItem = {
    ...target,
    title: updates.title !== undefined && updates.title.trim() ? updates.title.trim() : target.title,
    content,
    tags,
    subtasks,
    dueDate: updates.dueDate !== undefined ? (updates.dueDate === null ? undefined : updates.dueDate) : target.dueDate,
    reminder: updates.reminder !== undefined ? (updates.reminder === null ? undefined : updates.reminder) : target.reminder,
    customProps: updates.customProps !== undefined
      ? { ...(target.customProps || {}), ...updates.customProps }
      : target.customProps,
    updatedAt: Date.now(),
  };

  // Dynamically apply any additional scalar properties from updates
  for (const key of Object.keys(updates) as Array<keyof ItemUpdates>) {
    if (!SPECIAL_KEYS.has(key) && updates[key] !== undefined) {
      (result as any)[key] = updates[key];
    }
  }

  return result;
}

export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialWorkspace] = useState(() => storage.getWorkspaceState());
  const [vault, setVault] = useState<VaultMeta>(storage.getCurrentVault());
  const [vaults, setVaults] = useState<VaultMeta[]>(storage.getVaults());
  const [folders, setFolders] = useState<FolderMeta[]>(() => storage.getFolders());
  const [currentFolder, setCurrentFolder] = useState<string>(() => {
    const valid = storage.getFolders().some(f => f.path === initialWorkspace.currentFolder);
    return valid ? initialWorkspace.currentFolder : 'Входящие';
  });
  const [inboxMode, setInboxMode] = useState<InboxMode>(() => initialWorkspace.inboxMode || 'all');
  const [feedViewMode, setFeedViewMode] = useState<FeedViewMode>(() => initialWorkspace.feedViewMode || 'feed');
  const [isKanbanMaterialsOpen, setIsKanbanMaterialsOpen] = useState<boolean>(() => {
    if (typeof initialWorkspace.isKanbanMaterialsOpen === 'boolean') {
      return initialWorkspace.isKanbanMaterialsOpen;
    }
    const isMobileInitial = typeof window !== 'undefined' && window.innerWidth < 768;
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
          folder: initialWorkspace.currentFolder || 'Входящие',
          tags: [],
          attachments: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
    }
    return null;
  });
  const [activeTypeFilter, setActiveTypeFilter] = useState<SlagItemType | 'all'>(() => initialWorkspace.activeTypeFilter || 'all');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(() => initialWorkspace.activeTagFilter ?? null);
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
  const [settingsTab, setSettingsTab] = useState<'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs'>('ai');

  const openSettingsModal = useCallback((tab?: 'ai' | 'vault' | 'ui' | 'shortcuts' | 'logs') => {
    if (tab) setSettingsTab(tab);
    setIsSettingsOpen(true);
  }, []);

  const [isLogViewerOpen, setIsLogViewerOpen] = useState<boolean>(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<FolderMeta | null>(null);
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

  // Mobile navigation & touch state: desktop and standalone popouts never default to phone layout
  const isMobileScreen = useIsMobile(768);
  const [forceMobileMode, setForceMobileMode] = useState<boolean | null>(null);
  const isDesktop = isDesktopApp();
  const isStandalone = typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('panel'));
  const isMobile = !isStandalone && (forceMobileMode !== null ? forceMobileMode : (!isDesktop && isMobileScreen));

  const toggleMobileMode = useCallback(() => {
    setForceMobileMode(prev => {
      if (prev === null) return !isMobileScreen;
      return !prev;
    });
  }, [isMobileScreen]);

  const [activeMobileTab, setActiveMobileTab] = useState<MobileTabId>(() => initialWorkspace.activeMobileTab || 'folders');
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

  // Dynamically apply density, font scale and font family CSS properties to document root
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

    const cleanupDesktop = listenDesktopEvents({
      onOpenComposer: () => {
        openComposerModal();
      },
      onDataChanged: () => {
        refreshData();
      },
    });

    return () => {
      cleanupDesktop();
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
        isInbox: currentFolder === 'Входящие',
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
    if (isVaultModalOpen) {
      setIsVaultModalOpen(false);
      return true;
    }
    if (isFolderInfoModalOpen) {
      setIsFolderInfoModalOpen(false);
      setFolderInfoTarget(null);
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
    if (isMobile && mobileFolderInfoOpen) {
      setMobileFolderInfoOpen(false);
      return true;
    }
    if (isMobile && mobileActiveFolder !== null) {
      if (mobileActiveFolder.includes('/')) {
        const parent = mobileActiveFolder.substring(0, mobileActiveFolder.lastIndexOf('/'));
        setMobileActiveFolder(parent);
      } else {
        setMobileActiveFolder(null);
      }
      return true;
    }
    if (isMobile && activeMobileTab !== 'folders') {
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
    isVaultModalOpen,
    isFolderInfoModalOpen,
    isTriageModalOpen,
    isComposerModalOpen,
    isSettingsOpen,
    isSearchOpen,
    replyTarget,
    isFullscreenEditorOpen,
    isMobile,
    mobileFolderInfoOpen,
    mobileActiveFolder,
    setMobileActiveFolder,
    activeMobileTab,
  ]);

  const toggleAssistant = useCallback(() => {
    if (isMobile) {
      setActiveMobileTab(prev => (prev === 'assistant' ? 'folders' : 'assistant'));
    } else {
      window.dispatchEvent(new CustomEvent('slag:toggle-assistant'));
    }
  }, [isMobile, setActiveMobileTab]);

  // Global In-App Keyboard Shortcuts (Zero-Overhead native keydown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Escape: dismiss top layer in LIFO stack
      if (e.key === 'Escape') {
        if (dismissTopLayer()) {
          e.preventDefault();
          return;
        }
      }

      const mod = e.metaKey || e.ctrlKey;

      // 2. Ctrl/Cmd + F or Ctrl/Cmd + K: Toggle Search (prevent browser find)
      if (mod && (e.code === 'KeyF' || e.code === 'KeyK' || e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
        return;
      }

      // 3. Ctrl/Cmd + J: Toggle Assistant
      if (mod && (e.code === 'KeyJ' || e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        toggleAssistant();
        return;
      }

      // 4. Ctrl/Cmd + `: Toggle System Logs & HUD (support tilde and Cyrillic ё)
      if (mod && (e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё')) {
        e.preventDefault();
        setIsLogViewerOpen(prev => !prev);
        return;
      }

      // 5. Ctrl/Cmd + ,: Open Settings
      if (mod && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault();
        openSettingsModal();
        return;
      }

      // 6. Single-key shortcuts ('C' for task, 'N' for note) outside typing elements
      if (!mod && !e.altKey && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        const tag = (target?.tagName || '').toLowerCase();
        const isEditable = target?.isContentEditable || target?.getAttribute('contenteditable') === 'true';

        if (
          tag !== 'input' &&
          tag !== 'textarea' &&
          tag !== 'select' &&
          !isEditable &&
          !isFullscreenEditorOpen &&
          !isComposerModalOpen &&
          !isSearchOpen &&
          !isSettingsOpen
        ) {
          if (e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с') {
            e.preventDefault();
            openComposerModal({ type: 'task' });
            return;
          }
          if (e.code === 'KeyN' || e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'т') {
            e.preventDefault();
            openComposerModal({ type: 'note' });
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    dismissTopLayer,
    toggleAssistant,
    openComposerModal,
    openSettingsModal,
    isFullscreenEditorOpen,
    isComposerModalOpen,
    isSearchOpen,
    isSettingsOpen,
  ]);

  // Navigation & Layer Depth Calculation (LIFO Stack)
  const overlayDepth = (
    (activeLightboxIndex !== null ? 1 : 0) +
    (mobileActionSheetItem !== null ? 1 : 0) +
    (contextMenu !== null ? 1 : 0) +
    (isLogViewerOpen ? 1 : 0) +
    (isFolderModalOpen ? 1 : 0) +
    (isVaultModalOpen ? 1 : 0) +
    (isFolderInfoModalOpen ? 1 : 0) +
    (isTriageModalOpen ? 1 : 0) +
    (isComposerModalOpen ? 1 : 0) +
    (isSettingsOpen ? 1 : 0) +
    (isSearchOpen ? 1 : 0) +
    (replyTarget !== null ? 1 : 0) +
    (isFullscreenEditorOpen ? 1 : 0) +
    (isMobile && mobileFolderInfoOpen ? 1 : 0)
  );
  const mobileFolderDepth = (isMobile && mobileActiveFolder) ? mobileActiveFolder.split('/').length : 0;
  const mobileTabDepth = (isMobile && activeMobileTab !== 'folders') ? 1 : 0;
  const totalLayerDepth = overlayDepth + mobileFolderDepth + mobileTabDepth;

  const historyDepthRef = useRef<number>(0);
  const isProgrammaticNavRef = useRef<boolean>(false);

  // Initialize base history state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.history.replaceState({ slagRoot: true, depth: 0 }, '');
    } catch {
      // Ignore
    }
  }, []);

  // Sync totalLayerDepth with window.history (mobile Android back gesture only)
  useEffect(() => {
    if (typeof window === 'undefined' || !isMobile) return;

    const targetDepth = totalLayerDepth;
    const currentHistDepth = historyDepthRef.current;

    if (targetDepth > currentHistDepth) {
      const diff = targetDepth - currentHistDepth;
      for (let i = 0; i < diff; i++) {
        try {
          window.history.pushState({ slagLayer: true, depth: currentHistDepth + i + 1 }, '');
        } catch {
          // Ignore
        }
      }
      historyDepthRef.current = targetDepth;
    } else if (targetDepth < currentHistDepth) {
      const diff = currentHistDepth - targetDepth;
      historyDepthRef.current = targetDepth;
      isProgrammaticNavRef.current = true;
      try {
        window.history.go(-diff);
      } catch {
        // Ignore
      }
      const timer = setTimeout(() => {
        isProgrammaticNavRef.current = false;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [totalLayerDepth, isMobile]);

  // Handle hardware back / browser back / swipe gestures via popstate
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (isProgrammaticNavRef.current) {
        isProgrammaticNavRef.current = false;
        return;
      }

      if (historyDepthRef.current > 0) {
        historyDepthRef.current -= 1;
      }
      dismissTopLayer();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dismissTopLayer]);

  // Handle Mouse Back button (Mouse button 4 / Back / e.button === 3)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMouseBack = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'mouseup') {
          dismissTopLayer();
        }
      }
    };

    window.addEventListener('mouseup', handleMouseBack, true);
    window.addEventListener('auxclick', handleMouseBack, true);
    return () => {
      window.removeEventListener('mouseup', handleMouseBack, true);
      window.removeEventListener('auxclick', handleMouseBack, true);
    };
  }, [dismissTopLayer]);

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

    if (currentFolder !== found.folder && !found.folder.startsWith(currentFolder + '/')) {
      setCurrentFolder(found.folder);
    }

    // Set highlighted item. FeedList observes this and anchors with centered scroll
    setHighlightedItemId(found.id);

    // Keep highlight effect for 2.4s then clear
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
    const prevFolder = item?.folder || 'Входящие';
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
    const item = items.find(i => i.id === itemId);
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

      let streak = item.streak;
      let history = item.history;
      let lastCompletedDate = item.lastCompletedDate;

      if (item.recurrence && allDone && item.status !== 'done') {
        const todayStr = getISODateString(new Date());
        streak = (streak ?? 0) + 1;
        history = Array.from(new Set([...(history || []), todayStr]));
        lastCompletedDate = todayStr;
      }

      updateItem({
        ...item,
        content: updatedContent,
        subtasks: updatedSubtasks,
        status: newStatus,
        streak,
        history,
        lastCompletedDate,
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

      let streak = item.streak;
      let history = item.history;
      let lastCompletedDate = item.lastCompletedDate;

      if (item.recurrence) {
        const todayStr = getISODateString(new Date());
        if (newStatus === 'done') {
          streak = (streak ?? 0) + 1;
          history = Array.from(new Set([...(history || []), todayStr]));
          lastCompletedDate = todayStr;
        } else {
          // Unchecking task on the same day reverts completion & streak increment
          if (lastCompletedDate === todayStr) {
            streak = Math.max(0, (streak ?? 1) - 1);
            history = (history || []).filter(d => d !== todayStr);
            lastCompletedDate = history.length > 0 ? history[history.length - 1] : undefined;
          }
        }
      }

      updateItem({
        ...item,
        content: updatedContent,
        status: newStatus,
        subtasks: updatedSubtasks,
        streak,
        history,
        lastCompletedDate,
      });

      if (newStatus === 'done') {
        const toastText = item.recurrence && streak !== undefined
          ? `Задача выполнена (🔥 ${streak})`
          : 'Задача выполнена';
        addToast(toastText, 'success');
      } else {
        addToast('Задача возобновлена', 'info');
      }
    }
  }, [items, updateItem, addToast]);

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
        const rawContent = action.content !== undefined && action.content !== '' ? action.content : existing.content;
        const mergedContent = action.subtasks && action.subtasks.length > 0
          ? migrateLegacySubtasksToContent(rawContent, action.subtasks)
          : rawContent;
        const parsedSubtasks = parseSubtasksFromContent(mergedContent);

        const updated: SlagItem = {
          ...existing,
          title: action.title.trim() || existing.title,
          content: mergedContent,
          tags: action.tags && action.tags.length > 0 ? Array.from(new Set([...existing.tags, ...action.tags])) : existing.tags,
          dueDate: action.dueDate !== undefined ? action.dueDate : existing.dueDate,
          reminder: action.reminder !== undefined ? action.reminder : existing.reminder,
          priority: action.priority !== undefined ? action.priority : existing.priority,
          status: action.status !== undefined ? action.status : existing.status,
          subtasks: parsedSubtasks.length > 0 ? parsedSubtasks : existing.subtasks,
          updatedAt: Date.now(),
        };
        updateItem(updated);
        savedItem = updated;
        addToast(`Запись «${updated.title}» обновлена`, 'success');
      } else {
        const rawContent = action.content || '';
        const mergedContent = action.subtasks && action.subtasks.length > 0
          ? migrateLegacySubtasksToContent(rawContent, action.subtasks)
          : rawContent;
        const parsedSubtasks = parseSubtasksFromContent(mergedContent);

        const saved = saveItem({
          type: targetType,
          title: action.title.trim(),
          content: mergedContent,
          folder: targetFolder,
          tags: action.tags || [],
          dueDate: action.dueDate,
          reminder: action.reminder,
          priority: action.priority,
          status: action.status,
          subtasks: parsedSubtasks.length > 0 ? parsedSubtasks : action.subtasks,
        });
        savedItem = saved;
        addToast(`Запись «${saved.title}» сохранена`, 'success');
      }
    }

    // 2. Universal Update Item (single)
    else if (action.type === 'update_item') {
      const targetQuery = (action.targetItemId || action.title || '').trim().toLowerCase();
      const target = items.find(i =>
        (action.targetItemId && i.id === action.targetItemId) ||
        (targetQuery && (i.title.toLowerCase() === targetQuery || i.title.toLowerCase().includes(targetQuery) || targetQuery.includes(i.title.toLowerCase())))
      );

      if (target) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Изменение «${target.title}»`,
          itemSnapshots: [{ ...target }],
        });

        const rawUpdates: ItemUpdates = action.updates || {
          title: action.title && action.title !== target.title ? action.title : undefined,
          content: action.content || undefined,
          appendContent: action.appendContent || undefined,
          folder: action.folder && action.folder !== target.folder ? action.folder : undefined,
          status: action.status,
          priority: action.priority,
          dueDate: action.dueDate,
          reminder: action.reminder,
          subtasks: action.subtasks,
          tags: action.tags && action.tags.length > 0 ? action.tags : undefined,
        };

        const updated = applyItemUpdates(target, rawUpdates);
        updateItem(updated);
        savedItem = updated;

        let toastMsg = `Запись «${updated.title}» обновлена`;
        if (rawUpdates.subtasks && Array.isArray(rawUpdates.subtasks) && rawUpdates.subtasks.length > 0) {
          toastMsg = `К задаче «${updated.title}» добавлено ${rawUpdates.subtasks.length} подзадач`;
        } else if (rawUpdates.appendContent) {
          toastMsg = `Заметка «${updated.title}» дополнена`;
        } else if (rawUpdates.dueDate !== undefined) {
          toastMsg = rawUpdates.dueDate ? `Задача перенесена на ${rawUpdates.dueDate}` : 'Срок задачи снят';
        } else if (rawUpdates.status) {
          toastMsg = `Статус задачи изменен на «${rawUpdates.status}»`;
        } else if (rawUpdates.folder) {
          toastMsg = `Запись перенесена в «${rawUpdates.folder}»`;
        }

        addToast(toastMsg, 'success', {
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    // 3. Universal Batch Update (multiple)
    else if (action.type === 'batch_update') {
      const batchList = action.batchUpdateItems || [];
      const snapshots: SlagItem[] = [];
      let updatedCount = 0;

      for (const item of batchList) {
        const tId = item.targetItemId;
        const tTitle = (item.title || '').toLowerCase().trim();
        const target = items.find(i =>
          (tId && i.id === tId) ||
          (tTitle && (i.title.toLowerCase() === tTitle || i.title.toLowerCase().includes(tTitle) || tTitle.includes(i.title.toLowerCase())))
        );

        if (target) {
          snapshots.push({ ...target });
          const updated = applyItemUpdates(target, item.updates);
          updateItem(updated);
          savedItem = updated;
          updatedCount++;
        } else if (item.title) {
          const newItem = saveItem({
            title: item.title,
            type: action.itemType || 'task',
            folder: action.folder || currentFolder,
            tags: action.tags || [],
            dueDate: item.updates?.dueDate || undefined,
            reminder: item.updates?.reminder || undefined,
            priority: item.updates?.priority || 'none',
            status: item.updates?.status || 'todo',
            content: '',
          });
          savedItem = newItem;
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        actionHistoryRef.current.push({
          id: 'hist_' + Date.now(),
          timestamp: Date.now(),
          description: `Пакетное применение ${updatedCount} записей`,
          itemSnapshots: snapshots,
        });
        addToast(`Применено задач: ${updatedCount}`, 'success', {
          label: 'Отменить',
          onClick: () => undoLastAction(),
        });
      }
    }

    if (messageId && (savedItem || action.type === 'batch_update')) {
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
  }, [currentFolder, saveItem, updateItem, items, addToast, undoLastAction]);

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
    storage.clearAssistantHistory();
    setChatMessages([]);
  }, []);

  const saveFolder = (folder: FolderMeta) => {
    storage.saveFolder(folder);
    refreshData();
    setIsFolderModalOpen(false);
    setEditingFolder(null);
    addToast(`Папка «${folder.name}» сохранена`, 'success');
  };

  const renameFolder = useCallback((oldPath: string, updatedFolder: FolderMeta) => {
    storage.renameFolder(oldPath, updatedFolder);
    if (currentFolder === oldPath || currentFolder.startsWith(oldPath + '/')) {
      const newCurrent = updatedFolder.path + currentFolder.slice(oldPath.length);
      setCurrentFolder(newCurrent);
    }
    refreshData();
    addToast(`Папка переименована в «${updatedFolder.name}»`, 'success');
  }, [currentFolder, refreshData, addToast]);

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
    const newWs = storage.getWorkspaceState();
    setCurrentFolder(newWs.currentFolder || 'Входящие');
    setFeedViewMode(newWs.feedViewMode || 'feed');
    setInboxMode(newWs.inboxMode || 'all');
    setActiveTypeFilter(newWs.activeTypeFilter || 'all');
    setActiveTagFilter(newWs.activeTagFilter || null);
    setActiveMobileTab(newWs.activeMobileTab || 'folders');
    setIsKanbanMaterialsOpen(typeof newWs.isKanbanMaterialsOpen === 'boolean' ? newWs.isKanbanMaterialsOpen : true);
    setChatMessages(storage.getAssistantHistory());
    setSelectedItem(null);
    refreshData();
    addToast('Хранилище переключено', 'info');
  };

  const createVault = (name: string, mode?: 'indexeddb' | 'fsa' | 'tauri', path?: string) => {
    storage.createVault(name, mode, path);
    setCurrentFolder('Входящие');
    setSelectedItem(null);
    refreshData();
    addToast(`Создано хранилище «${name}»`, 'success');
  };

  const deleteVault = (vaultId: string) => {
    const wasCurrent = vault.id === vaultId;
    const success = storage.deleteVault(vaultId);
    if (success) {
      if (wasCurrent) {
        setVault(storage.getCurrentVault());
        setFolders(storage.getFolders());
        setItems(storage.getItems());
        setCurrentFolder('Входящие');
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

  const seedDemoData = useCallback(() => {
    storage.seedDemoData();
    refreshData();
    addToast('Созданы стартовые демо-заметки и папки', 'success');
  }, [refreshData, addToast]);

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

  // Filter items by current folder, hybrid inbox mode, type filter, and tag filter (memoized to prevent layout churn)
  const filteredItems = useMemo(() => {
    return items.filter(item => {
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
  }, [items, aiItemFilter, currentFolder, inboxMode, activeTypeFilter, activeTagFilter]);

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
        editingFolder,
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
        toggleAssistant,
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
        completeTaskForever,
        moveItem,
        saveFolder,
        deleteFolder,
        switchVault,
        createVault,
        deleteVault,
        pickVaultDirectory,
        revealVaultInExplorer,
        seedDemoData,
        isVaultModalOpen,
        openVaultModal,
        closeVaultModal,
        saveAiSettings,
        addToast,
        undoLastAction,
        removeToast,
        refreshData,
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
