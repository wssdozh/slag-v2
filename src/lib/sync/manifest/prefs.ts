// Device-local: a phone on mobile data may not want to compare every change.
import { STORAGE_KEYS } from '../../../config';
import { getPref, setPref } from '../../storage/prefs';

/** Absent means yes: the check is what makes the vault one vault, so it is on unless refused. */
export function readManifestAutoCheck(): boolean {
  return getPref(STORAGE_KEYS.MANIFEST_AUTOCHECK) !== '0';
}

export function writeManifestAutoCheck(enabled: boolean): void {
  setPref(STORAGE_KEYS.MANIFEST_AUTOCHECK, enabled ? '1' : '0');
}
