import type { LlmProtocolAdapter, LlmAdapterTurnRequest, LlmAdapterTurnResponse } from '../types';
import { logger } from '../../logger';

const aiLog = logger.scope('AI');

function extractErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.msg) return parsed.msg;
    if (parsed.error && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON
  }
  const clean = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 160) : `HTTP ${status}`;
}

export class OpenAiResponsesAdapter implements LlmProtocolAdapter {
  async executeTurn(request: LlmAdapterTurnRequest): Promise<LlmAdapterTurnResponse> {
    const {
      systemPrompt,
      messages,
      tools,
      apiKey,
      endpointUrl,
      model,
      reasoningEffort,
      turnHistory,
      isLastAllowedRound,
    } = request;

    const input: any[] = [];

    // Prior dialog turns
    for (const m of messages) {
      let text = m.content;
      if (!text || !text.trim()) {
        text = '[Действие или черновик подготовлено]';
      }
      if (m.role === 'assistant') {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        });
      } else {
        input.push({
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        });
      }
    }

    // Intra-turn tool calls and tool outputs
    for (const item of turnHistory) {
      if (item.role === 'assistant' && item.toolCalls && item.toolCalls.length > 0) {
        for (const tc of item.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.args || {}),
          });
        }
      } else if (item.toolResults && item.toolResults.length > 0) {
        for (const tr of item.toolResults) {
          input.push({
            type: 'function_call_output',
            call_id: tr.toolCallId,
            output: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
          });
        }
      }
    }

    const effectiveInstructions = isLastAllowedRound
      ? `${systemPrompt}\n\nВАЖНО: Все запрошенные инструменты выполнены. Ответь пользователю финальным текстом на русском языке. Запрещено использовать псевдокод, теги DSML или вызовы функций.`
      : systemPrompt;

    const payload: Record<string, any> = {
      model,
      stream: false,
      instructions: effectiveInstructions,
      input,
    };

    if (reasoningEffort === 'none') {
      payload.reasoning = { effort: 'none' };
    } else {
      payload.reasoning = { effort: reasoningEffort };
    }

    if (!isLastAllowedRound && tools.length > 0) {
      payload.tools = tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
      }));
      payload.tool_choice = 'auto';
    }

    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const detail = extractErrorMessage(res.status, errorBody);
      aiLog.warn(`Responses Adapter HTTP ${res.status}: ${detail}`, { status: res.status, raw: errorBody.slice(0, 300) });
      throw new Error(`Responses HTTP ${res.status}: ${detail}`);
    }

    const data = await res.json();
    if (data.code && data.code !== 200) {
      const msg = data.msg || `Responses error code ${data.code}`;
      aiLog.warn(`Responses error code ${data.code}: ${msg}`);
      throw new Error(msg);
    }
    if (data.error) {
      const msg = data.error.message || `Responses Error: ${JSON.stringify(data.error)}`;
      aiLog.warn(`Responses Error: ${msg}`);
      throw new Error(msg);
    }

    let textContent = '';
    let reasoning = '';
    const toolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'reasoning') {
          const summaries = Array.isArray(item.summary)
            ? item.summary.map((s: any) => s.text).filter(Boolean).join('\n')
            : '';
          if (summaries) {
            reasoning = (reasoning ? `${reasoning}\n\n` : '') + summaries;
          }
        } else if (item.type === 'function_call') {
          let args: Record<string, any> = {};
          try {
            args = typeof item.arguments === 'string'
              ? JSON.parse(item.arguments || '{}')
              : (item.arguments || {});
          } catch {
            args = {};
          }
          toolCalls.push({
            id: item.call_id || item.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: item.name,
            args,
          });
        } else if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === 'output_text') {
              textContent += c.text || '';
            }
          }
        }
      }
    }

    const usage = data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.total_tokens,
      reasoningTokens: data.usage.output_tokens_details?.reasoning_tokens,
    } : undefined;

    return {
      content: textContent,
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
