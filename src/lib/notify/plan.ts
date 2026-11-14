// Delayed reminders: arm them on the relay, toast them locally when nothing else would.
import type { NotifyPrefs, NotifyRoute, SlagItem } from '../../types';
import { isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';
import { accountClient } from '../sync/account';
import { computeHash } from '../sync/crypto';
import { formatDueDateLabel, getISODateString } from '../time/dateUtils';
import { describeError, getNotifyPrefs, getNotifyRoutes, integrationsLive, saveNotifyRoutes } from './prefs';
import { DAY_MS, shiftOutOfQuiet } from './quiet';

const notifyLog = logger.scope('NOTIFY');

/** A reminder older than this is not worth a message: the moment is gone, not postponed. */
const STALE_AFTER_MS = 5 * 60_000;
/** Overdue tasks get their morning ping at this local hour. */
const OVERDUE_HOUR = 10;
/** Reminder text that carries only a time of day, e.g. "10:00" or "10:00:00". */
const BARE_TIME = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
/** A reminder that names its own offset is the one case where the instant, not the clock, is fixed. */
const ABSOLUTE_REMINDER = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** What this session already pushed, so a re-render is not another arm call. */
const armedKeys = new Map<string, string>();
let armedVaultId = '';
/** Local toasts already shown, with the moment they were shown: the set is pruned, not grown. */
const shownLocally = new Map<string, number>();
/** Dedup keys are hashed once per (item, moment): a 30s tick must not re-run SubtleCrypto. */
const eventKeyCache = new Map<string, string>();
const EVENT_KEY_CACHE_LIMIT = 2000;

async function eventKeyFor(input: string): Promise<string> {
  const cached = eventKeyCache.get(input);
  if (cached) return cached;
  const hash = await computeHash(input);
  if (eventKeyCache.size > EVENT_KEY_CACHE_LIMIT) eventKeyCache.clear();
  eventKeyCache.set(input, hash);
  return hash;
}

export function localDateKey(timestamp: number): string {
  return getISODateString(new Date(timestamp));
}

function clockOf(timestamp: number): string {
  const at = new Date(timestamp);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/**
 * A wall clock with no zone: two devices in different zones have to agree that this is one
 * reminder, so the dedup key cannot be built from the UTC instant.
 */
function localMinute(timestamp: number): string {
  return `${localDateKey(timestamp)}T${clockOf(timestamp)}`;
}

/** The deadline as a human reads it: `сегодня, 14:30`. Built here, never on the relay. */
function formatNotifyStamp(moment: number): string {
  return `${formatDueDateLabel(localDateKey(moment)).toLowerCase()}, ${clockOf(moment)}`;
}

/**
 * The deadline line the relay prints, or '' when the item has none.
 *
 * `fireAt` cannot stand in for it: quiet hours move that moment, and the relay never learns
 * the recipient's clock, so the string is built on the device that owns the deadline.
 */
function dueStamp(item: SlagItem): string {
  if (!item.dueDate) return '';
  const bare = BARE_TIME.exec(item.reminder?.trim() ?? '');
  if (!bare) return formatDueDateLabel(item.dueDate).toLowerCase();
  const [year, month, day] = item.dueDate.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return item.dueDate;
  const at = new Date(year, month - 1, day, Number(bare[1]), Number(bare[2]), Number(bare[3] ?? 0));
  return Number.isFinite(at.getTime()) ? formatNotifyStamp(at.getTime()) : item.dueDate;
}

/** Absolute epoch ms of `item.reminder`, or null when it cannot be resolved to a moment. */
export function resolveReminder(item: Pick<SlagItem, 'reminder' | 'dueDate'>): number | null {
  const raw = item.reminder?.trim();
  if (!raw) return null;
  const bare = BARE_TIME.exec(raw);
  if (bare) {
    if (!item.dueDate) return null;
    const [year, month, day] = item.dueDate.split('-').map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    const at = new Date(year, month - 1, day, Number(bare[1]), Number(bare[2]), Number(bare[3] ?? 0));
    return Number.isFinite(at.getTime()) ? at.getTime() : null;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function isOverdueTask(item: SlagItem, todayKey: string): boolean {
  return item.type === 'task' && item.status !== 'done' && !!item.dueDate && item.dueDate < todayKey;
}

/** The next 10:00 that is still ahead: one ping a day per overdue task, not a backlog. */
function overdueMoment(item: SlagItem, now: number): number | null {
  if (!item.dueDate) return null;
  const [year, month, day] = item.dueDate.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const due = new Date(year, month - 1, day, OVERDUE_HOUR, 0, 0, 0);
  let at = due.getTime() + DAY_MS;
  if (at <= now) {
    const today = new Date(now);
    today.setHours(OVERDUE_HOUR, 0, 0, 0);
    at = today.getTime() > now ? today.getTime() : today.getTime() + DAY_MS;
  }
  return at;
}

/** One planned delivery: which item, which event, when. */
interface PlannedNotification {
  itemKey: string;
  eventKey: string;
  fireAt: number;
  kind: 'task' | 'overdue';
}

async function planFor(item: SlagItem, prefs: NotifyPrefs, now: number): Promise<PlannedNotification | null> {
  if (prefs.tasks) {
    const reminder = resolveReminder(item);
    if (reminder !== null && reminder > now) {
      const fireAt = shiftOutOfQuiet(reminder, prefs);
      // A reminder that names its own offset is an instant; the rest are a local wall clock,
      // and that is what two devices in different zones can agree on.
      const moment = ABSOLUTE_REMINDER.test(item.reminder?.trim() ?? '')
        ? new Date(reminder).toISOString()
        : localMinute(reminder);
      return {
        itemKey: item.id,
        eventKey: await eventKeyFor(`${item.id}|task|${moment}`),
        fireAt,
        kind: 'task',
      };
    }
  }
  if (prefs.overdue && isOverdueTask(item, localDateKey(now))) {
    const moment = overdueMoment(item, now);
    if (moment !== null) {
      const fireAt = shiftOutOfQuiet(moment, prefs);
      return {
        itemKey: item.id,
        eventKey: await eventKeyFor(`${item.id}|overdue|${item.dueDate}|${localDateKey(fireAt)}`),
        fireAt,
        kind: 'overdue',
      };
    }
  }
  return null;
}

function persistRouteStates(states: Map<string, NotifyRoute['state']>): void {
  const current = getNotifyRoutes();
  let changed = false;
  const updated = current.map((route) => {
    const state = states.get(route.token);
    if (!state || state === route.state) return route;
    changed = true;
    return { ...route, state };
  });
  if (changed) saveNotifyRoutes(updated);
}

/**
 * Arms every due reminder on the relay and cancels the ones that stopped being
 * due. Idempotent by construction: the event key is stable, the relay drops repeats.
 */
export async function reconcileNotifications(
  items: SlagItem[],
  vaultId: string,
  routes: NotifyRoute[],
  prefs: NotifyPrefs
): Promise<void> {
  if (!vaultId || !accountClient.isAuthenticated()) return;
  if (armedVaultId !== vaultId) {
    armedKeys.clear();
    armedVaultId = vaultId;
  }
  const recipients = routes.filter((route) => route.state !== 'blocked');
  const now = Date.now();
  const armedNow = new Set<string>();
  const droppedStates = new Map<string, NotifyRoute['state']>();
  // A pending route has not been linked in the bot yet, so it silently drops out of
  // the arm call. The next pass retries until it is: the relay ignores the repeat.
  const hasPending = recipients.some((route) => route.state === 'pending');
  const recipientTokens = recipients.map((route) => route.token).sort().join(',');
  // Minutes east of UTC. The relay keeps a queued job in the zone that armed it first, so a
  // laptop in another country cannot pull the moment back and forth every half minute.
  const tz = -new Date().getTimezoneOffset();

  for (const item of items) {
    if (!recipients.length) continue;
    const planned = await planFor(item, prefs, now);
    if (!planned) continue;
    const title = item.title;
    // Only markdown noise goes: `*`, `_`, `~` are literal text in telegram's html mode, and a
    // note is allowed to say them out loud.
    const body = item.content.replace(/[#`>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const stamp = dueStamp(item);
    // The signature carries the message itself: an edit or a toggled spoiler must reach the
    // job that is already standing, not only the next one.
    const signature = `${planned.eventKey}|${recipientTokens}|${stamp}|${prefs.spoiler ? 1 : 0}|${title}|${body}`;
    if (!hasPending && armedKeys.get(planned.itemKey) === signature) {
      armedNow.add(planned.itemKey);
      continue;
    }
    try {
      const result = await accountClient.armNotifications({
        vaultId,
        itemKey: planned.itemKey,
        eventKey: planned.eventKey,
        // UNIX seconds, same unit the relay stores `fire_at` in.
        fireAt: Math.floor(planned.fireAt / 1000),
        kind: planned.kind,
        stamp,
        spoiler: prefs.spoiler,
        tz,
        routes: recipients.map((route) => ({ token: route.token, title, body })),
      });
      const failed = new Set(result.dropped.map((drop) => drop.token));
      for (const drop of result.dropped) {
        droppedStates.set(drop.token, drop.reason === 'blocked' ? 'blocked' : 'pending');
      }
      // Everything the bot accepted is a live channel: the settings list says so.
      for (const route of recipients) {
        if (!failed.has(route.token)) droppedStates.set(route.token, 'active');
      }
      // Armed nothing at all means every recipient dropped: cache nothing, retry later.
      if (result.armed > 0) armedKeys.set(planned.itemKey, signature);
      // The call went through, so a job may well be standing: never cancel it here.
      armedNow.add(planned.itemKey);
    } catch (error) {
      // The relay is unreachable or the plan lapsed: one warning, the next pass retries.
      notifyLog.warn('Arming a reminder failed', { itemId: item.id, error: describeError(error) });
      return;
    }
  }

  for (const itemKey of [...armedKeys.keys()]) {
    if (armedNow.has(itemKey)) continue;
    try {
      await accountClient.armNotifications({
        vaultId,
        itemKey,
        eventKey: null,
        fireAt: null,
        kind: 'task',
        stamp: '',
        spoiler: false,
        tz: 0,
        routes: [],
      });
      armedKeys.delete(itemKey);
    } catch (error) {
      notifyLog.warn('Cancelling a reminder failed', { itemId: itemKey, error: describeError(error) });
      return;
    }
  }

  if (droppedStates.size) persistRouteStates(droppedStates);
}

/** Toasts every reminder that just came due and has no working telegram channel behind it. */
export async function runLocalReminders(items: SlagItem[], prefs: NotifyPrefs): Promise<void> {
  const now = Date.now();
  // The map is bounded by the same stale window the scheduler uses: an entry that can no longer
  // fire is dead weight, and a session can run for days.
  for (const [key, shownAt] of shownLocally) {
    if (now - shownAt > STALE_AFTER_MS) shownLocally.delete(key);
  }
  for (const item of items) {
    if (!prefs.tasks) continue;
    const reminder = resolveReminder(item);
    if (reminder === null) continue;
    // Quiet hours move a reminder to the end of the window, exactly like the relay does: a
    // desktop toast that silently drops what telegram would deliver is two products, not one.
    const fireAt = shiftOutOfQuiet(reminder, prefs);
    if (fireAt > now || now - fireAt > STALE_AFTER_MS) continue;
    const key = `${item.id}|${fireAt}`;
    if (shownLocally.has(key)) continue;
    shownLocally.set(key, now);
    await showLocalReminder(item);
  }
}

export type LocalNotificationResult = 'sent' | 'denied' | 'unsupported';

// одно системное уведомление через плагин: без исключений наружу, только результат.
export async function sendLocalNotification(title: string, body: string): Promise<LocalNotificationResult> {
  if (!isTauri()) return 'unsupported';
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
    if (!granted) return 'denied';
    sendNotification({ title, body });
    return 'sent';
  } catch (error) {
    notifyLog.warn('Local reminder failed', { error: describeError(error) });
    return 'denied';
  }
}

/**
 * A desktop toast. Silenced while an active telegram route exists: the relay
 * already sent it, and a second ping for one reminder is noise. With the integrations
 * switched off nothing is delivered, so the toast is the only channel left.
 */
export async function showLocalReminder(item: SlagItem): Promise<void> {
  const prefs = getNotifyPrefs();
  if (integrationsLive(prefs) && getNotifyRoutes().some((route) => route.state === 'active')) return;
  await sendLocalNotification(item.title, 'напоминание');
}
