import type { AiSettings } from '../../types';
import type { LlmProtocolAdapter } from './types';
import { syncEngine } from '../sync/syncEngine';
import { accountClient } from '../sync/account';
import { logger } from '../logger';
import { OpenAiChatAdapter } from './adapters/openAiAdapter';
import { OpenAiResponsesAdapter } from './adapters/openAiResponsesAdapter';
import { AnthropicMessagesAdapter } from './adapters/anthropicAdapter';
import { AI_ENDPOINTS, DEFAULT_AI_MODELS } from '../../config';

const aiLog = logger.scope('AI');

export interface AiResolvedTarget {
  providerName: string;
  apiKey: string;
  model: string;
  endpointUrl: string;
  adapter: LlmProtocolAdapter;
  isSubscriptionMode: boolean;
}

export interface PromptRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface PromptResult {
  text: string;
  target: AiResolvedTarget;
}

/**
 * Resolves full chat completions endpoint for KIE.AI.
 * For Claude models, routes to dedicated /anthropic/v1/messages.
 * For DeepSeek models on native KIE, routes to /openai/v1/responses.
 */
export function resolveKieEndpoint(baseUrl?: string, model?: string): string {
  const clean = (baseUrl || AI_ENDPOINTS.DEFAULT_KIE_BASE_URL).replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions') || clean.endsWith('/messages') || clean.endsWith('/responses')) return clean;

  const m = (model || '').toLowerCase();
  if (m.startsWith('claude-')) {
    return `${clean}/anthropic/v1/messages`;
  }

  if (m.includes('deepseek')) {
    return `${clean}/openai/v1/responses`;
  }

  return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

/**
 * Single source of truth for routing AI requests across Subscription Relay and BYOK providers.
 * Returns the matching adapter and endpoint as a verified pair.
 */
export function resolveAiTarget(settings: AiSettings): AiResolvedTarget | null {
  const syncSub = syncEngine.getStatus().subscription;
  const isSubscriptionAllowed = Boolean(syncSub?.hasAiLease);
  const isSubscriptionMode = (settings.sourceMode === 'subscription' || !settings.sourceMode) && isSubscriptionAllowed;

  if (isSubscriptionMode) {
    const tier = settings.subscriptionModel || 'fast';
    const model = DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS[tier as keyof typeof DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS] || DEFAULT_AI_MODELS.SUBSCRIPTION_TIERS.fast;
    const cleanServer = syncEngine.getConfig().serverUrl.replace(/\/+$/, '');
    const apiKey = accountClient.getToken() || syncEngine.getStatus().currentRoomId || 'slag-relay-room';
    return {
      providerName: 'SLAG Relay AI Gateway',
      apiKey,
      model,
      endpointUrl: `${cleanServer}/api/ai/chat`,
      adapter: new OpenAiChatAdapter(),
      isSubscriptionMode: true,
    };
  }

  const isGroq = settings.provider === 'groq' && Boolean(settings.groqApiKey);
  const isKie = settings.provider === 'kie' && Boolean(settings.kieApiKey);
  const isGemini = settings.provider === 'gemini' && Boolean(settings.geminiApiKey);

  if (!isGroq && !isKie && !isGemini) {
    return null;
  }

  if (isGroq) {
    const model = settings.model || DEFAULT_AI_MODELS.GROQ_DEFAULT;
    return {
      providerName: 'Groq',
      apiKey: settings.groqApiKey,
      model,
      endpointUrl: `${AI_ENDPOINTS.DEFAULT_GROQ_BASE_URL}/chat/completions`,
      adapter: new OpenAiChatAdapter(),
      isSubscriptionMode: false,
    };
  }

  if (isKie) {
    const defaultModel = DEFAULT_AI_MODELS.KIE_DEFAULT;
    const model = settings.model || defaultModel;
    const lower = model.toLowerCase();
    const endpointUrl = resolveKieEndpoint(settings.kieBaseUrl, model);

    if (lower.startsWith('claude-')) {
      return {
        providerName: 'KIE.AI (Claude)',
        apiKey: settings.kieApiKey,
        model,
        endpointUrl,
        adapter: new AnthropicMessagesAdapter(),
        isSubscriptionMode: false,
      };
    }

    if (lower.includes('deepseek')) {
      return {
        providerName: 'KIE.AI (DeepSeek)',
        apiKey: settings.kieApiKey,
        model,
        endpointUrl,
        adapter: new OpenAiResponsesAdapter(),
        isSubscriptionMode: false,
      };
    }

    return {
      providerName: 'KIE.AI',
      apiKey: settings.kieApiKey,
      model,
      endpointUrl,
      adapter: new OpenAiChatAdapter(),
      isSubscriptionMode: false,
    };
  }

  if (isGemini) {
    const model = settings.model || DEFAULT_AI_MODELS.GEMINI_DEFAULT;
    return {
      providerName: 'Gemini',
      apiKey: settings.geminiApiKey,
      model,
      endpointUrl: `${AI_ENDPOINTS.DEFAULT_GEMINI_BASE_URL}/openai/chat/completions`,
      adapter: new OpenAiChatAdapter(),
      isSubscriptionMode: false,
    };
  }

  return null;
}

/**
 * Robust JSON parser extracting JSON arrays or objects from model text output.
 */
export function parseJsonContent<T>(raw: string): T | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

/**
 * Executes a single-turn completion through the configured provider's protocol adapter.
 */
export async function completePrompt(
  settings: AiSettings,
  req: PromptRequest
): Promise<PromptResult | null> {
  const target = resolveAiTarget(settings);
  if (!target) return null;

  const start = performance.now();
  try {
    aiLog.debug(`Calling AI [${target.providerName} / ${target.model}]`, {
      endpoint: target.endpointUrl,
      promptChars: req.systemPrompt.length + req.userPrompt.length,
    });

    const response = await target.adapter.executeTurn({
      systemPrompt: req.systemPrompt,
      messages: [{ role: 'user', content: req.userPrompt }],
      tools: [],
      apiKey: target.apiKey,
      endpointUrl: target.endpointUrl,
      model: target.model,
      reasoningEffort: settings.reasoningEffort || 'low',
      webSearchEnabled: false,
      turnHistory: [],
      isLastAllowedRound: true,
    });

    const durationMs = performance.now() - start;
    const text = response.content || '';
    aiLog.info(`AI response received [${target.providerName}] (${Math.round(durationMs)}ms)`, {
      durationMs,
      replyChars: text.length,
    }, durationMs);

    return { text, target };
  } catch (err) {
    aiLog.warn(`AI call failed [${target.providerName}] (${Math.round(performance.now() - start)}ms), falling back`, err);
    return null;
  }
}

/**
 * Executes prompt and parses result as typed JSON structure.
 */
export async function completeJson<T>(
  settings: AiSettings,
  req: PromptRequest
): Promise<T | null> {
  const res = await completePrompt(settings, req);
  if (!res || !res.text) return null;
  return parseJsonContent<T>(res.text);
}

export const aiClient = {
  resolveTarget: resolveAiTarget,
  resolveKieEndpoint,
  completePrompt,
  completeJson,
  parseJsonContent,
};
