// Who is actually on the line right now. The relay touches a device's `lastSeenAt` on every
// authenticated request, so a running client polls its way into "online" without extra protocol.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/** The app's own vocabulary for "just saw it", written by touchDeviceLastSeen. */
const JUST_NOW = 'Только что';

export interface DevicePresence {
  online: boolean;
  /** 'онлайн' | '5 мин назад' | 'давно' | '' when there is no timestamp at all. */
  label: string;
}

export function devicePresence(lastSeenAt: string | null | undefined, now: number = Date.now()): DevicePresence {
  if (!lastSeenAt) return { online: false, label: '' };
  if (lastSeenAt === JUST_NOW) return { online: true, label: 'онлайн' };
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return { online: false, label: '' };

  const ageMs = now - seen;
  if (ageMs <= ONLINE_WINDOW_MS) return { online: true, label: 'онлайн' };
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return { online: false, label: `${minutes} мин назад` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, label: `${hours} ч назад` };
  return { online: false, label: `${Math.floor(hours / 24)} дн назад` };
}
