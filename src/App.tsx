import React, { useCallback, useState, useEffect, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { navigatePage } from './lib/navigation';
import { MobileShell } from './components/Mobile/MobileShell';
import { useVisualViewportHeight } from './hooks/layout/useVisualViewportHeight';
import { InitialSyncBoundary } from './components/InitialSyncBoundary';
import { MobileActionSheet } from './components/UI/MobileActionSheet';
import { ConfirmDialog } from './components/Modals/ConfirmDialog';
import { AttachSheet } from './components/Media/AttachSheet';
import { FolderModal } from './components/Modals/FolderModal';
import { FolderInfoModal } from './components/Modals/FolderInfoModal';
import { FolderViewModal } from './components/Modals/FolderViewModal';
import { VaultModal } from './components/Modals/VaultModal';
import { ComposerModal } from './components/Modals/ComposerModal';
import { QuickComposerWindow } from './components/Composer/QuickComposerWindow';
import { ContextMenu } from './components/UI/ContextMenu';
import { ToastContainer } from './components/UI/Toast';
import { ImageLightbox } from './components/UI/ImageLightbox';
import { Monitor } from 'lucide-react';
import { enrichAttachment, extractFocalContext } from './lib/media/attachmentEnrichment';
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
const LandingPage = lazy(() =>
  import('./components/Landing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const AccountCabinet = lazy(() =>
  import('./components/Account/AccountCabinet').then((m) => ({ default: m.AccountCabinet }))
);
const AdminPanel = lazy(() =>
  import('./components/Admin/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);

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
  } = useApp();

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
    return <QuickComposerWindow />;
  }

  if (currentPage === 'landing') {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-canvas-subtle select-text">
        <Suspense fallback={<div className="min-h-screen bg-canvas-subtle" />}>
          <LandingPage onNavigateToAccount={() => navigatePage('account')} />
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
      </div>
    );
  }

  if (currentPage === 'admin') {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-canvas-subtle select-text">
        <Suspense fallback={<div className="min-h-screen bg-canvas-subtle" />}>
          <AdminPanel />
        </Suspense>
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
        <VaultModal />
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

        <MobileActionSheet />
        <Suspense fallback={null}>
          <FullscreenEditor />
        </Suspense>
        <Suspense fallback={null}>
          <SearchModal />
        </Suspense>
        <SettingsModal />
        <FolderModal />
        <FolderInfoModal />
        <FolderViewModal />
        <TriageModal />
        <ComposerModal />
        <LogModal />
        </InitialSyncBoundary>
        <VaultModal />
        <ToastContainer />
        <ImageLightbox
          images={lightboxImages}
          currentIndex={activeLightboxIndex ?? 0}
          isOpen={activeLightboxIndex !== null}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          onRetryEnrich={handleRetryEnrich}
        />
        <ConfirmDialog />
        <AttachSheet />
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
      {!isMobile && <ContextMenu />}
      <MobileActionSheet />

      {/* Global Modals & Overlays */}
      <Suspense fallback={null}>
        <FullscreenEditor />
        <SettingsModal />
        <TriageModal />
        <LogModal />
        <SearchModal />
      </Suspense>
      <FolderModal />
      <FolderInfoModal />
      <FolderViewModal />
      <ComposerModal />
      </InitialSyncBoundary>
      <VaultModal />
      <ToastContainer />
      <ImageLightbox
        images={lightboxImages}
        currentIndex={activeLightboxIndex ?? 0}
        isOpen={activeLightboxIndex !== null}
        onClose={closeLightbox}
        onNavigate={navigateLightbox}
        onRetryEnrich={handleRetryEnrich}
      />
      {/* Last in the tree: it asks above whatever dialog is open, so it must paint above them. */}
      <AttachSheet />
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
