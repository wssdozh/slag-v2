// In-app self-update: the only place that talks to the Rust updater commands and its progress
// event. UI never imports @tauri-apps directly — that lives in src/lib by contract.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../logger/logger';
import type {
  AppUpdateInstallOutcome,
  AppUpdateOffer,
  AppUpdatePlatform,
  AppUpdateProgress,
} from '../../types';

const updateLog = logger.scope('UPDATE');
const PROGRESS_EVENT = 'slag://update-progress';

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
  'permission_required',
  'missing_file',
  'install_failed',
  'settings_failed',
  'up_to_date',
  'unsupported',
];

export function updateErrorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const known = KNOWN_CODES.find((code) => text.includes(code));
  if (known) return known;
  const http = text.match(/http_\d{3}/);
  return http ? http[0] : 'unknown';
}

export async function getAppUpdatePlatform(): Promise<AppUpdatePlatform | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<AppUpdatePlatform>('update_platform');
  } catch (error) {
    updateLog.warn('platform probe failed', { error: String(error) });
    return null;
  }
}

export async function checkAppUpdate(): Promise<AppUpdateOffer | null> {
  if (!isTauri()) return null;
  return invoke<AppUpdateOffer | null>('update_check');
}

export async function installAppUpdate(): Promise<AppUpdateInstallOutcome> {
  return invoke<AppUpdateInstallOutcome>('update_install');
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
