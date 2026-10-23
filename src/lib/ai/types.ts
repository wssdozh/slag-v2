export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ExecutedToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  result: any;
}

export interface AdapterTurnHistoryItem {
  role: 'assistant' | 'user';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    name: string;
    result: any;
  }>;
}

export interface LlmAdapterTurnRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: AssistantToolDefinition[];
  apiKey: string;
  endpointUrl: string;
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  webSearchEnabled: boolean;
  turnHistory: AdapterTurnHistoryItem[];
  isLastAllowedRound?: boolean;
}

export interface LlmAdapterTurnResponse {
  content: string;
  reasoning?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
}

export interface LlmProtocolAdapter {
  executeTurn(request: LlmAdapterTurnRequest): Promise<LlmAdapterTurnResponse>;
}
