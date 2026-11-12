/**
 * Offline intent chain: handlers run in priority order, the first non-null result wins.
 */
import type { SendAssistantChatResult } from '../types';
import { calendarAgenda } from './agenda';
import { contextualLink, greetingHelp, metaTalk, refuseDelete, shortNoise } from './dialog';
import { decomposeTask, splitNote } from './decomposition';
import { appendToNote, createRecord, refineDraft } from './notes';
import { filterFeed, searchNotes, vaultStats } from './search';
import { changeTaskParams, rescheduleTasks } from './tasks';
import type { FallbackIntentHandler, LocalFallbackParams } from './types';

const intentChain: FallbackIntentHandler[] = [
  appendToNote,
  contextualLink,
  filterFeed,
  splitNote,
  vaultStats,
  changeTaskParams,
  rescheduleTasks,
  calendarAgenda,
  decomposeTask,
  refineDraft,
  createRecord,
  refuseDelete,
  metaTalk,
  greetingHelp,
  shortNoise,
];

export async function runLocalFallbackAgent(params: LocalFallbackParams): Promise<SendAssistantChatResult> {
  for (const handler of intentChain) {
    const result = await handler(params);
    if (result) {
      return result;
    }
  }

  return searchNotes(params);
}
