import { isTauri } from '@tauri-apps/api/core';
import { logger } from './logger';

const fsLog = logger.scope('FS');

export interface OpenFolderResult {
  success: boolean;
  path?: string;
  message: string;
}

/**
 * Opens a local folder in native OS file explorer (Windows Explorer, Finder, xdg-open).
 * Works seamlessly in:
 * 1. Native Tauri desktop app via Rust invoke('open_in_folder')
 * 2. Vite dev server mode (pnpm dev) via /api/dev/open-folder middleware
 * 3. Browser fallback with informative toast notification
 */
export async function openAppFolder(
  target: 'logs' | 'notes' | 'appdata' = 'logs'
): Promise<OpenFolderResult> {
  // 1. Desktop native app via Tauri invoke
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const dirPath = await invoke<string>('open_in_folder', { target });
      fsLog.info(`Opened native folder in OS explorer (${target})`, { dirPath });
      return {
        success: true,
        path: dirPath,
        message: `Папка открыта: ${dirPath}`,
      };
    } catch (err) {
      fsLog.error(`Failed to open native folder (${target})`, err);
    }
  }

  // 2. Vite dev server middleware (works in dev browser builds)
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(`/api/dev/open-folder?target=${encodeURIComponent(target)}`);
      if (res.ok) {
        const json = await res.json();
        fsLog.info(`Opened dev folder via Vite middleware (${target})`, json);
        return {
          success: true,
          path: json.path,
          message: `Папка открыта: ${json.path}`,
        };
      }
    } catch (err) {
      fsLog.debug('Dev folder opener endpoint unreachable:', err);
    }
  }

  // 3. Fallback for standalone web / browser builds
  const folderName = target === 'logs' ? 'логов' : target === 'notes' ? 'заметок' : 'приложения';
  return {
    success: false,
    message: `Прямое открытие папки ${folderName} поддерживается в настольной и dev-версии. Используйте скачивание файлов.`,
  };
}
