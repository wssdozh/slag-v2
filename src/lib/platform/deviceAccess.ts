// The Android grants a reminder needs that are not runtime permissions: draw over other apps,
// full-screen alarm intents, and notification access. Each one is a switch in system settings, so
// this module only reads the state and opens that screen — it never asks the OS for anything.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';
import type { DeviceAccessStatus, DeviceAccessTarget } from '../../types';

const accessLog = logger.scope('NOTIFY');

/**
 * The only synchronous tell that this is the Android build: the webview user agent. The native
 * platform probe arrives after the first paint, and the permissions group is Android-only, so
 * waiting for it would flash the group in and out on every desktop launch.
 */
export function isAndroidApp(): boolean {
  return isTauri() && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export async function getDeviceAccessStatus(): Promise<DeviceAccessStatus | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<DeviceAccessStatus | null>('device_access_status');
  } catch (error) {
    // A vendor build without the overlay screen still has to render the other rows.
    accessLog.warn('device access status failed', { error: String(error) });
    return null;
  }
}

/** Opens the system screen for one grant. Coming back is what refreshes the status. */
export async function openDeviceAccessSettings(target: DeviceAccessTarget): Promise<void> {
  if (!isTauri()) return;
  await invoke('device_access_open', { target });
}

export type { DeviceAccessStatus, DeviceAccessTarget };
