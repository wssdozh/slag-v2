import React, { useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { FeedHeader } from './components/Feed/FeedHeader';
import { FeedList } from './components/Feed/FeedList';
import { Composer } from './components/Feed/Composer';
import { FolderInfoPanel } from './components/RightPanel/FolderInfoPanel';
import { FullscreenEditor } from './components/Editor/FullscreenEditor';
import { SearchModal } from './components/Search/SearchModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FolderModal } from './components/Modals/FolderModal';
import { TriageModal } from './components/Modals/TriageModal';
import { ContextMenu } from './components/UI/ContextMenu';
import { ToastContainer } from './components/UI/Toast';

const MainLayout: React.FC = () => {
  const {
    setSidebarWidth,
    setRightPanelWidth,
    isRightPanelOpen
  } = useApp();

  const isDraggingSidebar = useRef(false);
  const isDraggingRight = useRef(false);

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const onPointerMove = (ev: PointerEvent) => {
      if (!isDraggingSidebar.current) return;
      setSidebarWidth(ev.clientX);
    };

    const onPointerUp = () => {
      isDraggingSidebar.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const startRightResize = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRight.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const onPointerMove = (ev: PointerEvent) => {
      if (!isDraggingRight.current) return;
      setRightPanelWidth(window.innerWidth - ev.clientX);
    };

    const onPointerUp = () => {
      isDraggingRight.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none relative">
      {/* 1. Left Sidebar */}
      <Sidebar />

      {/* Sidebar Resizer Splitter */}
      <div
        onPointerDown={startSidebarResize}
        className="w-1 hover:w-1.5 h-full cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-all z-20 shrink-0 select-none"
        title="Перетащите для изменения ширины"
      />

      {/* 2. Center Column: Telegram-Style Stream / Monologue Feed */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        <FeedHeader />
        <FeedList />
        <Composer />
      </main>

      {/* Right Panel Resizer Splitter */}
      {isRightPanelOpen && (
        <div
          onPointerDown={startRightResize}
          className="w-1 hover:w-1.5 h-full cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-all z-20 shrink-0 select-none"
          title="Перетащите для изменения ширины"
        />
      )}

      {/* 3. Right Column: Folder Info Panel, Statistics & Media Tabs */}
      <FolderInfoPanel />

      {/* Global Right-Click Context Menu */}
      <ContextMenu />

      {/* Modals & Overlays */}
      <FullscreenEditor />
      <SearchModal />
      <SettingsModal />
      <FolderModal />
      <TriageModal />
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
