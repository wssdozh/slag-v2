import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { logger } from '../../lib/logger';
import { isDesktopApp, openDetachedWindow } from '../../lib/windowControls';
import { prefersReducedMotion } from '../../lib/motion';
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

/** Panels that are allowed to fold into the reading pane when the window gets tight. */
const SIDE_COMPONENTS = new Set(['assistant', 'audio', 'folder-info', 'logs']);

/**
 * Fold under the first width, unfold only above the second one. A window dragged across a single
 * threshold would otherwise rebuild the grid on every frame.
 */
const FOLD_BELOW_PX = 1024;
const UNFOLD_ABOVE_PX = 1120;

/**
 * Which column each side panel lived in before the fold, so widening puts the very same split back
 * without recreating panels — a `fromJSON` restore remounts them and the editor loses its place.
 * ponytail: in memory only, so a restart in a narrow window starts folded. Persist it next to the
 * saved layout if that ever matters.
 */
let foldedSides: { id: string; column: string }[] | null = null;
let isApplyingLayout = false;

const DOCK_ANIMATING_CLASS = 'dockfold-animating';
const DOCK_ANIMATION_MS = 220;
let animationTimer: ReturnType<typeof setTimeout> | null = null;

const applyGroupConstraints = (api: DockviewApi) => {
  const entries = api.groups
    .map(group => ({ group, active: group.activePanel }))
    .filter((entry): entry is { group: (typeof entry.group); active: IDockviewPanel } => Boolean(entry.active));
  // Whatever is still split gets scaled minimums: the window is the hard limit, the rail minimums
  // are just a comfortable default.
  const totalMin = entries.reduce((sum, entry) => sum + getPanelMinWidth(getPanelComponent(entry.active)), 0);
  const scale = api.width > 0 && totalMin > api.width ? api.width / totalMin : 1;
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

/** Side panels living as tabs of the reading pane is the folded state, not a user choice. */
export const isDockLayoutFolded = (api: DockviewApi): boolean => {
  const feed = api.panels.find(panel => getPanelComponent(panel) === 'feed');
  if (!feed) return false;
  return api.panels.some(
    panel => SIDE_COMPONENTS.has(getPanelComponent(panel)) && panel.group === feed.group
  );
};

/**
 * Decides whether the side panels are columns or tabs of the reading pane, then re-applies the
 * group constraints. The resize path (`foldOnly`) never touches the constraints: dockview already
 * resizes the grid itself, and recomputing on every frame is what made dragging the window crawl.
 */
export const syncAllGroupConstraints = (api: DockviewApi, foldOnly = false) => {
  if (isApplyingLayout) return;

  const panels = api.panels;
  const feed = panels.find(panel => getPanelComponent(panel) === 'feed') ?? panels[0];
  if (!feed) return;

  const sides = panels.filter(panel => SIDE_COMPONENTS.has(getPanelComponent(panel)));
  const fold = api.width > 0 && api.width < (foldedSides ? UNFOLD_ABOVE_PX : FOLD_BELOW_PX);
  const spread = !fold && sides.some(panel => panel.group === feed.group);
  const changed = fold ? sides.some(panel => panel.group !== feed.group) : foldedSides !== null || spread;
  if (!changed) {
    if (!foldOnly) applyGroupConstraints(api);
    return;
  }

  const apply = () => {
    if (fold) {
      foldedSides = sides
        .filter(panel => panel.group !== feed.group)
        .map(panel => ({ id: panel.id, column: panel.group.id }));
      for (const panel of sides) {
        if (panel.group === feed.group) continue;
        panel.api.moveTo({ group: feed.group });
      }
      feed.api.setActive();
    } else {
      const restore = foldedSides;
      foldedSides = null;
      // Every remembered column comes back as one column: the first panel opens the group next to
      // the feed, the rest of its tabs move into it. Panels closed while folded are skipped.
      const columns = new Map<string, string[]>();
      for (const entry of restore ?? []) {
        if (!api.getPanel(entry.id)) continue;
        columns.set(entry.column, [...(columns.get(entry.column) ?? []), entry.id]);
      }
      for (const ids of columns.values()) {
        const [head, ...rest] = ids;
        api.getPanel(head)?.api.moveTo({ group: feed.group, position: 'right' });
        const column = api.getPanel(head)?.group;
        if (!column) continue;
        for (const id of rest) api.getPanel(id)?.api.moveTo({ group: column });
      }
      // Nothing was remembered (a folded layout came back from storage): give every side panel its
      // own column, otherwise the folded tabs would stick around at any window width.
      for (const panel of sides) {
        if (panel.group === feed.group) panel.api.moveTo({ group: feed.group, position: 'right' });
      }
    }
    if (!foldOnly) applyGroupConstraints(api);
  };

  // No view-transition snapshot here: folding a column is two moves, and a full-window snapshot of a
  // live audio orb costs more than the layout change itself. The panes glide on their own CSS
  // transition instead (`.dockfold-animating .dv-view` in dockview-theme-slag.css).
  isApplyingLayout = true;
  // dockview puts its own theme class on the shell root, so `.dockview-theme-slag` is not the
  // element to hang this on.
  const dock = document.querySelector<HTMLElement>('.dv-shell');
  const animate = dock !== null && !prefersReducedMotion();
  if (animate) dock.classList.add(DOCK_ANIMATING_CLASS);
  try {
    apply();
  } finally {
    isApplyingLayout = false;
  }
  if (animate) {
    if (animationTimer) clearTimeout(animationTimer);
    animationTimer = setTimeout(() => dock.classList.remove(DOCK_ANIMATING_CLASS), DOCK_ANIMATION_MS);
  }
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
