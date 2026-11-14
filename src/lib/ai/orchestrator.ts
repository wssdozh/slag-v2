// Runs the assistant loop: prompt, model turn, local tools, until the reply is final.
import type { ChatToolCall, BatchUpdateItem, SuggestedAction } from '../../types';
import type {
  AdapterTurnHistoryItem,
  LlmAdapterTurnResponse,
  SendAssistantChatParams,
  SendAssistantChatResult,
} from './types';
import { resolveAiTarget, resolveKieEndpoint } from './aiClient';
export { resolveKieEndpoint, resolveAiTarget };
import { storage } from '../storage';
import { logger } from '../logger/logger';
import { DEFAULT_INBOX_FOLDER, AI_LIMITS } from '../../config';
import { extractActionBlock } from './actionParser';
export { extractActionBlock, cleanSnippetText } from './actionParser';
import { buildSystemPrompt } from './prompt';
import { createLocalToolExecutor } from './tools';
import { getCanonicalTools } from './toolDefinitions';
import { runLocalFallbackAgent } from './fallback';
import { memoryService } from '../memory';

const aiLog = logger.scope('AI');

export type { SendAssistantChatParams, SendAssistantChatResult } from './types';

/**
 * Parent Assistant Orchestrator.
 * Defines core assistant behavior, canonical tools, multi-round execution loop,
 * and delegates to OpenAI or Anthropic protocol adapters.
 */
export class AssistantOrchestrator {
  async runChat(params: SendAssistantChatParams): Promise<SendAssistantChatResult> {
    const { messages, currentFolder, settings, folders, allItems, toolAllowlist, channel, facts } = params;
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
    // A telegram question is answered by a narrower set: whatever the relay forwarded must not be
    // able to pull a note body out of a tool the person did not opt into.
    const canonicalTools = toolAllowlist
      ? getCanonicalTools(settings.webSearchEnabled).filter((tool) => toolAllowlist.includes(tool.name))
      : getCanonicalTools(settings.webSearchEnabled);

    // What the assistant already knows, best matches for this turn. The counters are touched
    // here and persisted at most every ten minutes: rehearsal is what lifts a fact that keeps
    // mattering above one that was merely written once.
    const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const memory = memoryService.forPrompt(
      `${lastUserText} ${currentFolder} ${folderMeta?.description ?? ''}`.trim()
    );
    memoryService.touch(memory.map((item) => item.id));
    const memoryTags = memoryService.tagsForPrompt();

    const workspace = storage.getWorkspaceState();
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
      memory,
      memoryTags,
      channel,
      // Written by the owner in settings and carried in the vault, so the assistant keeps one
      // voice across devices and the telegram bot answers like the app does.
      customPrompt: workspace.aiPrompt,
      persona: workspace.aiPersona,
      personaEnabled: workspace.aiPersonaEnabled,
      // A telegram question in "minimal" mode has no search tool at all: the model is told to
      // say that instead of dressing a vault-stats count up as an answer.
      notesRestricted: Boolean(toolAllowlist) && !toolAllowlist?.includes('search_notes'),
      // Everything the model may know about the vault, counted here. A tool-less turn is a single
      // model call; the alternative — call, tool, call — doubled the wait in the bot.
      facts,
      // No tools in the payload means no instructions about calling them either.
      toolsEnabled: canonicalTools.length > 0,
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
          // In telegram these templates read as a robot reading a database dump: the person asked
          // a question and got a stats line. Say honestly that the answer did not come out.
          if (channel === 'telegram') {
            finalContent = 'Не смог ответить на этот вопрос — сформулируй иначе.';
          } else {
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
    const localResult = await runLocalFallbackAgent({
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

}

export const assistantOrchestrator = new AssistantOrchestrator();
