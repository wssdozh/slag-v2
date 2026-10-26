import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
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
import { logger } from '../../lib/logger';
import {
  isDesktopApp,
  openDetachedWindow,
  closeWindow,
  restoreDetachedWindows,
  updateDetachedWindowBounds,
  sendCrossWindowTab,
  listenCrossWindowTab,
  type CrossWindowTabMessage,
} from '../../lib/windowControls';
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

const wsLog = logger.scope('WORKSPACE');

const getPanelComponent = (panel: IDockviewPanel): string => {
  return panel.toJSON()?.contentComponent || panel.id.replace(/^panel_/, '').replace(/_\d+$/, '');
};

// Detach panel to native OS window (in desktop mode) or browser popout / floating group
const detachPanel = async (api: DockviewApi, panel: IDockviewPanel, box?: { left: number; top: number; width?: number; height?: number }) => {
  const groupElement = (panel.group as any)?.element as HTMLElement | undefined;
  const rect = groupElement?.getBoundingClientRect();
  const panelWidth = box?.width || (rect ? Math.round(rect.width) : panel.api.width) || 760;
  const panelHeight = box?.height || (rect ? Math.round(rect.height) : panel.api.height) || 580;
  const left = box?.left ?? (rect ? Math.round(window.screenX + rect.left) : Math.max(40, window.screenX + 80));
  const top = box?.top ?? (rect ? Math.round(window.screenY + rect.top) : Math.max(40, window.screenY + 80));

  const rawComponentId = getPanelComponent(panel);
  const title = panel.title || 'Окно SLAG';

  wsLog.info(`Detaching panel [${rawComponentId}] "${title}"`, {
    panelId: panel.id,
    mode: isDesktopApp() ? 'native_window' : 'popout/floating',
    box: { left, top, width: panelWidth, height: panelHeight },
  });

  // Capture existing group widths to preserve proportions when panel/group is removed
  const panelGroup = panel.group;
  const remainingGroups = api.groups.filter(g => g !== panelGroup);
  const capturedWidths = new Map<string, number>();
  remainingGroups.forEach(g => {
    capturedWidths.set(g.id, g.api.width);
  });

  const restoreProportions = () => {
    requestAnimationFrame(() => {
      // If 2 groups remain (Center workspace + 1 side panel), keep side panel compact (~320px)
      if (api.groups.length === 2) {
        const centerGroup = api.groups.find(g =>
          g.panels.some(p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_'))
        );
        const sideGroup = api.groups.find(g => g !== centerGroup);
        if (sideGroup) {
          const prevWidth = capturedWidths.get(sideGroup.id) || 320;
          const targetWidth = Math.min(Math.max(prevWidth, 240), 380);
          try {
            sideGroup.api.setSize({ width: targetWidth });
          } catch {
            // Group might be disposing
          }
        }
      }
    });
  };

  // 1. In native Tauri desktop app, spawn a genuine independent OS window
  if (isDesktopApp()) {
    const opened = await openDetachedWindow(rawComponentId, title, {
      left,
      top,
      width: panelWidth,
      height: panelHeight,
    });
    if (opened) {
      wsLog.info(`Detached panel [${rawComponentId}] spawned into native window; removing from workspace`, {
        panelId: panel.id,
      });
      try {
        api.removePanel(panel);
        restoreProportions();
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
      wsLog.info(`Browser popout failed or blocked; converting [${rawComponentId}] to floating group`, {
        panelId: panel.id,
      });
      api.addFloatingGroup(panel, {
        x: Math.max(20, (window.innerWidth - panelWidth) / 2),
        y: Math.max(20, (window.innerHeight - panelHeight) / 2),
        width: panelWidth,
        height: panelHeight,
      });
    } else {
      wsLog.info(`Detached panel [${rawComponentId}] successfully placed in popout group`, { panelId: panel.id });
      restoreProportions();
    }
  } catch {
    wsLog.info(`Detached panel [${rawComponentId}] placed in fallback floating group`, { panelId: panel.id });
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
  const seqRef = useRef(0);

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

    seqRef.current += 1;
    const uniqueId = `panel_${panelId}_g${seqRef.current}_${props.group?.id || 'main'}`;
    wsLog.info(`Added panel tab to group: [${panelId}] "${title}"`, { uniqueId });

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

  return (
    <div className="relative flex items-center h-full px-0.5 gap-0.5">
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

export interface WorkspaceShellProps {
  initialPanel?: { id: string; title: string };
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({ initialPanel }) => {
  const { currentFolder } = useApp();
  const apiRef = useRef<DockviewApi | null>(null);
  const dockSeqRef = useRef(0);
  const activeCrossTabRef = useRef<{ panelId: string; title: string; sourceLabel: string } | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    title: string;
    isTabBar?: boolean;
    label?: string;
  } | null>(null);

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

  // Helper to determine spatial target group, tab bar detection, and split direction
  const computeDropTarget = useCallback((clientX: number, clientY: number) => {
    const api = apiRef.current;
    if (!api) return null;

    const clampedX = Math.max(0, Math.min(clientX, window.innerWidth - 1));
    const clampedY = Math.max(0, Math.min(clientY, window.innerHeight - 1));

    const dropEl = document.elementFromPoint(clampedX, clampedY);
    let targetGroupEl = dropEl?.closest<HTMLElement>('.dv-groupview');
    if (!targetGroupEl) {
      const allGroups = document.querySelectorAll<HTMLElement>('.dv-groupview');
      for (const el of allGroups) {
        const r = el.getBoundingClientRect();
        if (
          clampedX >= r.left - 4 &&
          clampedX <= r.right + 4 &&
          clampedY >= r.top - 4 &&
          clampedY <= r.bottom + 4
        ) {
          targetGroupEl = el;
          break;
        }
      }
    }

    if (!targetGroupEl) return null;

    const matchedGroup =
      api.groups.find((g) => (g as any)?.element === targetGroupEl) ||
      api.activeGroup ||
      api.groups[0];
    const rect = targetGroupEl.getBoundingClientRect();

    // Check if cursor is over the tab header row (~34px)
    const headerEl = targetGroupEl.querySelector<HTMLElement>(
      '.dv-tabs-and-actions-container, .dv-header'
    );
    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 34;

    const isOverTabBar =
      Boolean(
        dropEl?.closest(
          '.dv-tabs-and-actions-container, .dv-tab, .dv-tabs-container, .dv-void-container, .dv-right-actions-container'
        )
      ) ||
      (clampedY >= rect.top && clampedY <= rect.top + headerHeight + 6);

    if (isOverTabBar) {
      return {
        group: matchedGroup,
        direction: undefined as 'left' | 'right' | 'above' | 'below' | undefined,
        isTabBar: true,
        preview: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(Math.max(32, headerHeight)),
        },
      };
    }

    // Cursor is in content area below the tab bar
    const contentTop = rect.top + headerHeight;
    const contentHeight = Math.max(1, rect.height - headerHeight);
    const relContentX = (clampedX - rect.left) / Math.max(1, rect.width);
    const relContentY = (clampedY - contentTop) / contentHeight;

    let direction: 'left' | 'right' | 'above' | 'below' | undefined;
    let previewLeft = rect.left;
    let previewTop = contentTop;
    let previewWidth = rect.width;
    let previewHeight = contentHeight;

    if (relContentX < 0.20) {
      direction = 'left';
      previewWidth = rect.width / 2;
    } else if (relContentX > 0.80) {
      direction = 'right';
      previewLeft = rect.left + rect.width / 2;
      previewWidth = rect.width / 2;
    } else if (relContentY < 0.20) {
      direction = 'above';
      previewHeight = contentHeight / 2;
    } else if (relContentY > 0.80) {
      direction = 'below';
      previewTop = contentTop + contentHeight / 2;
      previewHeight = contentHeight / 2;
    }

    return {
      group: matchedGroup,
      direction,
      isTabBar: false,
      preview: {
        left: Math.round(previewLeft),
        top: Math.round(previewTop),
        width: Math.round(previewWidth),
        height: Math.round(previewHeight),
      },
    };
  }, []);

  const dockCrossWindowTab = useCallback(
    (
      panelId: string,
      title: string,
      targetGroup: any,
      direction: 'left' | 'right' | 'above' | 'below' | undefined
    ) => {
      const api = apiRef.current;
      if (!api) return;

      const existingPanel = api.panels.find((p) => getPanelComponent(p) === panelId);
      if (existingPanel) {
        if (targetGroup && existingPanel.group !== targetGroup) {
          existingPanel.api.moveTo(
            direction
              ? { group: targetGroup, position: direction as any }
              : { group: targetGroup }
          );
        }
        existingPanel.api.setActive();
        wsLog.info(`Cross-window tab already open in workspace; moved/focused [${panelId}] "${title}"`);
      } else {
        dockSeqRef.current += 1;
        const uniqueId = `panel_${panelId}_dock${dockSeqRef.current}`;
        wsLog.info(`Cross-window tab accepted and docked into workspace: [${panelId}] "${title}"`, {
          direction,
          uniqueId,
        });

        try {
          api.addPanel({
            id: uniqueId,
            component: panelId,
            title,
            position: targetGroup
              ? (direction ? { referenceGroup: targetGroup, direction } : { referenceGroup: targetGroup })
              : undefined,
          });
        } catch {
          api.addPanel({
            id: uniqueId,
            component: panelId,
            title,
          });
        }
      }
    },
    []
  );

  // Primary window: native HTML5 dragover & drop listeners for 60fps cursor tracking & docking
  useEffect(() => {
    if (effectiveInitialPanel) return;

    const handleWindowDragEnter = (e: DragEvent) => {
      if (activeCrossTabRef.current || e.dataTransfer?.types.includes('application/x-slag-tab')) {
        e.preventDefault();
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      const crossTab = activeCrossTabRef.current;
      const hasSlagType = e.dataTransfer?.types.includes('application/x-slag-tab');
      if (!crossTab && !hasSlagType) return;

      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      const title = crossTab?.title || 'Вкладка';
      const target = computeDropTarget(e.clientX, e.clientY);
      if (target) {
        let label = `Вкладка в группу «${title}»`;
        if (target.direction === 'left') label = `Разделить слева «${title}»`;
        else if (target.direction === 'right') label = `Разделить справа «${title}»`;
        else if (target.direction === 'above') label = `Разделить сверху «${title}»`;
        else if (target.direction === 'below') label = `Разделить снизу «${title}»`;

        setDropPreview({
          ...target.preview,
          title,
          isTabBar: target.isTabBar,
          label,
        });
      } else {
        setDropPreview(null);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (
        !e.relatedTarget ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setDropPreview(null);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      const crossTab = activeCrossTabRef.current;
      const hasSlagType = e.dataTransfer?.types.includes('application/x-slag-tab');
      if (!crossTab && !hasSlagType) return;

      e.preventDefault();
      setDropPreview(null);

      let panelId = crossTab?.panelId;
      let title = crossTab?.title || 'SLAG';
      let sourceLabel = crossTab?.sourceLabel || '';

      if (!panelId && e.dataTransfer) {
        try {
          const raw = e.dataTransfer.getData('application/x-slag-tab');
          if (raw) {
            const parsed = JSON.parse(raw);
            panelId = parsed.panelId;
            title = parsed.title;
            sourceLabel = parsed.sourceLabel || '';
          }
        } catch {}
      }

      if (panelId) {
        const target = computeDropTarget(e.clientX, e.clientY);
        dockCrossWindowTab(panelId, title, target?.group, target?.direction);

        void sendCrossWindowTab({
          type: 'TAB_DRAG_ACCEPTED',
          sourceLabel: 'main',
          targetLabel: sourceLabel,
          panelId,
          title,
        });

        activeCrossTabRef.current = null;
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [effectiveInitialPanel, computeDropTarget, dockCrossWindowTab]);

  // Cross-window tab docking listener: handles dragging tabs across OS windows
  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const myLabel = urlParams?.get('label') || 'main';
    const isPrimary = !effectiveInitialPanel;

    const unlisten = listenCrossWindowTab((msg: CrossWindowTabMessage) => {
      if (!msg || typeof msg !== 'object') return;
      // Guard: Never process messages originating from this exact window
      if (msg.sourceLabel === myLabel) return;

      // 1. Cross-window drag lifecycle tracking on primary window
      if (isPrimary && msg.type === 'TAB_DRAG_START') {
        activeCrossTabRef.current = {
          panelId: msg.panelId,
          title: msg.title,
          sourceLabel: msg.sourceLabel || '',
        };
      }

      if (isPrimary && msg.type === 'TAB_DRAG_END') {
        activeCrossTabRef.current = null;
        setDropPreview(null);
      }

      // 2. Live drop target preview indicator on primary window via IPC move coordinates
      if (isPrimary && msg.type === 'TAB_DRAG_MOVE') {
        if (msg.screenX === undefined || msg.screenY === undefined) {
          setDropPreview(null);
          return;
        }

        const clientX = msg.screenX - window.screenX;
        const clientY = msg.screenY - window.screenY;
        const isInside =
          clientX >= -10 &&
          clientX <= window.innerWidth + 10 &&
          clientY >= -10 &&
          clientY <= window.innerHeight + 10;

        if (!isInside) {
          setDropPreview(null);
          return;
        }

        const target = computeDropTarget(clientX, clientY);
        if (target) {
          let label = `Вкладка в группу «${msg.title}»`;
          if (target.direction === 'left') label = `Разделить слева «${msg.title}»`;
          else if (target.direction === 'right') label = `Разделить справа «${msg.title}»`;
          else if (target.direction === 'above') label = `Разделить сверху «${msg.title}»`;
          else if (target.direction === 'below') label = `Разделить снизу «${msg.title}»`;

          setDropPreview({
            ...target.preview,
            title: msg.title,
            isTabBar: target.isTabBar,
            label,
          });
        } else {
          setDropPreview(null);
        }
      }

      // 3. Primary window accepts tab, docks it, and sends confirmation
      if (isPrimary && msg.type === 'TAB_DRAG_RELEASE') {
        setDropPreview(null);
        activeCrossTabRef.current = null;

        const isInside =
          msg.forceDock ||
          (msg.screenX !== undefined &&
            msg.screenY !== undefined &&
            msg.screenX >= window.screenX - 40 &&
            msg.screenX <= window.screenX + window.outerWidth + 40 &&
            msg.screenY >= window.screenY - 40 &&
            msg.screenY <= window.screenY + window.outerHeight + 40);

        if (isInside && apiRef.current) {
          let targetGroup = apiRef.current.activeGroup || apiRef.current.groups[0];
          let direction: 'left' | 'right' | 'above' | 'below' | undefined;

          if (!msg.forceDock && msg.screenX !== undefined && msg.screenY !== undefined) {
            const clientX = msg.screenX - window.screenX;
            const clientY = msg.screenY - window.screenY;
            const target = computeDropTarget(clientX, clientY);
            if (target) {
              targetGroup = target.group;
              direction = target.direction;
            }
          }

          dockCrossWindowTab(msg.panelId, msg.title, targetGroup, direction);

          void sendCrossWindowTab({
            type: 'TAB_DRAG_ACCEPTED',
            sourceLabel: myLabel,
            targetLabel: msg.sourceLabel,
            panelId: msg.panelId,
            title: msg.title,
          });
        } else {
          wsLog.debug(`Cross-window tab drag release ignored outside bounds: [${msg.panelId}]`, {
            screenPos: { x: msg.screenX, y: msg.screenY },
          });
        }
      }

      // 4. Secondary window: close once primary accepts the panel
      if (
        !isPrimary &&
        msg.type === 'TAB_DRAG_ACCEPTED' &&
        (msg.targetLabel === myLabel || msg.panelId === effectiveInitialPanel?.id)
      ) {
        wsLog.info(`Detached panel accepted by primary window; closing secondary window [${myLabel}]`);
        if (apiRef.current) {
          const target = apiRef.current.panels.find(p => getPanelComponent(p) === msg.panelId);
          if (target) {
            try {
              apiRef.current.removePanel(target);
            } catch {}
          }
        }
        void closeWindow();
      }
    });

    return () => {
      unlisten();
    };
  }, [effectiveInitialPanel, computeDropTarget, dockCrossWindowTab]);

  // Primary window: restore previously open detached windows across app restarts
  useEffect(() => {
    if (effectiveInitialPanel) return;
    void restoreDetachedWindows();
  }, [effectiveInitialPanel]);

  // Secondary window: track resizing to preserve geometry on restart
  useEffect(() => {
    if (!effectiveInitialPanel || typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const winLabel = urlParams.get('label');
    if (!winLabel) return;

    let timer: number | null = null;
    const handleBoundsChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        updateDetachedWindowBounds(winLabel, {
          left: window.screenX,
          top: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        });
      }, 400);
    };

    window.addEventListener('resize', handleBoundsChange);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('resize', handleBoundsChange);
    };
  }, [effectiveInitialPanel]);

  // Dynamically update feed panel tab title to match currentFolder
  useEffect(() => {
    if (apiRef.current) {
      const feedPanels = apiRef.current.panels.filter(
        p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_')
      );
      const targetTitle = currentFolder || 'Входящие';
      feedPanels.forEach(p => p.api.setTitle(targetTitle));
      wsLog.debug(`Synchronized feed panel tab title to folder: "${targetTitle}"`, { count: feedPanels.length });
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
    wsLog.info(`Dockview workspace shell mounted: ${effectiveInitialPanel ? `detached window [${effectiveInitialPanel.id}]` : 'primary window'}`);

    const saveLayout = () => {
      if (effectiveInitialPanel) return;
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
      const active = event.api.activePanel;
      if (active) {
        wsLog.debug(`Active workspace tab switched: [${active.id}] "${active.title || ''}"`);
      }
      saveLayout();
    });

    // Guard on panel removal: proportional resize and auto-destroy empty secondary windows
    event.api.onDidRemovePanel(() => {
      wsLog.info('Panel removed from workspace layout', { remainingPanels: event.api.totalPanels });
      if (effectiveInitialPanel && event.api.totalPanels === 0) {
        wsLog.info('Detached window has no remaining panels -> auto-closing window');
        closeWindow();
        return;
      }
      requestAnimationFrame(() => {
        if (event.api.groups.length === 2) {
          const centerGroup = event.api.groups.find(g =>
            g.panels.some(p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_'))
          );
          const sideGroup = event.api.groups.find(g => g !== centerGroup);
          if (centerGroup && sideGroup && sideGroup.api.width > 400) {
            try {
              sideGroup.api.setSize({ width: 320 });
            } catch {}
          }
        }
      });
      saveLayout();
    });

    if (effectiveInitialPanel) {
      event.api.clear();
      event.api.addPanel({
        id: `panel_${effectiveInitialPanel.id}`,
        component: effectiveInitialPanel.id,
        title: effectiveInitialPanel.title,
      });
    } else {
      // Try restoring saved layout
      let restored = false;
      try {
        const savedLayout = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
        if (savedLayout) {
          event.api.fromJSON(JSON.parse(savedLayout));
          restored = true;
          wsLog.debug('Restored saved workspace layout configuration');
        }
      } catch {
        restored = false;
      }

      if (!restored) {
        wsLog.debug('Applying default 3-panel workspace layout');
        applyDefaultLayout(event.api);
      }
    }

    // Tab tear-off & cross-window drag docking
    event.api.onWillDragPanel((dragEvent) => {
      const panel = dragEvent.panel;
      if (!panel) return;

      const groupElement = (panel.group as any)?.element as HTMLElement | undefined;
      const rect = groupElement?.getBoundingClientRect();
      const initialWidth = rect ? Math.round(rect.width) : panel.api.width;
      const initialHeight = rect ? Math.round(rect.height) : panel.api.height;

      const rawComponentId = getPanelComponent(panel);
      const title = panel.title || 'SLAG';
      const winLabel =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('label') || 'main'
          : 'main';
      const isSecondary = Boolean(effectiveInitialPanel);

      document.body.classList.add('tab-dragging');

      if (isSecondary) {
        void sendCrossWindowTab({
          type: 'TAB_DRAG_START',
          sourceLabel: winLabel,
          panelId: rawComponentId,
          title,
        });
      }

      const nativeEvt = dragEvent.nativeEvent as any;
      if (nativeEvt && nativeEvt.dataTransfer) {
        try {
          nativeEvt.dataTransfer.setData(
            'application/x-slag-tab',
            JSON.stringify({
              panelId: rawComponentId,
              title,
              sourceLabel: winLabel,
            })
          );
          nativeEvt.dataTransfer.effectAllowed = 'all';
        } catch {}
      }

      wsLog.debug(`Tab drag gesture started: [${rawComponentId}] "${title}"`, {
        isSecondary,
        winLabel,
      });

      let lastMoveTime = 0;
      const handlePointerMove = (e: MouseEvent | DragEvent) => {
        if (!isSecondary) return;
        const now = Date.now();
        if (now - lastMoveTime < 25) return;
        lastMoveTime = now;
        if (e.screenX || e.screenY) {
          void sendCrossWindowTab({
            type: 'TAB_DRAG_MOVE',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
            screenX: e.screenX,
            screenY: e.screenY,
          });
        }
      };

      window.addEventListener('drag', handlePointerMove as EventListener);
      window.addEventListener('pointermove', handlePointerMove as EventListener);

      const handleDragEnd = (e: DragEvent | MouseEvent) => {
        document.body.classList.remove('tab-dragging');
        window.removeEventListener('drag', handlePointerMove as EventListener);
        window.removeEventListener('pointermove', handlePointerMove as EventListener);
        window.removeEventListener('dragend', handleDragEnd as EventListener);
        window.removeEventListener('pointerup', handleDragEnd as EventListener);

        // If dragging in secondary window, broadcast drop release to main window
        if (isSecondary) {
          void sendCrossWindowTab({
            type: 'TAB_DRAG_END',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
          });

          if (e.screenX || e.screenY) {
            wsLog.debug(`Broadcasting cross-window TAB_DRAG_RELEASE for [${rawComponentId}] "${title}"`, {
              screenPos: { x: e.screenX, y: e.screenY },
              sourceLabel: winLabel,
            });
            void sendCrossWindowTab({
              type: 'TAB_DRAG_RELEASE',
              sourceLabel: winLabel,
              panelId: rawComponentId,
              title,
              screenX: e.screenX,
              screenY: e.screenY,
            });
          }
        }

        // If dragging in main window, tear-off into new OS window ONLY when dropped genuinely outside window
        if (!isSecondary) {
          const dragEvt = e as DragEvent;
          const dropEffect = dragEvt.dataTransfer?.dropEffect;
          // If drop was accepted inside window by Dockview, dropEffect is 'move' -> never tear off
          if (dropEffect && dropEffect !== 'none') {
            return;
          }

          // Ignore (0,0) coordinates which occur when drag is canceled or released on certain controls
          const hasValidCoords = Boolean(e.screenX || e.screenY);
          const isGenuinelyOutside =
            hasValidCoords &&
            (e.screenX < window.screenX - 25 ||
              e.screenX > window.screenX + window.outerWidth + 25 ||
              e.screenY < window.screenY - 25 ||
              e.screenY > window.screenY + window.outerHeight + 25);

          if (isGenuinelyOutside) {
            wsLog.info(`Tab dropped outside window bounds -> triggering tear-off for [${rawComponentId}] "${title}"`, {
              coords: { x: e.screenX, y: e.screenY },
            });
            detachPanel(event.api, panel, {
              left: Math.round(e.screenX - Math.min(160, initialWidth / 2)),
              top: Math.round(e.screenY - 25),
              width: initialWidth,
              height: initialHeight,
            });
          }
        }
      };

      window.addEventListener('dragend', handleDragEnd as EventListener, { once: true });
      window.addEventListener('pointerup', handleDragEnd as EventListener, { once: true });
    });
  };

  const getTabContextMenuItems = useCallback((params: GetTabContextMenuItemsParams) => {
    const { panel, api } = params;
    const isSecondary = Boolean(effectiveInitialPanel);
    const rawComponentId = getPanelComponent(panel);

    return [
      isSecondary
        ? {
            label: 'Вернуть в главное окно',
            action: () => {
              wsLog.info(`Tab context menu: returning [${rawComponentId}] "${panel.title}" to primary window`);
              const winLabel =
                typeof window !== 'undefined'
                  ? new URLSearchParams(window.location.search).get('label') || ''
                  : '';
              void sendCrossWindowTab({
                type: 'TAB_DRAG_RELEASE',
                sourceLabel: winLabel,
                panelId: rawComponentId,
                title: panel.title || 'SLAG',
                forceDock: true,
              });
            },
          }
        : {
            label: 'Вынести в отдельное окно',
            action: () => {
              wsLog.info(`Tab context menu: detaching [${rawComponentId}] "${panel.title}" to separate window`);
              detachPanel(api, panel);
            },
          },
      {
        label: 'Сделать плавающим',
        action: () => {
          wsLog.info(`Tab context menu: making [${rawComponentId}] "${panel.title}" floating`);
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
  }, [effectiveInitialPanel]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] text-[#f4f4f5] select-none relative z-0 isolate">
      <WindowControls />

      {/* Visual Drop Target Highlight & Insertion Indicator */}
      {dropPreview && (
        <div
          style={{
            position: 'absolute',
            left: `${dropPreview.left}px`,
            top: `${dropPreview.top}px`,
            width: `${dropPreview.width}px`,
            height: `${dropPreview.height}px`,
          }}
          className={`pointer-events-none z-[9999] border-2 border-blue-500/80 bg-blue-500/15 shadow-[0_0_24px_rgba(59,130,246,0.35)] backdrop-blur-[1px] flex items-center justify-center animate-in fade-in duration-75 ${
            dropPreview.isTabBar ? 'rounded-md ring-1 ring-blue-400/50' : 'rounded-xl'
          }`}
        >
          <div
            className={`bg-[#141417]/95 border border-white/20 text-white flex items-center gap-1.5 shadow-2xl select-none ${
              dropPreview.isTabBar
                ? 'px-2.5 py-0.5 rounded-full border-blue-400/40 text-[11px] font-medium text-blue-200'
                : 'px-3 py-1.5 rounded-lg text-xs font-medium'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span>{dropPreview.label || `Вставить «${dropPreview.title}»`}</span>
          </div>
        </div>
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
