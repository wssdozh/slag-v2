/**
 * Types shared by the offline fallback intent handlers.
 */
import type { SlagItem } from '../../../types';
import type { SendAssistantChatResult } from '../types';

export interface LocalFallbackParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  currentFolder: string;
  allItems: SlagItem[];
  startTime: number;
  executeLocalTool: (name: string, args: Record<string, any>) => Promise<any>;
  isInbox: boolean;
}

export type FallbackIntentHandler = (params: LocalFallbackParams) => Promise<SendAssistantChatResult | null>;
