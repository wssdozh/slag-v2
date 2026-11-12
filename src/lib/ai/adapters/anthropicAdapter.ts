import type { LlmProtocolAdapter, LlmAdapterTurnRequest, LlmAdapterTurnResponse } from '../types';
import { logger } from '../../logger';
import { extractErrorMessage } from './errorMessage';

const aiLog = logger.scope('AI');

export class AnthropicMessagesAdapter implements LlmProtocolAdapter {
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

    // Build Anthropic messages array
    const anthropicMessages: any[] = [];

    // Base dialog history
    for (const m of messages) {
      let text = m.content;
      if (!text || !text.trim()) {
        text = '[Действие или черновик подготовлено]';
      }
      anthropicMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: text,
      });
    }

    // Append intra-turn tool calls and results
    for (const item of turnHistory) {
      if (item.role === 'assistant') {
        const blocks: any[] = [];
        if (item.content && item.content.trim()) {
          blocks.push({ type: 'text', text: item.content });
        }
        if (item.toolCalls && item.toolCalls.length > 0) {
          for (const tc of item.toolCalls) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.args || {},
            });
          }
        }
        anthropicMessages.push({
          role: 'assistant',
          content: blocks.length > 0 ? blocks : 'Готово',
        });
      } else if (item.toolResults && item.toolResults.length > 0) {
        const resultBlocks = item.toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.toolCallId,
          content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
        }));
        anthropicMessages.push({
          role: 'user',
          content: resultBlocks,
        });
      }
    }

    // Ensure alternating user/assistant messages if consecutive roles appear
    const mergedMessages: any[] = [];
    for (const msg of anthropicMessages) {
      const prev = mergedMessages[mergedMessages.length - 1];
      if (prev && prev.role === msg.role) {
        if (typeof prev.content === 'string' && typeof msg.content === 'string') {
          prev.content = `${prev.content}\n\n${msg.content}`;
        } else {
          const prevArr = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
          const curArr = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
          prev.content = [...prevArr, ...curArr];
        }
      } else {
        mergedMessages.push(msg);
      }
    }

    // Ensure messages begin with 'user' role
    if (mergedMessages.length > 0 && mergedMessages[0].role !== 'user') {
      mergedMessages.unshift({ role: 'user', content: 'Привет' });
    }

    const payload: Record<string, any> = {
      model,
      system: systemPrompt,
      messages: mergedMessages,
      max_tokens: 4096,
      temperature: 0.2,
    };

    if (reasoningEffort !== 'none') {
      payload.thinkingFlag = true;
    }

    if (!isLastAllowedRound && tools.length > 0) {
      payload.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object', properties: {} },
      }));
    }

    // Resolve Authorization header: Kie.ai accepts "Bearer <key>"
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const detail = extractErrorMessage(res.status, errorBody);
      aiLog.warn(`Anthropic Adapter HTTP ${res.status}: ${detail}`, { status: res.status, raw: errorBody.slice(0, 300) });
      throw new Error(`Anthropic HTTP ${res.status}: ${detail}`);
    }

    const data = await res.json();
    if (data.error) {
      const msg = data.error.message || `Anthropic Error: ${JSON.stringify(data.error)}`;
      aiLog.warn(`Anthropic API Error: ${msg}`);
      throw new Error(msg);
    }

    let textContent = '';
    let reasoning = '';
    const toolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text || '';
        } else if (block.type === 'thinking') {
          reasoning += (reasoning ? '\n\n' : '') + (block.thinking || '');
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            args: block.input || {},
          });
        }
      }
    } else if (typeof data.content === 'string') {
      textContent = data.content;
    }

    const usage = data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined;

    return {
      content: textContent,
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
