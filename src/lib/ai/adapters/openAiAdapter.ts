// Speaks the OpenAI chat-completions protocol, including tool calls and hosted search.
import type { LlmProtocolAdapter, LlmAdapterTurnRequest, LlmAdapterTurnResponse } from '../types';
import { logger } from '../../logger/logger';
import { extractErrorMessage } from './errorMessage';

const aiLog = logger.scope('AI');

export class OpenAiChatAdapter implements LlmProtocolAdapter {
  async executeTurn(request: LlmAdapterTurnRequest): Promise<LlmAdapterTurnResponse> {
    const {
      systemPrompt,
      messages,
      tools,
      apiKey,
      endpointUrl,
      model,
      reasoningEffort,
      webSearchEnabled,
      turnHistory,
      isLastAllowedRound,
    } = request;

    const formattedMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => {
        let content = m.content;
        if (!content || !content.trim()) {
          content = '[Действие или черновик подготовлено]';
        }
        return { role: m.role, content };
      }),
    ];

    for (const item of turnHistory) {
      if (item.role === 'assistant') {
        const assistantMsg: any = {
          role: 'assistant',
          content: item.content || '',
        };
        if (item.toolCalls && item.toolCalls.length > 0) {
          assistantMsg.tool_calls = item.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args || {}),
            },
          }));
        }
        formattedMessages.push(assistantMsg);
      } else if (item.toolResults && item.toolResults.length > 0) {
        for (const tr of item.toolResults) {
          formattedMessages.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            name: tr.name,
            content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
          });
        }
      }
    }

    const payload: Record<string, any> = {
      model,
      messages: formattedMessages,
      temperature: 0.2,
      max_tokens: 2048,
    };

    const isArgon = model.toLowerCase().includes('gemini-4-argon');
    if (isArgon) {
      payload.include_thoughts = reasoningEffort !== 'none';
      if (reasoningEffort === 'high') {
        payload.reasoning_effort = 'high';
      } else if (reasoningEffort !== 'none') {
        payload.reasoning_effort = 'low';
      }
    }

    if (!isLastAllowedRound) {
      if (isArgon) {
        if (webSearchEnabled) {
          payload.tools = [{ type: 'function', function: { name: 'googleSearch' } }];
        }
      } else if (tools.length > 0) {
        payload.tools = tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
        payload.tool_choice = 'auto';
      }
    }

    let res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    // Rate limit backoff: retry on HTTP 429 (up to 2 retries with Groq error parsing)
    for (let retry = 0; retry < 2 && res.status === 429; retry++) {
      const errorText = await res.text().catch(() => '');
      const retryHeader = res.headers.get('retry-after');
      const waitMatch = errorText.match(/try again in ([\d.]+)\s*s/i);

      let waitMs = 2800 * (retry + 1);
      if (waitMatch) {
        waitMs = Math.ceil(parseFloat(waitMatch[1]) * 1000) + 400;
      } else if (retryHeader) {
        waitMs = Math.max(parseInt(retryHeader, 10) * 1000, 1000) + 400;
      }
      waitMs = Math.min(Math.max(waitMs, 1500), 7000);

      aiLog.warn(`OpenAI Adapter HTTP 429 rate limit hit (attempt ${retry + 1}/2), backing off ${waitMs}ms before retry...`);
      await new Promise((r) => setTimeout(r, waitMs));

      res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const detail = extractErrorMessage(res.status, errorBody);
      aiLog.warn(`OpenAI Adapter HTTP ${res.status}: ${detail}`, { status: res.status, raw: errorBody.slice(0, 300) });
      throw new Error(`OpenAI HTTP ${res.status}: ${detail}`);
    }

    const data = await res.json();
    if (data.code && data.code !== 200) {
      const msg = data.msg || `OpenAI Adapter error code ${data.code}`;
      aiLog.warn(`OpenAI Adapter error code ${data.code}: ${msg}`);
      throw new Error(msg);
    }

    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      return { content: '' };
    }

    let reasoning = msg.reasoning_content || '';
    let content = msg.content || '';

    if (content.includes('DSML') || content.includes('invoke')) {
      content = content
        .replace(/<[|｜\s]*DSML[\s\S]*?(?:<\/?[|｜\s]*DSML.*?>|$)/gi, '')
        .replace(/<[|｜\s]*invoke[\s\S]*?(?:<\/?[|｜\s]*invoke.*?>|$)/gi, '')
        .trim();
    }

    if (content.includes('<think>')) {
      const match = content.match(/<think>([\s\S]*?)<\/think>/);
      if (match) {
        reasoning = (reasoning ? `${reasoning}\n\n` : '') + match[1].trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      }
    }

    const toolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name;
        if (!name) continue;
        let args: Record<string, any> = {};
        try {
          args = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments || '{}')
            : (tc.function.arguments || {});
        } catch {
          args = {};
        }
        toolCalls.push({
          id: tc.id || `call_${crypto.randomUUID()}`,
          name,
          args,
        });
      }
    }

    const usage = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
      reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens,
    } : undefined;

    return {
      content,
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
