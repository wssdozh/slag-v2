// Owns the app-update state: one silent check after boot, a manual check, the download/install
// flow and the "dismissed this version" memory. The UI only reads this and calls the actions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../../config';
import {
  checkAppUpdate,
  getAppUpdatePlatform,
  installAppUpdate,
  openInstallPermissionSettings,
  updateErrorCode,
  updateErrorText,
  watchUpdateLog,
  watchUpdateProgress,
} from '../../lib/platform/appUpdate';
import { openExternalUrl } from '../../lib/platform/openExternal';
import { logger } from '../../lib/logger/logger';
import type {
  AppUpdateOffer,
  AppUpdatePlatform,
  AppUpdateProgress,
  AppUpdateState,
  AppUpdateStatus,
  ConfirmOptions,
} from '../../types';

const updateLog = logger.scope('UPDATE');
const CHECK_DELAY_MS = 4000;

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.UPDATE_DISMISSED);
  } catch {
    return null;
  }
}

export function useAppUpdates(
  addToast: (text: string, type?: 'info' | 'success' | 'error') => void,
  confirmAction: (options: ConfirmOptions) => Promise<boolean>
): AppUpdateState {
  const [platform, setPlatform] = useState<AppUpdatePlatform | null>(null);
  const [offer, setOffer] = useState<AppUpdateOffer | null>(null);
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(readDismissedVersion);
  const isBusy = useRef(false);

  useEffect(() => {
    void getAppUpdatePlatform().then(setPlatform);
  }, []);

  // The native side narrates every step; mirror it into the app log so a failed update on a phone
  // leaves a readable trace instead of a silent "nothing happened".
  useEffect(() => {
    let stop: (() => void) | null = null;
    let disposed = false;
    void watchUpdateLog((line) => {
      const level = line.level === 'error' ? 'error' : line.level === 'warn' ? 'warn' : 'info';
      updateLog[level](line.message, line.data ? { detail: line.data } : undefined);
    }).then((unlisten) => {
      if (disposed) unlisten?.();
      else stop = unlisten ?? null;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  const runCheck = useCallback(async (silent: boolean): Promise<'found' | 'none' | 'error'> => {
    if (isBusy.current) return 'error';
    isBusy.current = true;
    if (!silent) {
      setStatus('checking');
      setError(null);
    }
    try {
      const found = await checkAppUpdate();
      setOffer(found);
      setStatus(found ? 'available' : 'up-to-date');
      updateLog.info('check', { found: found?.version ?? 'none' });
      return found ? 'found' : 'none';
    } catch (cause) {
      const code = updateErrorCode(cause);
      if (silent) {
        updateLog.warn('silent check failed', { code });
      } else {
        setStatus('error');
        setError(code);
        addToast(`не удалось проверить обновление: ${updateErrorText(code)}`, 'error');
      }
      return 'error';
    } finally {
      isBusy.current = false;
    }
  }, [addToast]);

  // One silent check per launch, after the first paint: a cold start must not race the feed.
  useEffect(() => {
    if (!platform) return;
    const timer = setTimeout(() => void runCheck(true), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [platform, runCheck]);

  // A manual check that finds nothing says so as a toast; a permanent "new versions: none" row
  // under the card was a second copy of the label directly above it.
  const check = useCallback(async () => {
    const outcome = await runCheck(false);
    if (outcome === 'none') addToast('новых версий нет', 'info');
  }, [runCheck, addToast]);

  const install = useCallback(async () => {
    if (!offer || isBusy.current) return;
    isBusy.current = true;
    setStatus('downloading');
    setError(null);
    setProgress({ downloaded: 0, total: offer.size ?? null });
    const unlisten = await watchUpdateProgress(setProgress);
    try {
      const outcome = await installAppUpdate();
      updateLog.info('installed', { version: outcome.version, status: outcome.status });
      if (outcome.status === 'permission_required') {
        // Android cannot install silently: the switch lives in system settings, so this is a
        // question with a consequence, not a line of text under the button.
        setStatus('available');
        const proceed = await confirmAction({
          title: 'Разрешить установку?',
          description:
            'Android не даёт ставить apk из приложения, пока в настройках не разрешена установка из этого источника. Открыть настройки?',
          confirmLabel: 'Открыть настройки',
          cancelLabel: 'Позже',
        });
        if (proceed) {
          void openInstallPermissionSettings().catch((cause: unknown) => {
            updateLog.warn('install permission screen failed', { error: String(cause) });
          });
        }
        return;
      }
      setStatus('installing');
    } catch (cause) {
      const code = updateErrorCode(cause);
      updateLog.warn('install failed', { code });
      setStatus('error');
      setError(code);
      addToast(`обновление не установилось: ${updateErrorText(code)}`, 'error');
    } finally {
      unlisten?.();
      isBusy.current = false;
    }
  }, [offer, confirmAction, addToast]);

  const dismiss = useCallback(() => {
    const version = offer?.version;
    if (!version) return;
    setDismissedVersion(version);
    try {
      localStorage.setItem(STORAGE_KEYS.UPDATE_DISMISSED, version);
    } catch {
      // A blocked localStorage only costs the reminder, not the update itself.
    }
  }, [offer]);

  const openReleasePage = useCallback(() => {
    const url = platform?.releasePage;
    if (url) void openExternalUrl(url);
  }, [platform]);

  const requestInstallPermission = useCallback(() => {
    void openInstallPermissionSettings().catch((cause: unknown) => {
      updateLog.warn('install permission screen failed', { error: String(cause) });
    });
  }, []);

  const canInstall = Boolean(platform?.canApply && offer && offer.kind !== 'manual');
  const isNoticeVisible = Boolean(
    offer && offer.version !== dismissedVersion && status !== 'installing'
  );

  return useMemo(
    () => ({
      platform,
      offer,
      status,
      progress,
      error,
      isNoticeVisible,
      canInstall,
      check,
      install,
      dismiss,
      openReleasePage,
      openInstallPermissionSettings: requestInstallPermission,
    }),
    [
      platform,
      offer,
      status,
      progress,
      error,
      isNoticeVisible,
      canInstall,
      check,
      install,
      dismiss,
      openReleasePage,
      requestInstallPermission,
    ]
  );
}
