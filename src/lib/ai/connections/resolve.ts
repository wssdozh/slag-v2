// Who serves each role: the subscription relay, or a ready BYOK connection.
import type { AiConnection, AiRole, AiSettings } from '../../../types';
import type { LlmProtocolAdapter } from '../types';
import { syncEngine } from '../../sync/syncEngine';
import { accountClient } from '../../sync/account';
import { DEFAULT_AI_MODELS, SUBSCRIPTION_TIER_EFFORT } from '../../../config';
import { connectionModel, connectionSupports } from './presets';
import { isConnectionReady, isConnectionReadyFor } from './settings';
import { resolveWire } from './endpoints';
import { OpenAiResponsesAdapter } from '../adapters/openAiResponsesAdapter';

export interface ResolvedAiTarget {
  connectionId: string;
  providerName: string;
  apiKey: string;
  model: string;
  endpointUrl: string;
  adapter: LlmProtocolAdapter;
  isSubscriptionMode: boolean;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface RelayAccess {
  serverUrl: string;
  token: string;
}

/** The subscription path, when it is both selected and leased by the account. */
export function isSubscriptionMode(settings: AiSettings): boolean {
  const selected = settings.sourceMode === 'subscription' || !settings.sourceMode;
  return selected && Boolean(syncEngine.getStatus().subscription?.hasAiLease);
}

export function resolveRelayAccess(): RelayAccess | null {
  const serverUrl = syncEngine.getConfig().serverUrl.replace(/\/+$/, '');
  if (!serverUrl) return null;
  const token = accountClient.getToken() || syncEngine.getStatus().currentRoomId || 'slag-relay-room';
  return { serverUrl, token };
}

function subscriptionTier(settings: AiSettings): keyof typeof DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS {
  const tier = settings.subscriptionModel || 'fast';
  return tier in DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS
    ? (tier as keyof typeof DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS)
    : 'fast';
}

function relayChatTarget(settings: AiSettings): ResolvedAiTarget | null {
  const relay = resolveRelayAccess();
  if (!relay) return null;
  const tier = subscriptionTier(settings);
  return {
    connectionId: 'relay',
    providerName: 'SLAG Relay AI Gateway',
    apiKey: relay.token,
    model: DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS[tier],
    endpointUrl: `${relay.serverUrl}/api/ai/chat`,
    // KIE serves chat models over the Responses protocol; the relay proxies it verbatim.
    adapter: new OpenAiResponsesAdapter(),
    isSubscriptionMode: true,
    reasoningEffort: SUBSCRIPTION_TIER_EFFORT[tier],
  };
}

export function resolveRoleConnection(settings: AiSettings, role: AiRole): AiConnection | null {
  const id = settings.roles?.[role];
  if (!id) return null;
  return settings.connections.find((connection) => connection.id === id) ?? null;
}

/** Everything the settings UI may offer for a role: capability-wise, regardless of key. */
export function availableConnectionsFor(settings: AiSettings, role: AiRole): AiConnection[] {
  return settings.connections.filter((connection) => connectionSupports(connection, role));
}

export function chatTargetForConnection(connection: AiConnection): ResolvedAiTarget | null {
  if (!isConnectionReadyFor(connection, 'chat')) return null;
  const model = connectionModel(connection, 'chat');
  const wire = resolveWire(connection, model);
  return {
    connectionId: connection.id,
    providerName: connection.label,
    apiKey: connection.apiKey,
    model,
    endpointUrl: wire.endpointUrl,
    adapter: wire.adapter,
    isSubscriptionMode: false,
  };
}

export function resolveChatTarget(settings: AiSettings): ResolvedAiTarget | null {
  if (isSubscriptionMode(settings)) return relayChatTarget(settings);
  const connection = resolveRoleConnection(settings, 'chat');
  return connection ? chatTargetForConnection(connection) : null;
}

export type MediaTransport = 'relay' | 'openai' | 'gemini';

export type MediaTarget =
  | { transport: 'relay'; label: string; serverUrl: string; token: string; model: string }
  | { transport: 'openai'; label: string; connection: AiConnection; model: string }
  | { transport: 'gemini'; label: string; connection: AiConnection; model: string };

/**
 * Vision and speech are resolved separately from chat on purpose: a cheap chat model and a
 * multimodal one are rarely the same endpoint. `openai` means "chat-completions plus a
 * whisper-style /audio/transcriptions"; `gemini` means native generateContent.
 */
export function mediaTargetForConnection(connection: AiConnection, role: 'vision' | 'stt'): MediaTarget | null {
  if (!isConnectionReadyFor(connection, role)) return null;
  const model = connectionModel(connection, role);
  if (connection.kind === 'gemini') {
    return { transport: 'gemini', label: connection.label, connection, model };
  }
  if (connection.protocol !== 'chat') return null;
  return { transport: 'openai', label: connection.label, connection, model };
}

export function relayMediaTarget(settings: AiSettings): MediaTarget | null {
  const relay = resolveRelayAccess();
  if (!relay) return null;
  return {
    transport: 'relay',
    label: 'SLAG Relay',
    ...relay,
    model: DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS[subscriptionTier(settings)],
  };
}

export function resolveMediaTarget(settings: AiSettings, role: 'vision' | 'stt'): MediaTarget | null {
  if (isSubscriptionMode(settings)) return relayMediaTarget(settings);
  const connection = resolveRoleConnection(settings, role);
  return connection ? mediaTargetForConnection(connection, role) : null;
}

/** Used by the composer badge and by the "can enrich" gate. */
export function isChatConfigured(settings: AiSettings): boolean {
  if (isSubscriptionMode(settings)) return true;
  const connection = resolveRoleConnection(settings, 'chat');
  return Boolean(connection && isConnectionReady(connection));
}
