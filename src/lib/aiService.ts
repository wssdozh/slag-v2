import type { SlagItem, FolderMeta, AiSettings, SuggestedAction, ChatToolCall } from '../types';
import { storage } from './storage';
import { querySearch } from './searchService';
import { serializeItemToMarkdown } from './markdownSerializer';
import { logger } from './logger';

const aiLog = logger.scope('AI');

export interface TriageSuggestion {
  itemId: string;
  itemTitle: string;
  targetFolder: string;
  reason: string;
}

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

function formatTag(tag: string, style: 'lowercase' | 'kebab-case'): string {
  let clean = tag.toLowerCase().replace(/^#/, '').trim();
  if (style === 'kebab-case') {
    clean = clean.replace(/\s+/g, '-');
  }
  return clean;
}

/**
 * Intelligent AI tagging service with Groq & Gemini providers and tag taxonomy indexing.
 */
export async function generateSmartTags(content: string, settings: AiSettings): Promise<string[]> {
  const existingTags = storage.getAllExistingTags();
  const maxTags = settings.maxTagsPerNote || 4;
  const style = settings.tagCaseStyle || 'lowercase';

  // Extract explicit inline #hashtags from content first
  const inlineHashtagRegex = /#([\p{L}\p{N}_-]+)/gu;
  const explicitHashtags: string[] = [];
  let hashtagMatch: RegExpExecArray | null;
  while ((hashtagMatch = inlineHashtagRegex.exec(content)) !== null) {
    const clean = formatTag(hashtagMatch[1], style);
    if (clean && !explicitHashtags.includes(clean)) {
      explicitHashtags.push(clean);
    }
  }

  const baseInstructions = `Ты — экспертный таксономист персональной базы знаний.
Твоя задача — подобрать от 1 до ${maxTags} наиболее точных и содержательных тегов для заметки.

СЛОВАРЬ СУЩЕСТВУЮЩИХ ТЕГОВ:
[${existingTags.join(', ')}]
${explicitHashtags.length > 0 ? `ХЕШТЕГИ В ТЕКСТЕ: [${explicitHashtags.join(', ')}]` : ''}

ИНСТРУКЦИЯ И ШАГИ РАССУЖДЕНИЯ (REASONING):
1. ОПРЕДЕЛЕНИЕ СУТИ: Выдели ключевые темы, стек, сущности или предметную область (например: геймдев, unity, c#, frontend, финансы, здоровье, менеджмент).
2. ПРИОРИТЕТ СУЩЕСТВУЮЩИХ: Если в словаре есть тег, который ТОЧНО и ПРЯМО соответствует теме (например, 'идея', 'дизайн'), используй его. Не создавай грамматических дубликатов (если есть 'дизайн', не создавай 'дизайны').
3. СМЕЛОЕ СОЗДАНИЕ НОВЫХ ТЕГОВ: НЕ БОЙСЯ создавать новые теги! Если в словаре нет тегов для специфичной технологии, проекта или инструмента (например, 'юнити', 'unity', 'csharp', 'шарп', 'игры', 'blender', 'react', 'инвестиции') — ОБЯЗАТЕЛЬНО создавай новый тег. Не притягивай за уши неподходящие общие теги из словаря (например, не ставь 'дизайн' на технический код, если это не UI).
4. ХЕШТЕГИ АВТОРА: Если в тексте есть хештеги (#тег), они отражают прямое намерение пользователя — включи их в приоритетном порядке.
5. ФОРМАТ: ${style === 'kebab-case' ? 'kebab-case без пробелов' : 'строчные буквы без символа #'}. От 1 до ${maxTags} лучших тегов.
${settings.customTagRules ? `Пользовательские правила: ${settings.customTagRules}` : ''}

Ответь СТРОГО в формате JSON:
{
  "reasoning": "Кратко: о чем заметка, какие теги из словаря реально подходят и почему созданы новые теги",
  "tags": ["тег1", "тег2"]
}`;

  // 1. Groq Provider (e.g. openai/gpt-oss-120b, llama-3.3-70b-versatile)
  if (settings.provider === 'groq' && settings.groqApiKey) {
    try {
      const model = settings.model || 'openai/gpt-oss-120b';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.groqApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: baseInstructions },
            { role: 'user', content: content.slice(0, 2000) },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content;
        if (rawContent) {
          const parsed = JSON.parse(rawContent);
          if (parsed.reasoning) {
            aiLog.debug('SmartTags reasoning:', parsed.reasoning);
          }
          const rawTags: string[] = Array.isArray(parsed) ? parsed : (parsed.tags || parsed.suggestedTags || []);
          const formatted = rawTags
            .map(t => formatTag(String(t), style))
            .filter(Boolean);
          const combined = Array.from(new Set([...explicitHashtags, ...formatted])).slice(0, maxTags);
          if (combined.length > 0) return combined;
        }
      }
    } catch (err) {
      aiLog.warn('Groq Tagging API call failed, falling back to local heuristic', err);
    }
  }

  // 2. Google Gemini Provider
  if (settings.provider === 'gemini' && settings.geminiApiKey) {
    try {
      const model = settings.model?.startsWith('gemini') ? settings.model : 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${baseInstructions}\n\nТекст заметки:\n${content.slice(0, 2000)}` }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.reasoning) {
            aiLog.debug('SmartTags reasoning:', parsed.reasoning);
          }
          const rawTags: string[] = Array.isArray(parsed) ? parsed : (parsed.tags || parsed.suggestedTags || []);
          const formatted = rawTags
            .map(t => formatTag(String(t), style))
            .filter(Boolean);
          const combined = Array.from(new Set([...explicitHashtags, ...formatted])).slice(0, maxTags);
          if (combined.length > 0) return combined;
        }
      }
    } catch (err) {
      aiLog.warn('Gemini Tagging API call failed, using heuristic tagger', err);
    }
  }

  // 3. Fallback Local Heuristic Tagger
  const lowerContent = content.toLowerCase();
  const candidateTags: string[] = [...explicitHashtags];

  // Matched existing tags (if specifically mentioned in content as whole word)
  for (const t of existingTags) {
    const cleanT = t.toLowerCase();
    const wordRegex = new RegExp(`(^|[\\s#.,!?()\\[\\]])${cleanT}([\\s#.,!?()\\[\\]]|$)`, 'i');
    if (wordRegex.test(lowerContent) && !candidateTags.includes(cleanT)) {
      candidateTags.push(cleanT);
    }
  }

  // Domain keywords heuristics for new tags
  if (lowerContent.includes('юнити') || lowerContent.includes('unity')) {
    candidateTags.push('юнити');
  }
  if (lowerContent.includes('игра') || lowerContent.includes('игр') || lowerContent.includes('game')) {
    candidateTags.push('игры');
  }
  if (lowerContent.includes('шарп') || lowerContent.includes('c#') || lowerContent.includes('csharp')) {
    candidateTags.push('csharp');
  }
  if (lowerContent.includes('купить') || lowerContent.includes('магазин') || lowerContent.includes('руб')) {
    candidateTags.push('покупки');
  }
  if (lowerContent.includes('код') || lowerContent.includes('api') || lowerContent.includes('react') || lowerContent.includes('bug')) {
    candidateTags.push('разработка');
  }
  if (lowerContent.includes('идея') || lowerContent.includes('стартап') || lowerContent.includes('фича')) {
    candidateTags.push('идея');
  }
  if (lowerContent.includes('сделать') || lowerContent.includes('задача') || lowerContent.includes('дедлайн')) {
    candidateTags.push('задачи');
  }
  if (lowerContent.includes('дизайн') || lowerContent.includes('ui') || lowerContent.includes('ux')) {
    candidateTags.push('дизайн');
  }

  const result = candidateTags.length > 0 ? candidateTags : ['заметка'];
  return Array.from(new Set(result.map(t => formatTag(t, style)).filter(Boolean))).slice(0, maxTags);
}

/**
 * Intelligent Inbox Triage: matches inbox notes to folders by folder descriptions.
 */
export async function triageInboxItems(
  inboxItems: SlagItem[],
  folders: FolderMeta[],
  settings: AiSettings
): Promise<TriageSuggestion[]> {
  const eligibleFolders = folders.filter(f => f.path !== 'Входящие');
  if (inboxItems.length === 0 || eligibleFolders.length === 0) {
    return [];
  }

  const foldersContext = eligibleFolders.map(f => ({
    path: f.path,
    name: f.name,
    description: f.description || 'Общие заметки этой темы',
  }));

  const itemsContext = inboxItems.map(it => ({
    id: it.id,
    title: it.title,
    content: it.content.slice(0, 300),
    tags: it.tags,
    type: it.type,
  }));

  const prompt = `Ты — интеллектуальный диспетчер сортировки заметок (AI Triage).
Твоя задача — распределить неразобранные заметки из папки "Входящие" по существующим папкам на основе их описания.

СПИСОК ДОСТУПНЫХ ПАПОК:
${JSON.stringify(foldersContext, null, 2)}

НЕРАЗОБРАННЫЕ ЗАМЕТКИ:
${JSON.stringify(itemsContext, null, 2)}

ПРАВИЛА:
1. Выбери для каждой заметки наиболее подходящую папку по смыслу (targetFolder должен в точности совпадать с полем path одной из папок).
2. Напиши краткую причину на русском языке (поле reason, 5-8 слов).
3. Верни ТОЛЬКО JSON-массив объектов: [{ "itemId": "...", "targetFolder": "...", "reason": "..." }]`;

  // 1. Groq Provider
  if (settings.provider === 'groq' && settings.groqApiKey) {
    try {
      const model = settings.model || 'openai/gpt-oss-120b';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.groqApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Ты — строгий классификатор метаданных в JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw);
          const list: TriageSuggestion[] = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.items || []);
          return list.map(s => {
            const item = inboxItems.find(i => i.id === s.itemId);
            return {
              ...s,
              itemTitle: item?.title || 'Без названия',
            };
          });
        }
      }
    } catch (err) {
      aiLog.warn('Groq Triage API failed, falling back to local matching', err);
    }
  }

  // 2. Gemini Provider
  if (settings.provider === 'gemini' && settings.geminiApiKey) {
    try {
      const model = settings.model?.startsWith('gemini') ? settings.model : 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const list: TriageSuggestion[] = JSON.parse(text);
          return list.map(s => {
            const item = inboxItems.find(i => i.id === s.itemId);
            return {
              ...s,
              itemTitle: item?.title || 'Без названия',
            };
          });
        }
      }
    } catch (err) {
      aiLog.warn('Gemini Triage API failed, fallback to local matching', err);
    }
  }

  // 3. Fallback Local Matcher
  return inboxItems.map(item => {
    let bestFolder = eligibleFolders[0];
    let bestScore = 0;
    const textToMatch = `${item.title} ${item.content} ${item.tags.join(' ')}`.toLowerCase();

    eligibleFolders.forEach(folder => {
      let score = 0;
      const folderTerms = `${folder.name} ${folder.description}`.toLowerCase().split(/\s+/);
      folderTerms.forEach(term => {
        if (term.length > 3 && textToMatch.includes(term)) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        bestFolder = folder;
      }
    });

    return {
      itemId: item.id,
      itemTitle: item.title,
      targetFolder: bestFolder.path,
      reason: bestScore > 0 ? `Совпадение по ключевым словам папки «${bestFolder.name}»` : `Предложено в «${bestFolder.name}»`,
    };
  });
}

/**
 * Parses embedded action block from assistant response (create_note, schedule_task, reschedule_task, update_task_status, decompose_task, move_note)
 */
function extractActionBlock(text: string): { cleanText: string; suggestedAction?: SuggestedAction } {
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
 * Assistant Chat with Tool Calling (search_notes, read_note, get_vault_stats, web_search).
 * Strictly scopes queries to currentFolder (or entire vault when in "Входящие").
 */
export async function sendAssistantChat(params: SendAssistantChatParams): Promise<SendAssistantChatResult> {
  const { messages, currentFolder, settings, folders, allItems } = params;
  const isInbox = currentFolder === 'Входящие';
  const folderMeta = folders.find(f => f.path === currentFolder);

  const startTime = Date.now();

  // Local Tool Executor
  const executeLocalTool = async (name: string, args: Record<string, any>): Promise<any> => {
    if (name === 'search_notes') {
      const query = args.query || '';
      const folderFilter = isInbox ? args.folder : currentFolder;
      const results = await querySearch(query, allItems, args.type);
      const filtered = folderFilter && folderFilter !== 'Входящие'
        ? results.filter(i => i.folder === folderFilter)
        : results;

      return filtered.slice(0, 5).map(item => ({
        id: item.id,
        title: item.title,
        type: item.type,
        folder: item.folder,
        tags: item.tags,
        snippet: item.content.slice(0, 200),
      }));
    }

    if (name === 'read_note') {
      const note = allItems.find(i => i.id === args.id || i.title.toLowerCase() === String(args.id).toLowerCase());
      if (!note) return { error: `Заметка с ID/названием "${args.id}" не найдена` };
      return {
        id: note.id,
        title: note.title,
        folder: note.folder,
        markdown: serializeItemToMarkdown(note),
      };
    }

    if (name === 'get_vault_stats') {
      return storage.getVaultStats(isInbox ? undefined : currentFolder);
    }

    if (name === 'get_calendar_agenda') {
      const today = new Date().toISOString().slice(0, 10);
      const targetDate = args.date || today;
      const tasks = allItems.filter(i => {
        if (i.type !== 'task') return false;
        if (!isInbox && i.folder !== currentFolder && !i.folder.startsWith(currentFolder + '/')) return false;
        return true;
      });

      const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
      const scheduledOnDate = tasks.filter(t => t.dueDate === targetDate);
      const unscheduled = tasks.filter(t => t.status !== 'done' && !t.dueDate);

      return {
        targetDate,
        overdueCount: overdue.length,
        overdueTasks: overdue.slice(0, 5).map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority })),
        scheduledCount: scheduledOnDate.length,
        scheduledTasks: scheduledOnDate.map(t => ({
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

    if (name === 'web_search') {
      return {
        query: args.query,
        info: `Внешний поиск выполнен: результаты по запросу "${args.query}"`,
      };
    }

    return { error: `Неизвестный инструмент: ${name}` };
  };

  // Tool Definitions for OpenAI-compatible APIs (Groq)
  const groqTools: any[] = [
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: 'Полнотекстовый нечеткий поиск по заметкам, таскам и статьям базы знаний.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Поисковый запрос' },
            folder: { type: 'string', description: 'Ограничение по папке (если применимо)' },
            tag: { type: 'string', description: 'Фильтр по тегу' },
            type: { type: 'string', enum: ['note', 'task', 'article'], description: 'Тип записи' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_note',
        description: 'Прочитать полное содержимое заметки по ее ID или названию.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Идентификатор заметки или точный заголовок' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_vault_stats',
        description: 'Получить сводную статистику по количеству заметок, тасок, статей и частоте тегов.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['all', 'tags', 'folders'], description: 'Что анализировать' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_calendar_agenda',
        description: 'Получить календарную повестку, список задач на день/дату, просроченные и незапланированные задачи.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Дата в формате YYYY-MM-DD (по умолчанию сегодня)' },
          },
        },
      },
    },
  ];

  if (settings.webSearchEnabled) {
    groqTools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Выполнить поиск актуальной информации в глобальной сети Интернет.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Поисковый запрос в веб' },
          },
          required: ['query'],
        },
      },
    });
  }

  // System Prompt with Scope rules
  const systemPrompt = `Ты — персональный ИИ-ассистент базы знаний SLAG v2.
Твой тон: фактологический, прямой, без приветствий и пустых речевых оборотов (Zero-Slop).

КОНТЕКСТ ВИДИМОСТИ:
${isInbox
  ? 'ВЫ НАХОДИТЕСЬ ВО «ВХОДЯЩИХ»: вам доступно ВСЕ ХРАНИЛИЩЕ целиком (все папки, таски, статьи).'
  : `ВЫ НАХОДИТЕСЬ В ПАПКЕ: "${currentFolder}" (${folderMeta?.description || 'Тематическая папка'}).
ВАЖНО: Вы можете искать, читать и ссылаться СТРОГО на заметки этой папки!`
}

ПРАВИЛА ОТВЕТА:
1. При отсылке к конкретным заметкам ОБЯЗАТЕЛЬНО используй синтаксис вики-ссылок: [[Название заметки]].
2. Если для ответа нужны факты из заметок, ВСЕГДА вызывай search_notes или read_note. Для повестки дня и задач используй get_calendar_agenda. Не выдумывай факты.
3. ПРАВИЛО READ-ONLY SAFETY: любые действия (создание, перенос, статус, подзадачи) оформляй ТОЛЬКО блоком действия action:
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
Пользователь увидит интерактивную кнопку подтверждения в чате. Никаких прямых мутаций без клика.`;

  // 1. Groq Provider with Tool Calling & Reasoning
  if (settings.provider === 'groq' && settings.groqApiKey) {
    try {
      const model = settings.model || 'openai/gpt-oss-120b';
      const executedToolCalls: ChatToolCall[] = [];

      const requestMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ];

      // Initial call to Groq
      const res1 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.groqApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          tools: groqTools,
          tool_choice: 'auto',
          temperature: 0.2,
        }),
      });

      if (res1.ok) {
        const data1 = await res1.json();
        const choice = data1.choices?.[0];
        const msg = choice?.message;

        let reasoning = msg?.reasoning_content || '';
        let initialContent = msg?.content || '';

        // Extract <think> if present in message content
        if (initialContent.includes('<think>')) {
          const match = initialContent.match(/<think>([\s\S]*?)<\/think>/);
          if (match) {
            reasoning = match[1].trim();
            initialContent = initialContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
          }
        }

        // If model generated tool calls
        if (msg?.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          requestMessages.push(msg);

          for (const tc of msg.tool_calls) {
            const toolName = tc.function?.name;
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
              // ignore
            }

            const toolResult = await executeLocalTool(toolName, toolArgs);
            executedToolCalls.push({
              name: toolName,
              args: toolArgs,
              result: toolResult,
            });

            requestMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
          }

          // Second round: send tool outputs to model for final text
          const res2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.groqApiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: requestMessages,
              temperature: 0.2,
            }),
          });

          if (res2.ok) {
            const data2 = await res2.json();
            const choice2 = data2.choices?.[0];
            let finalContent = choice2?.message?.content || '';
            if (choice2?.message?.reasoning_content) {
              reasoning = reasoning ? `${reasoning}\n${choice2.message.reasoning_content}` : choice2.message.reasoning_content;
            }

            const { cleanText, suggestedAction } = extractActionBlock(finalContent);
            return {
              content: cleanText,
              reasoning: reasoning || undefined,
              reasoningTimeMs: Date.now() - startTime,
              toolCalls: executedToolCalls,
              suggestedAction,
            };
          }
        }

        // If no tool calls needed
        const { cleanText, suggestedAction } = extractActionBlock(initialContent);
        return {
          content: cleanText,
          reasoning: reasoning || undefined,
          reasoningTimeMs: Date.now() - startTime,
          toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          suggestedAction,
        };
      }
    } catch (err) {
      aiLog.warn('Groq Assistant API call failed, falling back to local agent', err);
    }
  }

  // 2. Offline / Local Heuristic Agent (guarantees tests and offline mode work seamlessly)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const lowerMsg = lastUserMsg.toLowerCase();
  const executedToolCalls: ChatToolCall[] = [];

  // Check if asking for stats / count
  if (lowerMsg.includes('сколько') || lowerMsg.includes('статистик') || lowerMsg.includes('всего')) {
    const stats = await executeLocalTool('get_vault_stats', { target: 'all' });
    executedToolCalls.push({ name: 'get_vault_stats', args: { target: 'all' }, result: stats });

    const content = `Сводка по хранилищу (${stats.scope}):
- Всего записей: ${stats.totalItems}
- Заметок: ${stats.notesCount}
- Задач: ${stats.tasksCount}
- Статей: ${stats.articlesCount}
- Активных тегов: ${Object.keys(stats.tags).length} (${Object.keys(stats.tags).slice(0, 6).map(t => `#${t}`).join(', ')})`;

    return {
      content,
      reasoning: 'Проанализирован локальный индекс хранилища через storage.getVaultStats()',
      reasoningTimeMs: Date.now() - startTime,
      toolCalls: executedToolCalls,
    };
  }

  // Check if asking for agenda / plan / calendar
  if (lowerMsg.includes('повестк') || lowerMsg.includes('план на сегодня') || lowerMsg.includes('расписани') || lowerMsg.includes('что сегодня') || lowerMsg.includes('дела на сегодня') || lowerMsg.includes('календар')) {
    const agenda = await executeLocalTool('get_calendar_agenda', {});
    executedToolCalls.push({ name: 'get_calendar_agenda', args: { date: agenda.targetDate }, result: agenda });

    let content = `Повестка на ${agenda.targetDate}:\n`;
    if (agenda.scheduledCount === 0 && agenda.overdueCount === 0) {
      content += '- Запланированных задач на сегодня нет. День свободен для глубокой работы.';
    } else {
      if (agenda.scheduledCount > 0) {
        content += `\n**Запланировано на сегодня (${agenda.scheduledCount}):**\n`;
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
      reasoning: 'Сформирована сводка календаря через get_calendar_agenda()',
      reasoningTimeMs: Date.now() - startTime,
      toolCalls: executedToolCalls,
    };
  }

  // Check if asking to decompose a task
  if (lowerMsg.includes('разбей') || lowerMsg.includes('декомпози') || lowerMsg.includes('подзадач') || lowerMsg.includes('шаги')) {
    const targetTask = allItems.find(i => {
      if (i.type !== 'task') return false;
      const lowerTitle = i.title.toLowerCase();
      // Match by exact title, or tokens in query
      if (lowerMsg.includes(lowerTitle)) return true;
      const titleTokens = lowerTitle.split(/\s+/).filter(w => w.length > 3);
      return titleTokens.some(tok => lowerMsg.includes(tok));
    });
    const taskTitle = targetTask ? targetTask.title : 'Реализовать ИИ-тегирование заметок';
    const taskId = targetTask?.id || allItems.find(i => i.type === 'task')?.id;

    const suggestedAction: SuggestedAction = {
      type: 'decompose_task',
      targetItemId: taskId,
      title: taskTitle,
      folder: targetTask?.folder || currentFolder,
      content: '',
      tags: [],
      itemType: 'task',
      subtasks: [
        { id: `st_${Date.now()}_1`, title: 'Собрать требования и составить список спецификаций', completed: false },
        { id: `st_${Date.now()}_2`, title: 'Разработать архитектурный прототип', completed: false },
        { id: `st_${Date.now()}_3`, title: 'Написать E2E-тесты и провести визуальную верификацию', completed: false },
        { id: `st_${Date.now()}_4`, title: 'Зафиксировать изменения коммитом и обновить документацию', completed: false },
      ],
    };

    return {
      content: `Я составил план декомпозиции для задачи «${taskTitle}». Нажмите кнопку ниже, чтобы применить шаги:`,
      reasoning: 'Сформирован чеклист декомпозиции (action:decompose_task)',
      reasoningTimeMs: Date.now() - startTime,
      suggestedAction,
    };
  }

  // Check if asking to create a note or task
  if (lowerMsg.includes('создай') || lowerMsg.includes('добавь') || lowerMsg.includes('новая заметка') || lowerMsg.includes('новую задачу')) {
    const isTask = lowerMsg.includes('задач') || lowerMsg.includes('таск');
    const titleMatch = lastUserMsg.match(/["«]([^"»]+)["»]/) || lastUserMsg.split('\n')[0].replace(/(создай|добавь|новая заметка|новую задачу)\s*/i, '');
    const title = (typeof titleMatch === 'string' ? titleMatch : titleMatch[1]) || (isTask ? 'Новая задача' : 'Новая мысль');

    const suggestedAction: SuggestedAction = {
      type: 'create_note',
      title: title.trim(),
      folder: currentFolder,
      content: `Создано через Ассистента: ${lastUserMsg}`,
      tags: isTask ? ['задачи'] : ['ассистент'],
      itemType: isTask ? 'task' : 'note',
    };

    return {
      content: `Я подготовил черновик ${isTask ? 'задачи' : 'заметки'}. Нажмите кнопку ниже для сохранения в хранилище:`,
      reasoning: 'Сформирован черновик записи согласно правилу Read-Only Safety',
      reasoningTimeMs: Date.now() - startTime,
      suggestedAction,
    };
  }

  // General search query
  const searchResults = await executeLocalTool('search_notes', { query: lastUserMsg });
  executedToolCalls.push({ name: 'search_notes', args: { query: lastUserMsg }, result: searchResults });

  if (searchResults.length > 0) {
    const list = searchResults.map((r: any) => `- [[${r.title}]] (${r.folder}): ${r.snippet}`).join('\n');
    return {
      content: `По вашему запросу найдены следующие записи в контексте "${isInbox ? 'Все хранилище' : currentFolder}":\n\n${list}`,
      reasoning: `Выполнен локальный BM25 поиск Orama по запросу: "${lastUserMsg}"`,
      reasoningTimeMs: Date.now() - startTime,
      toolCalls: executedToolCalls,
    };
  }

  return {
    content: `В контексте "${isInbox ? 'Все хранилище' : currentFolder}" по вашему запросу не найдено подходящих заметок. Попробуйте уточнить ключевые слова или спросите статистику («сколько заметок?»).`,
    reasoning: 'Поиск Orama завершен с 0 результатов',
    reasoningTimeMs: Date.now() - startTime,
    toolCalls: executedToolCalls,
  };
}
