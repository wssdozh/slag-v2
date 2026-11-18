// Default settings, readiness rules and the one legacy → connections migration.
import type { AiConnection, AiConnectionKind, AiRole, AiSettings, AiWireProtocol } from '../../../types';
import { AI_ENDPOINTS, DEFAULT_AI_MODELS, STORAGE_KEYS } from '../../../config';
import { getCachedSecret } from '../../platform/secretStore';
import { getPrefJson } from '../../storage/prefs';
import { PROVIDER_PRESETS, connectionModel, connectionSupports } from './presets';
import { applyAiKeys } from './secrets';

const AI_ROLES: AiRole[] = ['chat', 'vision', 'stt'];
const CONNECTION_KINDS = Object.keys(PROVIDER_PRESETS) as AiConnectionKind[];

/** Roles tried in order when a legacy profile has no explicit pick: Groq, then Gemini. */
const LEGACY_ROLE_ORDER: AiConnectionKind[] = ['groq', 'gemini', 'kie'];

/**
 * A fresh install starts with the Groq preset so pasting one free key makes the whole
 * assistant work — the same behaviour the flat settings had, now expressed as a connection.
 */
function defaultConnections(): AiConnection[] {
  return [
    {
      id: 'groq',
      kind: 'groq',
      label: 'Groq',
      apiKey: '',
      baseUrl: AI_ENDPOINTS.DEFAULT_GROQ_BASE_URL,
      protocol: 'chat',
      models: {
        chat: DEFAULT_AI_MODELS.GROQ_DEFAULT,
        vision: DEFAULT_AI_MODELS.GROQ_VISION_CANDIDATES[0],
        stt: DEFAULT_AI_MODELS.WHISPER_DEFAULT,
      },
    },
  ];
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  sourceMode: 'subscription',
  subscriptionModel: 'fast',
  connections: defaultConnections(),
  roles: { chat: 'groq', vision: 'groq', stt: 'groq' },
  reasoningEffort: 'low',
  autoTagging: true,
  autoTriage: true,
  webSearchEnabled: false,
  maxTagsPerNote: 3,
  allowNewTags: true,
  tagCaseStyle: 'lowercase',
};

function cloneDefaults(): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    connections: defaultConnections(),
    roles: { ...DEFAULT_AI_SETTINGS.roles },
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isKind(value: unknown): value is AiConnectionKind {
  return typeof value === 'string' && (CONNECTION_KINDS as string[]).includes(value);
}

function normalizeConnection(raw: Record<string, unknown>, usedIds: Set<string>): AiConnection {
  const kind = isKind(raw.kind) ? raw.kind : 'custom';
  const preset = PROVIDER_PRESETS[kind];

  let id = asString(raw.id).trim();
  if (!id || usedIds.has(id)) {
    let index = usedIds.size + 1;
    while (usedIds.has(`${kind}-${index}`)) index += 1;
    id = usedIds.has(kind) ? `${kind}-${index}` : kind;
  }
  usedIds.add(id);

  const protocol = asString(raw.protocol) as AiWireProtocol;
  const rawModels = raw.models && typeof raw.models === 'object' ? (raw.models as Record<string, unknown>) : {};
  const models: AiConnection['models'] = {};
  for (const role of AI_ROLES) {
    const model = asString(rawModels[role]).trim();
    if (model) models[role] = model;
  }

  const baseUrl = asString(raw.baseUrl).trim() || preset.defaultBaseUrl;

  return {
    id,
    kind,
    label: asString(raw.label).trim() || preset.label,
    apiKey: asString(raw.apiKey).trim(),
    baseUrl,
    protocol: preset.protocols.includes(protocol) ? protocol : preset.protocol,
    models,
  };
}

function normalizeConnections(raw: unknown): AiConnection[] {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set<string>();
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => normalizeConnection(entry, usedIds));
}

function normalizeRoles(raw: unknown, connections: AiConnection[]): Record<AiRole, string | null> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const roles = {} as Record<AiRole, string | null>;
  for (const role of AI_ROLES) {
    const id = asString(source[role]).trim();
    const connection = connections.find((candidate) => candidate.id === id);
    roles[role] = connection && connectionSupports(connection, role) ? connection.id : null;
  }
  return roles;
}

interface LegacySettings {
  provider?: unknown;
  model?: unknown;
  groqApiKey?: unknown;
  kieApiKey?: unknown;
  kieBaseUrl?: unknown;
  geminiApiKey?: unknown;
}

function hasArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * The flat `provider` + one key per provider shape was stored under the same settings key.
 * It converts into connections on read; nothing is thrown away, and a provider that was
 * merely selected (no key yet) keeps its preset so the user still sees it.
 */
function migrateLegacy(raw: LegacySettings): { connections: AiConnection[]; roles: Record<AiRole, string | null> } {
  const selected = asString(raw.provider);
  const chatModel = asString(raw.model).trim();
  const connections: AiConnection[] = [];

  const add = (kind: AiConnectionKind, apiKey: string, baseUrl?: string) => {
    if (!apiKey && selected !== kind) return;
    const preset = PROVIDER_PRESETS[kind];
    connections.push({
      id: kind,
      kind,
      label: preset.label,
      apiKey: apiKey.trim(),
      baseUrl: (baseUrl || preset.defaultBaseUrl).trim(),
      protocol: preset.protocol,
      models: { ...preset.defaultModels },
    });
  };

  add('groq', asString(raw.groqApiKey));
  add('kie', asString(raw.kieApiKey), asString(raw.kieBaseUrl));
  add('gemini', asString(raw.geminiApiKey));

  const chatConnection = connections.find((connection) => connection.kind === selected);
  if (chatConnection && chatModel) chatConnection.models.chat = chatModel;

  const readyFor = (role: AiRole): string | null => {
    for (const kind of LEGACY_ROLE_ORDER) {
      const connection = connections.find((candidate) => candidate.kind === kind);
      if (connection && connectionSupports(connection, role) && isConnectionReady(connection)) return connection.id;
    }
    return null;
  };

  const roles: Record<AiRole, string | null> = {
    chat: chatConnection && isConnectionReady(chatConnection) ? chatConnection.id : readyFor('chat'),
    vision: readyFor('vision'),
    stt: readyFor('stt'),
  };

  return { connections, roles };
}

export function isConnectionReady(connection: AiConnection): boolean {
  if (!connection.apiKey.trim()) return false;
  if (connection.kind === 'custom' && !connection.baseUrl.trim()) return false;
  return AI_ROLES.some((role) => connectionSupports(connection, role) && Boolean(connectionModel(connection, role)));
}

/** Ready *for this role*, not merely connected: a chat-only endpoint cannot do vision. */
export function isConnectionReadyFor(connection: AiConnection, role: AiRole): boolean {
  return isConnectionReady(connection) && connectionSupports(connection, role) && Boolean(connectionModel(connection, role));
}

/** Accepts anything from storage, keeps every known field, never mutates the input. */
export function normalizeAiSettings(raw: unknown): AiSettings {
  if (!raw || typeof raw !== 'object') return cloneDefaults();
  const source = raw as Record<string, unknown>;

  const migrated = hasArray(source.connections)
    ? { connections: normalizeConnections(source.connections), roles: source.roles }
    : migrateLegacy(source as LegacySettings);

  const connections = migrated.connections;

  return {
    sourceMode: source.sourceMode === 'byok' ? 'byok' : 'subscription',
    subscriptionModel:
      source.subscriptionModel === 'smart' || source.subscriptionModel === 'deep'
        ? source.subscriptionModel
        : 'fast',
    connections,
    roles: normalizeRoles(migrated.roles, connections),
    reasoningEffort:
      source.reasoningEffort === 'none' ||
      source.reasoningEffort === 'medium' ||
      source.reasoningEffort === 'high' ||
      source.reasoningEffort === 'low'
        ? source.reasoningEffort
        : DEFAULT_AI_SETTINGS.reasoningEffort,
    autoTagging: asBoolean(source.autoTagging, DEFAULT_AI_SETTINGS.autoTagging),
    autoTriage: asBoolean(source.autoTriage, DEFAULT_AI_SETTINGS.autoTriage),
    webSearchEnabled: asBoolean(source.webSearchEnabled, DEFAULT_AI_SETTINGS.webSearchEnabled),
    maxTagsPerNote:
      typeof source.maxTagsPerNote === 'number' && source.maxTagsPerNote > 0
        ? source.maxTagsPerNote
        : DEFAULT_AI_SETTINGS.maxTagsPerNote,
    allowNewTags: asBoolean(source.allowNewTags, DEFAULT_AI_SETTINGS.allowNewTags),
    tagCaseStyle: source.tagCaseStyle === 'kebab-case' ? 'kebab-case' : 'lowercase',
    customTagRules: asString(source.customTagRules),
  };
}

/**
 * Synchronous by contract: callers use it to seed state during render. The settings file has no
 * keys any more, so they come from the secret store's warmed cache — `initSecretStore()` is awaited
 * in `main.tsx` before the first render, which is what makes the sync lookup honest.
 */
export function loadAiSettings(): AiSettings {
  const saved = getPrefJson<unknown>(STORAGE_KEYS.AI_SETTINGS, null);
  if (saved === null) return cloneDefaults();
  return applyAiKeys(normalizeAiSettings(saved), getCachedSecret);
}
