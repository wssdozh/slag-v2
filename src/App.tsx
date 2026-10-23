import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { WorkspaceShell } from './components/Workspace/WorkspaceShell';
import { MobileShell } from './components/Mobile/MobileShell';
import { MobileActionSheet } from './components/UI/MobileActionSheet';
import { FullscreenEditor } from './components/Editor/FullscreenEditor';
import { SearchModal } from './components/Search/SearchModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FolderModal } from './components/Modals/FolderModal';
import { TriageModal } from './components/Modals/TriageModal';
import { ContextMenu } from './components/UI/ContextMenu';
import { ToastContainer } from './components/UI/Toast';
import { ImageLightbox } from './components/UI/ImageLightbox';
import { LogModal } from './components/Logs/LogModal';
import { useVisualViewport } from './hooks/useVisualViewport';

const AppContent: React.FC = () => {
  const {
    isMobile,
    lightboxImages,
    activeLightboxIndex,
    closeLightbox,
    navigateLightbox,
  } = useApp();

  useVisualViewport();

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none relative">
      {isMobile ? <MobileShell /> : <WorkspaceShell />}

      {/* Global Right-Click Context Menu (Desktop) & Mobile Action Sheet (Touch) */}
      {!isMobile && <ContextMenu />}
      <MobileActionSheet />

      {/* Global Modals & Overlays */}
      <FullscreenEditor />
      <SearchModal />
      <SettingsModal />
      <FolderModal />
      <TriageModal />
      <LogModal />
      <ToastContainer />
      <ImageLightbox
        images={lightboxImages}
        currentIndex={activeLightboxIndex ?? 0}
        isOpen={activeLightboxIndex !== null}
        onClose={closeLightbox}
        onNavigate={navigateLightbox}
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
