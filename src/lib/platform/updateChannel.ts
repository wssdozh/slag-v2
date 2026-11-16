// Which release stream this install follows. The choice is device-local on purpose: a phone may
// want beta while the laptop stays on release, and it must not travel through sync.
import { STORAGE_KEYS } from '../../config';
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
  try {
    return normalizeUpdateChannel(localStorage.getItem(STORAGE_KEYS.UPDATE_CHANNEL));
  } catch {
    return DEFAULT_UPDATE_CHANNEL;
  }
}

export function writeUpdateChannel(channel: AppUpdateChannel): void {
  try {
    localStorage.setItem(STORAGE_KEYS.UPDATE_CHANNEL, channel);
  } catch {
    // A blocked localStorage costs the persistence, not the switch: this session still reads the
    // channel the user picked, the next launch falls back to release.
  }
}
