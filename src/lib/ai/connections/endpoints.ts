// Endpoint and adapter for one connection + model. The only place that knows a provider's URLs.
import type { AiConnection } from '../../../types';
import type { LlmProtocolAdapter } from '../types';
import { AI_ENDPOINTS } from '../../../config';
import { PROVIDER_PRESETS } from './presets';
import { OpenAiChatAdapter } from '../adapters/openAiAdapter';
import { OpenAiResponsesAdapter } from '../adapters/openAiResponsesAdapter';
import { AnthropicMessagesAdapter } from '../adapters/anthropicAdapter';

export interface WireTarget {
  endpointUrl: string;
  adapter: LlmProtocolAdapter;
}

function trimBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** A user may paste the full URL; strip the protocol suffix so switching protocols keeps working. */
function normalizeCustomBase(value: string): string {
  return trimBase(value).replace(/\/(chat\/completions|responses|messages)$/i, '');
}

function joinEndpoint(base: string, path: string): string {
  return base.endsWith(path) ? base : `${base}${path}`;
}

/**
 * KIE routes by model: Claude over Anthropic, DeepSeek over Responses, everything else chat.
 * Public: the e2e suite pins these URLs, and a custom base URL makes the same rules useful
 * for any KIE-compatible gateway.
 */
export function resolveKieEndpoint(baseUrl?: string, model?: string): string {
  const clean = trimBase(baseUrl || AI_ENDPOINTS.DEFAULT_KIE_BASE_URL);
  if (clean.endsWith('/chat/completions') || clean.endsWith('/messages') || clean.endsWith('/responses')) return clean;

  const lower = (model || '').toLowerCase();
  if (lower.startsWith('claude-')) return `${clean}/anthropic/v1/messages`;
  if (lower.includes('deepseek')) return `${clean}/openai/v1/responses`;

  return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

function kieAdapter(model: string): LlmProtocolAdapter {
  const lower = model.toLowerCase();
  if (lower.startsWith('claude-')) return new AnthropicMessagesAdapter();
  if (lower.includes('deepseek')) return new OpenAiResponsesAdapter();
  return new OpenAiChatAdapter();
}

export function resolveWire(connection: AiConnection, model: string): WireTarget {
  const fallbackBase = PROVIDER_PRESETS[connection.kind].defaultBaseUrl;
  const base = trimBase(connection.baseUrl) || fallbackBase;

  switch (connection.kind) {
    case 'kie':
      return { endpointUrl: resolveKieEndpoint(base, model), adapter: kieAdapter(model) };
    case 'gemini':
      return { endpointUrl: joinEndpoint(base, '/openai/chat/completions'), adapter: new OpenAiChatAdapter() };
    case 'groq':
      return { endpointUrl: joinEndpoint(base, '/chat/completions'), adapter: new OpenAiChatAdapter() };
    case 'custom':
    default: {
      const customBase = normalizeCustomBase(base);
      if (connection.protocol === 'responses') {
        return { endpointUrl: joinEndpoint(customBase, '/responses'), adapter: new OpenAiResponsesAdapter() };
      }
      if (connection.protocol === 'anthropic') {
        return { endpointUrl: joinEndpoint(customBase, '/messages'), adapter: new AnthropicMessagesAdapter() };
      }
      return { endpointUrl: joinEndpoint(customBase, '/chat/completions'), adapter: new OpenAiChatAdapter() };
    }
  }
}

/** Whisper-style transcription lives next to chat completions on OpenAI-compatible servers. */
export function resolveTranscriptionEndpoint(connection: AiConnection): string {
  const base = trimBase(connection.baseUrl) || PROVIDER_PRESETS[connection.kind].defaultBaseUrl;
  return `${normalizeCustomBase(base)}/audio/transcriptions`;
}

/** Native Gemini: the key goes in the query string, exactly as the previous code did. */
export function resolveGeminiGenerateEndpoint(connection: AiConnection, model: string, apiKey: string): string {
  const base = trimBase(connection.baseUrl) || PROVIDER_PRESETS.gemini.defaultBaseUrl;
  return `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}
