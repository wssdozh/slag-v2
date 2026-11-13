// Delayed reminders: arm them on the relay, toast them locally when nothing else would.
import type { NotifyPrefs, NotifyRoute, SlagItem } from '../types';
import { logger } from './logger/logger';
import { isTauriEnvironment } from './platform/platform';
import { storage } from './storage';
import { accountClient } from './sync/account';
import { computeHash } from './sync/crypto';

const notifyLog = logger.scope('NOTIFY');

/** A reminder older than this is not worth a message: the moment is gone, not postponed. */
const STALE_AFTER_MS = 5 * 60_000;
/** Overdue tasks get their morning ping at this local hour. */
const OVERDUE_HOUR = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Reminder text that carries only a time of day, e.g. "10:00" or "10:00:00". */
const BARE_TIME = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  tasks: true,
  overdue: true,
  quietFrom: '23:00',
  quietTo: '08:00',
  assistant: false,
};

/** What this session already pushed, so a re-render is not another arm call. */
const armedKeys = new Map<string, string>();
let armedVaultId = '';
const shownLocally = new Set<string>();

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function minutesOfDay(timestamp: number): number {
  const at = new Date(timestamp);
  return at.getHours() * 60 + at.getMinutes();
}

function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function localDateKey(timestamp: number): string {
  const at = new Date(timestamp);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
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

export function getNotifyRoutes(): NotifyRoute[] {
  return storage.getWorkspaceState().notifyRoutes ?? [];
}

export function saveNotifyRoutes(routes: NotifyRoute[]): void {
  storage.saveWorkspaceState({ notifyRoutes: routes });
}

export function getNotifyPrefs(): NotifyPrefs {
  return { ...DEFAULT_NOTIFY_PREFS, ...(storage.getWorkspaceState().notifyPrefs ?? {}) };
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  storage.saveWorkspaceState({ notifyPrefs: prefs });
}

/** Relay error codes, in words the user can act on. */
export function notifyErrorText(error: unknown): string {
  const raw = describeError(error);
  if (raw.includes('notifications_plan_required')) return 'нужна платная подписка';
  if (raw.includes('notify_bot_not_configured')) return 'бот не настроен на сервере';
  if (raw.includes('route_not_found')) return 'сначала подтверди канал в боте';
  return raw;
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
      return {
        itemKey: item.id,
        eventKey: await computeHash(`${item.id}|task|${new Date(reminder).toISOString()}`),
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
        eventKey: await computeHash(`${item.id}|overdue|${item.dueDate}|${localDateKey(fireAt)}`),
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

  for (const item of items) {
    if (!recipients.length) continue;
    const planned = await planFor(item, prefs, now);
    if (!planned) continue;
    const signature = `${planned.eventKey}|${recipientTokens}`;
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
        routes: recipients.map((route) => ({
          token: route.token,
          title: planned.kind === 'overdue' ? `просрочено: ${item.title}` : item.title,
          body: item.content.replace(/[#*_`>[\]~]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
        })),
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
      await accountClient.armNotifications({ vaultId, itemKey, eventKey: null, fireAt: null, routes: [] });
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
  for (const item of items) {
    if (!prefs.tasks) continue;
    const fireAt = resolveReminder(item);
    if (fireAt === null || fireAt > now || now - fireAt > STALE_AFTER_MS) continue;
    if (inQuietHours(fireAt, prefs)) continue;
    const key = `${item.id}|${fireAt}`;
    if (shownLocally.has(key)) continue;
    shownLocally.add(key);
    await showLocalReminder(item);
  }
}

/**
 * A desktop toast. Silenced while an active telegram route exists: the relay
 * already sent it, and a second ping for one reminder is noise.
 */
export async function showLocalReminder(item: SlagItem): Promise<void> {
  if (!isTauriEnvironment()) return;
  if (getNotifyRoutes().some((route) => route.state === 'active')) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
    if (!granted) return;
    sendNotification({ title: item.title, body: 'напоминание' });
  } catch (error) {
    notifyLog.warn('Local reminder failed', { itemId: item.id, error: describeError(error) });
  }
}

/** Points the bot at every live channel, or takes all of them out of the assistant path. */
export async function setAssistantForRoutes(
  vaultId: string,
  routes: NotifyRoute[],
  enabled: boolean
): Promise<void> {
  for (const route of routes.filter((entry) => entry.state === 'active')) {
    await accountClient.setAssistantLink({ vaultId, routeToken: route.token, enabled });
  }
}

/**
 * The one place a question from Telegram is answered.
 *
 * The relay has no model and never speaks for the vault: it forwards the text to a live
 * device and waits. Today the device answers from its own state, which is honest and useful;
 * wiring the full assistant orchestrator here is the next step, and nothing else has to move.
 */
export function buildAssistantAnswer(items: SlagItem[], now = Date.now()): string {
  const todayKey = localDateKey(now);
  const open = items.filter((item) => item.type === 'task' && item.status !== 'done');
  const dueToday = open.filter((item) => item.dueDate === todayKey).length;
  const overdue = open.filter((item) => !!item.dueDate && item.dueDate < todayKey).length;
  const upcoming = open
    .map((item) => ({ item, at: resolveReminder(item) }))
    .filter((entry): entry is { item: SlagItem; at: number } => entry.at !== null && entry.at > now)
    .sort((left, right) => left.at - right.at)[0];
  const parts = [`на связи · задач на сегодня: ${dueToday}`];
  if (overdue) parts.push(`просрочено: ${overdue}`);
  if (upcoming) {
    const time = new Date(upcoming.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    parts.push(`ближайшее: «${upcoming.item.title}» в ${time}`);
  }
  parts.push('подробнее — в приложении');
  return parts.join(' · ');
}

/** Answers a question the relay forwarded from the bot, so the person waiting gets a reply. */
export async function answerAssistantQuestion(vaultId: string, requestId: string): Promise<void> {
  try {
    await accountClient.answerAssistant({
      vaultId,
      requestId,
      answer: buildAssistantAnswer(storage.getItems()),
    });
  } catch (error) {
    notifyLog.warn('Answering a telegram question failed', { error: describeError(error) });
  }
}
