// Owns the app-update state: one silent check after boot, a manual check, the download/install
// flow and the "dismissed this version" memory. The UI only reads this and calls the actions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../../config';
import {
  checkAppUpdate,
  downloadAppUpdatePackage,
  getAppUpdatePlatform,
  installAppUpdate,
  installAppUpdatePackage,
  openInstallPermissionSettings,
  restartApp,
  updateErrorCode,
  updateErrorText,
  watchUpdateLog,
  watchUpdateProgress,
} from '../../lib/platform/appUpdate';
import { openExternalUrl } from '../../lib/platform/openExternal';
import { readUpdateChannel, writeUpdateChannel } from '../../lib/platform/updateChannel';
import { isPrimaryWindow } from '../../lib/platform/windowControls';
import { shouldResumeInstall } from '../../lib/platform/installResume';
import { getPref, setPref } from '../../lib/storage/prefs';
import { logger } from '../../lib/logger/logger';
import type {
  AppUpdateChannel,
  AppUpdateOffer,
  AppUpdatePackage,
  AppUpdatePlatform,
  AppUpdateProgress,
  AppUpdateState,
  AppUpdateStatus,
  ConfirmOptions,
} from '../../types';

const updateLog = logger.scope('UPDATE');
const CHECK_DELAY_MS = 4000;

export function useAppUpdates(
  addToast: (text: string, type?: 'info' | 'success' | 'error') => void,
  confirmAction: (options: ConfirmOptions) => Promise<boolean>
): AppUpdateState {
  const [platform, setPlatform] = useState<AppUpdatePlatform | null>(null);
  const [offer, setOffer] = useState<AppUpdateOffer | null>(null);
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    getPref(STORAGE_KEYS.UPDATE_DISMISSED)
  );
  const [packageOffer, setPackageOffer] = useState<AppUpdatePackage | null>(null);
  const [channel, setChannelState] = useState<AppUpdateChannel>(readUpdateChannel);
  const isBusy = useRef(false);
  /** The offer android refused to install, kept until the system permission changes. */
  const pendingInstall = useRef<string | null>(null);
  /** The version whose automatic resume already ran; one resume per offer, never a loop. */
  const resumedInstall = useRef<string | null>(null);

  useEffect(() => {
    void getAppUpdatePlatform(channel).then((next) => {
      // The probe answers "what is this build and may it replace itself". A silent null here is
      // exactly the state where the tab says nothing forever, so the log has to name it.
      updateLog.info('platform probe', {
        os: next?.os ?? 'none',
        form: next?.installForm ?? 'none',
        canApply: String(next?.canApply ?? false),
        primary: String(isPrimaryWindow()),
      });
      setPlatform(next);
    });
  }, [channel]);

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

  const runCheck = useCallback(
    async (silent: boolean): Promise<'found' | 'none' | 'error'> => {
      if (isBusy.current) return 'error';
      isBusy.current = true;
      if (!silent) {
        setStatus('checking');
        setError(null);
      }
      try {
        const found = await checkAppUpdate(channel);
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
    },
    [addToast, channel]
  );

  // One silent check per launch, after the first paint: a cold start must not race the feed.
  // The quick composer mounts this provider too, and two checks in one launch is one too many.
  useEffect(() => {
    if (!platform || !isPrimaryWindow()) return;
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
      const outcome = await installAppUpdate(channel);
      updateLog.info('installed', { version: outcome.version, status: outcome.status });
      if (outcome.status === 'permission_required') {
        // Android cannot install silently: the switch lives in system settings, so this is a
        // question with a consequence, not a line of text under the button. The version is
        // remembered so the return from that screen can pick the offer up again.
        pendingInstall.current = offer.version;
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
      pendingInstall.current = null;
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
  }, [offer, confirmAction, addToast, channel]);

  /**
   * Android: the install permission and the install itself both happen outside the app, and the
   * return is the only moment either can have changed. The platform probe is re-read then — never
   * on a timer — and one blocked offer gets exactly one automatic resume.
   */
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      const pending = pendingInstall.current;
      // Neither a blocked install nor an open permission row on screen: nothing to look at.
      if (!pending && platform?.canInstallPackages !== false) return;
      void (async () => {
        const next = await getAppUpdatePlatform(channel);
        if (next) setPlatform(next);
        const canInstallPackages = next?.canInstallPackages ?? null;
        updateLog.info('install permission check', {
          pending: pending ?? 'none',
          canInstall: canInstallPackages === null ? 'unknown' : String(canInstallPackages),
        });
        if (
          !shouldResumeInstall({
            pendingVersion: pending,
            offerVersion: offer?.version ?? null,
            resumedVersion: resumedInstall.current,
            canInstallPackages,
          })
        ) {
          return;
        }
        resumedInstall.current = pending;
        updateLog.info('install resume', { version: pending });
        await install();
      })();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [platform, offer, install, channel]);

  const dismiss = useCallback(() => {
    const version = offer?.version;
    if (!version) return;
    setDismissedVersion(version);
    setPref(STORAGE_KEYS.UPDATE_DISMISSED, version);
  }, [offer]);

  /**
   * Switching the stream drops the offer from the previous one: an update that came from `dev`
   * must not stay installable while the client now reads `release`. The probe effect re-runs on
   * the channel and its silent check refills the card with the answer of the new stream.
   */
  const setChannel = useCallback(
    (next: AppUpdateChannel) => {
      if (next === channel) return;
      writeUpdateChannel(next);
      updateLog.info('channel', { from: channel, to: next });
      setChannelState(next);
      setOffer(null);
      setStatus('idle');
      setError(null);
    },
    [channel]
  );

  /**
   * Linux package install: fetch the file this distro installs and copy the command that installs
   * it. The app never runs apt or pacman — that is the owner's terminal, not a gui button.
   */
  const downloadPackage = useCallback(async () => {
    if (!offer || isBusy.current) return;
    isBusy.current = true;
    setStatus('downloading');
    setError(null);
    setProgress({ downloaded: 0, total: offer.size ?? null });
    const unlisten = await watchUpdateProgress(setProgress);
    try {
      const fetched = await downloadAppUpdatePackage(channel);
      setPackageOffer(fetched);
      setStatus('available');
      updateLog.info('package downloaded', { version: fetched.version, kind: fetched.kind });
      try {
        await navigator.clipboard.writeText(fetched.command);
        addToast('пакет скачан, команда установки в буфере обмена', 'success');
      } catch {
        // A webview may refuse the clipboard; the command is on screen and selectable.
        addToast('пакет скачан — команда ниже, скопируй её в терминал', 'info');
      }
    } catch (cause) {
      const code = updateErrorCode(cause);
      updateLog.warn('package download failed', { code });
      setStatus('error');
      setError(code);
      addToast(`пакет не скачался: ${updateErrorText(code)}`, 'error');
    } finally {
      unlisten?.();
      isBusy.current = false;
    }
  }, [offer, channel, addToast]);

  const openReleasePage = useCallback(() => {
    const url = platform?.releasePage;
    if (url) void openExternalUrl(url);
  }, [platform]);

  /**
   * Linux package install without a terminal: download, then let polkit ask for the password. A
   * machine with no agent gets the command instead, which is the old hand-off; a dismissed dialog
   * is a decision, so it is a quiet info toast, not an error.
   */
  const installPackage = useCallback(async () => {
    if (!offer || isBusy.current) return;
    const proceed = await confirmAction({
      title: `Обновить до ${offer.version}?`,
      description:
        'скачаю пакет и передам его системному менеджеру — он спросит пароль администратора. приложение перезапустится само, чтобы запустилась новая версия.',
      confirmLabel: 'Обновить',
    });
    if (!proceed) return;
    isBusy.current = true;
    setStatus('downloading');
    setError(null);
    setProgress({ downloaded: 0, total: offer.size ?? null });
    const unlisten = await watchUpdateProgress(setProgress);
    try {
      const outcome = await installAppUpdatePackage(channel);
      updateLog.info('package install', { status: outcome.status, version: outcome.version });
      if (outcome.status === 'installed') {
        setStatus('installing');
        addToast(`обновлено до ${outcome.version} — перезапускаю`, 'success');
        // The file on disk is the new build; the process is still the old one. Nothing else picks
        // the update up, so the app does the restart itself instead of asking for it.
        setTimeout(() => void restartApp().catch((cause: unknown) => {
          updateLog.warn('restart failed', { error: String(cause) });
          addToast('перезапусти приложение вручную: обновление уже установлено', 'info');
        }), 1200);
        return;
      }
      if (outcome.status === 'cancelled') {
        setStatus('available');
        addToast('ввод пароля отменён — обновление не установлено', 'info');
        return;
      }
      if (outcome.status === 'manual') {
        setPackageOffer({ version: outcome.version, kind: offer.kind as AppUpdatePackage['kind'], path: '', command: outcome.command });
        setStatus('available');
        try {
          await navigator.clipboard.writeText(outcome.command);
          addToast('пароль спросить не у кого — команда установки в буфере', 'info');
        } catch {
          addToast('пароль спросить не у кого — команда ниже', 'info');
        }
        return;
      }
      setStatus('error');
      setError('install_failed');
      addToast(`пакет не установился${outcome.detail ? `: ${outcome.detail}` : ''}`, 'error');
    } catch (cause) {
      const code = updateErrorCode(cause);
      updateLog.warn('package install failed', { code });
      setStatus('error');
      setError(code);
      addToast(`обновление не установилось: ${updateErrorText(code)}`, 'error');
    } finally {
      unlisten?.();
      isBusy.current = false;
    }
  }, [offer, confirmAction, addToast, channel]);

  const requestRestart = useCallback(() => {
    void restartApp().catch((cause: unknown) => {
      updateLog.warn('restart failed', { error: String(cause) });
    });
  }, []);

  const requestInstallPermission = useCallback(() => {
    void openInstallPermissionSettings().catch((cause: unknown) => {
      updateLog.warn('install permission screen failed', { error: String(cause) });
    });
  }, []);

  const canInstall = Boolean(platform?.canApply && offer && offer.kind !== 'manual');
  /** A file exists for this machine, but the app will not install it: hand over the command. */
  const canFetchPackage = Boolean(offer && offer.kind !== 'manual' && !canInstall);
  const canInstallPackage = Boolean(platform?.canInstallPackage && offer && !canInstall);
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
      canFetchPackage,
      canInstallPackage,
      packageOffer,
      channel,
      setChannel,
      check,
      install,
      downloadPackage,
      installPackage,
      restartApp: requestRestart,
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
      canFetchPackage,
      canInstallPackage,
      packageOffer,
      channel,
      setChannel,
      check,
      install,
      downloadPackage,
      installPackage,
      requestRestart,
      dismiss,
      openReleasePage,
      requestInstallPermission,
    ]
  );
}
