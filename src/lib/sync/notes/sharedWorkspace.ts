import type { NotifyPrefs, NotifyRoute, ProfileInfo, WorkspaceState } from '../../../types/index.ts';

// Navigation, filters, view preferences, editor position and the device's integration switch
// never form a registry record. Prompt and persona stay separate so one edit can't undo the other.
const fields = ['profile', 'notifyRoutes', 'notifyPrefs', 'aiPrompt', 'aiPersona'] as const;
export type SharedWorkspaceField = typeof fields[number];
export type SharedWorkspace = {
  profile?: ProfileInfo;
  notifyRoutes?: NotifyRoute[];
  notifyPrefs?: Omit<NotifyPrefs, 'integrationsEnabled'>;
  aiPrompt?: string;
  aiPersona?: { text: string; enabled: boolean };
};
export type SharedWorkspaceValue = NonNullable<SharedWorkspace[SharedWorkspaceField]>;

export function isSharedWorkspaceField(key: string): key is SharedWorkspaceField {
  return fields.some((field) => field === key);
}

export function selectSharedWorkspace(state: Partial<WorkspaceState>): SharedWorkspace {
  const { profile, notifyRoutes, notifyPrefs, aiPrompt, aiPersona, aiPersonaEnabled } = state;
  return { profile, notifyRoutes,
    notifyPrefs: notifyPrefs && readNotifyPrefs(notifyPrefs), aiPrompt,
    aiPersona: aiPersona === undefined && aiPersonaEnabled === undefined ? undefined
      : { text: aiPersona ?? '', enabled: aiPersonaEnabled === true },
  };
}

// A local workspace flush may be queued behind canonical projection, or come from a
// different window. Preserve the shared fields from disk, not its stale UI snapshot.
export function mergeRegistryDeviceWorkspace(disk: Partial<WorkspaceState>, device: WorkspaceState): Partial<WorkspaceState> {
  const { profile, notifyRoutes, notifyPrefs, aiPrompt, aiPromptAt, aiPersona, aiPersonaAt, aiPersonaEnabled, ...local } = device;
  void [profile, notifyRoutes, aiPrompt, aiPromptAt, aiPersona, aiPersonaAt, aiPersonaEnabled];
  const merged = { ...disk, ...local };
  if (notifyPrefs?.integrationsEnabled !== undefined) {
    merged.notifyPrefs = { ...readNotifyPrefs(disk.notifyPrefs ?? {}), integrationsEnabled: notifyPrefs.integrationsEnabled };
  }
  return merged;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid shared workspace value');
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid shared workspace text');
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid shared workspace switch');
  return value;
}

function readNotifyPrefs(value: unknown): NonNullable<SharedWorkspace['notifyPrefs']> {
  const prefs = object(value);
  const assistantMode = prefs.assistantMode ?? (prefs.assistant === true ? 'minimal' : 'off');
  if (assistantMode !== 'off' && assistantMode !== 'minimal' && assistantMode !== 'read' && assistantMode !== 'risky') {
    throw new Error('Invalid shared assistant mode');
  }
  const quietFrom = text(prefs.quietFrom ?? '23:00');
  const quietTo = text(prefs.quietTo ?? '08:00');
  if (![quietFrom, quietTo].every((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('Invalid quiet hours');
  return { tasks: flag(prefs.tasks ?? true), overdue: flag(prefs.overdue ?? true), quietEnabled: flag(prefs.quietEnabled ?? true),
    quietFrom, quietTo, assistantMode, spoiler: flag(prefs.spoiler ?? false), telegramEnabled: flag(prefs.telegramEnabled ?? true) };
}

export function sharedWorkspacePatch(key: SharedWorkspaceField, value: unknown, current: { notifyPrefs?: { integrationsEnabled?: boolean } }): Partial<WorkspaceState> {
  if (key === 'aiPrompt') return { aiPrompt: value === null ? undefined : text(value), aiPromptAt: undefined };
  if (key === 'aiPersona') {
    const persona = value === null ? undefined : readPersona(value);
    return { aiPersona: persona?.text, aiPersonaEnabled: persona?.enabled, aiPersonaAt: undefined };
  }
  if (key === 'notifyPrefs') {
    const integrationsEnabled = current.notifyPrefs?.integrationsEnabled ?? true;
    return { notifyPrefs: { ...readNotifyPrefs(value ?? {}), integrationsEnabled } };
  }
  if (key === 'notifyRoutes') return { notifyRoutes: value === null ? undefined : readRoutes(value) };
  return { profile: value === null ? undefined : readProfile(value) };
}

function readPersona(value: unknown) {
  const input = object(value);
  return { text: text(input.text), enabled: flag(input.enabled) };
}

function readRoutes(value: unknown): NotifyRoute[] {
  if (!Array.isArray(value)) throw new Error('Invalid notification routes');
  return value.map((entry: unknown): NotifyRoute => {
    const { token, label, state } = object(entry);
    if (state !== 'pending' && state !== 'active' && state !== 'blocked') throw new Error('Invalid notification route state');
    return { token: text(token), label: text(label), state };
  });
}

function readProfile(value: unknown): ProfileInfo {
  const input = object(value);
  return { name: text(input.name), ...(input.avatar === undefined ? {} : { avatar: text(input.avatar) }) };
}

export function readSharedWorkspaceField(key: SharedWorkspaceField, value: unknown): SharedWorkspaceValue {
  if (key === 'aiPrompt') return text(value);
  if (key === 'notifyPrefs') return readNotifyPrefs(value);
  if (key === 'notifyRoutes') return readRoutes(value);
  if (key === 'aiPersona') return readPersona(value);
  return readProfile(value);
}
