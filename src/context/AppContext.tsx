/* oxlint-disable react/only-export-components */
import React, { createContext, useState, useEffect, useCallback } from 'react';
import type {
  SlagItem,
  FolderMeta,
  VaultMeta,
  AiSettings,
  SlagItemType,
  InboxMode,
  LightboxImage,
  FeedViewMode,
  RightPanelMode,
  AiItemFilter,
  ChatMessage,
  SuggestedAction
} from '../types';
import { storage } from '../lib/storage';
import { sendAssistantChat } from '../lib/aiService';

interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
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
  isRightPanelOpen: boolean;
  rightPanelMode: RightPanelMode;
  setRightPanelMode: (mode: RightPanelMode | ((prev: RightPanelMode) => RightPanelMode)) => void;
  isFullscreenEditorOpen: boolean;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;
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
  createNoteFromAction: (action: SuggestedAction) => SlagItem;

  // Lightbox Gallery
  lightboxImages: LightboxImage[];
  activeLightboxIndex: number | null;
  openLightbox: (images: LightboxImage[], index?: number) => void;
  closeLightbox: () => void;
  navigateLightbox: (newIndex: number) => void;

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
  setIsRightPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsFullscreenEditorOpen: (open: boolean) => void;
  setIsSearchOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  openCreateFolderModal: (parentPath?: string) => void;
  openEditFolderModal: (folder: FolderMeta) => void;
  closeFolderModal: () => void;
  setIsTriageModalOpen: (open: boolean) => void;
  
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
  addToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  removeToast: (id: string) => void;
  refreshData: () => void;
}

const AI_SETTINGS_KEY = 'slag_ai_settings_v2';
const SIDEBAR_WIDTH_KEY = 'slag_sidebar_width_v2';
const RIGHT_PANEL_WIDTH_KEY = 'slag_right_panel_width_v2';

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'groq',
  groqApiKey: '',
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
  const [inboxMode, setInboxMode] = useState<InboxMode>('unsorted');
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
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('info');
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<FolderMeta | null>(null);
  const [isTriageModalOpen, setIsTriageModalOpen] = useState<boolean>(false);
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

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    try {
      const saved = localStorage.getItem(AI_SETTINGS_KEY);
      return saved ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(saved) } : DEFAULT_AI_SETTINGS;
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  });

  const addToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshData = useCallback(() => {
    setVault(storage.getCurrentVault());
    setVaults(storage.getVaults());
    setFolders(storage.getFolders());
    setItems(storage.getItems());
  }, []);

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

  // Strict Layered Dismiss Stack for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        // Toggle right panel assistant mode and ensure panel is open
        setIsRightPanelOpen(true);
        setRightPanelMode(prev => prev === 'assistant' ? 'info' : 'assistant');
        return;
      }

      if (e.key === 'Escape') {
        // Hierarchy of layered closing: Lightbox -> ContextMenu -> FolderModal/TriageModal/SettingsModal -> SearchModal -> FullscreenEditor
        if (activeLightboxIndex !== null) {
          e.preventDefault();
          closeLightbox();
        } else if (contextMenu) {
          e.preventDefault();
          closeContextMenu();
        } else if (isFolderModalOpen) {
          e.preventDefault();
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        } else if (isTriageModalOpen) {
          e.preventDefault();
          setIsTriageModalOpen(false);
        } else if (isSettingsOpen) {
          e.preventDefault();
          setIsSettingsOpen(false);
        } else if (isSearchOpen) {
          e.preventDefault();
          setIsSearchOpen(false);
        } else if (replyTarget) {
          e.preventDefault();
          setReplyTarget(null);
        } else if (isFullscreenEditorOpen) {
          e.preventDefault();
          setIsFullscreenEditorOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeLightboxIndex,
    closeLightbox,
    contextMenu,
    isFolderModalOpen,
    isTriageModalOpen,
    isSettingsOpen,
    isSearchOpen,
    replyTarget,
    isFullscreenEditorOpen,
    closeContextMenu
  ]);

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

  const createNoteFromAction = useCallback((action: SuggestedAction): SlagItem => {
    const saved = saveItem({
      type: action.itemType || 'note',
      title: action.title,
      content: action.content,
      folder: action.folder || currentFolder,
      tags: action.tags,
    });
    addToast(`Запись «${saved.title}» сохранена`, 'success');
    return saved;
  }, [currentFolder, saveItem, addToast]);

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
        messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        currentFolder,
        settings: aiSettings,
        folders,
        allItems: items,
      });

      const assistantMsg: ChatMessage = {
        id: 'msg_res_' + Date.now(),
        role: 'assistant',
        content: response.content,
        createdAt: Date.now(),
        reasoning: response.reasoning,
        reasoningTimeMs: response.reasoningTimeMs,
        toolCalls: response.toolCalls,
        suggestedAction: response.suggestedAction,
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
  }, [chatMessages, currentFolder, aiSettings, folders, items]);

  const clearChatMessages = useCallback(() => {
    setChatMessages([]);
  }, []);

  const updateItem = (item: SlagItem) => {
    storage.saveItem(item);
    if (selectedItem?.id === item.id) {
      setSelectedItem(item);
    }
    refreshData();
  };

  const deleteItem = (id: string) => {
    storage.deleteItem(id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
    refreshData();
    addToast('Запись перемещена в корзину .trash', 'info');
  };

  const restoreFromTrash = (id: string) => {
    const restored = storage.restoreFromTrash(id);
    if (restored) {
      refreshData();
      addToast(`Запись «${restored.title}» восстановлена`, 'success');
    }
  };

  const toggleTaskComplete = (itemId: string, subtaskId?: string) => {
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
  };

  const moveItem = (itemId: string, targetFolder: string) => {
    storage.moveItem(itemId, targetFolder);
    refreshData();
    addToast(`Перемещено в «${targetFolder}»`, 'success');
  };

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
    if (currentFolder === 'Входящие') {
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
        isRightPanelOpen,
        rightPanelMode,
        setRightPanelMode,
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
        lightboxImages,
        activeLightboxIndex,
        openLightbox,
        closeLightbox,
        navigateLightbox,
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
        setIsRightPanelOpen,
        setIsFullscreenEditorOpen,
        setIsSearchOpen,
        setIsSettingsOpen,
        openCreateFolderModal,
        openEditFolderModal,
        closeFolderModal,
        setIsTriageModalOpen,
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
        removeToast,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export { useApp } from './useApp';
