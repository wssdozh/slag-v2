// This preference belongs to the device, not to the vault or relay account.
import { getPref, setPref } from '../storage/prefs';

const key = 'slag:android-background-sync';
const listeners = new Set<(enabled: boolean) => void>();

export function getAndroidBackgroundSyncEnabled(): boolean {
  return getPref(key) !== '0';
}

export function setAndroidBackgroundSyncEnabled(enabled: boolean): void {
  if (getAndroidBackgroundSyncEnabled() === enabled) return;
  setPref(key, enabled ? '1' : '0');
  for (const listener of listeners) listener(enabled);
}

export function subscribeAndroidBackgroundSyncPreference(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
