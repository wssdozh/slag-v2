// Android overlay / alarm / notification access, re-read whenever the app regains focus: the
// switch lives in the system settings screen, and the return from it is the only moment the state
// can have changed. No polling — one focus or visibility event is the entire schedule.
import { useEffect, useState } from 'react';
import { getDeviceAccessStatus } from '../lib/platform/deviceAccess';
import type { DeviceAccessStatus } from '../types';

/**
 * `enabled` is false outside the Android app: desktop has no such grants, and the group is not
 * rendered there, so nothing should be asked of the native side.
 */
export function useDeviceAccess(enabled: boolean): DeviceAccessStatus | null {
  const [status, setStatus] = useState<DeviceAccessStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void getDeviceAccessStatus().then(setStatus);
    const onReturn = () => {
      if (document.visibilityState === 'visible') {
        void getDeviceAccessStatus().then(setStatus);
      }
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [enabled]);

  return status;
}
