// Provider API keys are secrets, not settings: `slag_ai_settings_v2` keeps the connections, the
// secret store keeps the keys. These functions are the seam between the two and stay pure — no
// tauri, no localStorage — so plain node can check the split (scripts/ai-keys-secret.test.mjs).
import type { AiSettings } from '../../../types';

/** `ai-key:<connectionId>` — the id, never the kind: two Groq connections are two keys. */
export const AI_KEY_SECRET_PREFIX = 'ai-key:';

export interface AiKeyEntry {
  key: string;
  value: string;
}

export function aiKeySecretName(connectionId: string): string {
  return `${AI_KEY_SECRET_PREFIX}${connectionId}`;
}

/** Settings as they go to disk: every key is blanked, every other field is left alone. */
export function stripAiKeys(settings: AiSettings): AiSettings {
  return {
    ...settings,
    connections: settings.connections.map((connection) => ({ ...connection, apiKey: '' })),
  };
}

/**
 * Settings as the app works with them: the key comes from the store, and when the store has
 * nothing to say — a browser without a working IndexedDB — the plaintext already sitting in the
 * settings stands, because losing a key silently is worse than keeping it. A connection with no
 * key anywhere reads as an empty string, never as a missing field.
 */
export function applyAiKeys(settings: AiSettings, lookup: (key: string) => string | null): AiSettings {
  return {
    ...settings,
    connections: settings.connections.map((connection) => ({
      ...connection,
      apiKey: lookup(aiKeySecretName(connection.id)) ?? connection.apiKey,
    })),
  };
}

/**
 * The one-time migration of `slag_ai_settings_v2`: returns the keys still lying there in plain
 * text and the same JSON with exactly those keys removed. Everything that is not a key — labels,
 * base urls, models, roles, flags — stays byte for byte as it was.
 */
export function splitAiKeys(raw: unknown): { keys: AiKeyEntry[]; settings: Record<string, unknown> | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { keys: [], settings: null };
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.connections)) return { keys: [], settings: source };

  const keys: AiKeyEntry[] = [];
  const connections = source.connections.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const connection = { ...(entry as Record<string, unknown>) };
    const id = typeof connection.id === 'string' ? connection.id : '';
    const value = typeof connection.apiKey === 'string' ? connection.apiKey.trim() : '';
    delete connection.apiKey;
    if (id && value) keys.push({ key: aiKeySecretName(id), value });
    return connection;
  });

  return { keys, settings: { ...source, connections } };
}
