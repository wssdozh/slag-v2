// Opens a link in the system browser. Telegram deep links are the reason this exists: an
// <a target="_blank"> does nothing inside the app's webview.
import { isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';

export const isNativeWebview = isTauri;

const uiLog = logger.scope('UI');

export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  } catch (error) {
    // В браузере (vite dev) плагина нет: там window.open — это и есть нужное поведение.
    uiLog.warn('Native opener unavailable, using window.open', { error: String(error) });
  }
  window.open(url, '_blank', 'noreferrer');
}
