import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { FeedViewMode } from '../../types';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type DockviewApi,
  type IDockviewPanel,
  type GetTabContextMenuItemsParams,
} from 'dockview-react';
import { Sidebar } from '../Sidebar/Sidebar';
import { FeedHeader } from '../Feed/FeedHeader';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { AssistantChat } from '../Feed/AssistantChat';
import { KanbanBoard } from '../Views/KanbanBoard';
import { CalendarView } from '../Views/CalendarView';
import { FolderInfoPanel } from '../RightPanel/FolderInfoPanel';
import { LogViewer } from '../Logs/LogViewer';
import { AudioPanel } from '../Audio/AudioPanel';
import { WindowControls } from '../UI/WindowControls';
import { isDesktopApp, openDetachedWindow } from '../../lib/windowControls';
import {
  Plus,
  Layers,
  Kanban,
  Calendar,
  Sparkles,
  Folder,
  Info,
  Terminal,
  Music,
  ExternalLink,
} from 'lucide-react';

const WORKSPACE_LAYOUT_KEY = 'slag_workspace_layout_v2';

// Dynamic Workspace Content Panel supporting Feed, Kanban, and Calendar
const WorkspaceContentPanel: React.FC<{
  panelProps: IDockviewPanelProps;
  defaultMode?: FeedViewMode;
  syncWithGlobal?: boolean;
}> = ({ panelProps, defaultMode, syncWithGlobal = false }) => {
  const { feedViewMode, setFeedViewMode, currentFolder } = useApp();
  const [localMode, setLocalMode] = useState<FeedViewMode>(() => defaultMode || feedViewMode);

  // If syncWithGlobal is true (e.g. for the primary panel_feed), mirror global feedViewMode
  const activeMode = syncWithGlobal ? feedViewMode : localMode;

  const handleModeChange = useCallback(
    (mode: FeedViewMode) => {
      if (syncWithGlobal) {
        setFeedViewMode(mode);
      } else {
        setLocalMode(mode);
        const title =
          mode === 'kanban'
            ? 'Канбан'
            : mode === 'calendar'
              ? 'Календарь'
              : currentFolder || 'Входящие';
        panelProps.api.setTitle(title);
      }
    },
    [syncWithGlobal, setFeedViewMode, currentFolder, panelProps.api]
  );

  return (
    <main className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
      <FeedHeader viewMode={activeMode} onViewModeChange={handleModeChange} />
      {activeMode === 'kanban' ? (
        <KanbanBoard />
      ) : activeMode === 'calendar' ? (
        <CalendarView />
      ) : (
        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
          <FeedList />
          {/* Floating Composer Island */}
          <div className="absolute bottom-0 inset-x-0 pointer-events-none z-20 pb-3 px-3 flex justify-center">
            <div className="pointer-events-auto max-w-2xl w-full">
              <Composer key={currentFolder} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

// Panel components registry for Dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  sidebar: () => (
    <aside className="w-full h-full bg-[#0c0c0e] overflow-hidden flex flex-col">
      <Sidebar />
    </aside>
  ),
  feed: (props) => (
    <WorkspaceContentPanel
      panelProps={props}
      syncWithGlobal={props.api.id === 'panel_feed'}
      defaultMode="feed"
    />
  ),
  kanban: (props) => (
    <WorkspaceContentPanel
      panelProps={props}
      defaultMode="kanban"
    />
  ),
  calendar: (props) => (
    <WorkspaceContentPanel
      panelProps={props}
      defaultMode="calendar"
    />
  ),
  assistant: () => (
    <main className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
      <AssistantChat variant="center" />
    </main>
  ),
  'folder-info': () => (
    <aside className="w-full h-full bg-[#0c0c0e] flex flex-col overflow-hidden min-w-0">
      <FolderInfoPanel />
    </aside>
  ),
  logs: () => (
    <div className="w-full h-full bg-[#08090a] flex flex-col overflow-hidden min-w-0">
      <LogViewer variant="dock" />
    </div>
  ),
  audio: () => (
    <div className="w-full h-full bg-[#09090b] flex flex-col overflow-hidden min-w-0">
      <AudioPanel />
    </div>
  ),
};

const PANELS_TO_ADD = [
  { id: 'feed', title: 'Лента', icon: Layers },
  { id: 'kanban', title: 'Канбан', icon: Kanban },
  { id: 'calendar', title: 'Календарь', icon: Calendar },
  { id: 'assistant', title: 'Ассистент', icon: Sparkles },
  { id: 'audio', title: 'Аудиоплеер', icon: Music },
  { id: 'sidebar', title: 'Навигация', icon: Folder },
  { id: 'folder-info', title: 'Инфо папки', icon: Info },
  { id: 'logs', title: 'Логи & HUD', icon: Terminal },
];

// Detach panel to native OS window (in desktop mode) or browser popout / floating group
const detachPanel = async (api: DockviewApi, panel: IDockviewPanel, box?: { left: number; top: number; width?: number; height?: number }) => {
  const panelWidth = box?.width || 760;
  const panelHeight = box?.height || 580;
  const left = box?.left ?? Math.max(40, window.screenX + 80);
  const top = box?.top ?? Math.max(40, window.screenY + 80);

  // 1. In native Tauri desktop app, spawn a genuine independent OS window
  if (isDesktopApp()) {
    const rawComponentId = panel.toJSON()?.contentComponent || panel.id.replace(/^panel_/, '').replace(/_\d+$/, '');
    const title = panel.title || 'Окно SLAG';
    const opened = await openDetachedWindow(rawComponentId, title, {
      left,
      top,
      width: panelWidth,
      height: panelHeight,
    });
    if (opened) {
      try {
        api.removePanel(panel);
      } catch {
        // Ignore if already unmounted
      }
      return;
    }
  }

  // 2. Web browser fallback: try window.open / popout.html
  try {
    const success = await api.addPopoutGroup(panel, {
      popoutUrl: '/popout.html',
      position: { left, top, width: panelWidth, height: panelHeight },
    });
    if (!success) {
      api.addFloatingGroup(panel, {
        x: Math.max(20, (window.innerWidth - panelWidth) / 2),
        y: Math.max(20, (window.innerHeight - panelHeight) / 2),
        width: panelWidth,
        height: panelHeight,
      });
    }
  } catch {
    api.addFloatingGroup(panel, {
      x: Math.max(20, (window.innerWidth - panelWidth) / 2),
      y: Math.max(20, (window.innerHeight - panelHeight) / 2),
      width: panelWidth,
      height: panelHeight,
    });
  }
};

// Header action [+] and popout buttons on each tab group
const GroupHeaderActions: React.FC<any> = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelSeqRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const addPanel = (panelId: string, title: string) => {
    setIsOpen(false);
    const containerApi = props.containerApi as DockviewApi | undefined;
    if (!containerApi) return;

    panelSeqRef.current += 1;
    const uniqueId = `panel_${panelId}_${panelSeqRef.current}`;

    try {
      containerApi.addPanel({
        id: uniqueId,
        component: panelId,
        title,
        position: { referenceGroup: props.group },
      });
    } catch {
      containerApi.addPanel({
        id: uniqueId,
        component: panelId,
        title,
      });
    }
  };

  const handlePopout = () => {
    const containerApi = props.containerApi as DockviewApi | undefined;
    const activePanel = props.activePanel as IDockviewPanel | undefined;
    if (containerApi && activePanel) {
      detachPanel(containerApi, activePanel);
    }
  };

  return (
    <div className="relative flex items-center h-full px-0.5 gap-0.5">
      <button
        onClick={handlePopout}
        className="w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
        title="Вынести вкладку в отдельное окно"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
        title="Добавить вкладку в эту группу"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full mt-1 w-44 rounded-lg bg-[#18181c] border border-white/[0.12] shadow-2xl py-1 z-50 animate-in fade-in duration-100"
        >
          <div className="px-2.5 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-white/[0.04]">
            Добавить вкладку
          </div>
          {PANELS_TO_ADD.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => addPanel(item.id, item.title)}
                className="w-full px-2.5 py-1.5 text-left text-xs flex items-center gap-2 text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 text-zinc-400" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const WorkspaceShell: React.FC = () => {
  const { currentFolder } = useApp();
  const apiRef = useRef<DockviewApi | null>(null);

  // Dynamically update feed panel tab title to match currentFolder
  useEffect(() => {
    if (apiRef.current) {
      const feedPanels = apiRef.current.panels.filter(
        p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_')
      );
      feedPanels.forEach(p => p.api.setTitle(currentFolder || 'Входящие'));
    }
  }, [currentFolder]);

  // Safety cleaner and singular guardian for Dockview drag-and-drop overlays
  useEffect(() => {
    const purgeStaleOverlays = () => {
      const dropzones = document.querySelectorAll(
        '.dv-drop-target-dropzone, .dv-drop-target-anchor, .dv-drop-target-selection'
      );
      if (dropzones.length > 0) {
        dropzones.forEach(el => el.remove());
      }
      document.querySelectorAll('.dv-drop-target').forEach(el => {
        el.classList.remove('dv-drop-target');
      });
    };

    // Clean up orphaned panel content dropzones (e.g. when drag exits a panel without dragleave)
    // Runs throttled via requestAnimationFrame so we never interrupt Dockview's active drag loop or tab stick
    let rafId: number | null = null;
    const cleanOrphanedContentDropzones = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const contentDropzones = Array.from(
          document.querySelectorAll<HTMLElement>('.dv-content-container > .dv-drop-target-dropzone')
        );
        if (contentDropzones.length > 1) {
          // Keep only the newest content dropzone, remove older orphaned ones
          for (let i = 0; i < contentDropzones.length - 1; i++) {
            const stale = contentDropzones[i];
            const parent = stale.closest('.dv-drop-target');
            stale.remove();
            if (parent && !parent.querySelector('.dv-drop-target-dropzone')) {
              parent.classList.remove('dv-drop-target');
            }
          }
        }
      });
    };

    const handlePointerOrDragEnd = (e: MouseEvent | DragEvent) => {
      if (e.buttons === 0 || e.type === 'dragend' || e.type === 'drop' || e.type === 'mouseup' || e.type === 'pointerup') {
        purgeStaleOverlays();
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          cleanOrphanedContentDropzones();
          break;
        }
      }
    });

    const dockHost = document.querySelector('.dockview-theme-slag') || document.body;
    observer.observe(dockHost, { childList: true, subtree: true });

    window.addEventListener('dragend', handlePointerOrDragEnd);
    window.addEventListener('drop', handlePointerOrDragEnd);
    window.addEventListener('mouseup', handlePointerOrDragEnd);
    window.addEventListener('pointerup', handlePointerOrDragEnd);
    window.addEventListener('blur', purgeStaleOverlays);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('dragend', handlePointerOrDragEnd);
      window.removeEventListener('drop', handlePointerOrDragEnd);
      window.removeEventListener('mouseup', handlePointerOrDragEnd);
      window.removeEventListener('pointerup', handlePointerOrDragEnd);
      window.removeEventListener('blur', purgeStaleOverlays);
    };
  }, []);

  const applyDefaultLayout = useCallback((api: DockviewApi) => {
    api.clear();

    // 1. Center workspace panel (DynamicFeedPanel: Feed / Kanban / Calendar)
    const centerPanel = api.addPanel({
      id: 'panel_feed',
      component: 'feed',
      title: currentFolder || 'Входящие',
    });

    // 2. Left navigation sidebar
    api.addPanel({
      id: 'panel_sidebar',
      component: 'sidebar',
      title: 'Навигация',
      position: { direction: 'left', referencePanel: centerPanel },
      initialWidth: 260,
    });

    // 3. Right Assistant & Info in a single group with tabs
    const assistantPanel = api.addPanel({
      id: 'panel_assistant',
      component: 'assistant',
      title: 'Ассистент',
      position: { direction: 'right', referencePanel: centerPanel },
      initialWidth: 320,
    });

    api.addPanel({
      id: 'panel_info',
      component: 'folder-info',
      title: 'Инфо',
      position: { referencePanel: assistantPanel },
    });
  }, [currentFolder]);

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    const saveLayout = () => {
      try {
        const json = event.api.toJSON();
        localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(json));
      } catch {
        // Ignore
      }
    };

    // Save layout on changes and clear lingering drop overlays
    event.api.onDidLayoutChange(() => {
      const dropzones = document.querySelectorAll(
        '.dv-drop-target-dropzone, .dv-drop-target-anchor, .dv-drop-target-selection'
      );
      if (dropzones.length > 0) {
        dropzones.forEach(el => el.remove());
      }
      document.querySelectorAll('.dv-drop-target').forEach(el => {
        el.classList.remove('dv-drop-target');
      });

      saveLayout();
    });

    // Save active tab selection across reloads
    event.api.onDidActivePanelChange(() => {
      saveLayout();
    });

    // Try restoring saved layout
    let restored = false;
    try {
      const savedLayout = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
      if (savedLayout) {
        event.api.fromJSON(JSON.parse(savedLayout));
        restored = true;
      }
    } catch {
      restored = false;
    }

    if (!restored) {
      applyDefaultLayout(event.api);
    }

    // Ensure feed panel tab reflects current folder
    const feedPanels = event.api.panels.filter(
      p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_')
    );
    feedPanels.forEach(p => p.api.setTitle(currentFolder || 'Входящие'));

    // Tab tear-off: drag tab out of application window to create an external/floating popout
    event.api.onWillDragPanel((dragEvent) => {
      const panel = dragEvent.panel;
      if (!panel) return;

      const handleDragEnd = (e: DragEvent) => {
        window.removeEventListener('dragend', handleDragEnd);

        // Check if cursor released outside main window bounds
        const isOutside =
          e.clientX < 10 ||
          e.clientX > window.innerWidth - 10 ||
          e.clientY < 10 ||
          e.clientY > window.innerHeight - 10 ||
          e.screenX < window.screenX ||
          e.screenX > window.screenX + window.outerWidth ||
          e.screenY < window.screenY ||
          e.screenY > window.screenY + window.outerHeight;

        if (isOutside) {
          detachPanel(event.api, panel, {
            left: e.screenX - 100,
            top: e.screenY - 30,
            width: 720,
            height: 540,
          });
        }
      };

      window.addEventListener('dragend', handleDragEnd, { once: true });
    });
  };

  const getTabContextMenuItems = useCallback((params: GetTabContextMenuItemsParams) => {
    const { panel, api } = params;
    return [
      {
        label: 'Вынести в отдельное окно',
        action: () => detachPanel(api, panel),
      },
      {
        label: 'Сделать плавающим',
        action: () => {
          api.addFloatingGroup(panel, {
            x: Math.max(20, (window.innerWidth - 680) / 2),
            y: Math.max(20, (window.innerHeight - 520) / 2),
            width: 680,
            height: 520,
          });
        },
      },
      'separator' as const,
      'close' as const,
      'closeOthers' as const,
      'closeAll' as const,
    ];
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none relative z-0 isolate">
      <WindowControls />
      <DockviewReact
        components={components}
        rightHeaderActionsComponent={GroupHeaderActions}
        getTabContextMenuItems={getTabContextMenuItems}
        onReady={onReady}
        className="dockview-theme-slag w-full h-full"
        popoutUrl="/popout.html"
      />
    </div>
  );
};
