import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const isDesktopApp = (): boolean => {
  return isTauri();
};

export const minimizeWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  } catch (err) {
    console.error('Failed to minimize window:', err);
  }
};

export const toggleMaximizeWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
  } catch (err) {
    console.error('Failed to toggle maximize window:', err);
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
  } catch {}
};

export const updateDetachedWindowBounds = (
  label: string,
  bounds: { left: number; top: number; width: number; height: number }
): void => {
  if (typeof window === 'undefined') return;
  try {
    const list = getSavedDetachedWindows();
    const target = list.find(w => w.label === label);
    if (target) {
      target.left = bounds.left;
      target.top = bounds.top;
      target.width = bounds.width;
      target.height = bounds.height;
      localStorage.setItem(DETACHED_WINDOWS_KEY, JSON.stringify(list));
    }
  } catch {}
};

export const removeDetachedWindow = (label: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const list = getSavedDetachedWindows().filter(w => w.label !== label);
    localStorage.setItem(DETACHED_WINDOWS_KEY, JSON.stringify(list));
  } catch {}
};

export const closeWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    // Destroy popout windows completely, but keep main window alive in tray
    if (appWindow.label !== 'main') {
      removeDetachedWindow(appWindow.label);
      await appWindow.destroy();
    } else {
      try {
        await appWindow.hide();
      } catch {
        await appWindow.close();
      }
    }
  } catch (err) {
    console.error('Failed to close window:', err);
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
      console.error('Failed to create detached native window:', err);
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
    console.error('Failed to open detached native window:', err);
    return false;
  }
};

export const restoreDetachedWindows = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const saved = getSavedDetachedWindows();
    for (const item of saved) {
      const existing = await WebviewWindow.getByLabel(item.label);
      if (!existing) {
        await openDetachedWindow(
          item.panelId,
          item.title,
          {
            left: item.left,
            top: item.top,
            width: item.width,
            height: item.height,
          },
          item.label
        );
      }
    }
  } catch (err) {
    console.error('Failed to restore detached windows:', err);
  }
};

export const listenDesktopEvents = (handlers: {
  onOpenComposer?: () => void;
}): (() => void) => {
  if (!isTauri()) return () => {};

  let unlistenComposer: UnlistenFn | null = null;
  let active = true;

  void listen('slag://open-composer', () => {
    if (active && handlers.onOpenComposer) {
      handlers.onOpenComposer();
    }
  }).then((unlisten) => {
    if (!active) {
      unlisten();
    } else {
      unlistenComposer = unlisten;
    }
  });

  return () => {
    active = false;
    if (unlistenComposer) {
      unlistenComposer();
    }
  };
};
