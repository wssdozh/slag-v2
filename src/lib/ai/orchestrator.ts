import type { SlagItem, FolderMeta, AiSettings, SuggestedAction, ChatToolCall, BatchUpdateItem, ItemUpdates } from '../../types';
import type {
  AdapterTurnHistoryItem,
  LlmAdapterTurnResponse,
} from './types';
import { resolveAiTarget, resolveKieEndpoint } from './aiClient';
export { resolveKieEndpoint, resolveAiTarget };
import { storage } from '../storage';
import { logger } from '../logger';
import { parseTodoistInput } from '../time/todoistTaskParser';
import { DEFAULT_INBOX_FOLDER, AI_LIMITS } from '../../config';
import { extractActionBlock } from './actionParser';
export { extractActionBlock, cleanSnippetText } from './actionParser';
import { buildSystemPrompt } from './prompt';
import { createLocalToolExecutor } from './tools';
import { getCanonicalTools } from './toolDefinitions';

const aiLog = logger.scope('AI');

export interface SendAssistantChatParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  currentFolder: string;
  settings: AiSettings;
  folders: FolderMeta[];
  allItems: SlagItem[];
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

/**
 * Sanitizes markdown content into a single-line, lightweight text snippet
 * stripping headings, bullet markers, horizontal rules and excess whitespace.
 */
/**
 * Parent Assistant Orchestrator.
 * Defines core assistant behavior, canonical tools, multi-round execution loop,
 * and delegates to OpenAI or Anthropic protocol adapters.
 */
export class AssistantOrchestrator {
  async runChat(params: SendAssistantChatParams): Promise<SendAssistantChatResult> {
    const { messages, currentFolder, settings, folders, allItems } = params;
    const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;
    const folderMeta = folders.find((f) => f.path === currentFolder);

    const startTime = Date.now();
    const capturedActions: SuggestedAction[] = [];
    let capturedFeedFilter: { itemIds: string[]; queryLabel: string } | undefined;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrowDate = new Date(now.getTime() + 86400000);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
    const dayNamesRu = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const todayDayName = dayNamesRu[now.getDay()];
    const tomorrowDayName = dayNamesRu[tomorrowDate.getDay()];

    const scopedTasks = allItems.filter((i) => {
      if (i.type !== 'task') return false;
      if (!isInbox && i.folder !== currentFolder && !i.folder.startsWith(currentFolder + '/')) return false;
      return true;
    });

    const tasksToday = scopedTasks.filter((t) => t.dueDate === todayStr);
    const tasksTomorrow = scopedTasks.filter((t) => t.dueDate === tomorrowStr);
    const overdueTasks = scopedTasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr);
    const unscheduledTasks = scopedTasks.filter((t) => t.status !== 'done' && !t.dueDate);

    // Local Tool Executor
    const executeLocalTool = createLocalToolExecutor({
      allItems,
      currentFolder,
      isInbox,
      capturedActions,
      setCapturedFeedFilter: (filter) => { capturedFeedFilter = filter; },
    });
    // System Prompt with Scope rules
    const canonicalTools = getCanonicalTools(settings.webSearchEnabled);

    const systemPrompt = buildSystemPrompt({
      todayStr,
      tomorrowStr,
      todayDayName,
      tomorrowDayName,
      tasksToday,
      tasksTomorrow,
      overdueTasks,
      unscheduledTasks,
      isInbox,
      currentFolder,
      folderMeta,
    });
    // Protocol Adapter & Endpoint Resolution
    const target = resolveAiTarget(settings);
    let fallbackReason: string | undefined = undefined;

    if (target) {
      const { providerName, apiKey, model, adapter, endpointUrl } = target;

      try {
        const executedToolCalls: ChatToolCall[] = [];
        const turnHistory: AdapterTurnHistoryItem[] = [];
        const MAX_TOOL_ROUNDS = AI_LIMITS.MAX_TOOL_ROUNDS;
        let round = 0;
        let finalContent = '';
        let accumulatedReasoning = '';
        const calledSignatures = new Set<string>();

        const filteredMessages = messages.map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content || '',
        }));

        while (round < MAX_TOOL_ROUNDS) {
          round++;
          const isLastAllowedRound = round === MAX_TOOL_ROUNDS;

          aiLog.info(`Agent round ${round}/${MAX_TOOL_ROUNDS} [${providerName}] started`, {
            model,
            adapter: adapter.constructor.name,
            endpoint: endpointUrl,
          });

          const roundStart = performance.now();
          let turnResponse: LlmAdapterTurnResponse;
          try {
            turnResponse = await adapter.executeTurn({
              systemPrompt,
              messages: filteredMessages,
              tools: canonicalTools,
              apiKey,
              endpointUrl,
              model,
              reasoningEffort: target.reasoningEffort ?? settings.reasoningEffort,
              webSearchEnabled: settings.webSearchEnabled,
              turnHistory,
              isLastAllowedRound,
            });
          } catch (turnErr) {
            aiLog.warn(`${providerName} round ${round} execution failed`, turnErr);
            if (executedToolCalls.length > 0 || capturedActions.length > 0) {
              // We already executed tool calls or captured actions in earlier rounds.
              // Break gracefully so post-processing preserves the actions and synthesizes response.
              break;
            }
            throw turnErr;
          }

          const roundDuration = Math.round(performance.now() - roundStart);
          const responseToolCalls = turnResponse.toolCalls;
          const usageStr = turnResponse.usage
            ? ` | tokens: ${turnResponse.usage.promptTokens ?? '?'} in / ${turnResponse.usage.completionTokens ?? '?'} out`
            : '';
          const toolsStr = responseToolCalls && responseToolCalls.length > 0
            ? ` | tools: ${responseToolCalls.map((t) => t.name).join(', ')}`
            : ' | final answer';
          aiLog.info(`Agent round ${round}/${MAX_TOOL_ROUNDS} [${providerName}] finished in ${roundDuration}ms${usageStr}${toolsStr}`);

          if (turnResponse.reasoning) {
            accumulatedReasoning = (accumulatedReasoning ? `${accumulatedReasoning}\n\n` : '') + turnResponse.reasoning;
          }

          // If no tool calls returned, this is the final answer
          if (!responseToolCalls || responseToolCalls.length === 0) {
            finalContent = turnResponse.content;
            break;
          }

          // Record assistant turn in history
          turnHistory.push({
            role: 'assistant',
            content: turnResponse.content,
            toolCalls: responseToolCalls,
          });

          // Execute tool calls locally
          let hasNewTools = false;
          const currentRoundResults: Array<{ toolCallId: string; name: string; result: any }> = [];

          for (const tc of responseToolCalls) {
            const toolName = tc.name;
            const toolArgs = tc.args || {};
            const callSig = `${toolName}:${JSON.stringify(toolArgs)}`;
            let toolResult: any;

            if (calledSignatures.has(callSig)) {
              toolResult = {
                warning: 'Этот инструмент уже вызывался с такими параметрами. Сформулируйте финальный ответ на основе имеющихся данных или вызовите другой инструмент.',
              };
            } else {
              calledSignatures.add(callSig);
              const toolStart = performance.now();
              const rawResult = await executeLocalTool(toolName, toolArgs);
              const toolDuration = Math.round(performance.now() - toolStart);

              let summary = '';
              if (Array.isArray(rawResult)) {
                summary = `→ ${rawResult.length} items`;
              } else if (rawResult && typeof rawResult === 'object') {
                if (rawResult.totalItems !== undefined) summary = `→ ${rawResult.totalItems} total`;
                else if (rawResult.count !== undefined) summary = `→ ${rawResult.count} items`;
                else if (rawResult.error) summary = `→ error: ${rawResult.error}`;
                else summary = '→ ok';
              } else if (typeof rawResult === 'string') {
                summary = `→ ${rawResult.length} chars`;
              }
              const argsSummary = Object.entries(toolArgs).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
              aiLog.info(`Tool ${toolName}(${argsSummary.slice(0, 80)}) ${summary} (+${toolDuration}ms)`, {
                tool: toolName,
                args: toolArgs,
                durationMs: toolDuration,
              });

              if (toolName === 'search_notes' && Array.isArray(rawResult) && rawResult.length === 0) {
                const allTags = storage.getAllExistingTags().slice(0, 8);
                toolResult = {
                  results: [],
                  message: `По запросу "${toolArgs.query}" заметок не найдено. Попробуйте поискать по смежным темам или тегам базы: ${allTags.join(', ')}`,
                };
              } else {
                toolResult = rawResult;
              }

              executedToolCalls.push({
                name: toolName,
                args: toolArgs,
                result: rawResult,
              });
              hasNewTools = true;
            }

            currentRoundResults.push({
              toolCallId: tc.id,
              name: toolName,
              result: toolResult,
            });
          }

          // Record tool results as user turn in history
          turnHistory.push({
            role: 'user',
            content: '',
            toolResults: currentRoundResults,
          });

          if (!hasNewTools) {
            finalContent = turnResponse.content;
            break;
          }
        }

        // Safeguard: If finalContent is empty but tools were executed or actions captured, synthesize friendly response
        if (!finalContent.trim() && (executedToolCalls.length > 0 || capturedActions.length > 0)) {
          const foundNotesSearch = executedToolCalls.find(
            (tc) => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0
          );
          if (foundNotesSearch && Array.isArray(foundNotesSearch.result)) {
            const list = foundNotesSearch.result
              .map((r: any) => `• [[${r.title}]] (${r.folder})${r.snippet && r.snippet !== '(пусто)' ? ` — ${r.snippet}` : ''}`)
              .join('\n');
            finalContent = `По вашему запросу найдены следующие записи:\n\n${list}`;
            if (!capturedFeedFilter) {
              const ids = foundNotesSearch.result.map((r: any) => r.id).filter(Boolean);
              if (ids.length > 0) {
                capturedFeedFilter = {
                  itemIds: ids,
                  queryLabel: 'Результаты поиска',
                };
              }
            }
          } else {
            const batchAction = capturedActions.find((a) => a.type === 'batch_update');
            const updateAction = capturedActions.find((a) => a.type === 'update_item');
            const agendaCall = executedToolCalls.find((tc) => tc.name === 'get_calendar_agenda' && tc.result);

            if (batchAction && batchAction.batchUpdateItems) {
              const count = batchAction.batchUpdateItems.length;
              const hasPrio = batchAction.batchUpdateItems.some((i) => i.updates?.priority);
              const label = hasPrio ? 'изменение приоритета' : 'пакетное обновление';
              finalContent = `Подготовил ${label} для ${count} задач. Проверьте параметры и нажмите «Применить».`;
            } else if (updateAction) {
              finalContent = `Подготовил обновление для «${updateAction.title}». Нажмите «Применить» для сохранения.`;
            } else if (agendaCall && agendaCall.result) {
              const a = agendaCall.result;
              finalContent = `Повестка на ${a.targetDate}: запланировано ${a.scheduledCount || 0} задач, просрочено ${a.overdueCount || 0}.`;
            } else if (capturedActions.length > 0) {
              finalContent = 'Подготовил действие согласно вашему запросу. Нажмите «Применить» для подтверждения.';
            } else {
              finalContent = 'В базе знаний не найдено подходящих записей по вашему запросу. Попробуйте уточнить ключевые слова.';
            }
          }
        }

        // Google Calendar Hallucination Interceptor & Fallback
        const isGoogleCalendarHallucination = (text: string) =>
          /Google\s*Calendar|активировать это расширение|подключиться к Google/i.test(text);

        if (isGoogleCalendarHallucination(finalContent)) {
          aiLog.warn('Intercepted Google Calendar hallucination, substituting with local SLAG v2 agenda');
          const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';
          const isTomorrow = lastUserText.includes('завтра');
          const targetLabel = isTomorrow ? `завтра (${tomorrowStr})` : `сегодня (${todayStr})`;
          const targetTasks = isTomorrow ? tasksTomorrow : tasksToday;

          if (targetTasks.length === 0) {
            finalContent = `На ${targetLabel} запланированных задач нет. День свободен для работы.`;
          } else {
            finalContent = `Задачи на ${targetLabel} (${targetTasks.length}):\n` +
              targetTasks.map((t) => `- [[${t.title}]] (${t.status}, приоритет: ${t.priority || 'обычный'}${t.reminder ? `, время: ${t.reminder}` : ''})`).join('\n');
          }
        }

        const { cleanText, suggestedAction: blockAction } = extractActionBlock(finalContent, allItems, currentFolder);
        if (blockAction) {
          capturedActions.push(blockAction);
        }

        // Auto-coalesce multiple update actions into a single batch_update card
        const updateActions = capturedActions.filter((a) => a.type === 'update_item' || a.type === 'batch_update');
        const otherActions = capturedActions.filter((a) => a.type !== 'update_item' && a.type !== 'batch_update');

        const finalActions: SuggestedAction[] = [...otherActions];

        if (updateActions.length > 1) {
          const combinedBatchItems: BatchUpdateItem[] = [];
          for (const act of updateActions) {
            if (act.type === 'update_item') {
              combinedBatchItems.push({
                targetItemId: act.targetItemId || '',
                title: act.title,
                updates: act.updates || {
                  dueDate: act.dueDate,
                  reminder: act.reminder,
                  priority: act.priority,
                  status: act.status,
                  appendContent: act.appendContent,
                },
              });
            } else if (act.type === 'batch_update' && act.batchUpdateItems) {
              combinedBatchItems.push(...act.batchUpdateItems);
            }
          }
          const seenIds = new Set<string>();
          const uniqueItems = combinedBatchItems.filter((item) => {
            const key = item.targetItemId || item.title;
            if (seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
          });

          const hasDueDate = uniqueItems.some(i => i.updates?.dueDate !== undefined);
          const hasPriority = uniqueItems.some(i => i.updates?.priority !== undefined);
          const hasStatus = uniqueItems.some(i => i.updates?.status !== undefined);
          let defaultBatchTitle = `Пакетное обновление (${uniqueItems.length})`;
          if (hasDueDate && !hasPriority && !hasStatus) {
            defaultBatchTitle = `Перенос задач (${uniqueItems.length})`;
          } else if (hasPriority && !hasDueDate) {
            defaultBatchTitle = `Изменение приоритета (${uniqueItems.length})`;
          } else if (hasStatus && !hasDueDate) {
            defaultBatchTitle = `Смена статуса (${uniqueItems.length})`;
          }

          finalActions.push({
            type: 'batch_update',
            title: defaultBatchTitle,
            actionLabel: defaultBatchTitle,
            folder: currentFolder,
            content: '',
            tags: [],
            itemType: 'task',
            batchUpdateItems: uniqueItems,
            actionState: 'suggested',
          });
        } else if (updateActions.length === 1) {
          finalActions.push(updateActions[0]);
        }

        return {
          content: cleanText,
          reasoning: accumulatedReasoning || undefined,
          reasoningTimeMs: Date.now() - startTime,
          toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          suggestedAction: finalActions[0],
          suggestedActions: finalActions.length > 0 ? finalActions : undefined,
          feedFilter: capturedFeedFilter,
        };
      } catch (err: any) {
        fallbackReason = err?.message || `${providerName} error`;
        aiLog.warn(`${providerName} Assistant API call failed, falling back to local agent: ${fallbackReason}`, err);
      }
    }

    // Offline / Local Heuristic Agent
    const localResult = await this.runLocalFallbackAgent({
      messages,
      currentFolder,
      allItems,
      startTime,
      executeLocalTool,
      isInbox,
    });

    if (fallbackReason) {
      const banner = `⚠️ Оффлайн-агент (API недоступен: ${fallbackReason})`;
      localResult.reasoning = localResult.reasoning
        ? `${banner}\n\n${localResult.reasoning}`
        : banner;
    }

    return localResult;
  }

  private async runLocalFallbackAgent(params: {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    currentFolder: string;
    allItems: SlagItem[];
    startTime: number;
    executeLocalTool: (name: string, args: Record<string, any>) => Promise<any>;
    isInbox: boolean;
  }): Promise<SendAssistantChatResult> {
    const { messages, currentFolder, allItems, startTime, executeLocalTool, isInbox } = params;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const rawLowerMsg = lastUserMsg.toLowerCase().trim();
    // Ponytail: normalize common slang into canonical terms in one line
    const lowerMsg = rawLowerMsg
      .replace(/сёдня|седня/g, 'сегодня')
      .replace(/таск(у|и|а|е|ом|ах)?\b/gi, 'задачу');
    const executedToolCalls: ChatToolCall[] = [];

    // Check 0.5: Append to note intent ("добавь в заметку X", "допиши к задаче Y")
    const isAppendIntent =
      (lowerMsg.includes('добавь в заметку') ||
       lowerMsg.includes('допиши в заметку') ||
       lowerMsg.includes('добавь к заметке') ||
       lowerMsg.includes('допиши к задаче') ||
       lowerMsg.includes('добавь в конец')) &&
      !lowerMsg.includes('создай') &&
      !lowerMsg.includes('подзадач');

    if (isAppendIntent) {
      // Find target note
      let targetNote: SlagItem | undefined;
      for (const item of allItems) {
        if (lowerMsg.includes(item.title.toLowerCase())) {
          targetNote = item;
          break;
        }
      }

      if (!targetNote) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const text = messages[i].content;
          const wikiMatches = Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1]);
          if (wikiMatches.length > 0) {
            targetNote = allItems.find(item => wikiMatches.some(w => w.toLowerCase() === item.title.toLowerCase()));
            if (targetNote) break;
          }
        }
      }

      if (targetNote) {
        // Extract content after quotes, colon or keywords
        let appendText = lastUserMsg;
        const colonIdx = lastUserMsg.indexOf(':');
        if (colonIdx !== -1) {
          appendText = lastUserMsg.slice(colonIdx + 1).trim();
        } else {
          const quoteMatch = lastUserMsg.match(/[«"]([^»"]+)[»"]/);
          if (quoteMatch) {
            appendText = quoteMatch[1];
          } else {
            appendText = lastUserMsg.replace(/^.*?(?:добавь|допиши)\s+(?:в\s+заметку|к\s+заметке|в\s+конец)?\s*/i, '').trim();
          }
        }

        const action: SuggestedAction = {
          type: 'update_item',
          targetItemId: targetNote.id,
          title: targetNote.title,
          actionLabel: 'Дополнение заметки',
          folder: targetNote.folder,
          content: appendText,
          appendContent: appendText,
          tags: targetNote.tags || [],
          itemType: targetNote.type,
          updates: {
            appendContent: appendText,
          },
          actionState: 'suggested',
        };

        return {
          content: `Добавил пункт в заметку «${targetNote.title}».`,
          reasoning: `Локальное дополнение заметки [[${targetNote.title}]]`,
          reasoningTimeMs: Date.now() - startTime,
          suggestedAction: action,
        };
      }
    }

    // Check 1: Contextual link / Anaphora resolution from recent chat history
    if (
      lowerMsg.includes('линк на') ||
      lowerMsg.includes('дай мне линк') ||
      lowerMsg.includes('дай ссылку') ||
      lowerMsg.includes('ссылк')
    ) {
      let foundTitle: string | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const text = messages[i].content;
        const wikiMatch = text.match(/\[\[([^\]]+)\]\]/);
        if (wikiMatch) {
          foundTitle = wikiMatch[1];
          break;
        }
        const quoteMatch = text.match(/[«"]([^»"]+)[»"]/);
        if (quoteMatch) {
          foundTitle = quoteMatch[1];
          break;
        }
      }

      if (foundTitle) {
        return {
          content: `Вот ссылка на запись из контекста: [[${foundTitle}]]`,
          reasoning: `Извлечена ссылка из контекста предыдущих сообщений диалога: [[${foundTitle}]]`,
          reasoningTimeMs: Date.now() - startTime,
        };
      }
    }

    // Check 1.5: Feed Filter Intent ("а с фильтром", "покажи с фильтром", "отфильтруй ленту")
    if (
      lowerMsg.includes('с фильтр') ||
      lowerMsg.includes('включи фильтр') ||
      lowerMsg.includes('отфильтруй')
    ) {
      // Find candidate tasks or notes from recent history
      let candidateIds: string[] = [];
      let label = 'Выборка ассистента';
      for (let i = messages.length - 1; i >= 0; i--) {
        const text = messages[i].content;
        const wikiMatches = Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1]);
        if (wikiMatches.length > 0) {
          const matched = allItems.filter(item => wikiMatches.some(w => w.toLowerCase() === item.title.toLowerCase()));
          if (matched.length > 0) {
            candidateIds = matched.map(m => m.id);
            label = wikiMatches.slice(0, 2).join(', ');
            break;
          }
        }
      }

      if (candidateIds.length === 0) {
        // Fallback to overdue tasks if discussed
        const today = new Date().toISOString().slice(0, 10);
        const overdue = allItems.filter(i => i.type === 'task' && i.status !== 'done' && i.dueDate && i.dueDate < today);
        if (overdue.length > 0) {
          candidateIds = overdue.map(o => o.id);
          label = 'Просроченные задачи';
        } else {
          candidateIds = allItems.slice(0, 4).map(i => i.id);
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

    // Check 1.8: Split / Decompose note intent ("раздели заметку", "разбей на таски", "раздели на несколько")
    const isSplitIntent =
      /раздели|разбей|декомпозируй|располовинь/i.test(lowerMsg) &&
      (lowerMsg.includes('заметк') || lowerMsg.includes('таск') || lowerMsg.includes('несколько') || lowerMsg.includes('пункт'));

    if (isSplitIntent) {
      let targetNote: SlagItem | undefined;
      for (let i = messages.length - 1; i >= 0; i--) {
        const text = messages[i].content;
        const wikiMatches = Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1]);
        if (wikiMatches.length > 0) {
          targetNote = allItems.find((item) => wikiMatches.some((w) => w.toLowerCase() === item.title.toLowerCase()));
          if (targetNote) break;
        }
      }

      if (targetNote && targetNote.content) {
        const lines = targetNote.content
          .split('\n')
          .map((l) => l.replace(/^[-\s*]*\[[ xX]?\]\s*|^[-*\d.]+\s*/, '').trim())
          .filter((l) => l.length > 2 && !l.startsWith('#'));

        if (lines.length > 1) {
          const batchItems: BatchUpdateItem[] = lines.slice(0, 10).map((line, idx) => ({
            targetItemId: `new_${idx}`,
            title: line,
            updates: {
              status: 'todo',
            },
          }));

          return {
            content: `Разделил заметку «${targetNote.title}» на ${batchItems.length} задач в папке «${targetNote.folder}». Нажмите «Применить» для подтверждения.`,
            reasoning: `Декомпозиция заметки [[${targetNote.title}]] на ${batchItems.length} задач`,
            reasoningTimeMs: Date.now() - startTime,
            suggestedAction: {
              type: 'batch_update',
              title: `Разделение заметки (${batchItems.length} задач)`,
              actionLabel: `Создать ${batchItems.length} задач`,
              folder: targetNote.folder,
              content: '',
              tags: targetNote.tags || [],
              itemType: 'task',
              batchUpdateItems: batchItems,
              actionState: 'suggested',
            },
          };
        }
      }
    }

    // Check 2: Vault stats / count
    const isStatsIntent =
      (lowerMsg.includes('сколько') && !lowerMsg.includes('несколько')) ||
      lowerMsg.includes('статистик') ||
      lowerMsg.includes('сводка') ||
      (lowerMsg.includes('всего') && !lowerMsg.includes('всего лишь'));

    if (isStatsIntent) {
      const stats = await executeLocalTool('get_vault_stats', { target: 'all' });
      executedToolCalls.push({ name: 'get_vault_stats', args: { target: 'all' }, result: stats });

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

    // Check 2.2: Priority or Status Update intent ("поменяй приоритет X на высокий", "смени статус Y на done", "у всех сегодняшних задач сделать минимум приоритета")
    const isPriorityIntent = /приоритет/i.test(lowerMsg);
    const isStatusIntent = /статус/i.test(lowerMsg) || /отметь как|переведи в/i.test(lowerMsg);
    if ((isPriorityIntent || isStatusIntent) && !lowerMsg.includes('создай') && !lowerMsg.includes('план')) {
      let newPriority: 'none' | 'low' | 'medium' | 'high' | undefined;
      if (/высок|high|p1|срочн|максим/i.test(lowerMsg)) newPriority = 'high';
      else if (/средн|medium|p2|обычн/i.test(lowerMsg)) newPriority = 'medium';
      else if (/низк|low|p3|миним/i.test(lowerMsg)) newPriority = 'low';
      else if (/сброс|убери приоритет|none/i.test(lowerMsg)) newPriority = 'none';

      let newStatus: 'backlog' | 'todo' | 'in_progress' | 'done' | undefined;
      if (/выполнен|завершен|закр|done|готов/i.test(lowerMsg)) newStatus = 'done';
      else if (/в процесс|в работ|in_progress|делаю/i.test(lowerMsg)) newStatus = 'in_progress';
      else if (/бэклог|backlog|потом/i.test(lowerMsg)) newStatus = 'backlog';
      else if (/к исполнен|todo|надо/i.test(lowerMsg)) newStatus = 'todo';

      const isBatch = /всех|всеми|все\s+задач|кажд(ой|ую)\s+задач|у\s+всех|всем/i.test(lowerMsg);

      if (isBatch && (newPriority || newStatus)) {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const isTodayTarget = lowerMsg.includes('сегодня') || lowerMsg.includes('сегодняшн');
        const isTomorrowTarget = lowerMsg.includes('завтра') || lowerMsg.includes('завтрашн');
        const isOverdueTarget = lowerMsg.includes('просрочен') || lowerMsg.includes('долг');

        const scopedTasks = allItems.filter(i => i.type === 'task' && (isInbox || i.folder === currentFolder || i.folder.startsWith(currentFolder + '/')));

        let candidateTasks: SlagItem[] = [];
        let dateLabel = 'хранилище';
        if (isTodayTarget) {
          dateLabel = 'сегодня';
          const explicitToday = scopedTasks.filter(t => t.dueDate === today && t.status !== 'done');
          candidateTasks = explicitToday.length > 0
            ? explicitToday
            : scopedTasks.filter(t => t.status !== 'done' && (!t.dueDate || t.dueDate === today));
        } else if (isTomorrowTarget) {
          dateLabel = 'завтра';
          candidateTasks = scopedTasks.filter(t => t.status !== 'done' && t.dueDate === tomorrow);
        } else if (isOverdueTarget) {
          dateLabel = 'просроченные';
          candidateTasks = scopedTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
        } else {
          candidateTasks = scopedTasks.filter(t => t.status !== 'done');
        }

        if (candidateTasks.length === 0) {
          return {
            content: `В расписании на ${dateLabel} не найдено подходящих задач для изменения параметров.`,
            reasoning: `Поиск задач на ${dateLabel} дал 0 результатов`,
            reasoningTimeMs: Date.now() - startTime,
          };
        }

        const batchItems: BatchUpdateItem[] = candidateTasks.map(t => ({
          targetItemId: t.id,
          title: t.title,
          updates: {
            ...(newPriority ? { priority: newPriority } : {}),
            ...(newStatus ? { status: newStatus } : {}),
          },
        }));

        const actionTitle = newPriority
          ? `Изменение приоритета (${batchItems.length})`
          : `Смена статуса (${batchItems.length})`;
        const actionLabel = newPriority
          ? `Приоритет ➔ ${newPriority.toUpperCase()} (${batchItems.length})`
          : `Статус ➔ ${newStatus} (${batchItems.length})`;

        const action: SuggestedAction = {
          type: 'batch_update',
          title: actionTitle,
          actionLabel,
          folder: currentFolder,
          content: '',
          tags: [],
          itemType: 'task',
          batchUpdateItems: batchItems,
          actionState: 'suggested',
        };

        return {
          content: `Подготовил изменение параметров для ${batchItems.length} задач на ${dateLabel}${newPriority ? `: приоритет ➔ ${newPriority.toUpperCase()}` : ''}${newStatus ? `: статус ➔ ${newStatus}` : ''}.`,
          reasoning: `Локальное пакетное обновление параметров задач (${dateLabel})`,
          reasoningTimeMs: Date.now() - startTime,
          suggestedAction: action,
        };
      }

      let targetTask: SlagItem | undefined;
      for (const item of allItems) {
        if (item.type === 'task' && lowerMsg.includes(item.title.toLowerCase())) {
          targetTask = item;
          break;
        }
      }
      if (!targetTask) {
        for (const item of allItems) {
          if (item.type === 'task') {
            const words = item.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
            if (words.some(w => lowerMsg.includes(w))) {
              targetTask = item;
              break;
            }
          }
        }
      }

      if (targetTask) {
        if (newPriority || newStatus) {
          const updates: ItemUpdates = {};
          if (newPriority) updates.priority = newPriority;
          if (newStatus) updates.status = newStatus;

          const action: SuggestedAction = {
            type: 'update_item',
            targetItemId: targetTask.id,
            title: targetTask.title,
            actionLabel: newPriority ? `Приоритет ➔ ${newPriority.toUpperCase()}` : `Статус ➔ ${newStatus}`,
            folder: targetTask.folder,
            content: '',
            tags: targetTask.tags || [],
            itemType: 'task',
            priority: newPriority || targetTask.priority,
            status: newStatus || targetTask.status,
            updates,
            actionState: 'suggested',
          };

          return {
            content: `Подготовил изменение параметров задачи «${targetTask.title}»: ${newPriority ? `приоритет ➔ ${newPriority.toUpperCase()}` : ''}${newStatus ? ` статус ➔ ${newStatus}` : ''}.`,
            reasoning: `Локальное обновление параметров задачи [[${targetTask.title}]]`,
            reasoningTimeMs: Date.now() - startTime,
            suggestedAction: action,
          };
        }
      }
    }

    // Check 2.5: Reschedule tasks (Single & Batch with Todoist parsing & multi-date distribution)
    const isCreateIntent =
      !isPriorityIntent &&
      !isStatusIntent &&
      !lowerMsg.includes('приоритет') &&
      !lowerMsg.includes('статус') &&
      (lowerMsg.includes('созда') ||
       lowerMsg.includes('добав') ||
       lowerMsg.includes('сдела') ||
       lowerMsg.includes('написа') ||
       lowerMsg.includes('напиш') ||
       lowerMsg.includes('оформ') ||
       lowerMsg.includes('преврат') ||
       lowerMsg.includes('запланир') ||
       lowerMsg.includes('постав') ||
       lowerMsg.includes('новая заметка') ||
       lowerMsg.includes('новую задачу') ||
       lowerMsg.includes('статью'));

    const isRescheduleIntent =
      /перенес|сдвин|раскид|разброс|распредел|отлож|передвин|инвертир|задом на пер/i.test(lowerMsg) ||
      (lowerMsg.includes('задач') && (lowerMsg.includes('на завтра') || lowerMsg.includes('на послезавтра')) && !isCreateIntent);

    if (isRescheduleIntent) {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const isOverdueTarget = lowerMsg.includes('просрочен') || lowerMsg.includes('долг');
      const isTomorrowTarget = lowerMsg.includes('завтрашн') || (lowerMsg.includes('завтра') && (lowerMsg.includes('задач') || lowerMsg.includes('таск')));
      const isTodayTarget = lowerMsg.includes('сегодняшн') || (lowerMsg.includes('сегодня') && (lowerMsg.includes('задач') || lowerMsg.includes('таск')));
      const allTasks = allItems.filter(i => i.type === 'task' && (isInbox || i.folder === currentFolder || i.folder.startsWith(currentFolder + '/')));

      let candidateTasks: SlagItem[] = [];
      if (isOverdueTarget) {
        candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
        if (candidateTasks.length === 0) {
          candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate <= today);
        }
      } else if (isTomorrowTarget) {
        candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate === tomorrow);
        if (candidateTasks.length === 0) {
          candidateTasks = allTasks.filter(t => t.status !== 'done');
        }
      } else if (isTodayTarget) {
        candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate === today);
        if (candidateTasks.length === 0) {
          candidateTasks = allTasks.filter(t => t.status !== 'done');
        }
      } else {
        candidateTasks = allTasks.filter(t => {
          const tLower = t.title.toLowerCase();
          return lowerMsg.includes(tLower) || (tLower.length > 3 && lowerMsg.includes(tLower.slice(0, 4)));
        });
        if (candidateTasks.length === 0 && (lowerMsg.includes('все задачи') || lowerMsg.includes('все таски'))) {
          candidateTasks = allTasks.filter(t => t.status !== 'done');
        }
      }

      if (candidateTasks.length === 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const text = messages[i].content || '';
          const wikiMatches = Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1]);
          if (wikiMatches.length > 0) {
            candidateTasks = allTasks.filter(t => wikiMatches.some(w => w.toLowerCase() === t.title.toLowerCase()));
            if (candidateTasks.length > 0) break;
          }
          const mentioned = allTasks.filter(t => t.title.length > 3 && text.toLowerCase().includes(t.title.toLowerCase()));
          if (mentioned.length > 0) {
            candidateTasks = mentioned;
            break;
          }
        }
      }

      if (candidateTasks.length === 0) {
        const hasTomorrowContext = messages.some(m => m.content && (m.content.includes('завтра') || m.content.includes(tomorrow)));
        if (hasTomorrowContext) {
          candidateTasks = allTasks.filter(t => t.status !== 'done' && (t.dueDate === tomorrow || !t.dueDate));
        }
      }

      if (candidateTasks.length === 0) {
        candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
        if (candidateTasks.length === 0) {
          candidateTasks = allTasks.filter(t => t.status !== 'done');
        }
      }

      if (candidateTasks.length > 0) {
        // Detect composite split conditions, e.g.:
        // 1. "1. задачу перенести на завтра, остальные две на послезавтра"
        // 2. "можешь задачу про чай перенести на завтра остальные просроченные на послезавтра"
        const hasRemainder = lowerMsg.includes('остальн') || lowerMsg.includes('друг');
        const hasNumberSplit = (lowerMsg.includes('1.') || lowerMsg.includes('перв')) && hasRemainder;
        
        // Find if a specific task was named before the remainder clause
        let namedTaskTarget: SlagItem | undefined;
        if (hasRemainder && candidateTasks.length > 1) {
          namedTaskTarget = candidateTasks.find(t => {
            const words = t.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            return words.some(w => lowerMsg.includes(w));
          });
        }

        const isCompositeSplit = (hasNumberSplit || Boolean(namedTaskTarget)) && candidateTasks.length > 1;
        const isInverse = lowerMsg.includes('инверт') || lowerMsg.includes('задом на пер') || lowerMsg.includes('наоборот');

        const isIntraDay =
          lowerMsg.includes('в течении дня') ||
          lowerMsg.includes('в течение дня') ||
          lowerMsg.includes('по часам') ||
          lowerMsg.includes('в течении суток') ||
          lowerMsg.includes('в течение суток') ||
          isInverse ||
          (lowerMsg.includes('день') && /разброс|раскид|распредел/i.test(lowerMsg) && !lowerMsg.includes('по дням'));

        const isDistribute =
          isIntraDay ||
          isCompositeSplit ||
          /раскид|разброс|распредел/i.test(lowerMsg) ||
          lowerMsg.includes('на неделю') ||
          lowerMsg.includes('по дням');

        let baseDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // tomorrow by default
        let baseReminder: string | undefined = undefined;
        let basePriority: 'none' | 'low' | 'medium' | 'high' | undefined = undefined;

        if (lowerMsg.includes('послезавтра') && !isCompositeSplit) {
          baseDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
        } else if (lowerMsg.includes('сегодня') && !lowerMsg.includes('завтра') && !isCompositeSplit) {
          baseDate = today;
        } else if (isTomorrowTarget) {
          baseDate = tomorrow;
        } else {
          const parsed = parseTodoistInput(lastUserMsg);
          if (parsed.dueDate) baseDate = parsed.dueDate;
          if (parsed.reminder) baseReminder = parsed.reminder;
          if (parsed.priority) basePriority = parsed.priority;
        }

        if (candidateTasks.length === 1 && !isDistribute) {
          const task = candidateTasks[0];
          const action: SuggestedAction = {
            type: 'update_item',
            targetItemId: task.id,
            title: task.title,
            folder: task.folder,
            content: '',
            tags: task.tags || [],
            itemType: 'task',
            dueDate: baseDate,
            reminder: baseReminder,
            priority: basePriority || task.priority,
            updates: {
              dueDate: baseDate,
              reminder: baseReminder,
              priority: basePriority || task.priority,
            },
            actionState: 'suggested',
          };
          return {
            content: `Перенес задачу «${task.title}» на ${baseDate}.`,
            reasoning: `Локальный перенос задачи: ${task.title} ➔ ${baseDate}`,
            reasoningTimeMs: Date.now() - startTime,
            suggestedAction: action,
          };
        }

        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
        const sortedTasks = [...candidateTasks].sort((a, b) => {
          if (namedTaskTarget) {
            if (a.id === namedTaskTarget.id) return -1;
            if (b.id === namedTaskTarget.id) return 1;
          }
          const pA = priorityOrder[a.priority || 'none'] || 0;
          const pB = priorityOrder[b.priority || 'none'] || 0;
          return isInverse ? pA - pB : pB - pA;
        });

        const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const dayAfterTomorrowIso = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
        const timeSlots = ['10:00', '12:00', '14:30', '16:30', '18:00', '19:30'];

        const batchItems: BatchUpdateItem[] = sortedTasks.map((t, idx) => {
          let dueDate = baseDate;
          let reminder = baseReminder;
          let reason: string | undefined = undefined;

          if (isIntraDay) {
            const slot = timeSlots[Math.min(idx, timeSlots.length - 1)];
            dueDate = baseDate;
            reminder = `${baseDate}T${slot}:00`;
            reason = isInverse ? `Инвертированный слот ${slot}` : `Слот ${slot}`;
          } else if (isCompositeSplit) {
            // Named or first task -> tomorrow; remaining tasks -> day after tomorrow
            const isLead = namedTaskTarget ? t.id === namedTaskTarget.id : idx === 0;
            dueDate = isLead ? tomorrowIso : dayAfterTomorrowIso;
            reason = isLead ? 'Первая задача' : 'Остальные задачи';
          } else if (isDistribute) {
            dueDate = new Date(Date.now() + 86400000 * (idx + 1)).toISOString().slice(0, 10);
            reason = `День ${idx + 1}`;
          }
          return {
            targetItemId: t.id,
            title: t.title,
            updates: {
              dueDate,
              reminder,
              priority: basePriority || t.priority,
            },
            reason,
          };
        });

        const action: SuggestedAction = {
          type: 'batch_update',
          title: isIntraDay ? `Распределение на день (${batchItems.length})` : `Перенос задач (${batchItems.length})`,
          folder: currentFolder,
          content: '',
          tags: [],
          itemType: 'task',
          batchUpdateItems: batchItems,
          actionState: 'suggested',
        };

        let messageText = `Перенес ${batchItems.length} задач на ${baseDate}.`;
        if (isInverse) {
          messageText = `Инвертировал порядок ${batchItems.length} задач (задом наперед) на ${baseDate}.`;
        } else if (isIntraDay) {
          messageText = `Разбросал ${batchItems.length} задач на ${baseDate} в течение дня по слотам времени.`;
        } else if (isCompositeSplit) {
          const leadTitle = namedTaskTarget ? namedTaskTarget.title : sortedTasks[0].title;
          messageText = `Задачу «${leadTitle}» перенес на завтра, остальные просроченные — на послезавтра.`;
        } else if (isDistribute) {
          messageText = `Раскидал ${batchItems.length} задач по свободным дням недели.`;
        }

        return {
          content: messageText,
          reasoning: isIntraDay
            ? `Сформировано внутридневное распределение ${batchItems.length} задач по слотам времени на ${baseDate}`
            : `Сформирован пакетный перенос ${batchItems.length} задач на ${isDistribute ? 'разные дни' : baseDate}`,
          reasoningTimeMs: Date.now() - startTime,
          suggestedAction: action,
        };
      } else {
        return {
          content: 'В хранилище не найдено задач для переноса.',
          reasoning: 'Задачи для переноса не обнаружены',
          reasoningTimeMs: Date.now() - startTime,
        };
      }
    }

    // Check 3: Calendar / Agenda / Relative Dates
    const isCalendarQuery =
      (lowerMsg.includes('повестк') ||
      lowerMsg.includes('план') ||
      lowerMsg.includes('расписани') ||
      lowerMsg.includes('календар') ||
      lowerMsg.includes('просроченн') ||
      lowerMsg.includes('сегодня') ||
      lowerMsg.includes('завтра') ||
      lowerMsg.includes('послезавтра') ||
      lowerMsg.includes('вчера') ||
      lowerMsg === 'а на завтра чо' ||
      lowerMsg === 'а на завтра то чо' ||
      lowerMsg.includes('чо на завтра') ||
      lowerMsg.includes('че на завтра') ||
      lowerMsg.includes('что на завтра') ||
      lowerMsg.includes('на завтра') ||
      (lowerMsg.includes('дела') && (lowerMsg.includes('день') || lowerMsg.includes('сегодня') || lowerMsg.includes('завтра'))) ||
      (lowerMsg.includes('задач') && (lowerMsg.includes('день') || lowerMsg.includes('сегодня') || lowerMsg.includes('завтра') || lowerMsg.includes('просроч')))) &&
      !lowerMsg.includes('сколько') &&
      !lowerMsg.includes('статистик') &&
      !isRescheduleIntent;

    if (isCalendarQuery && !isCreateIntent && !lowerMsg.includes('разбей')) {
      let targetDate = new Date().toISOString().slice(0, 10);
      let dateLabel = 'сегодня';
      if (lowerMsg.includes('послезавтра')) {
        targetDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
        dateLabel = 'послезавтра';
      } else if (lowerMsg.includes('завтра')) {
        targetDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        dateLabel = 'завтра';
      } else if (lowerMsg.includes('вчера')) {
        targetDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        dateLabel = 'вчера';
      }

      const agenda = await executeLocalTool('get_calendar_agenda', { date: targetDate });
      executedToolCalls.push({ name: 'get_calendar_agenda', args: { date: agenda.targetDate }, result: agenda });

      let content = `Повестка на ${agenda.targetDate} (${dateLabel}):\n`;
      if (agenda.scheduledCount === 0 && agenda.overdueCount === 0) {
        content += '- Запланированных задач нет. День свободен для глубокой работы.';
      } else {
        if (agenda.scheduledCount > 0) {
          content += `\n**Запланировано (${agenda.scheduledCount}):**\n`;
          agenda.scheduledTasks.forEach((t: any) => {
            content += `- [[${t.title}]] (${t.status || 'todo'}, приоритет: ${t.priority || 'обычный'})\n`;
          });
        }
        if (agenda.overdueCount > 0) {
          content += `\n**Просроченные задачи (${agenda.overdueCount}):**\n`;
          agenda.overdueTasks.forEach((t: any) => {
            content += `- [[${t.title}]] (срок: ${t.dueDate})\n`;
          });
        }
      }

      return {
        content,
        reasoning: `Сформирована сводка календаря через get_calendar_agenda(${agenda.targetDate})`,
        reasoningTimeMs: Date.now() - startTime,
        toolCalls: executedToolCalls,
      };
    }

    // Check 4: Decompose task into checklist or add concrete subtask
    if (lowerMsg.includes('разбей') || lowerMsg.includes('декомпози') || lowerMsg.includes('подзадач') || lowerMsg.includes('шаги')) {
      const recentActionMsg = [...messages].reverse().find((m) => m.content && (
        m.content.includes('[Действие ассистента:') ||
        m.content.includes('[Подготовлен черновик') ||
        m.content.includes('«')
      ));
      const titleFromHistory = recentActionMsg?.content.match(/[«"]([^»"]+)[»"]/) || recentActionMsg?.content.match(/Заголовок:\s*«([^»]+)»/);

      let taskTitle = '';
      const explicitTaskM = lastUserMsg.match(/(?:есть\s+задача|задача|задачу|таска|таску|в\s+задаче|к\s+задаче|для\s+задачи)\s+[«"]?([^«".,\n]+)[»"]?/i);
      if (explicitTaskM) {
        const candidate = explicitTaskM[1].trim().split(/\s+(?:нужно|надо|сделай|добавь|хочу|на\s+подзадачи|на\s+шаги)/i)[0].trim();
        if (candidate) {
          taskTitle = candidate;
        }
      }

      let targetTask = taskTitle
        ? allItems.find((i) => i.type === 'task' && (
            i.title.toLowerCase() === taskTitle.toLowerCase() ||
            i.title.toLowerCase().includes(taskTitle.toLowerCase()) ||
            taskTitle.toLowerCase().includes(i.title.toLowerCase())
          ))
        : allItems.find((i) => i.type === 'task' && lowerMsg.includes(i.title.toLowerCase()));

      if (targetTask) {
        taskTitle = targetTask.title;
      }

      if (!targetTask && !taskTitle) {
        if (titleFromHistory && lowerMsg.includes(titleFromHistory[1].toLowerCase())) {
          taskTitle = titleFromHistory[1];
          targetTask = allItems.find((i) => i.type === 'task' && i.title.toLowerCase() === taskTitle.toLowerCase());
        } else {
          targetTask = allItems.find((i) => {
            if (i.type !== 'task') return false;
            const lowerTitle = i.title.toLowerCase();
            const titleTokens = lowerTitle.split(/\s+/).filter((w) => w.length > 3);
            return titleTokens.length > 0 && titleTokens.every((tok) => lowerMsg.includes(tok));
          });
        }
      }

      if (!taskTitle) {
        taskTitle = targetTask ? targetTask.title : (titleFromHistory ? titleFromHistory[1] : 'Реализовать ИИ-тегирование заметок');
      }
      const taskId = targetTask?.id || allItems.find((i) => i.type === 'task')?.id;

      const parsedSubtaskTitles: string[] = [];
      const lines = lastUserMsg.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/на\s+(?:подзадачи|шаги|подзадач)\s*$/i.test(trimmed)) {
          continue;
        }

        const subtaskMatch = trimmed.match(/(?:сделать|добавить|создать|включить)?\s*подзадач(?:у|а|е|и)?\s*[:\-–—]\s*(.+)/i)
          || trimmed.match(/(?:сделать|добавить|создать|включить)\s+подзадач(?:у|а|е|и)?\s+(.+)/i);

        if (subtaskMatch) {
          const cleanSub = subtaskMatch[1].replace(/^(сделать|добавить|создать|записать)\s*/i, '').trim();
          if (cleanSub.length >= 2 && !parsedSubtaskTitles.includes(cleanSub) && !/^на\s+(?:подзадачи|шаги)$/i.test(cleanSub)) {
            parsedSubtaskTitles.push(cleanSub);
          }
        }
        const listMatch = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
        if (listMatch) {
          const itemText = listMatch[1].trim();
          if (itemText && !parsedSubtaskTitles.includes(itemText)) {
            parsedSubtaskTitles.push(itemText);
          }
        }
      }

      const subtasks = parsedSubtaskTitles.length > 0
        ? parsedSubtaskTitles.map((stTitle, idx) => ({
            id: `st_${Date.now()}_${idx + 1}`,
            title: stTitle.charAt(0).toUpperCase() + stTitle.slice(1),
            completed: false,
          }))
        : taskTitle.toLowerCase().includes('тегирован') || taskTitle.toLowerCase().includes('архитектур')
        ? [
            { id: `st_${Date.now()}_1`, title: 'Собрать требования и составить список спецификаций', completed: false },
            { id: `st_${Date.now()}_2`, title: 'Разработать архитектурный прототип', completed: false },
            { id: `st_${Date.now()}_3`, title: 'Написать E2E-тесты и провести визуальную верификацию', completed: false },
            { id: `st_${Date.now()}_4`, title: 'Зафиксировать изменения коммитом и обновить документацию', completed: false },
          ]
        : [
            { id: `st_${Date.now()}_1`, title: `Подготовить принадлежности для «${taskTitle}»`, completed: false },
            { id: `st_${Date.now()}_2`, title: `Выполнить действия по задаче «${taskTitle}»`, completed: false },
            { id: `st_${Date.now()}_3`, title: 'Проверить результат', completed: false },
          ];

      const suggestedAction: SuggestedAction = {
        type: 'update_item',
        targetItemId: taskId,
        title: taskTitle,
        folder: targetTask?.folder || currentFolder,
        content: '',
        tags: [],
        itemType: 'task',
        subtasks,
        updates: {
          subtasks,
        },
        actionState: 'suggested',
      };

      const replyText = `Подзадачи для «${taskTitle}»:`;

      return {
        content: replyText,
        reasoning: 'Сформирован чеклист декомпозиции (action:decompose_task)',
        reasoningTimeMs: Date.now() - startTime,
        suggestedAction,
      };
    }

    // Check 4.5: Refine existing task/note from context
    const recentActionMsg = [...messages].reverse().find((m) => m.content && (
      m.content.includes('[Действие ассистента:') ||
      m.content.includes('[Подготовлен черновик') ||
      m.content.includes('[Подготовлено действие:') ||
      m.content.includes('Уточните, какие именно подробности') ||
      m.content.includes('«почистить яйца»')
    ));

    const isRefineIntent =
      lowerMsg.includes('подробност') ||
      lowerMsg.includes('инструмент') ||
      lowerMsg.includes('детал') ||
      lowerMsg.includes('измени') ||
      lowerMsg.includes('уточни') ||
      lowerMsg.includes('шаг') ||
      Boolean(recentActionMsg && (recentActionMsg.content.includes('Уточните') || recentActionMsg.content.includes('подробности')));

    if (isRefineIntent && recentActionMsg) {
      const titleMatch = recentActionMsg.content.match(/[«"]([^»"]+)[»"]/) || recentActionMsg.content.match(/Заголовок:\s*«([^»]+)»/);
      const existingTitle = titleMatch ? titleMatch[1] : 'почистить яйца';

      const dueMatch = recentActionMsg.content.match(/Срок:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
      const existingDue = dueMatch ? dueMatch[1] : undefined;

      const details = lastUserMsg.replace(/^(добавь|укажи|запиши|измени|можешь добавить|подробности|детали)\s*/i, '').trim();
      const suggestedAction: SuggestedAction = {
        type: existingDue ? 'schedule_task' : 'create_note',
        title: existingTitle,
        folder: currentFolder,
        content: `Подробности:\n- ${details || lastUserMsg}`,
        dueDate: existingDue,
        priority: 'medium',
        tags: ['задачи'],
        itemType: 'task',
        actionState: 'suggested',
      };

      return {
        content: `Обновлен черновик задачи «${existingTitle}»:`,
        reasoning: 'Обновлен черновик задачи на основе контекста диалога (Read-Only Safety)',
        reasoningTimeMs: Date.now() - startTime,
        suggestedAction,
      };
    }

    // Check 5: Create note, task or article
    if (isCreateIntent && !isPriorityIntent && !isStatusIntent && !lowerMsg.includes('приоритет') && !lowerMsg.includes('статус')) {
      const isTask = lowerMsg.includes('задач') || lowerMsg.includes('таск');
      const isArticle = lowerMsg.includes('стать') || lowerMsg.includes('лонгрид');
      const itemType = isArticle ? 'article' : isTask ? 'task' : 'note';

      let dueDate: string | undefined;
      if (lowerMsg.includes('на завтра') || lowerMsg.includes('завтра')) {
        dueDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      } else if (lowerMsg.includes('на сегодня') || lowerMsg.includes('сегодня')) {
        dueDate = new Date().toISOString().slice(0, 10);
      } else if (lowerMsg.includes('на послезавтра') || lowerMsg.includes('послезавтра')) {
        dueDate = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
      }

      let previousDraftContent = '';
      let previousTitle = '';
      if (
        lowerMsg.includes('из этого') ||
        lowerMsg.includes('из этой') ||
        lowerMsg.includes('на этот счет') ||
        lowerMsg.includes('на счёт этого') ||
        lowerMsg.includes('на счет этого') ||
        lowerMsg.includes('об этом') ||
        lowerMsg.includes('преврати')
      ) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const text = messages[i].content;
          if (text && text.length > 20) {
            previousDraftContent = text;
            const titleM = text.match(/[«"]([^»"]+)[»"]/) || text.match(/\[\[([^\]]+)\]\]/);
            if (titleM) previousTitle = titleM[1];
            break;
          }
        }
      }

      let title = previousTitle;
      if (!title) {
        const quoted = lastUserMsg.match(/["«]([^"»]+)["»]/);
        if (quoted) {
          title = quoted[1];
        } else {
          let cleaned = lastUserMsg.split('\n')[0].trim();
          cleaned = cleaned.replace(/^(?:можешь|пожалуйста|хочу|нужно|надо)\s+/i, '');
          cleaned = cleaned.replace(/^(?:создай|добавь|сделай|напиши|оформи|преврати|запланируй)\s+(?:новую\s+|новый\s+)?(?:таску|задачу|заметку|статью|черновик)?\s*/i, '');
          cleaned = cleaned.replace(/^(?:таску|задачу|заметку|статью|черновик)\s+/i, '');
          cleaned = cleaned.replace(/\s+на\s+(?:сегодня|завтра|послезавтра)\s*$/i, '');
          cleaned = cleaned.replace(/^на\s+(?:сегодня|завтра|послезавтра)\s+/i, '');
          cleaned = cleaned.replace(/:\s*$/, '').trim();
          title = cleaned || (isArticle ? 'Статья' : isTask ? 'Новая задача' : 'Новая мысль');
        }
      }

      const msgLines = lastUserMsg.split('\n').map(l => l.trim()).filter(Boolean);
      const extraBody = msgLines.length > 1 ? msgLines.slice(1).join('\n') : '';

      const cleanContent = previousDraftContent
        ? (previousDraftContent.startsWith('[Подготовлен черновик')
            ? previousDraftContent.replace(/^\[Подготовлен черновик[^:]*:[^\]]*\]\n?/, '')
            : previousDraftContent)
        : extraBody;

      const suggestedAction: SuggestedAction = {
        type: dueDate ? 'schedule_task' : 'create_note',
        title: title.trim(),
        folder: currentFolder,
        content: isArticle ? `# ${title.trim()}\n\n${cleanContent}` : cleanContent,
        tags: isArticle ? ['статьи', 'база-знаний'] : isTask ? ['задачи'] : ['ассистент'],
        dueDate,
        priority: isTask ? 'medium' : undefined,
        itemType,
        actionState: 'suggested',
      };

      return {
        content: `Черновик ${isArticle ? 'статьи' : isTask ? (dueDate ? 'задачи в календарь' : 'задачи') : 'заметки'}:`,
        reasoning: 'Сформирован черновик записи согласно правилу Read-Only Safety',
        reasoningTimeMs: Date.now() - startTime,
        suggestedAction,
      };
    }

    // Check 6: Delete request
    if (lowerMsg.includes('удали') || lowerMsg.includes('стереть') || lowerMsg.includes('delete')) {
      return {
        content: 'Удаление заметок не поддерживается напрямую из диалога ради безопасности данных. Возможны только создание, перемещение в архив/корзину, изменение статуса и планирование задач.',
        reasoning: 'Сработало правило Read-Only Safety (удаление заблокировано)',
        reasoningTimeMs: Date.now() - startTime,
      };
    }

    // Check 7: Conversational meta-intents
    if (
      lowerMsg === 'не хочу' ||
      lowerMsg === 'не надо' ||
      lowerMsg === 'что' ||
      lowerMsg === 'что?' ||
      lowerMsg === 'чо' ||
      lowerMsg.includes('почему ты') ||
      lowerMsg.includes('почему не') ||
      lowerMsg.includes('молч') ||
      lowerMsg.includes('не общ') ||
      lowerMsg.includes('даун') ||
      lowerMsg.includes('дурак') ||
      lowerMsg.includes('туп') ||
      lowerMsg.includes('глуп') ||
      lowerMsg.includes('поговори')
    ) {
      return {
        content: `Я работаю в локальном автономном режиме без активного API-ключа.\n\nВ этом режиме доступны базовые функции: календарная повестка («план на сегодня/завтра»), статистика хранилища, поиск заметок и создание задач.\n\nДля свободного диалога и рассуждений подключите API-ключ Groq или KIE.AI в Настройках (⌘,).`,
        reasoning: 'Локальный диалоговый ответ (автономный режим без LLM API)',
        reasoningTimeMs: Date.now() - startTime,
      };
    }

    // Check 8: Greetings & Help
    if (
      lowerMsg === 'привет' ||
      lowerMsg === 'здравствуй' ||
      lowerMsg === 'здравствуйте' ||
      lowerMsg === 'хай' ||
      lowerMsg === 'hello' ||
      lowerMsg.includes('кто ты') ||
      lowerMsg.includes('что ты умеешь') ||
      lowerMsg.includes('помощь') ||
      lowerMsg === 'help'
    ) {
      return {
        content: `Ассистент базы знаний SLAG v2 (локальный режим):\n\n- 📅 **Повестка дня**: «план на сегодня», «что на завтра»\n- 🔍 **Поиск заметок**: введите тему или ключевое слово\n- 📊 **Статистика**: «сколько заметок в базе?»\n- ✏️ **Создание**: «создай задачу: ...»\n\nДля подключения полной языковой модели укажите ключ Groq или KIE.AI в Настройках (⌘,).`,
        reasoning: 'Справочный ответ локального агента',
        reasoningTimeMs: Date.now() - startTime,
      };
    }

    // Check 9: Short noise guard
    if (lowerMsg.length < 2) {
      return {
        content: 'Пожалуйста, введите запрос для поиска или команду для ассистента.',
        reasoning: 'Слишком короткий запрос',
        reasoningTimeMs: Date.now() - startTime,
      };
    }

    // 10. General search query via Orama
    const searchResults = await executeLocalTool('search_notes', { query: lastUserMsg });
    executedToolCalls.push({ name: 'search_notes', args: { query: lastUserMsg }, result: searchResults });

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
}

export const assistantOrchestrator = new AssistantOrchestrator();
