// Reports the desktop OS, session type and hotkey backend so settings can adapt.
import { isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';

const platformLog = logger.scope('APP');

export function isTauriEnvironment(): boolean {
  return isTauri();
}

export interface PlatformInfo {
  os: 'linux' | 'windows' | 'macos' | 'unknown' | string;
  sessionType: 'wayland' | 'x11' | 'native' | 'unknown' | string;
  desktopEnvironment: 'gnome' | 'kde' | 'hyprland' | 'sway' | 'other' | 'unknown' | string;
  isWayland: boolean;
  isGnome: boolean;
  hotkeyBackend: 'gnome_gsettings' | 'tauri_native' | 'custom_launcher' | string;
  isHotkeyRegistered: boolean;
  executablePath: string;
  shortcut: string;
  details: string;
}

/**
 * Retrieves the current desktop platform info, session type (Wayland/X11), and global hotkey integration status.
 */
export async function getPlatformInfo(): Promise<PlatformInfo | null> {
  if (!isTauri()) {
    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
    const isWin = typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent);
    return {
      os: isMac ? 'macos' : isWin ? 'windows' : 'linux',
      sessionType: 'web',
      desktopEnvironment: 'browser',
      isWayland: false,
      isGnome: false,
      hotkeyBackend: 'browser_fallback',
      isHotkeyRegistered: false,
      executablePath: '',
      shortcut: 'Ctrl+Shift+Space',
      details: 'Работает в веб-режиме браузера',
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<PlatformInfo>('get_platform_info');
    platformLog.debug('Fetched desktop platform info', info);
    return info;
  } catch (err) {
    platformLog.error('Failed to get platform info from native core', err);
    return null;
  }
}

/**
 * Installs or updates system-wide hotkey integration (e.g. GNOME Media Keys on Linux Wayland).
 */
export async function setupSystemHotkey(binding?: string): Promise<PlatformInfo | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<PlatformInfo>('setup_system_hotkey', { binding });
    platformLog.info('Successfully configured system global shortcut', info);
    return info;
  } catch (err) {
    platformLog.error('Failed to setup system hotkey', err);
    throw err;
  }
}

/**
 * Unregisters the system-wide global shortcut.
 */
export async function removeSystemHotkey(): Promise<PlatformInfo | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<PlatformInfo>('remove_system_hotkey');
    platformLog.info('Successfully removed system global shortcut', info);
    return info;
  } catch (err) {
    platformLog.error('Failed to remove system hotkey', err);
    throw err;
  }
}
