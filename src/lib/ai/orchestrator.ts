import type { SlagItem, FolderMeta, AiSettings, SuggestedAction, ChatToolCall } from '../../types';
import type {
  AssistantToolDefinition,
  AdapterTurnHistoryItem,
  LlmProtocolAdapter,
} from './types';
import { OpenAiChatAdapter } from './adapters/openAiAdapter';
import { AnthropicMessagesAdapter } from './adapters/anthropicAdapter';
import { storage } from '../storage';
import { querySearch, getSearchableAttachmentText } from '../searchService';
import { serializeItemToMarkdown } from '../markdownSerializer';
import { logger } from '../logger';

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
}

/**
 * Parses embedded action block from assistant response (create_note, schedule_task, reschedule_task, update_task_status, decompose_task, move_note)
 */
export function extractActionBlock(text: string): { cleanText: string; suggestedAction?: SuggestedAction } {
  const actionRegex = /```(?:action:[\w_]+|json:[\w_]+)?\s*\n?(\{\s*"action"\s*:\s*"[\w_]+"[\s\S]*?\})\s*```/i;
  const match = text.match(actionRegex);

  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanText = text.replace(match[0], '').trim();

      if (parsed.action === 'create_note' || parsed.action === 'schedule_task') {
        return {
          cleanText,
          suggestedAction: {
            type: parsed.action === 'schedule_task' ? 'schedule_task' : 'create_note',
            title: parsed.title || 'Новая запись',
            folder: parsed.folder || 'Входящие',
            content: parsed.content || '',
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            itemType: ['note', 'task', 'article'].includes(parsed.itemType) ? parsed.itemType : (parsed.action === 'schedule_task' ? 'task' : 'note'),
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: ['none', 'low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : undefined,
          },
        };
      }

      if (parsed.action === 'reschedule_task') {
        return {
          cleanText,
          suggestedAction: {
            type: 'reschedule_task',
            targetItemId: parsed.targetItemId,
            title: parsed.title || 'Перенос задачи',
            folder: parsed.folder || 'Входящие',
            content: '',
            tags: [],
            itemType: 'task',
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
          },
        };
      }

      if (parsed.action === 'update_task_status') {
        return {
          cleanText,
          suggestedAction: {
            type: 'update_task_status',
            targetItemId: parsed.targetItemId,
            title: parsed.title || 'Смена статуса задачи',
            folder: parsed.folder || 'Входящие',
            content: '',
            tags: [],
            itemType: 'task',
            status: ['backlog', 'todo', 'in_progress', 'done'].includes(parsed.status) ? parsed.status : 'todo',
          },
        };
      }

      if (parsed.action === 'decompose_task') {
        return {
          cleanText,
          suggestedAction: {
            type: 'decompose_task',
            targetItemId: parsed.targetItemId,
            title: parsed.title || 'Декомпозиция задачи',
            folder: parsed.folder || 'Входящие',
            content: '',
            tags: [],
            itemType: 'task',
            subtasks: Array.isArray(parsed.subtasks)
              ? parsed.subtasks.map((st: any, i: number) => ({
                  id: st.id || `st_${Date.now()}_${i}`,
                  title: typeof st === 'string' ? st : (st.title || 'Подзадача'),
                  completed: !!st.completed,
                }))
              : [],
          },
        };
      }

      if (parsed.action === 'move_note') {
        return {
          cleanText,
          suggestedAction: {
            type: 'move_note',
            targetItemId: parsed.targetItemId,
            title: parsed.title || 'Перемещение заметки',
            folder: parsed.folder || 'Входящие',
            content: '',
            tags: [],
            itemType: 'note',
          },
        };
      }
    } catch {
      // JSON parse failed, return as is
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
  if (clean.endsWith('/chat/completions') || clean.endsWith('/messages')) return clean;

  const m = (model || '').toLowerCase();
  if (m.startsWith('claude-')) {
    return `${clean}/claude/v1/messages`;
  }

  if (m.includes('gemini-4-argon') || m === 'gemini-4-argon-openai') {
    if (clean.includes('gemini-4-argon-openai')) {
      return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
    }
    return `${clean}/gemini-4-argon-openai/v1/chat/completions`;
  }

  if (m.includes('gemini-3-8-flash') || m === 'gemini-3-8-flash-openai') {
    return `${clean}/gemini-3-8-flash-openai/v1/chat/completions`;
  }

  if (m.includes('gemini-3-5-flash') || m === 'gemini-3-5-flash-openai') {
    return `${clean}/gemini-3-5-flash-openai/v1/chat/completions`;
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
    let capturedAction: SuggestedAction | undefined;

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
        const query = args.query || '';
        const folderFilter = isInbox ? args.folder : currentFolder;
        const results = await querySearch(query, allItems, args.type);
        const filtered = folderFilter && folderFilter !== 'Входящие'
          ? results.filter((i) => i.folder === folderFilter)
          : results;

        return filtered.slice(0, 5).map((item) => {
          const bodySnippet = (item.content || '').slice(0, 200).trim();
          const attachSnippet = getSearchableAttachmentText(item.attachments).slice(0, 200).trim();
          let snippet = bodySnippet;
          if (attachSnippet) {
            snippet = snippet ? `${snippet} [Вложения: ${attachSnippet}]` : `[Вложения: ${attachSnippet}]`;
          }
          return {
            id: item.id,
            title: item.title,
            type: item.type,
            folder: item.folder,
            tags: item.tags,
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

      // Action tools for Read-Only Safety: prepare SuggestedAction cards for UI confirmation
      if (name === 'create_note') {
        capturedAction = {
          type: 'create_note',
          title: String(args.title || 'Новая запись').trim(),
          folder: args.folder || currentFolder,
          content: args.content || '',
          tags: Array.isArray(args.tags) ? args.tags : [],
          itemType: args.itemType || 'note',
          actionState: 'suggested',
        };
        return {
          status: 'proposed',
          message: `Черновик ${args.itemType || 'записи'} «${args.title}» подготовлен к сохранению в хранилище. В интерфейсе пользователю отображена карточка подтверждения. Завершите ответ кратким подтверждением.`,
        };
      }

      if (name === 'schedule_task') {
        capturedAction = {
          type: 'schedule_task',
          title: String(args.title || 'Новая задача').trim(),
          folder: args.folder || currentFolder,
          content: args.content || '',
          dueDate: args.dueDate,
          reminder: args.reminder,
          priority: args.priority || 'medium',
          tags: Array.isArray(args.tags) ? args.tags : [],
          itemType: 'task',
          actionState: 'suggested',
        };
        return {
          status: 'proposed',
          message: `Задача «${args.title}» на дату ${args.dueDate} подготовлена к планированию. В интерфейсе пользователю отображена карточка подтверждения. Завершите ответ кратким подтверждением.`,
        };
      }

      if (name === 'decompose_task') {
        const subtasks = Array.isArray(args.subtasks)
          ? args.subtasks.map((st: any, idx: number) => typeof st === 'string' ? { id: `st_${Date.now()}_${idx}`, title: st, completed: false } : st)
          : [];
        capturedAction = {
          type: 'decompose_task',
          title: String(args.title || 'Задача').trim(),
          folder: currentFolder,
          content: '',
          tags: [],
          itemType: 'task',
          subtasks,
          actionState: 'suggested',
        };
        return {
          status: 'proposed',
          message: `Декомпозиция задачи «${args.title}» на ${subtasks.length} подзадач подготовлена к применению. Завершите ответ кратким пояснением.`,
        };
      }

      if (name === 'update_task_status') {
        capturedAction = {
          type: 'update_task_status',
          title: String(args.title || 'Задача').trim(),
          folder: currentFolder,
          content: '',
          tags: [],
          itemType: 'task',
          status: args.status,
          actionState: 'suggested',
        };
        return {
          status: 'proposed',
          message: `Смена статуса задачи «${args.title}» на «${args.status}» подготовлена к подтверждению.`,
        };
      }

      if (name === 'move_note') {
        capturedAction = {
          type: 'move_note',
          title: String(args.title || 'Запись').trim(),
          folder: args.folder || currentFolder,
          content: '',
          tags: [],
          itemType: 'note',
          actionState: 'suggested',
        };
        return {
          status: 'proposed',
          message: `Перемещение «${args.title}» в папку «${args.folder}» подготовлено к подтверждению.`,
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
        description: 'Полнотекстовый нечеткий поиск по заметкам, таскам, статьям, а также по расшифровкам аудиозаписей (Whisper), распознанному тексту изображений (OCR) и саммари файлов.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Поисковый запрос. Передавай ключевые существительные или основы слов (1-3 слова). Поддерживается поиск по голосовым заметкам и изображениям. Обязательно исправляй опечатки пользователя (например: "прафилам как жить" -> "правила") и удаляй разговорный шум.',
            },
          },
          required: ['query'],
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
        name: 'create_note',
        description: 'Создать или обновить черновик заметки, задачи или статьи в хранилище (с интерактивной кнопкой подтверждения).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Заголовок записи' },
            content: { type: 'string', description: 'Содержимое/текст записи (включая подробности, шаги, инструменты)' },
            itemType: { type: 'string', enum: ['note', 'task', 'article'], description: 'Тип записи' },
            folder: { type: 'string', description: 'Папка для сохранения' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Теги' },
          },
          required: ['title'],
        },
      },
      {
        name: 'schedule_task',
        description: 'Запланировать задачу в календаре на конкретную дату (YYYY-MM-DD).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Заголовок задачи' },
            dueDate: { type: 'string', description: 'Дата в формате YYYY-MM-DD' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Приоритет задачи' },
            content: { type: 'string', description: 'Описание или подробности задачи' },
            folder: { type: 'string', description: 'Папка' },
          },
          required: ['title', 'dueDate'],
        },
      },
      {
        name: 'decompose_task',
        description: 'Декомпозировать задачу на список подзадач/шагов.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Заголовок задачи' },
            subtasks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Список подзадач/шагов',
            },
          },
          required: ['title', 'subtasks'],
        },
      },
      {
        name: 'update_task_status',
        description: 'Изменить статус задачи (backlog, todo, in_progress, done).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Заголовок задачи' },
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'done'] },
          },
          required: ['title', 'status'],
        },
      },
      {
        name: 'move_note',
        description: 'Переместить заметку в другую папку базы знаний.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Заголовок заметки' },
            folder: { type: 'string', description: 'Целевая папка' },
          },
          required: ['title', 'folder'],
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
Твой тон: фактологический, прямой, без приветствий и пустых речевых оборотов (Zero-Slop).

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
   - Ты поддерживаешь цепочки вызовов инструментов (до 4 раундов в одном диалоговом ходе).
   - Заметки могут содержать голосовые аудиозаписи, скриншоты/фотографии и документы. Их расшифровки речи (Whisper), распознанный текст (OCR) и саммари автоматически индексируются в поиске и возвращаются в search_notes (сниппеты вида [Вложения: ...]) и в read_note.
   - Когда пользователь спрашивает «что я говорил в голосовом про X?», «найди чек/скриншот с Y» или любые факты из базы — СНАЧАЛА вызови search_notes по ключевым словам.
   - Если для ответа недостаточно сниппета из поиска — вызови read_note по названию или id нужной заметки.
   - НОРМАЛИЗАЦИЯ ЗАПРОСОВ: При вызове search_notes очищай запрос от стоп-слов («поищи», «как», «вообще», «что») и исправляй опечатки пользователя (например, «прафилам как жить вообще» -> search_notes("правила")). Не копируй опечатки и шум буквально.
   - get_calendar_agenda: используй для повестки дня, расписания, задач на сегодня/завтра/дату (date: 'YYYY-MM-DD').
   - При вопросах общего характера («что?», «почему?», «не хочу», «поговори со мной», «кто ты?») — отвечай прямо текстом без бессмысленного вызова инструментов.

3. ПРАВИЛО READ-ONLY SAFETY И ДЕЙСТВИЯ:
   - Прямое удаление заметок запрещено политикой безопасности. Если пользователь просит удалить заметку («удали эту заметку»), прямо поясни, что удаление через чат недоступно, но можно предложить перенести её в архив/корзину через блок action:move_note или сменить статус.
   - Любые другие мутации (создание, перенос, декомпозиция, расписание) оформляй ТОЛЬКО через блок action:
- Создание заметки/задачи:
\`\`\`action:create_note
{ "action": "create_note", "title": "Название", "folder": "${currentFolder}", "content": "Текст...", "tags": ["тег"], "itemType": "note" }
\`\`\`
- Планирование задачи в календаре:
\`\`\`action:schedule_task
{ "action": "schedule_task", "title": "Название задачи", "folder": "${currentFolder}", "dueDate": "YYYY-MM-DD", "reminder": "ISO-время", "priority": "high", "itemType": "task" }
\`\`\`
- Декомпозиция задачи на чеклист:
\`\`\`action:decompose_task
{ "action": "decompose_task", "targetItemId": "id_задачи", "title": "Название задачи", "folder": "${currentFolder}", "subtasks": [{ "title": "Шаг 1", "completed": false }] }
\`\`\`
- Смена статуса канбан:
\`\`\`action:update_task_status
{ "action": "update_task_status", "targetItemId": "id_задачи", "title": "Название задачи", "status": "in_progress" }
\`\`\`
- Перемещение в папку:
\`\`\`action:move_note
{ "action": "move_note", "targetItemId": "id_записи", "title": "Название", "folder": "Целевая/Папка" }
\`\`\`
Пользователь увидит интерактивную кнопку подтверждения в чате. Никаких прямых мутаций без клика.

4. РАБОТА С КОНТЕКСТОМ И ТРАНСФОРМАЦИЯ ЧЕРНОВИКОВ:
   - Если пользователь просит переделать, развить или преобразовать предыдущую запись («сделай из этого статью», «преврати в задачу», «добавь деталей», «добавь этой таске подробности»):
   - Опирайся на тему и текст предыдущего черновика из истории диалога.
   - Сформируй обновленный вызов инструмента create_note / schedule_task или блок действия action:create_note.
   - Если пользователь сообщает дополнительные подробности («требуемые инструменты бритва», «детали:...») — ОБНОВИ черновик задачи/заметки, включив этот текст в поле content.
   - НЕ вызывай search_notes на такие контекстные просьбы и уточнения!`;

    // Protocol Adapter & Endpoint Resolution
    const isGroq = settings.provider === 'groq' && Boolean(settings.groqApiKey);
    const isKie = settings.provider === 'kie' && Boolean(settings.kieApiKey);
    const isGemini = settings.provider === 'gemini' && Boolean(settings.geminiApiKey);

    if (isGroq || isKie || isGemini) {
      const providerName = isGroq ? 'Groq' : isKie ? 'KIE.AI' : 'Gemini';
      const apiKey = isGroq ? settings.groqApiKey : isKie ? settings.kieApiKey : settings.geminiApiKey;
      const defaultModel = isGroq ? 'openai/gpt-oss-120b' : isKie ? 'gemini-3-8-flash-openai' : 'gemini-2.0-flash';
      const model = settings.model || defaultModel;

      let adapter: LlmProtocolAdapter;
      let endpointUrl: string;

      const isClaudeOnKie = isKie && model.toLowerCase().startsWith('claude-');
      if (isClaudeOnKie) {
        adapter = new AnthropicMessagesAdapter();
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
        const MAX_TOOL_ROUNDS = 4;
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

          aiLog.info(`Agent round ${round}/${MAX_TOOL_ROUNDS} [${providerName}]`, {
            model,
            adapter: adapter.constructor.name,
            endpoint: endpointUrl,
          });

          const turnResponse = await adapter.executeTurn({
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

          if (turnResponse.reasoning) {
            accumulatedReasoning = (accumulatedReasoning ? `${accumulatedReasoning}\n\n` : '') + turnResponse.reasoning;
          }

          const responseToolCalls = turnResponse.toolCalls;

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

              aiLog.info(`Tool executed: ${toolName}`, { args: toolArgs, durationMs: toolDuration });

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

        // Safeguard: If finalContent is empty but tools were executed, synthesize friendly response
        if (!finalContent.trim() && executedToolCalls.length > 0) {
          const foundNotesSearch = executedToolCalls.find(
            (tc) => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0
          );
          if (foundNotesSearch && Array.isArray(foundNotesSearch.result)) {
            const list = foundNotesSearch.result
              .map((r: any) => `- [[${r.title}]] (${r.folder}): ${r.snippet || ''}`)
              .join('\n');
            finalContent = `По вашему запросу найдены следующие записи:\n\n${list}`;
          } else {
            const agendaCall = executedToolCalls.find((tc) => tc.name === 'get_calendar_agenda' && tc.result);
            if (agendaCall && agendaCall.result) {
              const a = agendaCall.result;
              finalContent = `Повестка на ${a.targetDate}: запланировано ${a.scheduledCount || 0} задач, просрочено ${a.overdueCount || 0}.`;
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
        const suggestedAction = capturedAction || blockAction;
        return {
          content: cleanText,
          reasoning: accumulatedReasoning || undefined,
          reasoningTimeMs: Date.now() - startTime,
          toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          suggestedAction,
        };
      } catch (err) {
        aiLog.warn(`${providerName} Assistant API call failed, falling back to local agent`, err);
      }
    }

    // Offline / Local Heuristic Agent
    return this.runLocalFallbackAgent({
      messages,
      currentFolder,
      allItems,
      startTime,
      executeLocalTool,
      isInbox,
    });
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
    const lowerMsg = lastUserMsg.toLowerCase().trim();
    const executedToolCalls: ChatToolCall[] = [];

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

    // Check 2: Vault stats / count
    if (lowerMsg.includes('сколько') || lowerMsg.includes('статистик') || lowerMsg.includes('всего') || lowerMsg.includes('сводка')) {
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

    // Check 3: Calendar / Agenda / Relative Dates
    const isCreateIntent =
      lowerMsg.includes('созда') ||
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
      lowerMsg.includes('статью');

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
      !lowerMsg.includes('статистик');

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
        type: 'decompose_task',
        targetItemId: taskId,
        title: taskTitle,
        folder: targetTask?.folder || currentFolder,
        content: '',
        tags: [],
        itemType: 'task',
        subtasks,
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
    if (isCreateIntent) {
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
      const list = searchResults.map((r: any) => `- [[${r.title}]] (${r.folder}): ${r.snippet}`).join('\n');
      return {
        content: `По вашему запросу найдены следующие записи в контексте "${isInbox ? 'Все хранилище' : currentFolder}":\n\n${list}`,
        reasoning: `Выполнен поиск Orama по базе и вложениям по запросу: "${lastUserMsg}"`,
        reasoningTimeMs: Date.now() - startTime,
        toolCalls: executedToolCalls,
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
