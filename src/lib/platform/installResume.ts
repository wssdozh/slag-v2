// Resuming an Android apk install after the person flips "install unknown apps".
// The check runs when the app comes back to the foreground, and it must fire at most once per
// offer: a second launch would re-download a file the person already declined to install.

export interface InstallResumeInput {
  /** The offer whose install the system blocked. */
  pendingVersion: string | null;
  /** The offer currently on screen. */
  offerVersion: string | null;
  /** The version whose automatic resume already ran. */
  resumedVersion: string | null;
  /** Fresh `canRequestPackageInstalls()`, null when the probe failed. */
  canInstallPackages: boolean | null;
}

/**
 * True only when the permission is now known to be granted, the blocked offer is still the one on
 * screen, and its resume has not happened yet. `null` means "unknown" and is deliberately not a
 * resume: the UI would otherwise relaunch the installer and ask the same question again.
 */
export function shouldResumeInstall(input: InstallResumeInput): boolean {
  const { pendingVersion, offerVersion, resumedVersion, canInstallPackages } = input;
  if (!pendingVersion || !offerVersion) return false;
  if (pendingVersion !== offerVersion) return false;
  if (pendingVersion === resumedVersion) return false;
  return canInstallPackages === true;
}
