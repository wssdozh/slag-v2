// The provider catalogue: one table saying what each kind of connection can do.
import type { AiConnection, AiConnectionKind, AiRole, AiWireProtocol } from '../../../types';
import { AI_ENDPOINTS, DEFAULT_AI_MODELS } from '../../../config';

export interface ProviderPreset {
  kind: AiConnectionKind;
  label: string;
  defaultBaseUrl: string;
  /** Protocol a fresh connection starts with. */
  protocol: AiWireProtocol;
  /** Protocols the editor offers. A single-entry list is fixed. */
  protocols: AiWireProtocol[];
  /** Roles the provider can actually serve. */
  capabilities: AiRole[];
  /** Placeholder for the secret field; the key prefix is the useful hint. */
  keyHint: string;
  defaultModels: Partial<Record<AiRole, string>>;
  editableBaseUrl: boolean;
  helpUrl?: string;
}

export const PROVIDER_PRESETS: Record<AiConnectionKind, ProviderPreset> = {
  groq: {
    kind: 'groq',
    label: 'Groq',
    defaultBaseUrl: AI_ENDPOINTS.DEFAULT_GROQ_BASE_URL,
    protocol: 'chat',
    protocols: ['chat'],
    capabilities: ['chat', 'vision', 'stt'],
    keyHint: 'API Key · gsk_...',
    defaultModels: {
      chat: DEFAULT_AI_MODELS.GROQ_DEFAULT,
      vision: DEFAULT_AI_MODELS.GROQ_VISION_CANDIDATES[0],
      stt: DEFAULT_AI_MODELS.WHISPER_DEFAULT,
    },
    editableBaseUrl: false,
    helpUrl: 'https://console.groq.com/keys',
  },
  kie: {
    kind: 'kie',
    label: 'KIE.AI',
    defaultBaseUrl: AI_ENDPOINTS.DEFAULT_KIE_BASE_URL,
    protocol: 'chat',
    protocols: ['chat'],
    capabilities: ['chat', 'vision'],
    keyHint: 'API Key · sk-kie-...',
    defaultModels: {
      chat: DEFAULT_AI_MODELS.KIE_DEFAULT,
      vision: 'gemini-4-argon',
    },
    editableBaseUrl: true,
    helpUrl: 'https://kie.ai/api-key',
  },
  gemini: {
    kind: 'gemini',
    label: 'Gemini',
    defaultBaseUrl: AI_ENDPOINTS.DEFAULT_GEMINI_BASE_URL,
    protocol: 'chat',
    protocols: ['chat'],
    capabilities: ['chat', 'vision', 'stt'],
    keyHint: 'API Key · AIza...',
    defaultModels: {
      chat: DEFAULT_AI_MODELS.GEMINI_DEFAULT,
      vision: DEFAULT_AI_MODELS.GEMINI_DEFAULT,
      stt: DEFAULT_AI_MODELS.GEMINI_DEFAULT,
    },
    editableBaseUrl: false,
  },
  custom: {
    kind: 'custom',
    label: 'Custom',
    defaultBaseUrl: '',
    protocol: 'chat',
    protocols: ['chat', 'responses', 'anthropic'],
    capabilities: ['chat', 'vision', 'stt'],
    keyHint: 'API Key · любой OpenAI-совместимый ключ',
    defaultModels: {},
    editableBaseUrl: true,
  },
};

/**
 * Custom endpoints promise exactly what their protocol can carry: an OpenAI chat endpoint
 * takes audio and images, a responses/anthropic one is only trusted with text for now.
 */
export function connectionCapabilities(connection: AiConnection): AiRole[] {
  if (connection.kind !== 'custom') return PROVIDER_PRESETS[connection.kind].capabilities;
  return connection.protocol === 'chat' ? ['chat', 'vision', 'stt'] : ['chat'];
}

export function connectionSupports(connection: AiConnection, role: AiRole): boolean {
  return connectionCapabilities(connection).includes(role);
}

export function presetFor(connection: AiConnection): ProviderPreset {
  return PROVIDER_PRESETS[connection.kind];
}

/** The explicit model, or the preset's default for that role. Empty string means none. */
export function connectionModel(connection: AiConnection, role: AiRole): string {
  return connection.models[role]?.trim() || presetFor(connection).defaultModels[role] || '';
}

/** A free id for a new connection of this kind: `custom`, `custom-2`, `custom-3`... */
export function nextConnectionId(connections: AiConnection[], kind: AiConnectionKind): string {
  const taken = new Set(connections.map((connection) => connection.id));
  if (!taken.has(kind)) return kind;
  let index = 2;
  while (taken.has(`${kind}-${index}`)) index += 1;
  return `${kind}-${index}`;
}

export function createConnection(
  connections: AiConnection[],
  kind: AiConnectionKind
): AiConnection {
  const preset = PROVIDER_PRESETS[kind];
  const sameKind = connections.filter((connection) => connection.kind === kind).length;
  return {
    id: nextConnectionId(connections, kind),
    kind,
    label: sameKind > 0 ? `${preset.label} ${sameKind + 1}` : preset.label,
    apiKey: '',
    baseUrl: preset.defaultBaseUrl,
    protocol: preset.protocol,
    models: { ...preset.defaultModels },
  };
}
