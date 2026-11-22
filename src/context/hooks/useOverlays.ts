// Everything above the app: modals, lightbox, context menu, toasts, confirm, attach sheet.
import { useCallback, useRef, useState } from 'react';
import type {
  ConfirmOptions,
  LightboxImage,
  SlagAttachment,
  SlagItemStatus,
  SlagItemType,
  WorkspaceState,
} from '../../types';
import type { AttachSheetRequest, ContextMenuTarget, ToastMessage } from '../appContext.types';
import type { SettingsTabId } from '../../config/settingsTabs';
import { storage } from '../../lib/storage';
import { logger } from '../../lib/logger/logger';

/**
 * Everything that lives on top of the app: modals, lightbox, context menu, toasts,
 * the confirm question and the attach sheet.
 *
 * One reason to change вЂ” a new surface, or a new rule about layers. Nothing here
 * knows about notes, sync or the feed; when a modal needs vault data, the caller
 * passes it (folder info needs the current folder, that is the whole contract).
 */
export function useOverlays(currentFolder: string, initialWorkspace: WorkspaceState) {
  // Lightbox
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
    setLightboxImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
  }, []);

  // Editor and panels
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState<boolean>(() => {
    const fsState = initialWorkspace.fullscreenEditorState;
    if (fsState?.isOpen && fsState.itemId) {
      const rawItems = storage.getItems();
      return rawItems.some((it) => it.id === fsState.itemId) || fsState.itemId.startsWith('draft_');
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

  // Folder surfaces
  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [folderModalParent, setFolderModalParent] = useState<string | null>(null);
  const [isFolderInfoModalOpen, setIsFolderInfoModalOpen] = useState<boolean>(false);
  const [folderInfoTarget, setFolderInfoTarget] = useState<string | null>(null);
  const [folderMoveTarget, setFolderMoveTarget] = useState<string | null>(null);

  const openFolderInfoModal = useCallback((folderPath?: string) => {
    setFolderInfoTarget(folderPath || currentFolder);
    setIsFolderInfoModalOpen(true);
  }, [currentFolder]);

  const closeFolderInfoModal = useCallback(() => {
    setIsFolderInfoModalOpen(false);
    setFolderInfoTarget(null);
  }, []);

  // A move gets its own dialog: the folder stays where it is until the dialog commits.
  const openFolderMoveModal = useCallback((folderPath: string) => {
    setFolderMoveTarget(folderPath);
  }, []);

  const closeFolderMoveModal = useCallback(() => {
    setFolderMoveTarget(null);
  }, []);

  // Vault, triage, composer
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

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);

  // Toasts and the one pending question
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

  const addToast = useCallback((
    text: string,
    type: 'info' | 'success' | 'error' = 'info',
    action?: ToastMessage['action'],
  ) => {
    const id = 'toast_' + crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-2), { id, text, type, action }]);
    logger.log(type === 'error' ? 'error' : 'info', 'UI', `Toast: ${text}`);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openContextMenu = useCallback((target: ContextMenuTarget) => {
    setContextMenu(target);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const [attachSheet, setAttachSheet] = useState<AttachSheetRequest | null>(null);
  const openAttachSheet = useCallback((onAdd: (attachments: SlagAttachment[]) => void) => {
    setAttachSheet({ onAdd });
  }, []);
  const closeAttachSheet = useCallback(() => setAttachSheet(null), []);

  return {
    lightboxImages,
    activeLightboxIndex,
    openLightbox,
    closeLightbox,
    navigateLightbox,
    updateLightboxImage,
    isFullscreenEditorOpen,
    setIsFullscreenEditorOpen,
    isSearchOpen,
    setIsSearchOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab,
    setSettingsTab,
    openSettingsModal,
    isLogViewerOpen,
    setIsLogViewerOpen,
    isFolderModalOpen,
    setIsFolderModalOpen,
    folderModalParent,
    setFolderModalParent,
    isFolderInfoModalOpen,
    setIsFolderInfoModalOpen,
    folderInfoTarget,
    setFolderInfoTarget,
    openFolderInfoModal,
    closeFolderInfoModal,
    folderMoveTarget,
    openFolderMoveModal,
    closeFolderMoveModal,
    isVaultModalOpen,
    setIsVaultModalOpen,
    openVaultModal,
    closeVaultModal,
    isTriageModalOpen,
    setIsTriageModalOpen,
    isComposerModalOpen,
    setIsComposerModalOpen,
    composerModalOptions,
    setComposerModalOptions,
    openComposerModal,
    closeComposerModal,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    toasts,
    addToast,
    removeToast,
    confirmRequest,
    resolveConfirm,
    confirmAction,
    attachSheet,
    openAttachSheet,
    closeAttachSheet,
  };
}
