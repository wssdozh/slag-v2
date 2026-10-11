import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { SlagItem, FolderMeta, VaultMeta, AiSettings, SlagItemType } from '../types';
import { storage } from '../lib/storage';

interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
}

interface AppContextType {
  vault: VaultMeta;
  vaults: VaultMeta[];
  folders: FolderMeta[];
  currentFolder: string;
  items: SlagItem[];
  filteredItems: SlagItem[];
  selectedItem: SlagItem | null;
  activeTypeFilter: SlagItemType | 'all';
  activeTagFilter: string | null;
  isRightPanelOpen: boolean;
  isFullscreenEditorOpen: boolean;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;
  isFolderModalOpen: boolean;
  editingFolder: FolderMeta | null;
  isTriageModalOpen: boolean;
  aiSettings: AiSettings;
  toasts: ToastMessage[];

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

const DEFAULT_AI_SETTINGS: AiSettings = {
  geminiApiKey: '',
  model: 'gemini-2.0-flash',
  autoTagging: true,
  autoTriage: true,
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vault, setVault] = useState<VaultMeta>(storage.getCurrentVault());
  const [vaults, setVaults] = useState<VaultMeta[]>(storage.getVaults());
  const [folders, setFolders] = useState<FolderMeta[]>(storage.getFolders());
  const [currentFolder, setCurrentFolder] = useState<string>('Входящие');
  const [items, setItems] = useState<SlagItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<SlagItem | null>(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState<SlagItemType | 'all'>('all');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [editingFolder, setEditingFolder] = useState<FolderMeta | null>(null);
  const [isTriageModalOpen, setIsTriageModalOpen] = useState<boolean>(false);

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
    }, 3200);
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

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Keyboard shortcut listener: Cmd+K / Ctrl+K for search, Escape to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        if (isFullscreenEditorOpen) setIsFullscreenEditorOpen(false);
        else if (isSearchOpen) setIsSearchOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isFolderModalOpen) setIsFolderModalOpen(false);
        else if (isTriageModalOpen) setIsTriageModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenEditorOpen, isSearchOpen, isSettingsOpen, isFolderModalOpen, isTriageModalOpen]);

  const saveAiSettings = (newSettings: Partial<AiSettings>) => {
    const updated = { ...aiSettings, ...newSettings };
    setAiSettings(updated);
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(updated));
    addToast('Настройки ИИ сохранены', 'success');
  };

  const saveItem = (itemData: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }): SlagItem => {
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
      priority: itemData.priority || (itemData.type === 'task' ? 'none' : undefined),
      dueDate: itemData.dueDate,
      reminder: itemData.reminder,
      subtasks: itemData.subtasks || [],
      readingTimeMinutes: itemData.readingTimeMinutes || (itemData.type === 'article' ? Math.max(1, Math.round(itemData.content.split(/\s+/).length / 200)) : undefined),
      summary: itemData.summary,
    };

    const saved = storage.saveItem(newItem);
    refreshData();
    return saved;
  };

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
    addToast('Запись удалена', 'info');
  };

  const toggleTaskComplete = (itemId: string, subtaskId?: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    if (subtaskId && item.subtasks) {
      const updatedSubtasks = item.subtasks.map(st => 
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      );
      // Auto complete parent if all subtasks completed
      const allDone = updatedSubtasks.every(st => st.completed);
      updateItem({
        ...item,
        subtasks: updatedSubtasks,
        status: allDone ? 'done' : item.status === 'done' ? 'in_progress' : item.status,
      });
    } else {
      const newStatus = item.status === 'done' ? 'todo' : 'done';
      // If completing main task, toggle all subtasks
      const updatedSubtasks = item.subtasks?.map(st => ({
        ...st,
        completed: newStatus === 'done',
      }));
      updateItem({
        ...item,
        status: newStatus,
        subtasks: updatedSubtasks,
      });
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
    addToast('Папка удалена, заметки перенесены во Входящие', 'info');
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
    setEditingFolder(parentPath ? { path: `${parentPath}/`, name: '', description: '' } : null);
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

  // Filter items by current folder, type filter, and tag filter
  const filteredItems = items.filter(item => {
    // Folder match: if currentFolder is "Входящие", show items where folder is "Входящие"
    // If it's a parent folder, show items in this folder or subfolders
    const matchesFolder = item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
    if (!matchesFolder) return false;

    if (activeTypeFilter !== 'all' && item.type !== activeTypeFilter) {
      return false;
    }

    if (activeTagFilter && !item.tags.includes(activeTagFilter)) {
      return false;
    }

    return true;
  }).sort((a, b) => a.createdAt - b.createdAt); // Chronological stream for Telegram feel

  return (
    <AppContext.Provider
      value={{
        vault,
        vaults,
        folders,
        currentFolder,
        items,
        filteredItems,
        selectedItem,
        activeTypeFilter,
        activeTagFilter,
        isRightPanelOpen,
        isFullscreenEditorOpen,
        isSearchOpen,
        isSettingsOpen,
        isFolderModalOpen,
        editingFolder,
        isTriageModalOpen,
        aiSettings,
        toasts,
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

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
