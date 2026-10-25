import { isTauri } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export const sendDesktopNotification = async (
  title: string,
  body?: string
): Promise<void> => {
  if (isTauri()) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }
      if (granted) {
        sendNotification({ title, body });
      }
    } catch (err) {
      console.warn('Tauri notification error:', err);
    }
    return;
  }

  // Web Notification fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, { body });
        }
      }
    } catch {
      // ignore
    }
  }
};
