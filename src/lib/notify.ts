// Delayed reminders: arm them on the relay, and toast them locally when nothing else would.
import type { NotifyRoute, SlagItem } from '../types';
import { logger } from './logger/logger';
import { isTauriEnvironment } from './platform/platform';
import { storage } from './storage';
import { accountClient } from './sync/account';
import { computeHash } from './sync/crypto';

const notifyLog = logger.scope('NOTIFY');

/** A reminder older than this is not worth a message: the moment is gone, not postponed. */
const STALE_AFTER_MS = 5 * 60_000;
/** Reminder text that carries only a time of day, e.g. "10:00" or "10:00:00". */
const BARE_TIME = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** What this session already pushed, so a re-render is not another arm call. */
const armedKeys = new Map<string, string>();
let armedVaultId = '';
const shownLocally = new Set<string>();

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/**
 * Per-occurrence key. The same reminder hashes to the same key on every device,
 * which is what lets the relay dedupe with a plain primary-key insert.
 */
export async function eventKeyFor(item: SlagItem): Promise<string | null> {
  const fireAt = resolveReminder(item);
  if (fireAt === null) return null;
  return computeHash(`${item.id}|${new Date(fireAt).toISOString()}`);
}

export function getNotifyRoutes(): NotifyRoute[] {
  return storage.getWorkspaceState().notifyRoutes ?? [];
}

export function saveNotifyRoutes(routes: NotifyRoute[]): void {
  storage.saveWorkspaceState({ notifyRoutes: routes });
}

/** Relay error codes, in words the user can act on. */
export function notifyErrorText(error: unknown): string {
  const raw = describeError(error);
  if (raw.includes('notifications_plan_required')) return 'нужна платная подписка';
  if (raw.includes('notify_bot_not_configured')) return 'бот не настроен на сервере';
  return raw;
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
 * Arms every future reminder on the relay and cancels the ones that stopped being
 * due. Idempotent by construction: the event key is stable, the relay drops repeats.
 */
export async function reconcileNotifications(
  items: SlagItem[],
  vaultId: string,
  routes: NotifyRoute[]
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
    const fireAt = resolveReminder(item);
    if (fireAt === null || fireAt <= now) continue;
    const eventKey = await eventKeyFor(item);
    if (!eventKey) continue;
    const signature = `${eventKey}|${recipientTokens}`;
    if (!hasPending && armedKeys.get(item.id) === signature) {
      armedNow.add(item.id);
      continue;
    }
    try {
      const result = await accountClient.armNotifications({
        vaultId,
        itemKey: item.id,
        eventKey,
        // UNIX seconds, same unit the relay stores `fire_at` in.
        fireAt: Math.floor(fireAt / 1000),
        routes: recipients.map((route) => ({
          token: route.token,
          title: item.title,
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
      if (result.armed > 0) armedKeys.set(item.id, signature);
      // The call went through, so a job may well be standing: never cancel it here.
      armedNow.add(item.id);
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
export async function runLocalReminders(items: SlagItem[]): Promise<void> {
  const now = Date.now();
  for (const item of items) {
    const fireAt = resolveReminder(item);
    if (fireAt === null || fireAt > now || now - fireAt > STALE_AFTER_MS) continue;
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
