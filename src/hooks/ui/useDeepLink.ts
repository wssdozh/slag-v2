// Opens the note an external `slag://` link points at.
import { useEffect } from 'react';
import { onDeepLinkOpened, takePendingNoteLink } from '../../lib/platform/deepLink';

/**
 * Wires a link into the app: Telegram's answer, a browser, another app — anything that can
 * hand the OS a URL.
 *
 * Three moments can carry one: a cold start (`slag://` was the argument), a second launch while
 * the app is running, and a resume after the OS parked the intent. All three pull from the same
 * native slot, so the order they fire in does not matter — the second pull gets nothing.
 */
export function useDeepLink(onTarget: (target: string) => void): void {
  useEffect(() => {
    let disposed = false;
    const pull = (): void => {
      void takePendingNoteLink().then((target) => {
        if (!disposed && target) onTarget(target);
      });
    };
    pull();
    const unlisten = onDeepLinkOpened(pull);
    // Android hands a link to a running app as an intent, not as a script call: the webview only
    // knows it is back in front. Asking on return is what turns that into an open note.
    const onWake = (): void => {
      if (document.visibilityState === 'visible') pull();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      disposed = true;
      void unlisten.then((off) => off());
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [onTarget]);
}
