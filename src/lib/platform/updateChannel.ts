// Which release stream this install follows. The choice is device-local on purpose: a phone may
// want beta while the laptop stays on release, and it must not travel through sync.
import { STORAGE_KEYS } from '../../config';
import { getPref, setPref } from '../storage/prefs';
import type { AppUpdateChannel } from '../../types';

export const DEFAULT_UPDATE_CHANNEL: AppUpdateChannel = 'release';

export const UPDATE_CHANNEL_OPTIONS: { value: AppUpdateChannel; label: string }[] = [
  { value: 'release', label: 'релиз' },
  { value: 'beta', label: 'бета' },
  { value: 'dev', label: 'дев' },
];

/** Anything that is not an explicit prerelease is the stable stream, never a guess. */
export function normalizeUpdateChannel(value: string | null | undefined): AppUpdateChannel {
  return value === 'beta' || value === 'dev' ? value : DEFAULT_UPDATE_CHANNEL;
}

export function readUpdateChannel(): AppUpdateChannel {
  return normalizeUpdateChannel(getPref(STORAGE_KEYS.UPDATE_CHANNEL));
}

export function writeUpdateChannel(channel: AppUpdateChannel): void {
  setPref(STORAGE_KEYS.UPDATE_CHANNEL, channel);
}
