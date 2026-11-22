// The context's public contract and the shapes passed around it, kept out of state.
/**
 * The contract AppContext exposes to every consumer, plus the shapes the UI
 * passes around it. Kept apart from the provider so reading the API does not
 * mean scrolling through two thousand lines of state.
 */
import type * as React from 'react';
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
AppUpdateState,
} from '../types';
import type { SettingsTabId } from '../config/settingsTabs';
import type { FolderDropMode } from '../lib/vault/folderTree';
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

export interface FolderViewTarget {
  anchor: HTMLButtonElement;
  mode?: FeedViewMode;
  changeLocalMode?: (mode: FeedViewMode) => void;
}

export type FolderViewSection = 'main' | 'sort' | 'filters';

export interface AppContextType {
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
  folderMoveTarget: string | null;
  openFolderMoveModal: (folderPath: string) => void;
  closeFolderMoveModal: () => void;
  renameFolder: (oldPath: string, updatedFolder: FolderMeta) => void;
  /** Drop a folder onto another one, next to it, or at the root; `true` when the drop stuck. */
  moveFolder: (path: string, targetPath: string, mode: FolderDropMode) => boolean;
  setIsTriageModalOpen: (open: boolean) => void;
  isComposerModalOpen: boolean;
  composerModalOptions: { type?: SlagItemType; status?: SlagItemStatus; folder?: string; dueDate?: string; reminder?: string } | null;
  openComposerModal: (options?: { type?: SlagItemType; status?: SlagItemStatus; folder?: string; dueDate?: string; reminder?: string }) => void;
  closeComposerModal: () => void;

  // Folder View & Filter Settings (Todoist / Linear style)
  isFolderViewModalOpen: boolean;
  folderViewTarget: FolderViewTarget | null;
  folderViewSection: FolderViewSection;
  setFolderViewSection: (section: FolderViewSection) => void;
  openFolderViewModal: (target: FolderViewTarget) => void;
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

  // In-app self-update: version, a newer release and the install flow.
  appUpdate: AppUpdateState;
}
