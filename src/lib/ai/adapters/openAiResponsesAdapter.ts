import type { LlmProtocolAdapter, LlmAdapterTurnRequest, LlmAdapterTurnResponse } from '../types';
import { logger } from '../../logger/logger';
import { extractErrorMessage } from './errorMessage';

const aiLog = logger.scope('AI');

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
      // The sibling adapter already gave up after 10 s; without this the UI waits forever on a
      // relay that is down and the caller never reaches its local fallback.
      signal: AbortSignal.timeout(15000),
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

    // Parse any leaked internal model markup (DSML / invoke tags) into real tool calls
    if (textContent.includes('DSML') || textContent.includes('invoke')) {
      const invokeRegex = /<[/\\|｜\s]*invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[/\\|｜\s]*invoke>/gi;
      let match;
      while ((match = invokeRegex.exec(textContent)) !== null) {
        const name = match[1];
        const body = match[2];
        const args: Record<string, any> = {};
        const paramRegex = /<[/\\|｜\s]*parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[/\\|｜\s]*parameter>/gi;
        let pMatch;
        while ((pMatch = paramRegex.exec(body)) !== null) {
          const pName = pMatch[1];
          const pVal = pMatch[2].trim();
          try {
            args[pName] = JSON.parse(pVal);
          } catch {
            args[pName] = pVal;
          }
        }
        toolCalls.push({
          id: `call_dsml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name,
          args,
        });
      }
    }

    // Clean any leaked internal model markup (DSML / invoke tags)
    const cleanContent = textContent
      .replace(/<[/\\|｜\s]*(?:DSML|invoke|parameter|calls)[\s\S]*?>/gi, '')
      .trim();

    return {
      content: cleanContent,
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
