// Sends one assistant turn through whichever connection the chat role resolves to.
import type { AiSettings } from '../../types';
import { logger } from '../logger/logger';
import { resolveChatTarget, type ResolvedAiTarget } from './connections/resolve';
import { resolveKieEndpoint } from './connections/endpoints';

export type AiResolvedTarget = ResolvedAiTarget;
export { resolveKieEndpoint, resolveChatTarget };

const aiLog = logger.scope('AI');

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
 * The chat role's target. Kept as the old public name so the orchestrator and the e2e suite
 * read the same way they did before roles existed.
 */
export const resolveAiTarget = resolveChatTarget;

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
  const target = resolveChatTarget(settings);
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
      reasoningEffort: target.reasoningEffort ?? settings.reasoningEffort ?? 'low',
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
    const reason = err instanceof Error ? err.message : String(err);
    aiLog.warn(`AI call failed [${target.providerName}] (${Math.round(performance.now() - start)}ms): ${reason}`);
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
