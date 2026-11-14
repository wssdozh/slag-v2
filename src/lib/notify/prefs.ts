// Notify settings: what this vault wants to hear, where reminders go, and the words for relay errors.
import type { NotifyPrefs, NotifyRoute } from '../../types';
import { storage } from '../storage';

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  tasks: true,
  overdue: true,
  quietFrom: '23:00',
  quietTo: '08:00',
  assistantMode: 'off',
  spoiler: false,
  integrationsEnabled: true,
};

/** Older builds stored the assistant switch as a boolean, so state on disk may still carry it. */
type StoredNotifyPrefs = Partial<NotifyPrefs> & { assistant?: boolean };

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A stored mode wins; legacy `assistant: true` meant the task-scoped set, so it lands on `minimal`. */
function assistantModeOf(stored: StoredNotifyPrefs): NotifyPrefs['assistantMode'] {
  const mode = stored.assistantMode;
  if (mode === 'off' || mode === 'minimal' || mode === 'read' || mode === 'risky') return mode;
  return stored.assistant === true ? 'minimal' : 'off';
}

export function getNotifyRoutes(): NotifyRoute[] {
  return storage.getWorkspaceState().notifyRoutes ?? [];
}

export function saveNotifyRoutes(routes: NotifyRoute[]): void {
  storage.saveWorkspaceState({ notifyRoutes: routes });
}

export function getNotifyPrefs(): NotifyPrefs {
  const stored: StoredNotifyPrefs = storage.getWorkspaceState().notifyPrefs ?? {};
  return {
    tasks: stored.tasks ?? DEFAULT_NOTIFY_PREFS.tasks,
    overdue: stored.overdue ?? DEFAULT_NOTIFY_PREFS.overdue,
    quietFrom: stored.quietFrom ?? DEFAULT_NOTIFY_PREFS.quietFrom,
    quietTo: stored.quietTo ?? DEFAULT_NOTIFY_PREFS.quietTo,
    assistantMode: assistantModeOf(stored),
    spoiler: stored.spoiler ?? DEFAULT_NOTIFY_PREFS.spoiler,
    integrationsEnabled: stored.integrationsEnabled ?? DEFAULT_NOTIFY_PREFS.integrationsEnabled,
  };
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
