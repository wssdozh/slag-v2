// Whether this device compares its vault root with the room on its own, and whether it cleans up
// after a neighbour that refuses a note.
//
// Device-local on purpose, like the update channel: a phone on mobile data may not want a check
// after every typo, while a desktop on a LAN does. The choice must not travel through sync.
import { STORAGE_KEYS } from '../../../config';
import { getPref, setPref } from '../../storage/prefs';

/** Absent means yes: the check is what makes the vault one vault, so it is on unless refused. */
export function readManifestAutoCheck(): boolean {
  return getPref(STORAGE_KEYS.MANIFEST_AUTOCHECK) !== '0';
}

export function writeManifestAutoCheck(enabled: boolean): void {
  setPref(STORAGE_KEYS.MANIFEST_AUTOCHECK, enabled ? '1' : '0');
}

/**
 * Absent means yes as well: a note the neighbour refused stays here forever otherwise, and the
 * panel turns red on every check. `decideResolve` keeps the pass small and reversible — the trash,
 * not a delete — so the default is to let it happen.
 */
export function readManifestAutoResolve(): boolean {
  return getPref(STORAGE_KEYS.MANIFEST_AUTORESOLVE) !== '0';
}

export function writeManifestAutoResolve(enabled: boolean): void {
  setPref(STORAGE_KEYS.MANIFEST_AUTORESOLVE, enabled ? '1' : '0');
}
