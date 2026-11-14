// The app shell: routes, lazy-loaded screens, viewport height and global overlays.
import React, { useCallback, useState, useEffect, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { navigatePage } from './lib/navigation';
import { MobileShell } from './components/Mobile/MobileShell';
import { useVisualViewportHeight } from './hooks/layout/useVisualViewportHeight';
import { useDeepLink } from './hooks/ui/useDeepLink';
import { useAssistantActions } from './hooks/ui/useAssistantActions';
import { InitialSyncBoundary } from './components/InitialSyncBoundary';
import { ConfirmDialog } from './components/Modals/ConfirmDialog';
import { ToastContainer } from './components/UI/Toast';
import { Monitor } from 'lucide-react';
import { enrichAttachment } from './lib/media/enrichment/dispatch';
import { extractFocalContext } from './lib/media/enrichment/text';
import { setupAudioCollisionGuard } from './lib/media/audioHelper';
import type { LightboxImage } from './components/UI/ImageLightbox';

const WorkspaceShell = lazy(() =>
  import('./components/Workspace/WorkspaceShell').then((m) => ({ default: m.WorkspaceShell }))
);
const SearchModal = lazy(() =>
  import('./components/Search/SearchModal').then((m) => ({ default: m.SearchModal }))
);
const FullscreenEditor = lazy(() =>
  import('./components/Editor/FullscreenEditor').then((m) => ({ default: m.FullscreenEditor }))
);
const SettingsModal = lazy(() =>
  import('./components/Modals/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const TriageModal = lazy(() =>
  import('./components/Modals/TriageModal').then((m) => ({ default: m.TriageModal }))
);
const LogModal = lazy(() =>
  import('./components/Logs/LogModal').then((m) => ({ default: m.LogModal }))
);
const SiteRedirect = lazy(() =>
  import('./components/Landing/SiteRedirect').then((m) => ({ default: m.SiteRedirect }))
);
const AccountCabinet = lazy(() =>
  import('./components/Account/AccountCabinet').then((m) => ({ default: m.AccountCabinet }))
);
const AdminPanel = lazy(() =>
  import('./components/Admin/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const FolderModal = lazy(() =>
  import('./components/Modals/FolderModal').then((m) => ({ default: m.FolderModal }))
);
const FolderInfoModal = lazy(() =>
  import('./components/Modals/FolderInfoModal').then((m) => ({ default: m.FolderInfoModal }))
);
const FolderViewModal = lazy(() =>
  import('./components/Modals/FolderViewModal').then((m) => ({ default: m.FolderViewModal }))
);
const VaultModal = lazy(() =>
  import('./components/Modals/VaultModal').then((m) => ({ default: m.VaultModal }))
);
const ComposerModal = lazy(() =>
  import('./components/Modals/ComposerModal').then((m) => ({ default: m.ComposerModal }))
);
const QuickComposerWindow = lazy(() =>
  import('./components/Composer/QuickComposerWindow').then((m) => ({ default: m.QuickComposerWindow }))
);
const AttachSheet = lazy(() =>
  import('./components/Media/AttachSheet').then((m) => ({ default: m.AttachSheet }))
);
const ImageLightbox = lazy(() =>
  import('./components/UI/ImageLightbox').then((m) => ({ default: m.ImageLightbox }))
);
const ContextMenu = lazy(() =>
  import('./components/UI/ContextMenu').then((m) => ({ default: m.ContextMenu }))
);
const MobileActionSheet = lazy(() =>
  import('./components/UI/MobileActionSheet').then((m) => ({ default: m.MobileActionSheet }))
);

/**
 * `lazy()` only defers the import until React first renders the component, and these overlays
 * are rendered on every boot even though they are closed for the whole first minute of work.
 * Mount one on its first open and keep it mounted afterwards: an unmount on close would cut
 * the exit animation short (the same reason the editor stays mounted once it has been opened).
 */
const useMountedOnOpen = (isOpen: boolean) => {
  const [hasMounted, setHasMounted] = useState(false);
  if (isOpen && !hasMounted) setHasMounted(true);
  return hasMounted;
};

/** A lazy overlay that has not been opened yet renders nothing, so its chunk stays on the shelf. */
const LazyOverlay: React.FC<{ mounted: boolean; children: React.ReactNode }> = ({ mounted, children }) =>
  mounted ? <Suspense fallback={null}>{children}</Suspense> : null;

const AppContent: React.FC = () => {
  const {
    isMobile,
    forceMobileMode,
    toggleMobileMode,
    lightboxImages,
    activeLightboxIndex,
    closeLightbox,
    navigateLightbox,
    updateLightboxImage,
    items,
    updateItem,
    aiSettings,
    isFullscreenEditorOpen,
    isFolderModalOpen,
    isFolderInfoModalOpen,
    isFolderViewModalOpen,
    isVaultModalOpen,
    isComposerModalOpen,
    attachSheet,
    contextMenu,
    mobileActionSheetItem,
    isSettingsOpen,
    isTriageModalOpen,
    isLogViewerOpen,
    isSearchOpen,
    scrollToItem,
    executeSuggestedAction,
  } = useApp();

  // A `slag://note/…` link from telegram (or anywhere else) lands on the same jump a wiki link
  // inside the app makes: switch folder, highlight, scroll.
  useDeepLink(scrollToItem);

  // A button under a telegram answer runs the same executor the confirmation card runs: the tap
  // happens where the model is, not where the card is, so the wiring lives at the shell.
  useAssistantActions(executeSuggestedAction);

  // A lazy component starts importing the moment React renders it, so the editor's CodeMirror
  // chunk (641 kB, the second biggest in the build) used to land on the first paint even though
  // the editor renders null until a note opens. Mount it on first open and keep it mounted
  // afterwards: unmounting on close would cut the exit animation short.
  const isEditorMounted = useMountedOnOpen(isFullscreenEditorOpen);
  const isFolderModalMounted = useMountedOnOpen(isFolderModalOpen);
  const isFolderInfoModalMounted = useMountedOnOpen(isFolderInfoModalOpen);
  const isFolderViewModalMounted = useMountedOnOpen(isFolderViewModalOpen);
  const isVaultModalMounted = useMountedOnOpen(isVaultModalOpen);
  const isComposerModalMounted = useMountedOnOpen(isComposerModalOpen);
  const isAttachSheetMounted = useMountedOnOpen(attachSheet !== null);
  const isLightboxMounted = useMountedOnOpen(activeLightboxIndex !== null);
  const isContextMenuMounted = useMountedOnOpen(contextMenu !== null);
  const isActionSheetMounted = useMountedOnOpen(mobileActionSheetItem !== null);
  const isSettingsMounted = useMountedOnOpen(isSettingsOpen);
  const isTriageModalMounted = useMountedOnOpen(isTriageModalOpen);
  const isLogModalMounted = useMountedOnOpen(isLogViewerOpen);
  const isSearchModalMounted = useMountedOnOpen(isSearchOpen);

  const handleRetryEnrich = useCallback(async (image: LightboxImage) => {
    if (!image.itemId || !image.id) return;
    const parentItem = items.find(i => i.id === image.itemId);
    if (!parentItem) return;
    const targetAtt = parentItem.attachments?.find(a => a.id === image.id);
    if (!targetAtt) return;

    updateLightboxImage(image.id, { enrichmentStatus: 'processing', enrichmentError: undefined });

    try {
      const enriched = await enrichAttachment(targetAtt, extractFocalContext(parentItem), aiSettings);
      updateLightboxImage(image.id, {
        extractedText: enriched.extractedText,
        summary: enriched.summary,
        enrichmentStatus: enriched.enrichmentStatus,
        enrichmentError: enriched.enrichmentError,
      });

      const updatedAttachments = parentItem.attachments?.map(a => a.id === targetAtt.id ? enriched : a);
      const updatedItem = { ...parentItem, attachments: updatedAttachments };
      await updateItem(updatedItem);
    } catch (err: any) {
      updateLightboxImage(image.id, {
        enrichmentStatus: 'error',
        enrichmentError: err?.message || 'Ошибка обработки',
      });
    }
  }, [items, updateItem, aiSettings, updateLightboxImage]);

  useVisualViewportHeight();

  // One voice at a time, everywhere: the feed, the editor, the audio panel.
  useEffect(() => setupAudioCollisionGuard(), []);

  // Search sits in its own chunk (Orama index). Warm it after first paint so the
  // first mod+f does not stutter, without putting it on the startup critical path.
  useEffect(() => {
    const prefetch = () => {
      void import('./components/Search/SearchModal');
    };
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(prefetch, { timeout: 3000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(prefetch, 1500);
    return () => clearTimeout(timer);
  }, []);

  const [currentPage, setCurrentPage] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('page') : null;
  });

  useEffect(() => {
    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search).get('page');
      setCurrentPage(p);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const isDesktopWidth = typeof window !== 'undefined' && window.innerWidth >= 768;

  // Standalone Native Popout & Quick Composer Window Router
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isQuickComposer = urlParams?.get('window') === 'quick-composer';
  if (isQuickComposer) {
    return (
      <Suspense fallback={null}>
        <QuickComposerWindow />
      </Suspense>
    );
  }

  if (currentPage === 'landing') {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-canvas-subtle select-text">
        <Suspense fallback={<div className="min-h-screen bg-canvas-subtle" />}>
          <SiteRedirect onNavigateToAccount={() => navigatePage('account')} />
        </Suspense>
      </div>
    );
  }

  if (currentPage === 'account') {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-canvas-subtle select-text">
        <Suspense fallback={<div className="min-h-screen bg-canvas-subtle" />}>
          <AccountCabinet />
        </Suspense>
        {/* The cabinet asks its own questions and shows its own toasts; without these two the
            confirm promise never resolves and every destructive action becomes a silent no-op. */}
        <ToastContainer />
        <ConfirmDialog />
      </div>
    );
  }

  if (currentPage === 'admin') {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-canvas-subtle select-text">
        <Suspense fallback={<div className="min-h-screen bg-canvas-subtle" />}>
          <AdminPanel />
        </Suspense>
        <ToastContainer />
        <ConfirmDialog />
      </div>
    );
  }

  const standalonePanelId = urlParams?.get('panel');
  const standalonePanelTitle = urlParams?.get('title') || 'SLAG';

  if (standalonePanelId) {
    return (
      <div className="w-screen app-shell overflow-hidden bg-canvas text-fg-primary select-none relative">
        <InitialSyncBoundary>
          <Suspense fallback={null}>
            <WorkspaceShell initialPanel={{ id: standalonePanelId, title: standalonePanelTitle }} />
          </Suspense>
        </InitialSyncBoundary>
        <LazyOverlay mounted={isVaultModalMounted}>
          <VaultModal />
        </LazyOverlay>
        <ToastContainer />
      </div>
    );
  }

  if (isMobile && forceMobileMode && isDesktopWidth) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-canvas-subtle flex flex-col items-center justify-center p-4 relative select-none">
        <InitialSyncBoundary>
        {/* Top Banner with Toggle Back */}
        <div className="absolute top-3 inset-x-0 flex items-center justify-center pointer-events-none z-50">
          <button
            onClick={toggleMobileMode}
            className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs text-white backdrop-blur-md border border-white/[0.08] shadow-lg flex items-center gap-2 cursor-pointer motion-press"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Вернуться в десктопный режим</span>
          </button>
        </div>

        <div className="w-full max-w-[390px] h-[844px] max-h-[92vh] bg-canvas rounded-[40px] border-4 border-white/[0.12] shadow-2xl flex flex-col overflow-hidden relative">
          <MobileShell />
        </div>

        <LazyOverlay mounted={isActionSheetMounted}>
          <MobileActionSheet />
        </LazyOverlay>
        {isEditorMounted && (
          <Suspense fallback={null}>
            <FullscreenEditor />
          </Suspense>
        )}
        <LazyOverlay mounted={isSearchModalMounted}>
          <SearchModal />
        </LazyOverlay>
        <LazyOverlay mounted={isSettingsMounted}>
          <SettingsModal />
        </LazyOverlay>
        <LazyOverlay mounted={isFolderModalMounted}>
          <FolderModal />
        </LazyOverlay>
        <LazyOverlay mounted={isFolderInfoModalMounted}>
          <FolderInfoModal />
        </LazyOverlay>
        <LazyOverlay mounted={isFolderViewModalMounted}>
          <FolderViewModal />
        </LazyOverlay>
        <LazyOverlay mounted={isTriageModalMounted}>
          <TriageModal />
        </LazyOverlay>
        <LazyOverlay mounted={isComposerModalMounted}>
          <ComposerModal />
        </LazyOverlay>
        <LazyOverlay mounted={isLogModalMounted}>
          <LogModal />
        </LazyOverlay>
        </InitialSyncBoundary>
        <LazyOverlay mounted={isVaultModalMounted}>
          <VaultModal />
        </LazyOverlay>
        <ToastContainer />
        <LazyOverlay mounted={isLightboxMounted}>
          <ImageLightbox
            images={lightboxImages}
            currentIndex={activeLightboxIndex ?? 0}
            isOpen={activeLightboxIndex !== null}
            onClose={closeLightbox}
            onNavigate={navigateLightbox}
            onRetryEnrich={handleRetryEnrich}
          />
        </LazyOverlay>
        <ConfirmDialog />
        <LazyOverlay mounted={isAttachSheetMounted}>
          <AttachSheet />
        </LazyOverlay>
      </div>
    );
  }

  return (
    <div className="w-screen app-shell overflow-hidden bg-canvas text-fg-primary select-none relative">
      <InitialSyncBoundary>
      {isMobile ? (
        <MobileShell />
      ) : (
        <Suspense fallback={null}>
          <WorkspaceShell />
        </Suspense>
      )}

      {/* Global Right-Click Context Menu (Desktop) & Mobile Action Sheet (Touch) */}
      {!isMobile && (
        <LazyOverlay mounted={isContextMenuMounted}>
          <ContextMenu />
        </LazyOverlay>
      )}
      <LazyOverlay mounted={isActionSheetMounted}>
        <MobileActionSheet />
      </LazyOverlay>

      {/* Global Modals & Overlays. Each mounts on its first open: a `lazy()` component is
          imported the moment React renders it, so always-rendered modals used to land on the
          first frame even though they are closed for the whole first minute of work. */}
      <LazyOverlay mounted={isSettingsMounted}>
        <SettingsModal />
      </LazyOverlay>
      <LazyOverlay mounted={isTriageModalMounted}>
        <TriageModal />
      </LazyOverlay>
      <LazyOverlay mounted={isLogModalMounted}>
        <LogModal />
      </LazyOverlay>
      <LazyOverlay mounted={isSearchModalMounted}>
        <SearchModal />
      </LazyOverlay>
      {(isEditorMounted) && (
        <Suspense fallback={null}>
          <FullscreenEditor />
        </Suspense>
      )}
      <LazyOverlay mounted={isFolderModalMounted}>
        <FolderModal />
      </LazyOverlay>
      <LazyOverlay mounted={isFolderInfoModalMounted}>
        <FolderInfoModal />
      </LazyOverlay>
      <LazyOverlay mounted={isFolderViewModalMounted}>
        <FolderViewModal />
      </LazyOverlay>
      <LazyOverlay mounted={isComposerModalMounted}>
        <ComposerModal />
      </LazyOverlay>
      </InitialSyncBoundary>
      <LazyOverlay mounted={isVaultModalMounted}>
        <VaultModal />
      </LazyOverlay>
      <ToastContainer />
      <LazyOverlay mounted={isLightboxMounted}>
        <ImageLightbox
          images={lightboxImages}
          currentIndex={activeLightboxIndex ?? 0}
          isOpen={activeLightboxIndex !== null}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          onRetryEnrich={handleRetryEnrich}
        />
      </LazyOverlay>
      {/* Last in the tree: it asks above whatever dialog is open, so it must paint above them. */}
      <LazyOverlay mounted={isAttachSheetMounted}>
        <AttachSheet />
      </LazyOverlay>
      <ConfirmDialog />
    </div>
  );
};

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.warn('App recovered from runtime error:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex flex-col items-center justify-center bg-canvas text-fg-primary gap-4 font-mono">
          <p className="text-sm text-zinc-400">Произошла ошибка интерфейса</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs cursor-pointer transition-colors"
          >
            Восстановить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <AppProvider>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </AppProvider>
  );
}

export default App;
