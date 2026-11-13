// The desktop workspace: the dockview shell holding feed, Kanban, calendar, audio, logs.
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { FeedViewMode } from '../../types';
import {
  DockviewReact,
  type IDockviewPanelProps,
  type DockviewApi,
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
import { useCrossWindowDnd } from './useCrossWindowDnd';

const WorkspaceContentPanel: React.FC<{
  panelProps: IDockviewPanelProps;
  defaultMode?: FeedViewMode;
  syncWithGlobal?: boolean;
}> = ({ panelProps, defaultMode, syncWithGlobal = false }) => {
  const { feedViewMode, setFeedViewMode, currentFolder } = useApp();
  const [localMode, setLocalMode] = useState<FeedViewMode>(() => defaultMode || feedViewMode);
  // The feed scrolls under the composer, so the panel publishes the dock height for the list.
  const [attachComposerDock, composerInset] = useComposerInset();

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
              : currentFolder || DEFAULT_INBOX_FOLDER;
        panelProps.api.setTitle(title);
      }
    },
    [syncWithGlobal, setFeedViewMode, currentFolder, panelProps.api]
  );

  return (
    <main className="w-full h-full bg-canvas flex flex-col overflow-hidden min-w-[320px]">
      <FeedHeader viewMode={activeMode} onViewModeChange={handleModeChange} />
      {activeMode === 'kanban' ? (
        <KanbanBoard />
      ) : activeMode === 'calendar' ? (
        <CalendarView />
      ) : (
        <div
          className="flex-1 min-h-0 relative flex flex-col overflow-hidden"
          style={{ '--composer-inset': composerInset ? `${composerInset}px` : undefined } as React.CSSProperties}
        >
          <FeedList />
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
  sidebar: () => (
    <aside className="w-full h-full bg-panel overflow-hidden flex flex-col">
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
  const { currentFolder } = useApp();
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
      <WindowControls />

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
