// Quiet hours: the window where a reminder waits instead of ringing.
import type { NotifyPrefs } from '../../types';

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const DAY_MS = 24 * 60 * 60 * 1000;

function minutesOfDay(timestamp: number): number {
  const at = new Date(timestamp);
  return at.getHours() * 60 + at.getMinutes();
}

function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** True when this moment falls inside the quiet window, which may wrap past midnight. */
export function inQuietHours(timestamp: number, prefs: NotifyPrefs): boolean {
  const from = clockMinutes(prefs.quietFrom);
  const to = clockMinutes(prefs.quietTo);
  if (from === null || to === null || from === to) return false;
  const minute = minutesOfDay(timestamp);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Moves a moment out of the quiet window instead of dropping the reminder. */
export function shiftOutOfQuiet(timestamp: number, prefs: NotifyPrefs): number {
  if (!inQuietHours(timestamp, prefs)) return timestamp;
  const to = clockMinutes(prefs.quietTo);
  if (to === null) return timestamp;
  const target = new Date(timestamp);
  target.setHours(Math.floor(to / 60), to % 60, 0, 0);
  if (target.getTime() <= timestamp) target.setTime(target.getTime() + DAY_MS);
  return target.getTime();
}
