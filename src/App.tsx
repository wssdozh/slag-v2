import React, { useCallback, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { WorkspaceShell } from './components/Workspace/WorkspaceShell';
import { MobileShell } from './components/Mobile/MobileShell';
import { MobileActionSheet } from './components/UI/MobileActionSheet';
import { SearchModal } from './components/Search/SearchModal';
import { FolderModal } from './components/Modals/FolderModal';
import { FolderInfoModal } from './components/Modals/FolderInfoModal';
import { VaultModal } from './components/Modals/VaultModal';
import { ComposerModal } from './components/Modals/ComposerModal';
import { QuickComposerWindow } from './components/Composer/QuickComposerWindow';
import { ContextMenu } from './components/UI/ContextMenu';
import { ToastContainer } from './components/UI/Toast';
import { ImageLightbox } from './components/UI/ImageLightbox';
import { useVisualViewport } from './hooks/useVisualViewport';
import { Monitor } from 'lucide-react';
import { enrichAttachment, extractFocalContext } from './lib/attachmentEnrichment';
import type { LightboxImage } from './components/UI/ImageLightbox';

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

  useVisualViewport();

  const isDesktopWidth = typeof window !== 'undefined' && window.innerWidth >= 768;

  // Standalone Native Popout & Quick Composer Window Router
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isQuickComposer = urlParams?.get('window') === 'quick-composer';
  if (isQuickComposer) {
    return <QuickComposerWindow />;
  }

  const standalonePanelId = urlParams?.get('panel');
  const standalonePanelTitle = urlParams?.get('title') || 'SLAG';

  if (standalonePanelId) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-canvas text-fg-primary select-none relative">
        <WorkspaceShell initialPanel={{ id: standalonePanelId, title: standalonePanelTitle }} />
      </div>
    );
  }

  if (isMobile && forceMobileMode && isDesktopWidth) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-canvas-subtle flex flex-col items-center justify-center p-4 relative select-none">
        {/* Top Banner with Toggle Back */}
        <div className="absolute top-3 inset-x-0 flex items-center justify-center pointer-events-none z-50">
          <button
            onClick={toggleMobileMode}
            className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs text-white backdrop-blur-md border border-white/[0.08] shadow-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Вернуться в десктопный режим</span>
          </button>
        </div>

        <div className="w-full max-w-[390px] h-[844px] max-h-[92vh] bg-canvas rounded-[40px] border-4 border-white/[0.12] shadow-2xl flex flex-col overflow-hidden relative">
          <MobileShell />
        </div>

        <MobileActionSheet />
        <FullscreenEditor />
        <SearchModal />
        <SettingsModal />
        <FolderModal />
        <FolderInfoModal />
        <VaultModal />
        <TriageModal />
        <ComposerModal />
        <LogModal />
        <ToastContainer />
        <ImageLightbox
          images={lightboxImages}
          currentIndex={activeLightboxIndex ?? 0}
          isOpen={activeLightboxIndex !== null}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          onRetryEnrich={handleRetryEnrich}
        />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-canvas text-fg-primary select-none relative">
      {isMobile ? <MobileShell /> : <WorkspaceShell />}

      {/* Global Right-Click Context Menu (Desktop) & Mobile Action Sheet (Touch) */}
      {!isMobile && <ContextMenu />}
      <MobileActionSheet />

      {/* Global Modals & Overlays */}
      <Suspense fallback={null}>
        <FullscreenEditor />
        <SettingsModal />
        <TriageModal />
        <LogModal />
      </Suspense>
      <SearchModal />
      <FolderModal />
      <FolderInfoModal />
      <VaultModal />
      <ComposerModal />
      <ToastContainer />
      <ImageLightbox
        images={lightboxImages}
        currentIndex={activeLightboxIndex ?? 0}
        isOpen={activeLightboxIndex !== null}
        onClose={closeLightbox}
        onNavigate={navigateLightbox}
        onRetryEnrich={handleRetryEnrich}
      />
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
