// Whether this device compares its vault root with the room on its own.
//
// Device-local on purpose, like the update channel: a phone on mobile data may not want a check
// after every typo, while a desktop on a LAN does. The choice must not travel through sync.
import { STORAGE_KEYS } from '../../config';
import { getPref, setPref } from '../storage/prefs';

/** Absent means yes: the check is what makes the vault one vault, so it is on unless refused. */
export function readManifestAutoCheck(): boolean {
  return getPref(STORAGE_KEYS.MANIFEST_AUTOCHECK) !== '0';
}

export function writeManifestAutoCheck(enabled: boolean): void {
  setPref(STORAGE_KEYS.MANIFEST_AUTOCHECK, enabled ? '1' : '0');
}
