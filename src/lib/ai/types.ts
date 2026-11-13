// The contract between the assistant loop and a protocol adapter: request, reply, history.
import type { AiSettings, ChatToolCall, FolderMeta, SlagItem, SuggestedAction } from '../../types';

export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
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
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
  };
}

export interface LlmProtocolAdapter {
  executeTurn(request: LlmAdapterTurnRequest): Promise<LlmAdapterTurnResponse>;
}

export interface SendAssistantChatParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  currentFolder: string;
  settings: AiSettings;
  folders: FolderMeta[];
  allItems: SlagItem[];
  /**
   * Narrower than the full catalogue on purpose: a question that arrives from telegram is not
   * the same trust boundary as one typed in the app. Undefined means every tool is allowed.
   */
  toolAllowlist?: string[];
}

export interface SendAssistantChatResult {
  content: string;
  reasoning?: string;
  reasoningTimeMs?: number;
  toolCalls?: ChatToolCall[];
  suggestedAction?: SuggestedAction;
  suggestedActions?: SuggestedAction[];
  feedFilter?: { itemIds: string[]; queryLabel: string };
}
