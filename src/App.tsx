import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { FeedHeader } from './components/Feed/FeedHeader';
import { FeedList } from './components/Feed/FeedList';
import { Composer } from './components/Feed/Composer';
import { AssistantChat } from './components/Feed/AssistantChat';
import { KanbanBoard } from './components/Views/KanbanBoard';
import { CalendarView } from './components/Views/CalendarView';
import { FolderInfoPanel } from './components/RightPanel/FolderInfoPanel';
import { WorkspaceShell } from './components/Workspace/WorkspaceShell';
import { FullscreenEditor } from './components/Editor/FullscreenEditor';
import { SearchModal } from './components/Search/SearchModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FolderModal } from './components/Modals/FolderModal';
import { TriageModal } from './components/Modals/TriageModal';
import { ContextMenu } from './components/UI/ContextMenu';
import { ToastContainer } from './components/UI/Toast';
import { ImageLightbox } from './components/UI/ImageLightbox';

const LAYOUT_ENGINE_KEY = 'slag_layout_engine_v1';

interface MainLayoutProps {
  onToggleLayout: () => void;
  layoutMode: 'dockview' | 'classic';
}

const MainLayout: React.FC<MainLayoutProps> = ({ onToggleLayout, layoutMode }) => {
  const {
    setSidebarWidth,
    setRightPanelWidth,
    isRightPanelOpen,
    feedViewMode,
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

      {/* 2. Center Column: Telegram-Style Stream / Monologue Feed, Kanban, Calendar, or AI Assistant */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        <FeedHeader onToggleLayout={onToggleLayout} layoutMode={layoutMode} />
        {feedViewMode === 'kanban' ? (
          <KanbanBoard />
        ) : feedViewMode === 'calendar' ? (
          <CalendarView />
        ) : feedViewMode === 'assistant' ? (
          <AssistantChat />
        ) : (
          <>
            <FeedList />
            <Composer />
          </>
        )}
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
    </div>
  );
};

const AppContent: React.FC = () => {
  const {
    lightboxImages,
    activeLightboxIndex,
    closeLightbox,
    navigateLightbox,
    addToast
  } = useApp();

  const [layoutMode, setLayoutMode] = useState<'dockview' | 'classic'>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_ENGINE_KEY);
      if (saved === 'dockview' || saved === 'classic') {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'classic';
  });

  const toggleLayout = useCallback(() => {
    setLayoutMode(prev => {
      const next = prev === 'dockview' ? 'classic' : 'dockview';
      try {
        localStorage.setItem(LAYOUT_ENGINE_KEY, next);
      } catch {
        // Ignore
      }
      addToast(next === 'dockview' ? 'Режим: Модульная IDE-сетка (Dockview)' : 'Режим: Классический фиксированный', 'info');
      return next;
    });
  }, [addToast]);

  // Global shortcut (Ctrl+. or Cmd+.) to toggle layout engine
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        toggleLayout();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleLayout]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none relative">
      {layoutMode === 'dockview' ? (
        <WorkspaceShell onToggleLayout={toggleLayout} layoutMode="dockview" />
      ) : (
        <MainLayout onToggleLayout={toggleLayout} layoutMode="classic" />
      )}

      {/* Global Right-Click Context Menu */}
      <ContextMenu />

      {/* Global Modals & Overlays */}
      <FullscreenEditor />
      <SearchModal />
      <SettingsModal />
      <FolderModal />
      <TriageModal />
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
