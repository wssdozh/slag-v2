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
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/usePresence';
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
        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
          <FeedList />
          {/* Floating Composer Island */}
          <div className="absolute bottom-0 inset-x-0 pointer-events-none z-20 pb-3 px-2 sm:pl-4 sm:pr-[22px] flex justify-center">
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

// ponytail: central registry for dockview panel min/max dimensions. Prevents squishing adjacent panels.
const PANEL_CONSTRAINTS: Record<string, { minWidth: number; maxWidth?: number }> = {
  sidebar: { minWidth: 200, maxWidth: 420 },
  feed: { minWidth: 320 },
  kanban: { minWidth: 320 },
  calendar: { minWidth: 320 },
  assistant: { minWidth: 280, maxWidth: 640 },
  audio: { minWidth: 260, maxWidth: 640 },
  'folder-info': { minWidth: 260, maxWidth: 540 },
  logs: { minWidth: 260, maxWidth: 720 },
};

const getPanelMinWidth = (componentId: string): number => {
  return PANEL_CONSTRAINTS[componentId]?.minWidth ?? 260;
};

const getPanelMaxWidth = (componentId: string): number | undefined => {
  return PANEL_CONSTRAINTS[componentId]?.maxWidth;
};

const syncAllGroupConstraints = (api: DockviewApi) => {
  api.groups.forEach(group => {
    const active = group.activePanel;
    if (!active) return;
    const comp = getPanelComponent(active);
    const minWidth = getPanelMinWidth(comp);
    const maxWidth = getPanelMaxWidth(comp);
    try {
      group.api.setConstraints({
        minimumWidth: minWidth,
        maximumWidth: maxWidth,
      });
      if (minWidth > 0 && group.api.width < minWidth) {
        group.api.setSize({ width: minWidth });
      } else if (maxWidth && group.api.width > maxWidth) {
        group.api.setSize({ width: maxWidth });
      }
    } catch {
      // Group may be disposing
    }
  });
};

const wsLog = logger.scope('WORKSPACE');

const getPanelComponent = (panel: IDockviewPanel): string => {
  return panel.toJSON()?.contentComponent || panel.id.replace(/^panel_/, '').replace(/_\d+$/, '');
};

let isDetaching = false;

// Detach panel to native OS window (in desktop mode) or browser popout / floating group
const detachPanel = async (api: DockviewApi, panel: IDockviewPanel, box?: { left: number; top: number; width?: number; height?: number }) => {
  if (isDetaching || !api.panels.some(p => p.id === panel.id)) {
    return;
  }
  isDetaching = true;

  try {
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
  } finally {
    requestAnimationFrame(() => {
      isDetaching = false;
    });
  }
};

// Header action [+] and popout buttons on each tab group
const GroupHeaderActions: React.FC<any> = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const { ref: menuRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);
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
  }, [isOpen, menuRef]);

  const addPanel = (panelId: string, title: string) => {
    setIsOpen(false);
    const containerApi = props.containerApi as DockviewApi | undefined;
    if (!containerApi) return;

    seqRef.current += 1;
    const uniqueId = `panel_${panelId}_g${seqRef.current}_${props.group?.id || 'main'}`;
    wsLog.info(`Added panel tab to group: [${panelId}] "${title}"`, { uniqueId });

    const minW = getPanelMinWidth(panelId);
    const maxW = getPanelMaxWidth(panelId);

    try {
      containerApi.addPanel({
        id: uniqueId,
        component: panelId,
        title,
        minimumWidth: minW,
        maximumWidth: maxW,
        position: { referenceGroup: props.group },
      });
    } catch {
      containerApi.addPanel({
        id: uniqueId,
        component: panelId,
        title,
        minimumWidth: minW,
        maximumWidth: maxW,
      });
    }
    syncAllGroupConstraints(containerApi);
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

      {isPresent && (
        <div
          ref={menuRef}
          data-motion-state={phase}
          onTransitionEnd={onTransitionEnd}
          inert={!isOpen}
          className="absolute left-0 top-full mt-1 w-44 rounded-lg bg-surface-elevated border border-white/[0.12] shadow-2xl py-1 z-50 motion-popover"
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
  } | null>(null);
  const dropPreviewRef = useRef(dropPreview);
  useEffect(() => {
    dropPreviewRef.current = dropPreview;
  }, [dropPreview]);

  const previewRafRef = useRef<number | null>(null);
  const updateDropPreview = useCallback(
    (preview: { left: number; top: number; width: number; height: number } | null) => {
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current);
      }
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null;
        setDropPreview(preview);
      });
    },
    []
  );

  const clearDropPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setDropPreview(null);
  }, []);

  // Native window dragging on empty tab bar space without -webkit-app-region: drag
  useEffect(() => {
    if (!isDesktopApp()) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.dv-void-container') &&
        !target?.closest('.dv-tab, .dv-tabs-container, button, input, .dv-right-actions-container, .dv-default-tab-action')
      ) {
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
          getCurrentWindow().startDragging();
        }).catch(() => {});
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

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

        const minW = getPanelMinWidth(panelId);
        const maxW = getPanelMaxWidth(panelId);

        try {
          api.addPanel({
            id: uniqueId,
            component: panelId,
            title,
            minimumWidth: minW,
            maximumWidth: maxW,
            position: targetGroup
              ? (direction ? { referenceGroup: targetGroup, direction } : { referenceGroup: targetGroup })
              : undefined,
          });
        } catch {
          api.addPanel({
            id: uniqueId,
            component: panelId,
            title,
            minimumWidth: minW,
            maximumWidth: maxW,
          });
        }
        syncAllGroupConstraints(api);
      }
    },
    []
  );

  // Primary window: live HTML5 dragover & drop preview strictly for CROSS-WINDOW tab dragging
  useEffect(() => {
    if (effectiveInitialPanel) return;

    const isCrossDragEvent = (e: DragEvent) => {
      return Boolean(
        activeCrossTabRef.current ||
          e.dataTransfer?.types.includes('application/x-slag-cross-tab')
      );
    };

    const handleWindowDragEnter = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      e.preventDefault();
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      const target = computeDropTarget(e.clientX, e.clientY);
      updateDropPreview(target ? target.preview : null);
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      if (
        !e.relatedTarget ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        clearDropPreview();
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      e.preventDefault();
      clearDropPreview();

      let panelId = activeCrossTabRef.current?.panelId;
      let title = activeCrossTabRef.current?.title || 'SLAG';
      let sourceLabel = activeCrossTabRef.current?.sourceLabel || '';

      if (!panelId && e.dataTransfer) {
        try {
          const raw = e.dataTransfer.getData('application/x-slag-cross-tab');
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
  }, [effectiveInitialPanel, computeDropTarget, dockCrossWindowTab, updateDropPreview, clearDropPreview]);

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
        setTimeout(() => {
          clearDropPreview();
        }, 150);
      }

      // 2. Live drop target preview indicator on primary window via IPC move coordinates
      if (isPrimary && msg.type === 'TAB_DRAG_MOVE') {
        if (msg.screenX === undefined || msg.screenY === undefined) {
          clearDropPreview();
          return;
        }

        activeCrossTabRef.current = {
          panelId: msg.panelId,
          title: msg.title,
          sourceLabel: msg.sourceLabel || '',
        };

        const clientX = msg.screenX - window.screenX;
        const clientY = msg.screenY - window.screenY;
        const isInside =
          clientX >= -10 &&
          clientX <= window.innerWidth + 10 &&
          clientY >= -10 &&
          clientY <= window.innerHeight + 10;

        if (!isInside) {
          clearDropPreview();
          return;
        }

        const target = computeDropTarget(clientX, clientY);
        updateDropPreview(target ? target.preview : null);
      }

      // 3. Primary window accepts tab, docks it, and sends confirmation
      if (isPrimary && msg.type === 'TAB_DRAG_RELEASE') {
        const lastPreview = dropPreviewRef.current;
        clearDropPreview();
        activeCrossTabRef.current = null;

        const isInside =
          msg.forceDock ||
          Boolean(lastPreview) ||
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
        void closeWindow();
      }
    });

    return () => {
      unlisten();
    };
  }, [effectiveInitialPanel, computeDropTarget, dockCrossWindowTab, updateDropPreview, clearDropPreview]);

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
      const targetTitle = currentFolder || DEFAULT_INBOX_FOLDER;
      feedPanels.forEach(p => p.api.setTitle(targetTitle));
      wsLog.debug(`Synchronized feed panel tab title to folder: "${targetTitle}"`, { count: feedPanels.length });
    }
  }, [currentFolder]);

  // Listen for global assistant toggle command (mod+j)
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
            minimumWidth: getPanelMinWidth('assistant'),
            maximumWidth: getPanelMaxWidth('assistant'),
          });
        } catch (err) {
          wsLog.warn('Failed to add panel_assistant on toggle', { err });
        }
      }
    };

    window.addEventListener('slag:toggle-assistant', handleToggleAssistant);
    return () => window.removeEventListener('slag:toggle-assistant', handleToggleAssistant);
  }, []);

  const applyDefaultLayout = useCallback((api: DockviewApi) => {
    api.clear();

    // 1. Center workspace panel (DynamicFeedPanel: Feed / Kanban / Calendar)
    const centerPanel = api.addPanel({
      id: 'panel_feed',
      component: 'feed',
      title: currentFolder || DEFAULT_INBOX_FOLDER,
      minimumWidth: getPanelMinWidth('feed'),
      maximumWidth: getPanelMaxWidth('feed'),
    });

    // 2. Left navigation sidebar
    api.addPanel({
      id: 'panel_sidebar',
      component: 'sidebar',
      title: 'Навигация',
      position: { direction: 'left', referencePanel: centerPanel },
      initialWidth: 260,
      minimumWidth: getPanelMinWidth('sidebar'),
      maximumWidth: getPanelMaxWidth('sidebar'),
    });

    // 3. Right Assistant & Info in a single group with tabs
    const assistantPanel = api.addPanel({
      id: 'panel_assistant',
      component: 'assistant',
      title: 'Ассистент',
      position: { direction: 'right', referencePanel: centerPanel },
      initialWidth: 320,
      minimumWidth: getPanelMinWidth('assistant'),
      maximumWidth: getPanelMaxWidth('assistant'),
    });

    api.addPanel({
      id: 'panel_info',
      component: 'folder-info',
      title: 'Инфо',
      position: { referencePanel: assistantPanel },
      minimumWidth: getPanelMinWidth('folder-info'),
      maximumWidth: getPanelMaxWidth('folder-info'),
    });

    syncAllGroupConstraints(api);
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

    // Save layout on changes
    event.api.onDidLayoutChange(() => {
      saveLayout();
    });

    // Save active tab selection across reloads and sync group constraints
    event.api.onDidActivePanelChange(() => {
      const active = event.api.activePanel;
      if (active) {
        wsLog.debug(`Active workspace tab switched: [${active.id}] "${active.title || ''}"`);
      }
      syncAllGroupConstraints(event.api);
      saveLayout();
    });

    event.api.onDidAddPanel(() => {
      syncAllGroupConstraints(event.api);
    });

    // Guard on panel removal: proportional resize and auto-destroy empty secondary windows
    event.api.onDidRemovePanel(() => {
      wsLog.info('Panel removed from workspace layout', { remainingPanels: event.api.totalPanels });
      if (effectiveInitialPanel && event.api.totalPanels === 0) {
        wsLog.info('Detached window has no remaining panels -> auto-closing window');
        closeWindow();
        return;
      }
      syncAllGroupConstraints(event.api);
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
        minimumWidth: getPanelMinWidth(effectiveInitialPanel.id),
        maximumWidth: getPanelMaxWidth(effectiveInitialPanel.id),
      });
      syncAllGroupConstraints(event.api);
    } else {
      // Try restoring saved layout
      let restored = false;
      try {
        const savedLayout = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
        if (savedLayout) {
          const parsed = JSON.parse(savedLayout);
          if (parsed && typeof parsed === 'object' && parsed.panels && typeof parsed.panels === 'object') {
            for (const key of Object.keys(parsed.panels)) {
              const p = parsed.panels[key];
              const comp = p.contentComponent || key.replace(/^panel_/, '').replace(/_\d+$/, '');
              p.minimumWidth = Math.max(p.minimumWidth || 0, getPanelMinWidth(comp));
              const max = getPanelMaxWidth(comp);
              if (max !== undefined) {
                p.maximumWidth = p.maximumWidth ? Math.min(p.maximumWidth, max) : max;
              }
            }
          }
          event.api.fromJSON(parsed);
          syncAllGroupConstraints(event.api);
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

      if (isSecondary) {
        void sendCrossWindowTab({
          type: 'TAB_DRAG_START',
          sourceLabel: winLabel,
          panelId: rawComponentId,
          title,
        });

        const nativeEvt = dragEvent.nativeEvent as any;
        if (nativeEvt && nativeEvt.dataTransfer) {
          try {
            nativeEvt.dataTransfer.setData(
              'application/x-slag-cross-tab',
              JSON.stringify({
                panelId: rawComponentId,
                title,
                sourceLabel: winLabel,
              })
            );
            nativeEvt.dataTransfer.effectAllowed = 'all';
          } catch {}
        }
      }

      wsLog.debug(`Tab drag gesture started: [${rawComponentId}] "${title}"`, {
        isSecondary,
        winLabel,
      });

      let dragEnded = false;
      let lastScreenX = 0;
      let lastScreenY = 0;
      let lastClientX = 0;
      let lastClientY = 0;
      let lastMoveTime = 0;

      const handlePointerMove = (e: MouseEvent | DragEvent) => {
        if (dragEnded) return;
        if (e.screenX || e.screenY) {
          lastScreenX = e.screenX;
          lastScreenY = e.screenY;
        }
        if (e.clientX || e.clientY) {
          lastClientX = e.clientX;
          lastClientY = e.clientY;
        }
        if (isSecondary && (e.screenX || e.screenY)) {
          const now = Date.now();
          if (now - lastMoveTime < 25) return;
          lastMoveTime = now;
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

      const cleanupDrag = () => {
        window.removeEventListener('drag', handlePointerMove as EventListener);
        window.removeEventListener('dragover', handlePointerMove as EventListener);
        window.removeEventListener('dragend', handleDragEnd as EventListener);
      };

      const handleDragEnd = (e: DragEvent | MouseEvent) => {
        if (dragEnded) return;
        dragEnded = true;
        cleanupDrag();

        const releaseScreenX = e.screenX || lastScreenX;
        const releaseScreenY = e.screenY || lastScreenY;
        const releaseClientX = e.clientX || lastClientX;
        const releaseClientY = e.clientY || lastClientY;

        // 1. If dragging in secondary window, broadcast drop release to main window
        if (isSecondary) {
          wsLog.debug(`Broadcasting cross-window TAB_DRAG_RELEASE for [${rawComponentId}] "${title}"`, {
            screenPos: { x: releaseScreenX, y: releaseScreenY },
            sourceLabel: winLabel,
          });
          void sendCrossWindowTab({
            type: 'TAB_DRAG_RELEASE',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
            screenX: releaseScreenX,
            screenY: releaseScreenY,
          });

          void sendCrossWindowTab({
            type: 'TAB_DRAG_END',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
          });
        } else {
          // 2. If dragging in main window, tear-off into new OS window when dropped outside window bounds
          const isOutsideClient =
            releaseClientX < 0 ||
            releaseClientX > window.innerWidth ||
            releaseClientY < 0 ||
            releaseClientY > window.innerHeight;
          const isOutsideScreen =
            releaseScreenX > 0 &&
            releaseScreenY > 0 &&
            (releaseScreenX < window.screenX - 10 ||
              releaseScreenX > window.screenX + window.innerWidth + 10 ||
              releaseScreenY < window.screenY - 10 ||
              releaseScreenY > window.screenY + window.innerHeight + 10);

          if (isOutsideClient || isOutsideScreen) {
            wsLog.info(`Tab dropped outside window bounds -> triggering tear-off for [${rawComponentId}] "${title}"`, {
              coords: { screenX: releaseScreenX, screenY: releaseScreenY, clientX: releaseClientX, clientY: releaseClientY },
            });
            detachPanel(event.api, panel, {
              left: Math.round((releaseScreenX || window.screenX + releaseClientX) - Math.min(160, initialWidth / 2)),
              top: Math.round((releaseScreenY || window.screenY + releaseClientY) - 25),
              width: initialWidth,
              height: initialHeight,
            });
          }
        }
      };

      window.addEventListener('drag', handlePointerMove as EventListener);
      window.addEventListener('dragover', handlePointerMove as EventListener);
      window.addEventListener('dragend', handleDragEnd as EventListener, { once: true });
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
    <div className="w-screen h-screen overflow-hidden bg-canvas text-fg-primary select-none relative z-0 isolate">
      <WindowControls />

      {/* Sleek Minimal Blue Drop Highlight (Zero Slop / No Badges) */}
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
