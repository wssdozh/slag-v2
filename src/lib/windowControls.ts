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

export const closeWindow = async (): Promise<void> => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    // Destroy popout windows completely, but keep main window alive in tray
    if (appWindow.label !== 'main') {
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

export const openDetachedWindow = async (panelId: string, title: string, box?: { left?: number; top?: number; width?: number; height?: number }): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = `panel-${panelId}-${Date.now()}`;
    const url = `index.html?panel=${encodeURIComponent(panelId)}&title=${encodeURIComponent(title)}`;
    
    const win = new WebviewWindow(label, {
      url,
      title: `${title} — SLAG`,
      width: box?.width || 760,
      height: box?.height || 580,
      x: box?.left,
      y: box?.top,
      minWidth: 420,
      minHeight: 320,
      decorations: false,
      transparent: false,
      theme: 'dark',
      dragDropEnabled: false,
    });

    win.once('tauri://error', (err) => {
      console.error('Failed to create detached native window:', err);
    });

    return true;
  } catch (err) {
    console.error('Failed to open detached native window:', err);
    return false;
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
