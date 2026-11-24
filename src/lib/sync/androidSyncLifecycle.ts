import { isAndroidApp } from '../platform/deviceAccess';
import { getAndroidBackgroundSyncEnabled, subscribeAndroidBackgroundSyncPreference } from './androidBackgroundPreference';

export function isAndroidRelayPaused(): boolean {
  return isAndroidApp() && document.visibilityState === 'hidden' && !getAndroidBackgroundSyncEnabled();
}

function subscribe(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener);
  const unsubscribe = subscribeAndroidBackgroundSyncPreference(listener);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', listener);
  };
}

export function watchAndroidSync(signal: AbortSignal, pause: () => void, resume: (wasPaused: boolean) => void): void {
  if (!isAndroidApp()) return;
  let hidden = document.visibilityState === 'hidden';
  let paused = isAndroidRelayPaused();
  const stop = subscribe(() => {
    const wasHidden = hidden;
    const wasPaused = paused;
    hidden = document.visibilityState === 'hidden';
    paused = isAndroidRelayPaused();
    if (paused && !wasPaused) pause();
    else if (!paused && (wasPaused || (wasHidden && !hidden))) resume(wasPaused);
  });
  signal.addEventListener('abort', stop, { once: true });
}

// Only a new session's network negotiation waits here, never a journal transaction.
export function waitForAndroidSync(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      stop();
      signal.removeEventListener('abort', done);
      resolve();
    };
    const stop = subscribe(() => { if (!isAndroidRelayPaused()) done(); });
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted || !isAndroidRelayPaused()) done();
  });
}
