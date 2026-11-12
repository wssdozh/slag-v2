/**
 * Search, feed filtering and vault stats intents.
 */
import type { ChatToolCall } from '../../../types';
import type { SendAssistantChatResult } from '../types';
import { findItemsByWikiLinks } from './history';
import { readIntentText } from './intentContext';
import type { LocalFallbackParams } from './types';

export async function filterFeed(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, allItems, startTime } = params;
  const { lowerMsg } = readIntentText(params);

  if (!lowerMsg.includes('с фильтр') && !lowerMsg.includes('включи фильтр') && !lowerMsg.includes('отфильтруй')) {
    return null;
  }

  let candidateIds: string[] = [];
  let label = 'Выборка ассистента';
  const wikiMatch = findItemsByWikiLinks(messages, allItems);
  if (wikiMatch) {
    candidateIds = wikiMatch.items.map((m) => m.id);
    label = wikiMatch.titles.slice(0, 2).join(', ');
  }

  if (candidateIds.length === 0) {
    // Fallback to overdue tasks if discussed
    const today = new Date().toISOString().slice(0, 10);
    const overdue = allItems.filter((i) => i.type === 'task' && i.status !== 'done' && i.dueDate && i.dueDate < today);
    if (overdue.length > 0) {
      candidateIds = overdue.map((o) => o.id);
      label = 'Просроченные задачи';
    } else {
      candidateIds = allItems.slice(0, 4).map((i) => i.id);
    }
  }

  return {
    content: `В ленте активирован фильтр ИИ «${label}» (показано записей: ${candidateIds.length}).`,
    reasoning: `Активирован фильтр ленты по запросу пользователя: ${label}`,
    reasoningTimeMs: Date.now() - startTime,
    feedFilter: {
      itemIds: candidateIds,
      queryLabel: label,
    },
  };
}

export async function vaultStats(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { executeLocalTool, startTime } = params;
  const { lowerMsg } = readIntentText(params);

  const isStatsIntent =
    (lowerMsg.includes('сколько') && !lowerMsg.includes('несколько')) ||
    lowerMsg.includes('статистик') ||
    lowerMsg.includes('сводка') ||
    (lowerMsg.includes('всего') && !lowerMsg.includes('всего лишь'));

  if (!isStatsIntent) {
    return null;
  }

  const stats = await executeLocalTool('get_vault_stats', { target: 'all' });
  const executedToolCalls: ChatToolCall[] = [
    { name: 'get_vault_stats', args: { target: 'all' }, result: stats },
  ];

  const content = `Сводка по хранилищу (${stats.scope}):
- Всего записей: ${stats.totalItems}
- Заметок: ${stats.notesCount}
- Задач: ${stats.tasksCount}
- Статей: ${stats.articlesCount}
- Активных тегов: ${Object.keys(stats.tags).length} (${Object.keys(stats.tags).slice(0, 6).map((t) => `#${t}`).join(', ')})`;

  return {
    content,
    reasoning: 'Проанализирован локальный индекс хранилища через storage.getVaultStats()',
    reasoningTimeMs: Date.now() - startTime,
    toolCalls: executedToolCalls,
  };
}

export async function searchNotes(params: LocalFallbackParams): Promise<SendAssistantChatResult> {
  const { executeLocalTool, startTime, isInbox, currentFolder } = params;
  const { lastUserMsg } = readIntentText(params);

  const searchResults = await executeLocalTool('search_notes', { query: lastUserMsg });
  const executedToolCalls: ChatToolCall[] = [
    { name: 'search_notes', args: { query: lastUserMsg }, result: searchResults },
  ];

  if (searchResults.length > 0) {
    const list = searchResults
      .map((r: any) => `• [[${r.title}]] (${r.folder})${r.snippet && r.snippet !== '(пусто)' ? ` — ${r.snippet}` : ''}`)
      .join('\n');
    const candidateIds = searchResults.map((r: any) => r.id).filter(Boolean);
    return {
      content: `По вашему запросу в контексте "${isInbox ? 'Все хранилище' : currentFolder}" найдено ${searchResults.length} записей:\n\n${list}`,
      reasoning: `Локальный поиск Orama: найдено ${searchResults.length} записей по "${lastUserMsg}"`,
      reasoningTimeMs: Date.now() - startTime,
      toolCalls: executedToolCalls,
      feedFilter: candidateIds.length > 0 ? {
        itemIds: candidateIds,
        queryLabel: `Поиск: ${lastUserMsg}`,
      } : undefined,
    };
  }

  return {
    content: `В контексте "${isInbox ? 'Все хранилище' : currentFolder}" по запросу "${lastUserMsg}" записей не найдено.\n\n💡 Попробуйте другие ключевые слова или тег. Для свободного общения подключите ключ Groq или KIE.AI в Настройках (⌘,).`,
    reasoning: 'Поиск Orama завершен с 0 результатов',
    reasoningTimeMs: Date.now() - startTime,
    toolCalls: executedToolCalls,
  };
}
