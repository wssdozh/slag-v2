// The workspace panel registry: ids, icons, width limits, and layout persistence.
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { logger } from '../../lib/logger/logger';
import { isDesktopApp, openDetachedWindow } from '../../lib/platform/windowControls';
import {
  Layers,
  Kanban,
  Calendar,
  Sparkles,
  Folder,
  Info,
  Terminal,
  Music,
} from 'lucide-react';

export const WORKSPACE_LAYOUT_KEY = 'slag_workspace_layout_v2';

export const wsLog = logger.scope('WORKSPACE');

export const PANELS_TO_ADD = [
  { id: 'feed', title: 'Лента', icon: Layers },
  { id: 'kanban', title: 'Канбан', icon: Kanban },
  { id: 'calendar', title: 'Календарь', icon: Calendar },
  { id: 'assistant', title: 'Ассистент', icon: Sparkles },
  { id: 'audio', title: 'Аудиоплеер', icon: Music },
  { id: 'sidebar', title: 'Навигация', icon: Folder },
  { id: 'folder-info', title: 'Инфо папки', icon: Info },
  { id: 'logs', title: 'Логи & HUD', icon: Terminal },
];

export const PANEL_CONSTRAINTS: Record<string, { minWidth: number; maxWidth?: number }> = {
  sidebar: { minWidth: 200, maxWidth: 420 },
  feed: { minWidth: 320 },
  kanban: { minWidth: 320 },
  calendar: { minWidth: 320 },
  assistant: { minWidth: 280, maxWidth: 640 },
  audio: { minWidth: 260, maxWidth: 640 },
  'folder-info': { minWidth: 260, maxWidth: 540 },
  logs: { minWidth: 260, maxWidth: 720 },
};

export const getPanelMinWidth = (componentId: string): number => {
  return PANEL_CONSTRAINTS[componentId]?.minWidth ?? 260;
};

export const getPanelMaxWidth = (componentId: string): number | undefined => {
  return PANEL_CONSTRAINTS[componentId]?.maxWidth;
};

export const getPanelComponent = (panel: IDockviewPanel): string => {
  return panel.toJSON()?.contentComponent || panel.id.replace(/^panel_/, '').replace(/_\d+$/, '');
};

/**
 * Keeps the panes inside the window. Dockview obeys the minimum widths it is given, and minimums
 * that cannot all fit at once leave the grid wider than the frame — the right-hand pane is then
 * clipped by the window edge. The minimums are scaled to the width that actually exists, so the
 * panes just squeeze.
 */
export const syncAllGroupConstraints = (api: DockviewApi) => {
  const entries = api.groups
    .map(group => ({ group, active: group.activePanel }))
    .filter((entry): entry is { group: (typeof entry.group); active: IDockviewPanel } => Boolean(entry.active));
  const totalMin = entries.reduce((sum, entry) => sum + getPanelMinWidth(getPanelComponent(entry.active)), 0);
  // Sashes between the columns eat width too, and rounding lands on the wrong side of the edge;
  // without this inset the minimums add up to the whole frame and the last pane pokes past it.
  const available = api.width - 8 * Math.max(0, entries.length - 1) - 8;
  const scale = available > 0 && totalMin > available ? available / totalMin : 1;
  entries.forEach(({ group, active }) => {
    const comp = getPanelComponent(active);
    const maxWidth = getPanelMaxWidth(comp);
    try {
      group.api.setConstraints({
        minimumWidth: Math.floor(getPanelMinWidth(comp) * scale),
        maximumWidth: maxWidth,
      });
      if (maxWidth && group.api.width > maxWidth) {
        group.api.setSize({ width: maxWidth });
      }
    } catch {
      // Group may be disposing
    }
  });
};

/**
 * A layout saved in a narrower window keeps its pixel sizes, and restoring it into a wider one
 * leaves a blank strip on the right (black on WebKit). Rescale the saved numbers to the container
 * before handing them to dockview.
 */
export const scaleLayoutToWidth = (root: unknown, width: number): void => {
  if (!root || typeof root !== 'object' || width <= 0) return;
  const top = (root as { data?: { size?: number }[] }).data;
  const total = Array.isArray(top) ? top.reduce((sum, node) => sum + (node.size ?? 0), 0) : 0;
  if (total <= 0 || Math.abs(total - width) < 2) return;
  const factor = width / total;
  const scale = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const entry = node as { size?: number; data?: unknown };
    if (typeof entry.size === 'number') entry.size = Math.round(entry.size * factor);
    if (Array.isArray(entry.data)) entry.data.forEach(scale);
  };
  scale(root);
};

let isDetaching = false;

export const detachPanel = async (
  api: DockviewApi,
  panel: IDockviewPanel,
  box?: { left: number; top: number; width?: number; height?: number }
) => {
  if (isDetaching || !api.panels.some(p => p.id === panel.id)) {
    return;
  }
  isDetaching = true;

  try {
    const groupElement = (panel.group as { element?: HTMLElement } | undefined)?.element;
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

    const panelGroup = panel.group;
    const remainingGroups = api.groups.filter(g => g !== panelGroup);
    const capturedWidths = new Map<string, number>();
    remainingGroups.forEach(g => {
      capturedWidths.set(g.id, g.api.width);
    });

    const restoreProportions = () => {
      requestAnimationFrame(() => {
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
