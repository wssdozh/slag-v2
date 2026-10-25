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
    await appWindow.close();
  } catch (err) {
    console.error('Failed to close window:', err);
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
