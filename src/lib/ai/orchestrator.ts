import type { SlagItem, FolderMeta, AiSettings, SuggestedAction, ChatToolCall, BatchUpdateItem, ItemUpdates } from '../../types';
import type {
  AssistantToolDefinition,
  AdapterTurnHistoryItem,
  LlmProtocolAdapter,
  LlmAdapterTurnResponse,
} from './types';
import { OpenAiChatAdapter } from './adapters/openAiAdapter';
import { AnthropicMessagesAdapter } from './adapters/anthropicAdapter';
import { OpenAiResponsesAdapter } from './adapters/openAiResponsesAdapter';
import { storage } from '../storage';
import { querySearch, getSearchableAttachmentText } from '../searchService';
import { serializeItemToMarkdown } from '../markdownSerializer';
import { logger } from '../logger';
import { parseTodoistInput } from '../todoistTaskParser';
import { ITEM_UPDATES_SCHEMA } from '../itemSchema';

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
export function cleanSnippetText(text: string, maxLen = 140): string {
  if (!text) return '';
  return text
    .replace(/#+\s*/g, '')
    .replace(/[-*]\s+/g, '')
    .replace(/\d+\.\s+/g, '')
    .replace(/---[-*]*/g, ' ')
    .replace(/[`~_>|]/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Parses embedded action block from assistant response (create_note, schedule_task, reschedule_task, update_task_status, decompose_task, move_note)
 */
export function extractActionBlock(text: string): { cleanText: string; suggestedAction?: SuggestedAction } {
  // Matches ```action:name, ```json:name, ```action, ```json or ```\n{...}
  const actionRegex = /```(?:action:?([\w_]+)|json:?([\w_]+)?|([\w_]+))?\s*\n?(\{[\s\S]*?\})\s*```/i;
  const match = text.match(actionRegex);

  if (match) {
    try {
      const tagAction = (match[1] || match[2] || match[3] || '').trim();
      const jsonStr = match[4] || (match[1]?.startsWith('{') ? match[1] : undefined);
      if (!jsonStr) return { cleanText: text };
      const parsed = JSON.parse(jsonStr);
      const cleanText = text.replace(match[0], '').trim();
      const actionKind = parsed.action || tagAction;

      if (actionKind === 'batch_update' || actionKind === 'batch_update_items' || actionKind === 'batch_reschedule' || actionKind === 'batch_reschedule_tasks' || Array.isArray(parsed.items)) {
        const batchItems: BatchUpdateItem[] = Array.isArray(parsed.items)
          ? parsed.items.map((it: any) => ({
              targetItemId: it.targetItemId || it.id || '',
              title: it.title || 'Задача',
              updates: it.updates || {
                dueDate: it.dueDate,
                reminder: it.reminder,
                priority: ['none', 'low', 'medium', 'high'].includes(it.priority) ? it.priority : undefined,
                status: it.status,
              },
              reason: it.reason,
            }))
          : [];
        if (batchItems.length > 0) {
          return {
            cleanText,
            suggestedAction: {
              type: 'batch_update',
              title: parsed.title || `Перенос задач (${batchItems.length})`,
              folder: parsed.folder || 'Входящие',
              content: '',
              tags: [],
              itemType: 'task',
              batchUpdateItems: batchItems,
            },
          };
        }
      }

      if (actionKind === 'save_item') {
        const hasExistingId = parsed.id || parsed.targetItemId;
        if (hasExistingId) {
          return {
            cleanText,
            suggestedAction: {
              type: 'update_item',
              targetItemId: parsed.id || parsed.targetItemId,
              title: parsed.title || 'Обновление записи',
              folder: parsed.folder || 'Входящие',
              content: parsed.content || '',
              appendContent: parsed.appendContent,
              tags: Array.isArray(parsed.tags) ? parsed.tags : [],
              itemType: parsed.itemType || 'note',
              dueDate: parsed.dueDate,
              reminder: parsed.reminder,
              priority: parsed.priority,
              status: parsed.status,
              updates: parsed.updates || parsed,
            },
          };
        }
        return {
          cleanText,
          suggestedAction: {
            type: 'create_note',
            title: parsed.title || 'Новая запись',
            folder: parsed.folder || 'Входящие',
            content: parsed.content || '',
            appendContent: parsed.appendContent,
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            itemType: ['note', 'task', 'article'].includes(parsed.itemType) ? parsed.itemType : (parsed.dueDate ? 'task' : 'note'),
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: ['none', 'low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : undefined,
            status: parsed.status,
          },
        };
      }

      if (actionKind === 'create_note' || actionKind === 'schedule_task') {
        return {
          cleanText,
          suggestedAction: {
            type: actionKind === 'schedule_task' ? 'schedule_task' : 'create_note',
            title: parsed.title || 'Новая запись',
            folder: parsed.folder || 'Входящие',
            content: parsed.content || '',
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            itemType: ['note', 'task', 'article'].includes(parsed.itemType) ? parsed.itemType : (actionKind === 'schedule_task' ? 'task' : 'note'),
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: ['none', 'low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : undefined,
          },
        };
      }

      if (actionKind === 'update_item') {
        return {
          cleanText,
          suggestedAction: {
            type: 'update_item',
            targetItemId: parsed.targetItemId || parsed.id,
            title: parsed.title || 'Обновление записи',
            folder: parsed.folder || 'Входящие',
            content: parsed.content || '',
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            itemType: parsed.itemType || 'note',
            updates: parsed.updates || parsed,
          },
        };
      }

      if (actionKind === 'reschedule_task' || actionKind === 'update_task_status' || actionKind === 'decompose_task' || actionKind === 'append_to_note' || actionKind === 'move_note') {
        const rawUpdates: ItemUpdates = {};
        if (parsed.dueDate) rawUpdates.dueDate = parsed.dueDate;
        if (parsed.reminder) rawUpdates.reminder = parsed.reminder;
        if (parsed.priority) rawUpdates.priority = parsed.priority;
        if (parsed.status) rawUpdates.status = parsed.status;
        if (parsed.content) rawUpdates.appendContent = parsed.content;
        if (parsed.folder) rawUpdates.folder = parsed.folder;
        if (parsed.subtasks) rawUpdates.subtasks = parsed.subtasks;

        return {
          cleanText,
          suggestedAction: {
            type: 'update_item',
            targetItemId: parsed.targetItemId,
            title: parsed.title || 'Обновление записи',
            folder: parsed.folder || 'Входящие',
            content: parsed.content || '',
            appendContent: parsed.content || undefined,
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: parsed.priority,
            status: parsed.status,
            tags: [],
            itemType: 'task',
            updates: rawUpdates,
          },
        };
      }
    } catch {
      // JSON parse failed, return as is
    }
  }

  // Safeguard against raw pseudo-protocol string leak:
  // e.g. [Действие ассистента: batch_reschedule_tasks | ... | Параметры: {"items":[...]}]
  const pseudoActionRegex = /\[Действие ассистента:\s*([\w_]+)\s*\|[^|]*\|[^|]*Параметры:\s*(\{[\s\S]*?\})\s*\]/i;
  const pseudoMatch = text.match(pseudoActionRegex);
  if (pseudoMatch) {
    try {
      const actionName = pseudoMatch[1].trim();
      const params = JSON.parse(pseudoMatch[2]);
      const cleanText = text.replace(pseudoMatch[0], '').trim();

      if (actionName === 'batch_update_items' || actionName === 'batch_update' || actionName === 'batch_reschedule_tasks' || actionName === 'batch_reschedule') {
        const batchItems: BatchUpdateItem[] = Array.isArray(params.items)
          ? params.items.map((it: any) => ({
              targetItemId: it.targetItemId || it.id || '',
              title: it.title || 'Задача',
              updates: it.updates || {
                dueDate: it.dueDate,
                reminder: it.reminder,
                priority: it.priority,
                status: it.status,
              },
              reason: it.reason,
            }))
          : [];
        return {
          cleanText,
          suggestedAction: {
            type: 'batch_update',
            title: `Перенос задач (${batchItems.length})`,
            folder: 'Входящие',
            content: '',
            tags: [],
            itemType: 'task',
            batchUpdateItems: batchItems,
          },
        };
      }
    } catch {
      // Ignore fallback error
    }
  }

  return { cleanText: text };
}

/**
 * Resolves full chat completions endpoint for KIE.AI.
 * For Gemini models, routes to dedicated /{model}/v1/chat/completions.
 */
export function resolveKieEndpoint(baseUrl?: string, model?: string): string {
  const clean = (baseUrl || 'https://api.kie.ai').replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions') || clean.endsWith('/messages') || clean.endsWith('/responses')) return clean;

  const m = (model || '').toLowerCase();
  if (m.startsWith('claude-')) {
    return `${clean}/anthropic/v1/messages`;
  }

  if (m.includes('deepseek')) {
    return `${clean}/openai/v1/responses`;
  }

  return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

/**
 * Parent Assistant Orchestrator.
 * Defines core assistant behavior, canonical tools, multi-round execution loop,
 * and delegates to OpenAI or Anthropic protocol adapters.
 */
export class AssistantOrchestrator {
  async runChat(params: SendAssistantChatParams): Promise<SendAssistantChatResult> {
    const { messages, currentFolder, settings, folders, allItems } = params;
    const isInbox = currentFolder === 'Входящие';
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
    const executeLocalTool = async (name: string, args: Record<string, any>): Promise<any> => {
      if (name === 'search_notes') {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        const requestedType = args.type && args.type !== 'all' ? args.type : undefined;
        const folderFilter = isInbox ? args.folder : currentFolder;

        // Base search pool: text query or type filter
        let pool = query
          ? await querySearch(query, allItems, requestedType)
          : allItems.filter((i) => (!requestedType ? true : i.type === requestedType));

        // Deduplicate pool by ID
        pool = Array.from(new Map(pool.map((item) => [item.id, item])).values());

        // Folder scoping
        if (folderFilter && folderFilter !== 'Входящие' && folderFilter !== 'all') {
          pool = pool.filter((i) => i.folder === folderFilter || i.folder.startsWith(folderFilter + '/'));
        }

        // Timeframe filtering
        const tf = (args.timeframe || 'all').toLowerCase();
        const todayMidnight = new Date().setHours(0, 0, 0, 0);
        const yesterdayMidnight = todayMidnight - 86400000;
        const now = Date.now();

        if (tf === 'today') {
          pool = pool.filter((i) => {
            const t = Math.max(i.createdAt || 0, i.updatedAt || 0);
            return t >= todayMidnight;
          });
        } else if (tf === 'yesterday') {
          pool = pool.filter((i) => {
            const t = Math.max(i.createdAt || 0, i.updatedAt || 0);
            return t >= yesterdayMidnight && t < todayMidnight;
          });
        } else if (tf === 'week') {
          const weekAgo = now - 7 * 86400000;
          pool = pool.filter((i) => Math.max(i.createdAt || 0, i.updatedAt || 0) >= weekAgo);
        } else if (tf === 'month') {
          const monthAgo = now - 30 * 86400000;
          pool = pool.filter((i) => Math.max(i.createdAt || 0, i.updatedAt || 0) >= monthAgo);
        }

        // Sorting
        const defaultSort = (tf === 'today' || tf === 'yesterday' || !query) ? 'recent' : 'relevance';
        const sortBy = (args.sortBy || defaultSort).toLowerCase();
        if (sortBy === 'recent') {
          pool.sort((a, b) => Math.max(b.createdAt || 0, b.updatedAt || 0) - Math.max(a.createdAt || 0, a.updatedAt || 0));
        } else if (sortBy === 'oldest') {
          pool.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        }

        // Limit
        const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 15);
        pool = pool.slice(0, limit);

        return pool.map((item) => {
          const bodySnippet = cleanSnippetText(item.content || '', 140);
          const attachSnippet = cleanSnippetText(getSearchableAttachmentText(item.attachments), 100);
          let snippet = bodySnippet;
          if (attachSnippet) {
            snippet = snippet ? `${snippet} [Вложения: ${attachSnippet}]` : `[Вложения: ${attachSnippet}]`;
          }

          const itemTime = Math.max(item.createdAt || 0, item.updatedAt || 0);
          let dateStr = new Date(itemTime || now).toISOString().slice(0, 10);
          if (itemTime >= todayMidnight) {
            dateStr = `Сегодня, ${new Date(itemTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
          } else if (itemTime >= yesterdayMidnight) {
            dateStr = `Вчера, ${new Date(itemTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
          }

          return {
            id: item.id,
            title: item.title,
            type: item.type,
            folder: item.folder,
            date: dateStr,
            tags: item.tags || [],
            ...(item.type === 'task' ? { status: item.status, priority: item.priority || 'medium', dueDate: item.dueDate } : {}),
            snippet: snippet || '(пусто)',
          };
        });
      }

      if (name === 'read_note') {
        const targetQuery = String(args.id || '').toLowerCase().trim();
        let note = allItems.find((i) => i.id === targetQuery || i.title.toLowerCase() === targetQuery);
        if (!note) {
          const cleanTitle = targetQuery.replace(/^\[\[|\]\]$/g, '').trim();
          note = allItems.find((i) => i.title.toLowerCase() === cleanTitle || i.title.toLowerCase().includes(cleanTitle));
        }
        if (!note) return { error: `Заметка с ID/названием "${args.id}" не найдена` };

        let markdown = serializeItemToMarkdown(note);
        const enriched = (note.attachments || []).filter(a => a.extractedText || a.summary);
        if (enriched.length > 0) {
          const attachBlock = enriched.map(att => {
            const icon = att.type === 'audio' ? '🎙' : att.type === 'image' ? '🖼' : '📄';
            const label = att.summary ? `**${att.name}** (Суть: ${att.summary})` : `**${att.name}**`;
            const text = att.extractedText ? `\n> ${att.extractedText.replace(/\n/g, '\n> ')}` : '';
            return `- ${icon} ${label}${text}`;
          }).join('\n');
          markdown = `${markdown}\n\n### Вложения и расшифровки\n${attachBlock}`;
        }

        return {
          id: note.id,
          title: note.title,
          folder: note.folder,
          markdown: markdown.slice(0, 4500),
          attachments: (note.attachments || []).map(att => ({
            name: att.name,
            type: att.type,
            summary: att.summary,
            extractedText: att.extractedText ? att.extractedText.slice(0, 300) : undefined,
          })),
        };
      }

      if (name === 'get_vault_stats') {
        return storage.getVaultStats(isInbox ? undefined : currentFolder);
      }

      if (name === 'get_calendar_agenda') {
        const today = new Date().toISOString().slice(0, 10);
        const targetDate = args.date || today;
        const tasks = allItems.filter((i) => {
          if (i.type !== 'task') return false;
          if (!isInbox && i.folder !== currentFolder && !i.folder.startsWith(currentFolder + '/')) return false;
          return true;
        });

        const overdue = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today);
        const scheduledOnDate = tasks.filter((t) => t.dueDate === targetDate);
        const unscheduled = tasks.filter((t) => t.status !== 'done' && !t.dueDate);

        return {
          targetDate,
          overdueCount: overdue.length,
          overdueTasks: overdue.slice(0, 5).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority })),
          scheduledCount: scheduledOnDate.length,
          scheduledTasks: scheduledOnDate.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            reminder: t.reminder,
            subtasksCount: t.subtasks?.length || 0,
          })),
          unscheduledCount: unscheduled.length,
        };
      }

      // Action tools for Read-Only Safety: unified save_item + backward compatibility for create_note, schedule_task, update_item
      if (name === 'save_item' || name === 'create_note' || name === 'schedule_task' || name === 'update_item') {
        const rawTitle = String(args.title || '').trim();
        const rawId = String(args.id || args.targetItemId || '').trim();
        const rawUpdates: ItemUpdates = args.updates || {};

        // Merge flat parameters and nested updates
        const content = args.content !== undefined ? args.content : rawUpdates.content;
        const appendContent = args.appendContent || rawUpdates.appendContent;
        const folder = args.folder || rawUpdates.folder;
        const itemType = args.itemType || (rawUpdates as any).type || (name === 'schedule_task' ? 'task' : undefined);
        const tags = args.tags || rawUpdates.tags;
        let dueDate = args.dueDate !== undefined ? args.dueDate : rawUpdates.dueDate;
        let reminder = args.reminder !== undefined ? args.reminder : rawUpdates.reminder;
        let priority = args.priority || rawUpdates.priority;
        const status = args.status || rawUpdates.status;
        const subtasks = args.subtasks || rawUpdates.subtasks;

        const dueDateText = args.dueDateText || (rawUpdates as any).dueDateText;
        if (dueDateText) {
          const parsed = parseTodoistInput(dueDateText);
          if (parsed.dueDate) dueDate = parsed.dueDate;
          if (parsed.reminder) reminder = parsed.reminder;
          if (parsed.priority) priority = parsed.priority;
        }

        const titleQuery = rawTitle.toLowerCase();
        // Determine whether target item already exists
        const found = rawId
          ? allItems.find((i) => i.id === rawId || i.title.toLowerCase() === rawId.toLowerCase())
          : (name === 'update_item' || args.actionLabel || (titleQuery && (status || appendContent || (priority && !dueDate))))
            ? allItems.find((i) => i.title.toLowerCase() === titleQuery || i.title.toLowerCase().includes(titleQuery) || titleQuery.includes(i.title.toLowerCase()))
            : null;

        if (name === 'update_item' && !found) {
          const available = allItems.slice(0, 5).map(t => `«${t.title}» (id: ${t.id})`);
          return {
            error: `Запись не найдена по запросу "${args.title || args.targetItemId || args.id}". Доступные записи: ${available.join(', ') || 'нет записей'}. Уточните title или targetItemId.`,
          };
        }

        if (found) {
          // UPDATE BRANCH
          if (reminder && !reminder.includes('T')) {
            const effectiveDate = dueDate || found.dueDate || new Date().toISOString().slice(0, 10);
            dueDate = effectiveDate;
            const time = reminder.trim();
            reminder = `${effectiveDate}T${time.length === 5 ? time : time.slice(0, 5)}:00`;
          }

          let actionLabel = args.actionLabel || (rawUpdates as any).actionLabel;
          if (!actionLabel) {
            if (appendContent) actionLabel = 'Дополнение заметки';
            else if (dueDate !== undefined) actionLabel = dueDate ? 'Перенос срока' : 'Снятие срока';
            else if (priority) actionLabel = `Приоритет ➔ ${priority.toUpperCase()}`;
            else if (status) actionLabel = `Статус ➔ ${status}`;
            else if (folder) actionLabel = 'Перемещение записи';
            else actionLabel = 'Обновление записи';
          }

          const resolvedUpdates: ItemUpdates = {
            ...rawUpdates,
            title: rawTitle || found.title,
            content: content !== undefined ? content : undefined,
            appendContent,
            folder: folder || found.folder,
            type: itemType || found.type,
            dueDate: dueDate !== undefined ? (dueDate || undefined) : undefined,
            reminder: reminder !== undefined ? (reminder || undefined) : undefined,
            priority,
            status,
            tags: tags || found.tags,
            subtasks: Array.isArray(subtasks)
              ? subtasks.map((st: any, idx: number) => typeof st === 'string' ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false } : st)
              : undefined,
          };

          const formattedSubtasks = Array.isArray(resolvedUpdates.subtasks)
            ? resolvedUpdates.subtasks.map((st: any, idx: number) =>
                typeof st === 'string'
                  ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false }
                  : { id: st.id || `st_${Date.now()}_${idx}`, title: st.title || '', completed: Boolean(st.completed) }
              )
            : undefined;

          capturedActions.push({
            type: 'update_item',
            targetItemId: found.id,
            title: found.title,
            actionLabel,
            folder: resolvedUpdates.folder || found.folder,
            content: resolvedUpdates.content || '',
            appendContent: resolvedUpdates.appendContent,
            tags: resolvedUpdates.tags || found.tags || [],
            itemType: resolvedUpdates.type || found.type,
            dueDate: resolvedUpdates.dueDate || undefined,
            reminder: resolvedUpdates.reminder || undefined,
            priority: resolvedUpdates.priority,
            status: resolvedUpdates.status,
            subtasks: formattedSubtasks,
            updates: resolvedUpdates,
            actionState: 'suggested',
          });

          return {
            status: 'proposed',
            message: `Изменения для «${found.title}» подготовлены. В интерфейсе пользователю отображена интерактивная карточка подтверждения. Завершите ответ подтверждением.`,
          };
        }

        // CREATE BRANCH
        if (reminder && !reminder.includes('T') && dueDate) {
          reminder = `${dueDate}T${reminder}:00`;
        }

        const effectiveType = itemType || (name === 'schedule_task' || dueDate ? 'task' : 'note');

        capturedActions.push({
          type: 'create_note',
          title: rawTitle || 'Новая запись',
          folder: folder || currentFolder,
          content: content || appendContent || '',
          dueDate,
          reminder,
          priority: priority || (effectiveType === 'task' ? 'medium' : undefined),
          status: status || (effectiveType === 'task' ? 'todo' : undefined),
          tags: Array.isArray(tags) ? tags : [],
          itemType: effectiveType,
          subtasks: Array.isArray(subtasks)
            ? subtasks.map((st: any, idx: number) => typeof st === 'string' ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false } : st)
            : undefined,
          actionState: 'suggested',
        });

        const typeLabel = effectiveType === 'task' ? 'задачи' : (effectiveType === 'article' ? 'статьи' : 'заметки');
        return {
          status: 'proposed',
          message: `Черновик ${typeLabel} «${rawTitle || 'Новая запись'}» подготовлен к сохранению в хранилище. В интерфейсе пользователю отображена карточка подтверждения. Завершите ответ кратким подтверждением.`,
        };
      }

      if (name === 'batch_update_items') {
        const rawItems = Array.isArray(args.items) ? args.items : [];
        if (rawItems.length === 0) {
          return {
            error: 'Список записей для обновления пуст. Передайте массив items с объектами { targetItemId?, title?, updates }.',
          };
        }

        const resolvedItems: BatchUpdateItem[] = [];
        const missing: string[] = [];

        for (const item of rawItems) {
          const tId = String(item.targetItemId || '').trim();
          const tTitle = String(item.title || '').trim().toLowerCase();
          const target = allItems.find((i) =>
            (tId && i.id === tId) ||
            (tTitle && (i.title.toLowerCase() === tTitle || i.title.toLowerCase().includes(tTitle) || tTitle.includes(i.title.toLowerCase())))
          );

          if (!target) {
            missing.push(item.title || item.targetItemId || 'неизвестная');
            continue;
          }

          const rawUpdates: ItemUpdates = item.updates || {};
          if ((rawUpdates as any).dueDateText) {
            const parsed = parseTodoistInput((rawUpdates as any).dueDateText);
            if (parsed.dueDate) rawUpdates.dueDate = parsed.dueDate;
            if (parsed.reminder) rawUpdates.reminder = parsed.reminder;
            if (parsed.priority) rawUpdates.priority = parsed.priority;
          }

          if (rawUpdates.reminder && !rawUpdates.reminder.includes('T')) {
            const effectiveDate = rawUpdates.dueDate || target.dueDate || new Date().toISOString().slice(0, 10);
            rawUpdates.dueDate = effectiveDate;
            const time = rawUpdates.reminder.trim();
            rawUpdates.reminder = `${effectiveDate}T${time.length === 5 ? time : time.slice(0, 5)}:00`;
          }

          resolvedItems.push({
            targetItemId: target.id,
            title: target.title,
            updates: rawUpdates,
            reason: item.reason,
          });
        }

        if (resolvedItems.length === 0) {
          const available = allItems.slice(0, 5).map(t => `«${t.title}» (id: ${t.id})`);
          return {
            error: `Ни одна из указанных записей не найдена (${missing.join(', ')}). Доступные записи: ${available.join(', ')}. Вызовите batch_update_items с точными названиями или id из этого списка.`,
          };
        }

        const hasDueDate = resolvedItems.some(i => i.updates?.dueDate !== undefined);
        const hasPriority = resolvedItems.some(i => i.updates?.priority !== undefined);
        const hasStatus = resolvedItems.some(i => i.updates?.status !== undefined);
        let defaultBatchTitle = `Пакетное обновление (${resolvedItems.length})`;
        if (hasDueDate && !hasPriority && !hasStatus) {
          defaultBatchTitle = `Перенос задач (${resolvedItems.length})`;
        } else if (hasPriority && !hasDueDate) {
          defaultBatchTitle = `Изменение приоритета (${resolvedItems.length})`;
        } else if (hasStatus && !hasDueDate) {
          defaultBatchTitle = `Смена статуса (${resolvedItems.length})`;
        }

        capturedActions.push({
          type: 'batch_update',
          title: args.title || defaultBatchTitle,
          actionLabel: args.title || defaultBatchTitle,
          folder: currentFolder,
          content: '',
          tags: [],
          itemType: 'task',
          batchUpdateItems: resolvedItems,
          actionState: 'suggested',
        });

        return {
          status: 'proposed',
          message: `Подготовлено пакетное обновление для ${resolvedItems.length} записей. В интерфейсе пользователю отображена карточка подтверждения со списком предложенных изменений. Завершите ответ кратким резюме.`,
        };
      }

      if (name === 'filter_feed') {
        let matchedItems: SlagItem[] = [];
        const rawIds = Array.isArray(args.itemIds) ? args.itemIds : [];
        const rawTitles = Array.isArray(args.itemTitles) ? args.itemTitles : [];

        if (rawIds.length > 0) {
          matchedItems = allItems.filter(i => rawIds.includes(i.id));
        } else if (rawTitles.length > 0) {
          matchedItems = allItems.filter(i =>
            rawTitles.some((t: string) => i.title.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(i.title.toLowerCase()))
          );
        } else {
          matchedItems = allItems.slice(0, 5);
        }

        const queryLabel = args.queryLabel || 'Выборка ассистента';
        capturedFeedFilter = {
          itemIds: matchedItems.map(i => i.id),
          queryLabel,
        };

        return {
          status: 'applied',
          count: matchedItems.length,
          message: `В ленте активирован фильтр ИИ «${queryLabel}» (${matchedItems.length} записей).`,
        };
      }

      if (name === 'web_search') {
        return {
          query: args.query,
          info: `Внешний поиск выполнен: результаты по запросу "${args.query}"`,
        };
      }

      return { error: `Неизвестный инструмент: ${name}` };
    };

    // Canonical Tool Definitions
    const canonicalTools: AssistantToolDefinition[] = [
      {
        name: 'search_notes',
        description: 'Полнотекстовый нечеткий поиск по заметкам, таскам, статьям с фильтрацией по времени, типу и папке. Возвращает список совпадений с датой создания, типом, статусом и краткой сутью.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Поисковый запрос (1-3 ключевых слова). Для запросов "все записи за сегодня" или "последние заметки" query можно оставить пустым или передать тему.',
            },
            timeframe: {
              type: 'string',
              enum: ['all', 'today', 'yesterday', 'week', 'month'],
              description: 'Временной фильтр. Для запросов "последние за сегодня", "что создал сегодня" передавай "today", для "вчера" — "yesterday", для "за неделю" — "week".',
            },
            type: {
              type: 'string',
              enum: ['all', 'note', 'task', 'article'],
              description: 'Тип записей: note (заметки), task (задачи), article (статьи), all (любые).',
            },
            folder: {
              type: 'string',
              description: 'Папка для ограничения поиска (например "Проекты/Идеи").',
            },
            sortBy: {
              type: 'string',
              enum: ['relevance', 'recent', 'oldest'],
              description: 'Сортировка: "recent" для самых свежих/последних сначала, "relevance" по смысловой релевантности.',
            },
            limit: {
              type: 'number',
              description: 'Максимум записей в ответе (по умолчанию 5, от 1 до 15).',
            },
          },
        },
      },
      {
        name: 'read_note',
        description: 'Прочитать полное содержимое заметки по ее ID или названию (например, после успешного search_notes).',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Идентификатор заметки или точный заголовок' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_vault_stats',
        description: 'Получить сводную статистику по количеству заметок, тасок, статей и частоте тегов.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['all', 'tags', 'folders'], description: 'Что анализировать' },
          },
        },
      },
      {
        name: 'get_calendar_agenda',
        description: 'Получить календарную повестку, список задач на день/дату, просроченные и незапланированные задачи.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Дата в формате YYYY-MM-DD (по умолчанию сегодня)' },
          },
        },
      },
      {
        name: 'save_item',
        description: 'Создать новую или обновить существующую заметку, задачу или статью (паттерн save_*). Если передан id (или точный заголовок существующей записи) — запись обновляется. Если id не передан — создается новая.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID или точный заголовок существующей записи для обновления. Опусти при создании новой записи.' },
            title: { type: 'string', description: 'Заголовок записи' },
            content: { type: 'string', description: 'Содержимое/текст записи в формате Markdown' },
            appendContent: { type: 'string', description: 'Текст для добавления в конец записи (при обновлении)' },
            itemType: { type: 'string', enum: ['note', 'task', 'article'], description: 'Тип записи: note (заметка), task (задача), article (статья)' },
            folder: { type: 'string', description: 'Папка для сохранения или перемещения' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Список тегов без знака #' },
            dueDate: { type: 'string', description: 'Срок выполнения задачи в формате YYYY-MM-DD (или пустая строка для сброса)' },
            dueDateText: { type: 'string', description: 'Естественное описание даты (например, "завтра в 10:00")' },
            reminder: { type: 'string', description: 'Время напоминания или слот дня (например, "10:00", "14:30" или ISO)' },
            priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'], description: 'Приоритет задачи' },
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'done'], description: 'Статус задачи' },
            subtasks: { type: 'array', items: { type: 'string' }, description: 'Список подзадач' },
            actionLabel: { type: 'string', description: 'Краткое название действия в 2-4 слова' },
          },
          required: ['title'],
        },
      },
      {
        name: 'batch_update_items',
        description: 'Пакетное изменение нескольких существующих заметок/задач с индивидуальными параметрами для каждой (перенос дат, смена приоритетов, статусов, распределение нагрузки по времени/дням).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Краткое общее название пакетного действия (например: "Перенос задач на завтра", "Смена приоритетов")' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  targetItemId: { type: 'string', description: 'Идентификатор записи' },
                  title: { type: 'string', description: 'Заголовок записи' },
                  updates: ITEM_UPDATES_SCHEMA,
                  reason: { type: 'string', description: 'Обоснование изменений' },
                },
                required: ['updates'],
              },
              description: 'Список обновлений для каждой записи',
            },
          },
          required: ['items'],
        },
      },
      {
        name: 'filter_feed',
        description: 'Активировать ИИ-фильтр в стрим-ленте заметок, оставив на экране только выбранные записи.',
        parameters: {
          type: 'object',
          properties: {
            itemTitles: { type: 'array', items: { type: 'string' }, description: 'Названия заметок для фильтра' },
            itemIds: { type: 'array', items: { type: 'string' }, description: 'ID заметок для фильтра' },
            queryLabel: { type: 'string', description: 'Текстовая метка фильтра (например "Просроченные задачи" или "Чай")' },
          },
        },
      },
    ];

    if (settings.webSearchEnabled) {
      canonicalTools.push({
        name: 'web_search',
        description: 'Выполнить поиск актуальной информации в глобальной сети Интернет.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Поисковый запрос в веб' },
          },
          required: ['query'],
        },
      });
    }

    // System Prompt with Scope rules
    const systemPrompt = `Ты — персональный ИИ-ассистент базы знаний SLAG v2.
Твой тон: фактологический, лаконичный, без приветствий и канцелярита (Zero-Slop).

БАЗОВЫЕ ПРАВИЛА ЯЗЫКА И ПОСТРОЕНИЯ ПРЕДЛОЖЕНИЙ (СЛОПОТРОН):
1. ЖИВЫЕ ГЛАГОЛЫ ВМЕСТО КАНЦЕЛЯРИТА:
   - Пиши простыми глаголами действия: «перенёс», «разделил», «нашёл», «создал».
   - Запрещены отглагольные конструкции и канцеляризмы: «является», «данный», «осуществлять», «обеспечивать», «в рамках», «в контексте», «позволяет», «способствует».
2. БЕЗ СЛОВЕСНЫХ ЛЕСОВ И САМОКОММЕНТИРОВАНИЯ:
   - Запрещено комментировать свой текст: «Стоит отметить», «Важно подчеркнуть», «В заключение», «Как мы видим», «Подводя итог».
   - Называй сразу факты, без вступительных речевых подводок.
3. БЕЗ ЧАТ-МУСОРА И ФАЛЬШИВОЙ ВЕЖЛИВОСТИ:
   - Запрещено: «Конечно!», «Отличный вопрос!», «Рад помочь», «Надеюсь, было полезно», «Если у вас есть вопросы — обращайтесь». Никаких преамбул и концовок.
4. ЕСТЕСТВЕННЫЙ РУССКИЙ СИНТАКСИС:
   - Одно предложение = одна законченная мысль. Без тяжелых деепричастных конструкций и цепочек родительного падежа (не «для улучшения процесса ведения канала», а «чтобы вести канал»).
   - Без штампов «не просто X, а Y», без искусственных трёхчленов («быстро, просто и эффективно»), без пафосных эпитетов («уникальный», «ключевой», «активно»).

ТЕКУЩЕЕ ВРЕМЯ И КАЛЕНДАРЬ:
- Сегодня: ${todayStr} (${todayDayName})
- Завтра: ${tomorrowStr} (${tomorrowDayName})

АКТУАЛЬНЫЙ СРЕЗ ЗАДАЧ ИЗ ЛОКАЛЬНОЙ БАЗЫ SLAG v2:
- Задачи на сегодня (${tasksToday.length}): ${tasksToday.length > 0 ? tasksToday.map((t) => `«${t.title}» [статус: ${t.status}, приоритет: ${t.priority || 'обычный'}]`).join(', ') : 'нет'}
- Задачи на завтра (${tasksTomorrow.length}): ${tasksTomorrow.length > 0 ? tasksTomorrow.map((t) => `«${t.title}» [статус: ${t.status}, приоритет: ${t.priority || 'обычный'}]`).join(', ') : 'нет'}
- Просроченные задачи (${overdueTasks.length}): ${overdueTasks.length > 0 ? overdueTasks.map((t) => `«${t.title}» [срок: ${t.dueDate}]`).join(', ') : 'нет'}
- Задачи без даты (${unscheduledTasks.length}): ${unscheduledTasks.length > 0 ? unscheduledTasks.slice(0, 5).map((t) => `«${t.title}»`).join(', ') : 'нет'}

КАТЕГОРИЧЕСКИЙ ЗАПРЕТ ВНЕШНИХ СЕРВИСОВ И GOOGLE CALENDAR:
Ты работаешь ИСКЛЮЧИТЕЛЬНО с локальной базой заметок и задач SLAG v2 (Local-First).
В приложении НЕТ Google Calendar, Google Workspace, Apple Calendar или сторонних расширений!
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО упоминать Google Calendar, писать "Чтобы активировать это расширение, вам нужно подключиться к Google Calendar" или предлагать подключение внешних сервисов.
Все данные о задачах на сегодня, завтра и расписание уже предоставлены тебе в блоке «АКТУАЛЬНЫЙ СРЕЗ ЗАДАЧ» выше. Если пользователь спрашивает «чо на завтра», «что на сегодня», «какие дела» — отвечай прямо на основе этого среза!

КОНТЕКСТ ВИДИМОСТИ:
${isInbox
  ? 'ВЫ НАХОДИТЕСЬ ВО «ВХОДЯЩИХ»: вам доступно ВСЕ ХРАНИЛИЩЕ целиком (все папки, таски, статьи).'
  : `ВЫ НАХОДИТЕСЬ В ПАПКЕ: "${currentFolder}" (${folderMeta?.description || 'Тематическая папка'}).
ВАЖНО: Вы можете искать, читать и ссылаться СТРОГО на заметки этой папки!`
}

ПРАВИЛА ОТВЕТА:
1. КОНТЕКСТНЫЕ ССЫЛКИ И АНАФОРА (ПЕРВЫЙ ПРИОРИТЕТ):
   - Если пользователь просит ссылку на заметку или задачу, которая УЖЕ упоминалась в предыдущих сообщениях (например, в повестке календаря, результатах поиска или ответах): «дай мне линк на эту заметку», «дай ссылку на задачу», «ссылку на просроченную» — СТРОГО бери точное название из контекста диалога и отвечай вики-ссылкой: [[Точное название заметки]].
   - В ЭТОМ СЛУЧАЕ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вызывать search_notes! Не выдумывай случайные или искаженные слова для поиска (например, «гидрецифаллизм» и т.п.).

2. МНОГОШАГОВЫЙ АГЕНТНЫЙ ПОИСК (MULTI-STEP AGENTIC WORKFLOW):
   - Заметки могут содержать голосовые аудиозаписи, скриншоты/фотографии и документы. Их расшифровки речи (Whisper), распознанный текст (OCR) и саммари автоматически индексируются в поиске и возвращаются в search_notes.
   - ПОЛНОЦЕННЫЙ ПОИСК (search_notes):
     * При запросах «последние», «свежие», «за сегодня», «за вчера» ОБЯЗАТЕЛЬНО передавай параметры timeframe: "today" | "yesterday" | "week" и sortBy: "recent"!
     * Если пользователь ищет конкретный тип (например «найди задачи про X» или «статьи по Y») — передавай type: "task" или type: "article".
     * Не вызывай read_note ради даты создания! search_notes УЖЕ возвращает точную дату (поле date) и краткую суть для каждой записи.
     * НЕ вызывай read_note на общий поисковый запрос! read_note нужен ТОЛЬКО тогда, когда пользователь прямо просит прочитать, декомпозировать или подробно разобрать конкретный документ.
   - НОРМАЛИЗАЦИЯ ЗАПРОСОВ: При вызове search_notes очищай запрос от стоп-слов («поищи», «как», «вообще», «что») и исправляй опечатки пользователя (например, «прафилам как жить вообще» -> search_notes("правила")). Не копируй опечатки и шум буквально.
   - ФОРМАТ ВЫДАЧИ ПОИСКА (ТОЛЬКО КРАТКАЯ СУТЬ В ОДНО ПРЕДЛОЖЕНИЕ):
     * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вываливать внутренние пункты, списки или подробный текст из найденных заметок, если пользователь прямо не просил раскрыть детали!
     * Формат: ссылка [[Название заметки]] и ровно ОДНО короткое предложение-суть (о чем она).
       Пример: «Нашёл заметку [[Идеи тем для роликов и блогов]] (Личное/Контент) — наброски идей для видео.»
     * Всё! Не вываливай всё содержимое разом. Если пользователю понадобятся конкретные пункты — он сам спросит.
   - get_calendar_agenda: используй для повестки дня, расписания, задач на сегодня/завтра/дату (date: 'YYYY-MM-DD').
   - При вопросах общего характера («что?», «почему?», «не хочу», «поговори со мной», «кто ты?») — отвечай прямо текстом без бессмысленного вызова инструментов.

3. ИНСТРУМЕНТЫ (TOOL CALLING) И ПРАВИЛО READ-ONLY SAFETY:
   - Все действия в приложении (создание, перенос, изменение параметров, декомпозиция) выполняются ИСКЛЮЧИТЕЛЬНО через нативные вызовы инструментов (tool_calls).
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать в текст ответа псевдокод вида action:... или сырой JSON! Вызывай соответствующие функции API (save_item, batch_update_items, filter_feed).
   - Для создания новой заметки/задачи или изменения существующей (приоритет, статус, срок, напоминание, текст, теги, папка) вызывай save_item. При создании id не указывай; при обновлении передавай id существующей записи (или точный заголовок).
   - Для группы записей (перенос нескольких задач, распределение по времени, массовая смена приоритетов или статусов) вызывай batch_update_items.
   - Прямое удаление заметок запрещено политикой безопасности. Если пользователь просит удалить заметку («удали эту заметку»), прямо поясни, что удаление через чат недоступно, но можно предложить перенести её в архив через save_item({ id: targetItemId, actionLabel: 'Архивация записи', status: 'backlog' }).
   - Пользователь увидит интерактивную кнопку подтверждения в чате. Никаких прямых мутаций без клика.

ФИЛЬТРАЦИЯ ЛЕНТЫ:
- Если пользователь пишет «а с фильтром», «покажи в ленте с фильтром», «отфильтруй по этим задачам» — вызови инструмент filter_feed!

ПЛАНИРОВАНИЕ И РАСПРЕДЕЛЕНИЕ ЗАДАЧ:
- Ты обладаешь полной автономностью (ReAct-подход): ты можешь свободно вызывать get_calendar_agenda или search_notes для анализа текущего расписания, либо сразу опираться на блок «АКТУАЛЬНЫЙ СРЕЗ ЗАДАЧ».
- Для планирования и переноса задач вызывай batch_update_items (для группы задач) или save_item (для одной).
- РАСПРЕДЕЛЕНИЕ В ТЕЧЕНИЕ ДНЯ («разбросай в течении дня», «по часам», «в обед»):
  * Сохраняй целевую дату (например, дату сегодняшнего дня, если пользователь пишет «в обед», или завтрашнего дня в формате YYYY-MM-DD).
  * В updates ОБЯЗАТЕЛЬНО передавай и dueDate (целевую дату), и reminder (время слота, например "12:00", "12:30", "13:00")!
  * Расставляй задачи по слотам рабочего дня в поле reminder: например "10:00", "12:00", "14:30", "16:30" (или ISO-время).
  * Задачи с высоким приоритетом (high) ставь на первую половину дня!
- РАСПРЕДЕЛЕНИЕ ПО ДНЯМ («раскидай по дням», «на неделю»):
  * Распределяй задачи на последовательные свободные рабочие дни начиная с завтра (например, Задача 1 на завтра, Задача 2 на послезавтра). Задачи с высоким приоритетом (high) ставь раньше!
- СОСТАВНЫЕ УСЛОВИЯ ПЕРЕНОСА («1. задачу на завтра, остальные две на послезавтра»):
  * СТРОГО вызывай batch_update_items, где каждому объекту в items назначаются свои updates с нужными датами dueDate!

4. РЕАКТИВНОСТЬ НА КОРРЕКТИРОВКИ (FOLLOW-UP REFINEMENT):
   - Если пользователь просит изменить, скорректировать, инвертировать порядок, сдвинуть время или состав ранее предложенных задач («нене порядок инвертировать задом на перёд», «сделай наоборот», «не в 10, а в 12», «поменяй местами», «убери одну», «добавь еще», «да теперь предложи»):
     * ТЫ ОБЯЗАН СРАЗУ ЖЕ ВЫЗВАТЬ соответствующий инструмент (например, batch_update_items или save_item) с обновленными параметрами!
     * НЕ ограничивайся просто текстовым описанием или списком! Всегда сопровождай ответ вызовом инструмента, чтобы в интерфейсе появилась обновленная карточка с кнопкой «Применить».
     * При запросе «инвертировать задом наперед» — переверни список задач и распредели временные слоты (reminder) в обратном порядке (например, задачи с низким приоритетом на более раннее время).

5. РАБОТА С КОНТЕКСТОМ И ТРАНСФОРМАЦИЯ ЧЕРНОВИКОВ:
   - Если пользователь просит переделать, развить или преобразовать предыдущую запись («сделай из этого статью», «преврати в задачу», «добавь деталей», «добавь этой таске подробности»):
   - Опирайся на тему и текст предыдущего черновика из истории диалога.
   - Сформируй обновленный вызов инструмента save_item.
   - Если пользователь сообщает дополнительные подробности («требуемые инструменты бритва», «детали:...») — ОБНОВИ черновик задачи/заметки, включив этот текст в поле content.
   - НЕ вызывай search_notes на такие контекстные просьбы и уточнения!`;

    // Protocol Adapter & Endpoint Resolution
    const isGroq = settings.provider === 'groq' && Boolean(settings.groqApiKey);
    const isKie = settings.provider === 'kie' && Boolean(settings.kieApiKey);
    const isGemini = settings.provider === 'gemini' && Boolean(settings.geminiApiKey);

    let fallbackReason: string | undefined = undefined;

    if (isGroq || isKie || isGemini) {
      const providerName = isGroq ? 'Groq' : isKie ? 'KIE.AI' : 'Gemini';
      const apiKey = isGroq ? settings.groqApiKey : isKie ? settings.kieApiKey : settings.geminiApiKey;
      const defaultModel = isGroq ? 'openai/gpt-oss-120b' : isKie ? 'deepseek-v4-1-flash' : 'gemini-2.0-flash';
      const model = settings.model || defaultModel;

      let adapter: LlmProtocolAdapter;
      let endpointUrl: string;

      const isClaudeOnKie = isKie && model.toLowerCase().startsWith('claude-');
      const isResponsesOnKie = isKie && model.toLowerCase().includes('deepseek');
      if (isClaudeOnKie) {
        adapter = new AnthropicMessagesAdapter();
        endpointUrl = resolveKieEndpoint(settings.kieBaseUrl, model);
      } else if (isResponsesOnKie) {
        adapter = new OpenAiResponsesAdapter();
        endpointUrl = resolveKieEndpoint(settings.kieBaseUrl, model);
      } else if (isGroq) {
        adapter = new OpenAiChatAdapter();
        endpointUrl = 'https://api.groq.com/openai/v1/chat/completions';
      } else if (isKie) {
        adapter = new OpenAiChatAdapter();
        endpointUrl = resolveKieEndpoint(settings.kieBaseUrl, model);
      } else {
        adapter = new OpenAiChatAdapter();
        endpointUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      }

      try {
        const executedToolCalls: ChatToolCall[] = [];
        const turnHistory: AdapterTurnHistoryItem[] = [];
        const MAX_TOOL_ROUNDS = 3;
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
              reasoningEffort: settings.reasoningEffort,
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

        const { cleanText, suggestedAction: blockAction } = extractActionBlock(finalContent);
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
          const cleaned = lastUserMsg
            .split('\n')[0]
            .replace(/^(можешь|пожалуйста|хочу|нужно|надо)\s*/i, '')
            .replace(/(создай|добавь|сделай|напиши|оформи|преврати|запланируй|новая заметка|новую задачу|таску|задачу|заметку|статью|из этого)\s*/gi, '')
            .replace(/на\s+(сегодня|завтра|послезавтра)\s*/gi, '')
            .replace(/^(сделать|создать|добавить|написать|запланировать)\s*/i, '')
            .trim();
          title = cleaned || (isArticle ? 'Статья' : isTask ? 'Новая задача' : 'Новая мысль');
        }
      }

      const cleanContent = previousDraftContent
        ? (previousDraftContent.startsWith('[Подготовлен черновик')
            ? previousDraftContent.replace(/^\[Подготовлен черновик[^:]*:[^\]]*\]\n?/, '')
            : previousDraftContent)
        : `Создано через Ассистента: ${lastUserMsg}`;

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
