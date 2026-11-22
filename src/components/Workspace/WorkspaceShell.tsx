// The desktop workspace: the dockview shell holding feed, Kanban, calendar, audio, logs.
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { FeedViewMode } from '../../types';
import {
  DockviewReact,
  type IDockviewPanelProps,
  type DockviewApi,
  type DockviewReadyEvent,
} from 'dockview-react';
import { Sidebar } from '../Sidebar/Sidebar';
import { FeedHeader } from '../Feed/FeedHeader';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { AssistantChat } from '../Feed/AssistantChat';
import { KanbanBoard } from '../Views/KanbanBoard';
import { CalendarView } from '../Views/CalendarView';
import { FolderInfoPanel } from '../RightPanel/FolderInfoPanel';
import { useComposerInset } from '../../hooks/layout/useComposerInset';
import { LogViewer } from '../Logs/LogViewer';
import { AudioPanel } from '../Audio/AudioPanel';
import { WindowControls } from '../UI/WindowControls';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { isDesktopApp, startDraggingWindow } from '../../lib/platform/windowControls';
import { useDockPanels } from './useDockPanels';
import { syncAllGroupConstraints } from './dockPanelUtils';
import type { TaskQuickFilter } from '../../lib/tasks/taskQuickFilter';
import { useLocalDay } from '../../hooks/useLocalDay';
import { useWorkspaceTaskFilter } from './useWorkspaceTaskFilter';
import { WorkspaceTaskFilterContext, useWorkspaceTaskFilterContext } from './workspaceTaskFilterContext';
import { useCrossWindowDnd } from './useCrossWindowDnd';

const WorkspaceContentPanel: React.FC<{
  panelProps: IDockviewPanelProps;
  defaultMode?: FeedViewMode;
  syncWithGlobal?: boolean;
}> = ({ panelProps, defaultMode, syncWithGlobal = false }) => {
  const { feedViewMode, currentFolder } = useApp();
  const { panelId, filter } = useWorkspaceTaskFilterContext();
  const taskFilter: TaskQuickFilter | undefined = panelId === panelProps.api.id ? filter : undefined;
  const [localMode, setLocalMode] = useState<FeedViewMode>(() => defaultMode || feedViewMode);
  // The feed scrolls under the composer, so the panel publishes the dock height for the list.
  const [attachComposerDock, composerInset] = useComposerInset();

  const activeMode = syncWithGlobal ? feedViewMode : localMode;

  const handleModeChange = useCallback(
    (mode: FeedViewMode) => {
      setLocalMode(mode);
      panelProps.api.setTitle(mode === 'kanban' ? 'Канбан' : mode === 'calendar' ? 'Календарь' : currentFolder || DEFAULT_INBOX_FOLDER);
    },
    [currentFolder, panelProps.api]
  );

  return (
    <main className="w-full h-full bg-canvas flex flex-col overflow-hidden min-w-0">
      <FeedHeader viewMode={activeMode} taskFilter={taskFilter} onViewModeChange={syncWithGlobal ? undefined : handleModeChange} />
      {activeMode === 'kanban' ? (
        <KanbanBoard taskFilter={taskFilter} />
      ) : activeMode === 'calendar' ? (
        <CalendarView taskFilter={taskFilter} />
      ) : (
        <div
          className="flex-1 min-h-0 relative flex flex-col overflow-hidden"
          style={{ '--composer-inset': composerInset ? `${composerInset}px` : undefined } as React.CSSProperties}
        >
          <FeedList taskFilter={taskFilter} />
          <div
            ref={attachComposerDock}
            data-testid="composer-dock"
            className="absolute bottom-0 inset-x-0 pointer-events-none z-20 pb-3 px-2 sm:pl-4 sm:pr-[22px] flex justify-center"
          >
            <div className="pointer-events-auto w-full max-w-[var(--feed-content-width,42rem)]">
              <Composer key={currentFolder} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  sidebar: Sidebar,
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
    <main className="w-full h-full bg-canvas flex flex-col overflow-hidden min-w-0">
      <AssistantChat variant="center" />
    </main>
  ),
  'folder-info': () => (
    <aside className="w-full h-full bg-panel flex flex-col overflow-hidden min-w-0">
      <FolderInfoPanel />
    </aside>
  ),
  logs: () => (
    <div className="w-full h-full bg-canvas flex flex-col overflow-hidden min-w-0">
      <LogViewer variant="dock" />
    </div>
  ),
  audio: () => (
    <div className="w-full h-full bg-canvas flex flex-col overflow-hidden min-w-0">
      <AudioPanel />
    </div>
  ),
};

export interface WorkspaceShellProps {
  initialPanel?: { id: string; title: string };
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({ initialPanel }) => {
  const { currentFolder, vault } = useApp();
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const { panelId, activeFilter, toggleFilter } = useWorkspaceTaskFilter(dockApi, JSON.stringify([vault.id, currentFolder]));
  const today = useLocalDay();
  const taskFilterContext = useMemo(() => ({ panelId, toggleFilter, filter: activeFilter ? { id: activeFilter, today } : undefined }), [panelId, toggleFilter, activeFilter, today]);
  const apiRef = useRef<DockviewApi | null>(null);

  const effectiveInitialPanel = useMemo(() => {
    if (initialPanel) return initialPanel;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const panel = sp.get('panel');
      if (panel) {
        return { id: panel, title: sp.get('title') || 'SLAG' };
      }
    }
    return undefined;
  }, [initialPanel]);

  const {
    dropPreview,
    handleWillDragPanel,
  } = useCrossWindowDnd({
    apiRef,
    effectiveInitialPanel,
  });

  const {
    onReady,
    getTabContextMenuItems,
    GroupHeaderActions,
  } = useDockPanels({
    apiRef,
    currentFolder,
    effectiveInitialPanel,
    onWillDragPanel: handleWillDragPanel,
  });

  const captionRef = useRef<HTMLDivElement>(null);
  const handleReady = useCallback((event: DockviewReadyEvent) => {
    onReady(event);
    setDockApi(event.api);
    const caption = captionRef.current;
    if (!caption) return;

    // Reserve only the portion of each grid header actually covered by the caption buttons.
    const alignCaption = () => {
      const controls = caption.getBoundingClientRect();
      const insets = event.api.groups.map(group => {
        const rect = group.element.getBoundingClientRect();
        const inset = group.api.location.type === 'grid' && rect.top < controls.bottom && rect.bottom > controls.top
          ? Math.max(0, Math.min(rect.right, controls.right) - Math.max(rect.left, controls.left))
          : 0;
        return { element: group.element, inset };
      });
      for (const { element, inset } of insets) {
        if (inset > 0) element.style.setProperty('--caption-inset', `${inset}px`);
        else element.style.removeProperty('--caption-inset');
      }
    };
    event.api.onDidLayoutChange(alignCaption);
    alignCaption();
  }, [onReady]);

  // Minimum widths are defined for a comfortable window; after a resize they are rescaled to what
  // actually fits, otherwise the grid ends up wider than the frame and the right pane gets clipped.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const api = apiRef.current;
        if (api) syncAllGroupConstraints(api);
      }, 200);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Native window dragging
  useEffect(() => {
    if (!isDesktopApp()) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.dv-void-container') &&
        !target?.closest('.dv-tab, .dv-tabs-container, button, input, .dv-right-actions-container, .dv-default-tab-action')
      ) {
        void startDraggingWindow();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // Update feed title
  useEffect(() => {
    if (apiRef.current) {
      const feedPanels = apiRef.current.panels.filter(
        p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_')
      );
      const targetTitle = currentFolder || DEFAULT_INBOX_FOLDER;
      feedPanels.forEach(p => p.api.setTitle(targetTitle));
    }
  }, [currentFolder]);

  // Assistant toggle
  useEffect(() => {
    const handleToggleAssistant = () => {
      const api = apiRef.current;
      if (!api) return;

      const assistantPanel = api.getPanel('panel_assistant') || api.panels.find(p => p.id.includes('assistant'));
      if (assistantPanel) {
        if (assistantPanel.api.isActive) {
          const infoPanel = api.getPanel('panel_info') || api.panels.find(p => p.id.includes('info'));
          if (infoPanel) {
            infoPanel.api.setActive();
          }
        } else {
          assistantPanel.api.setActive();
        }
      } else {
        try {
          const center = api.panels.find(p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_')) || api.panels[0];
          api.addPanel({
            id: 'panel_assistant',
            component: 'assistant',
            title: 'Ассистент',
            position: center ? { direction: 'right', referencePanel: center } : { direction: 'right' },
            initialWidth: 320,
            minimumWidth: 280, // Fallback
            maximumWidth: 640,
          });
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener('slag:toggle-assistant', handleToggleAssistant);
    return () => window.removeEventListener('slag:toggle-assistant', handleToggleAssistant);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-canvas text-fg-primary select-none relative z-0 isolate">
      <WindowControls ref={captionRef} />

      {dropPreview && (
        <div
          data-testid="drop-preview-indicator"
          style={{
            position: 'absolute',
            left: `${dropPreview.left}px`,
            top: `${dropPreview.top}px`,
            width: `${dropPreview.width}px`,
            height: `${dropPreview.height}px`,
          }}
          className="pointer-events-none z-[9999] rounded border border-blue-500/70 bg-blue-500/15 shadow-[0_0_20px_rgba(59,130,246,0.25)] transition-[border-color,background-color] duration-75"
        />
      )}

      <WorkspaceTaskFilterContext.Provider value={taskFilterContext}>
        <DockviewReact
          components={components}
          rightHeaderActionsComponent={GroupHeaderActions}
          getTabContextMenuItems={getTabContextMenuItems}
          onReady={handleReady}
          className="dockview-theme-slag w-full h-full"
          popoutUrl="/popout.html"
        />
      </WorkspaceTaskFilterContext.Provider>
    </div>
  );
};
