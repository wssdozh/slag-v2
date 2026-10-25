import { isTauri } from '@tauri-apps/api/core';
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';

export const isAutostartEnabled = async (): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    return await isEnabled();
  } catch (err) {
    console.warn('Failed to check autostart:', err);
    return false;
  }
};

export const setAutostart = async (enableAuto: boolean): Promise<void> => {
  if (!isTauri()) return;
  try {
    if (enableAuto) {
      await enable();
    } else {
      await disable();
    }
  } catch (err) {
    console.warn('Failed to toggle autostart:', err);
  }
};
