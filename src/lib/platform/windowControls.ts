// Window chrome and platform checks: main window, minimize, maximize, desktop or mobile.
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../logger/logger';

const wsLog = logger.scope('WORKSPACE');

export const isMobilePlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

export const isDesktopApp = (): boolean => {
  return isTauri() && !isMobilePlatform();
};

// Secondary webviews (quick composer, detached panels) must not run their own sync engine:
// each one opens its own room socket and pushes its own copy of the vault.
export const isPrimaryWindow = (): boolean => {
  if (!isTauri()) return true;
  try {
    return getCurrentWindow().label === 'main';
  } catch {
    return true;
  }
};

export const minimizeWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
    wsLog.debug('Window minimized');
  } catch (err) {
    wsLog.error('Failed to minimize window', err);
  }
};

export const toggleMaximizeWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    wsLog.debug('Window maximize toggled');
  } catch (err) {
    wsLog.error('Failed to toggle maximize window', err);
  }
};

export const startDraggingWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  } catch (err) {
    wsLog.debug('startDragging failed or interrupted', err);
  }
};

const DETACHED_WINDOWS_KEY = 'slag_detached_windows_v2';

export interface SavedDetachedWindow {
  label: string;
  panelId: string;
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const getSavedDetachedWindows = (): SavedDetachedWindow[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DETACHED_WINDOWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveDetachedWindow = (entry: SavedDetachedWindow): void => {
  if (typeof window === 'undefined') return;
  try {
    const list = getSavedDetachedWindows().filter(w => w.label !== entry.label);
    list.push(entry);
    localStorage.setItem(DETACHED_WINDOWS_KEY, JSON.stringify(list));
    wsLog.debug(`Saved detached window configuration for [${entry.label}]`, entry);
  } catch (err) {
    wsLog.error('Failed to save detached window configuration', err);
  }
};

export const removeDetachedWindow = (label: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const list = getSavedDetachedWindows().filter(w => w.label !== label);
    localStorage.setItem(DETACHED_WINDOWS_KEY, JSON.stringify(list));
    wsLog.info(`Removed detached window [${label}] from registry`);
  } catch (err) {
    wsLog.error(`Failed to remove detached window [${label}]`, err);
  }
};

export const closeWindow = async (): Promise<void> => {
  if (!isTauri()) {
    if (typeof window !== 'undefined') {
      window.close();
    }
    return;
  }
  try {
    const appWindow = getCurrentWindow();
    wsLog.info(`Window close requested for [${appWindow.label}]`);

    // Quick composer window stays alive, just hides
    if (appWindow.label === 'quick-composer') {
      await appWindow.hide();
      wsLog.info('Quick composer window hidden');
      return;
    }

    // Destroy popout windows completely, but keep main window alive in tray
    if (appWindow.label !== 'main') {
      removeDetachedWindow(appWindow.label);
      try {
        await appWindow.destroy();
      } catch {
        await appWindow.close();
      }
      wsLog.info(`Destroyed detached window [${appWindow.label}]`);
    } else {
      try {
        await appWindow.hide();
        wsLog.info('Main window hidden to system tray');
      } catch {
        await appWindow.close();
        wsLog.info('Main window closed');
      }
    }
  } catch (err) {
    wsLog.error('Failed to close window', err);
    try {
      if (typeof window !== 'undefined') {
        window.close();
      }
    } catch {}
  }
};

export const openDetachedWindow = async (
  panelId: string,
  title: string,
  box?: { left?: number; top?: number; width?: number; height?: number },
  existingLabel?: string
): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = existingLabel || `panel-${panelId}-${Date.now()}`;
    const url = `index.html?panel=${encodeURIComponent(panelId)}&title=${encodeURIComponent(title)}&label=${encodeURIComponent(label)}`;

    const width = Math.max(380, Math.round(box?.width || 760));
    const height = Math.max(300, Math.round(box?.height || 580));
    const x = box?.left !== undefined ? Math.round(box.left) : undefined;
    const y = box?.top !== undefined ? Math.round(box.top) : undefined;

    wsLog.info(`Opening detached native window for [${panelId}] "${title}"`, {
      label,
      width,
      height,
      x,
      y,
    });

    const win = new WebviewWindow(label, {
      url,
      title: `${title} — SLAG`,
      width,
      height,
      x,
      y,
      minWidth: 380,
      minHeight: 300,
      decorations: false,
      transparent: false,
      theme: 'dark',
      dragDropEnabled: false,
    });

    win.once('tauri://error', (err) => {
      wsLog.error(`Failed to create detached native window [${label}]`, err);
      removeDetachedWindow(label);
    });

    saveDetachedWindow({
      label,
      panelId,
      title,
      left: x ?? 100,
      top: y ?? 100,
      width,
      height,
    });

    return true;
  } catch (err) {
    wsLog.error(`Failed to open detached native window for [${panelId}]`, err);
    return false;
  }
};

export const hideQuickComposer = async (): Promise<void> => {
  if (!isTauri()) {
    if (typeof window !== 'undefined') window.close();
    return;
  }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.hide();
    wsLog.info('Quick composer hidden');
  } catch (err) {
    wsLog.error('Failed to hide quick composer', err);
  }
};

export const listenQuickComposerFocus = (onFocus: () => void): (() => void) => {
  if (!isTauri()) return () => {};
  let unlisten: UnlistenFn | null = null;
  let active = true;

  void listen('slag://focus-composer', () => {
    if (active) onFocus();
  }).then((fn) => {
    if (!active) fn();
    else unlisten = fn;
  });

  return () => {
    active = false;
    if (unlisten) unlisten();
  };
};

export const notifyDataChanged = async (): Promise<void> => {
  const channel = getTabCrossWindowChannel();
  if (channel) {
    try {
      channel.postMessage({ type: 'DATA_CHANGED' });
    } catch {}
  }
  if (isTauri()) {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('slag://data-changed', null);
    } catch {}
  }
};

export const listenDesktopEvents = (handlers: {
  onOpenComposer?: () => void;
  onDataChanged?: () => void;
}): (() => void) => {
  if (!isTauri()) return () => {};

  let unlistenComposer: UnlistenFn | null = null;
  let unlistenData: UnlistenFn | null = null;
  let active = true;

  wsLog.debug('Registering desktop event listeners');

  void listen('slag://open-composer', () => {
    if (active && handlers.onOpenComposer) {
      wsLog.info('Received desktop global shortcut event: slag://open-composer');
      handlers.onOpenComposer();
    }
  }).then((unlisten) => {
    if (!active) {
      unlisten();
    } else {
      unlistenComposer = unlisten;
    }
  });

  void listen('slag://data-changed', () => {
    if (active && handlers.onDataChanged) {
      wsLog.info('Received desktop data changed event: slag://data-changed');
      handlers.onDataChanged();
    }
  }).then((unlisten) => {
    if (!active) {
      unlisten();
    } else {
      unlistenData = unlisten;
    }
  });

  return () => {
    active = false;
    if (unlistenComposer) {
      unlistenComposer();
    }
    if (unlistenData) {
      unlistenData();
    }
  };
};

export interface CrossWindowTabMessage {
  type: 'TAB_DRAG_START' | 'TAB_DRAG_MOVE' | 'TAB_DRAG_RELEASE' | 'TAB_DRAG_ACCEPTED' | 'TAB_DRAG_END';
  sourceLabel?: string;
  targetLabel?: string;
  panelId: string;
  title: string;
  screenX?: number;
  screenY?: number;
  forceDock?: boolean;
}

export const getTabCrossWindowChannel = (): BroadcastChannel | null => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel('slag_cross_window_tabs_v2');
};

export const sendCrossWindowTab = async (msg: CrossWindowTabMessage): Promise<void> => {
  // 1. BroadcastChannel (standard Web API, ultra-fast in-memory messaging across WebViews)
  const channel = getTabCrossWindowChannel();
  if (channel) {
    try {
      channel.postMessage(msg);
    } catch {
      // ignore
    }
  }

  // 2. Tauri native global event emitter for discrete lifecycle events only.
  // Skipped for high-frequency TAB_DRAG_MOVE to prevent IPC channel congestion and UI stutter.
  if (isTauri() && msg.type !== 'TAB_DRAG_MOVE') {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('slag://cross-window-tab', msg);
    } catch {
      // ignore
    }
  }
};

export const listenCrossWindowTab = (handler: (msg: CrossWindowTabMessage) => void): (() => void) => {
  let disposed = false;
  let unlistenTauri: (() => void) | null = null;

  // 1. Listen via BroadcastChannel
  const channel = getTabCrossWindowChannel();
  if (channel) {
    channel.onmessage = (e: MessageEvent<CrossWindowTabMessage>) => {
      if (disposed || !e.data) return;
      handler(e.data);
    };
  }

  // 2. Listen via Tauri native global event bus
  if (isTauri()) {
    void import('@tauri-apps/api/event').then(({ listen }) => {
      if (disposed) return;
      void listen<CrossWindowTabMessage>('slag://cross-window-tab', (event) => {
        if (disposed || !event.payload) return;
        handler(event.payload);
      }).then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenTauri = unlisten;
        }
      });
    });
  }

  return () => {
    disposed = true;
    if (channel) {
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
    if (unlistenTauri) {
      unlistenTauri();
    }
  };
};
