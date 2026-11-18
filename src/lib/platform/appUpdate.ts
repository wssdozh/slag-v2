// In-app self-update: the only place that talks to the Rust updater commands and its progress
// event. UI never imports @tauri-apps directly — that lives in src/lib by contract.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../logger/logger';
import type {
  AppUpdateChannel,
  AppUpdateInstallOutcome,
  AppUpdateLogLine,
  AppUpdateOffer,
  AppUpdatePackage,
  AppUpdatePackageInstall,
  AppUpdatePlatform,
  AppUpdateProgress,
} from '../../types';

const updateLog = logger.scope('UPDATE');
const PROGRESS_EVENT = 'slag://update-progress';
const LOG_EVENT = 'slag://update-log';

/** Rust reports failures as short codes; anything unexpected collapses to `unknown`. */
const KNOWN_CODES = [
  'asset_url_not_allowed',
  'no_platform_asset',
  'manifest_invalid',
  'pubkey_invalid',
  'signature_invalid',
  'verify_failed',
  'size_mismatch',
  'network_client',
  'network',
  'write_failed',
  'read_failed',
  'restart_failed',
  'installer_failed',
  'install_timeout',
  'permission_required',
  'missing_file',
  'install_failed',
  'settings_failed',
  'up_to_date',
  'unsupported',
  'unknown_channel',
];

export function updateErrorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const known = KNOWN_CODES.find((code) => text.includes(code));
  if (known) return known;
  const http = text.match(/http_\d{3}/);
  return http ? http[0] : 'unknown';
}

/** The same codes, in words a toast can show without a raw identifier. */
const ERROR_TEXT: Record<string, string> = {
  asset_url_not_allowed: 'манифест указывает на чужой хост — обновление отменено',
  no_platform_asset: 'в релизе нет файла для этой платформы',
  manifest_invalid: 'манифест релиза битый',
  pubkey_invalid: 'вшитый публичный ключ повреждён',
  signature_invalid: 'подпись не разобралась — обновление отменено',
  verify_failed: 'хэш или подпись не сошлись — обновление отменено',
  size_mismatch: 'скачался не тот объём',
  network_client: 'не удалось поднять http-клиент',
  network: 'нет связи с github',
  write_failed: 'нет прав писать в папку обновления',
  read_failed: 'файл обновления не читается',
  restart_failed: 'не удалось запустить установку',
  installer_failed: 'установщик не запустился',
  install_timeout: 'пакетный менеджер не закончил за три минуты',
  permission_required: 'android не разрешает установку из этого источника',
  missing_file: 'файл обновления потерялся',
  install_failed: 'системный установщик отказал',
  settings_failed: 'не открылись настройки установки',
  up_to_date: 'уже последняя версия',
  unsupported: 'эта платформа не ставит обновления сама',
  unknown_channel: 'неизвестный канал обновлений',
};

export function updateErrorText(code: string | null): string {
  if (!code) return '';
  if (code.startsWith('http_')) return `github ответил ${code.slice(5)}`;
  return ERROR_TEXT[code] ?? code;
}

export async function getAppUpdatePlatform(
  channel: AppUpdateChannel
): Promise<AppUpdatePlatform | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<AppUpdatePlatform>('update_platform', { channel });
  } catch (error) {
    updateLog.warn('platform probe failed', { error: String(error) });
    return null;
  }
}

export async function checkAppUpdate(channel: AppUpdateChannel): Promise<AppUpdateOffer | null> {
  if (!isTauri()) return null;
  return invoke<AppUpdateOffer | null>('update_check', { channel });
}

export async function installAppUpdate(
  channel: AppUpdateChannel
): Promise<AppUpdateInstallOutcome> {
  return invoke<AppUpdateInstallOutcome>('update_install', { channel });
}

/**
 * Linux package install. The native side picks the file this distro eats (deb, pkg.tar.zst, or an
 * AppImage elsewhere), downloads and verifies it, and answers with the command the owner runs —
 * the app itself never touches apt or pacman.
 */
export async function downloadAppUpdatePackage(
  channel: AppUpdateChannel
): Promise<AppUpdatePackage> {
  return invoke<AppUpdatePackage>('update_download_package', { channel });
}

/**
 * The same file, installed by the system: `pkexec` raises the desktop's own password dialog, so the
 * owner never sees a `sudo` line. `manual` comes back when there is no polkit agent to ask.
 */
export async function installAppUpdatePackage(
  channel: AppUpdateChannel
): Promise<AppUpdatePackageInstall> {
  return invoke<AppUpdatePackageInstall>('update_install_package', { channel });
}

/** Relaunch: a package install puts the new file on disk, not into the running process. */
export async function restartApp(): Promise<void> {
  if (!isTauri()) return;
  await invoke('restart_app');
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke('update_open_install_settings');
}

/** Live download progress, in bytes; the handler runs on every `slag://update-progress` tick. */
export async function watchUpdateProgress(
  handler: (progress: AppUpdateProgress) => void
): Promise<UnlistenFn | null> {
  if (!isTauri()) return null;
  return listen<AppUpdateProgress>(PROGRESS_EVENT, (event) => handler(event.payload));
}

/**
 * The native pipeline narrates every step (manifest, download, hashes, apply) on this event.
 * It lands in the app log with the UPDATE scope, which is the only trace a phone user can read.
 */
export async function watchUpdateLog(
  handler: (line: AppUpdateLogLine) => void
): Promise<UnlistenFn | null> {
  if (!isTauri()) return null;
  return listen<AppUpdateLogLine>(LOG_EVENT, (event) => handler(event.payload));
}
