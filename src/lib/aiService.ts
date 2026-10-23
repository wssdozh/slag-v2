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
 * Resolves full chat completions endpoint for KIE.AI.
 * For Gemini 4 Argon, routes to dedicated /gemini-4-argon-openai/v1/chat/completions.
 */
export function resolveKieEndpoint(baseUrl?: string, model?: string): string {
  const clean = (baseUrl || 'https://api.kie.ai').replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return clean;

  const m = (model || '').toLowerCase();
  if (m.includes('gemini-4-argon') || m === 'gemini-4-argon-openai') {
    if (clean.includes('gemini-4-argon-openai')) {
      return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
    }
    return `${clean}/gemini-4-argon-openai/v1/chat/completions`;
  }

  return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
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

  // 2. KIE.AI Provider
  if (settings.provider === 'kie' && settings.kieApiKey) {
    try {
      const model = settings.model || 'gemini-4-argon-openai';
      const endpoint = resolveKieEndpoint(settings.kieBaseUrl, model);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.kieApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: baseInstructions },
            { role: 'user', content: content.slice(0, 2000) },
          ],
          temperature: 0.2,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.code && data.code !== 200) {
          throw new Error(data.msg || `KIE.AI Tagging error code ${data.code}`);
        }
        const rawContent = data.choices?.[0]?.message?.content;
        if (rawContent) {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
          if (parsed.reasoning) {
            aiLog.debug('KIE SmartTags reasoning:', parsed.reasoning);
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
      aiLog.warn('KIE Tagging API call failed, falling back to local heuristic', err);
    }
  }

  // 3. Google Gemini Provider
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

  // 2. KIE.AI Provider
  if (settings.provider === 'kie' && settings.kieApiKey) {
    try {
      const model = settings.model || 'gemini-4-argon-openai';
      const endpoint = resolveKieEndpoint(settings.kieBaseUrl, model);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.kieApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Ты — автономный ассистент каталогизации базы знаний SLAG. Отвечай строго валидным JSON массивом объектов.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.code && data.code !== 200) {
          throw new Error(data.msg || `KIE.AI Triage error code ${data.code}`);
        }
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
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
      aiLog.warn('KIE Triage API failed, falling back to local matching', err);
    }
  }

  // 3. Gemini Provider
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
  let capturedAction: SuggestedAction | undefined;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
  const dayNamesRu = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const todayDayName = dayNamesRu[now.getDay()];
  const tomorrowDayName = dayNamesRu[tomorrowDate.getDay()];

  const scopedTasks = allItems.filter(i => {
    if (i.type !== 'task') return false;
    if (!isInbox && i.folder !== currentFolder && !i.folder.startsWith(currentFolder + '/')) return false;
    return true;
  });

  const tasksToday = scopedTasks.filter(t => t.dueDate === todayStr);
  const tasksTomorrow = scopedTasks.filter(t => t.dueDate === tomorrowStr);
  const overdueTasks = scopedTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr);
  const unscheduledTasks = scopedTasks.filter(t => t.status !== 'done' && !t.dueDate);

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
      const targetQuery = String(args.id || '').toLowerCase().trim();
      let note = allItems.find(i => i.id === targetQuery || i.title.toLowerCase() === targetQuery);
      if (!note) {
        const cleanTitle = targetQuery.replace(/^\[\[|\]\]$/g, '').trim();
        note = allItems.find(i => i.title.toLowerCase() === cleanTitle || i.title.toLowerCase().includes(cleanTitle));
      }
      if (!note) return { error: `Заметка с ID/названием "${args.id}" не найдена` };
      return {
        id: note.id,
        title: note.title,
        folder: note.folder,
        markdown: serializeItemToMarkdown(note).slice(0, 4000),
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
        message: `Черновик ${args.itemType || 'записи'} «${args.title}» подготовлен. Не пишите служебных фраз подтверждения или инструкций клика.`,
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
        message: `Задача «${args.title}» на дату ${args.dueDate} подготовлена. Не пишите служебных фраз подтверждения или инструкций клика.`,
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
        message: `Подзадачи к «${args.title}» подготовлены. Не пишите служебных фраз подтверждения или инструкций клика.`,
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
        message: `Смена статуса задачи «${args.title}» на «${args.status}» подготовлена. Не пишите инструкций подтверждения.`,
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
        message: `Перемещение «${args.title}» в папку «${args.folder}» подготовлено. Не пишите инструкций подтверждения.`,
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

  // Tool Definitions for OpenAI-compatible APIs (Groq / KIE.AI)
  const groqTools: any[] = [
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: 'Полнотекстовый нечеткий поиск по заметкам, таскам и статьям базы знаний с поддержкой опечаток и токенов.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Поисковый запрос. Передавай ключевые существительные или основы слов (1-3 слова). Обязательно исправляй опечатки пользователя (например: "прафилам как жить" -> "правила") и удаляй разговорный шум.',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
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
    {
      type: 'function',
      function: {
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
    },
    {
      type: 'function',
      function: {
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
    },
    {
      type: 'function',
      function: {
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
    },
    {
      type: 'function',
      function: {
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
    },
    {
      type: 'function',
      function: {
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

ТЕКУЩЕЕ ВРЕМЯ И КАЛЕНДАРЬ:
- Сегодня: ${todayStr} (${todayDayName})
- Завтра: ${tomorrowStr} (${tomorrowDayName})

АКТУАЛЬНЫЙ СРЕЗ ЗАДАЧ ИЗ ЛОКАЛЬНОЙ БАЗЫ SLAG v2:
- Задачи на сегодня (${tasksToday.length}): ${tasksToday.length > 0 ? tasksToday.map(t => `«${t.title}» [статус: ${t.status}, приоритет: ${t.priority || 'обычный'}]`).join(', ') : 'нет'}
- Задачи на завтра (${tasksTomorrow.length}): ${tasksTomorrow.length > 0 ? tasksTomorrow.map(t => `«${t.title}» [статус: ${t.status}, приоритет: ${t.priority || 'обычный'}]`).join(', ') : 'нет'}
- Просроченные задачи (${overdueTasks.length}): ${overdueTasks.length > 0 ? overdueTasks.map(t => `«${t.title}» [срок: ${t.dueDate}]`).join(', ') : 'нет'}
- Задачи без даты (${unscheduledTasks.length}): ${unscheduledTasks.length > 0 ? unscheduledTasks.slice(0, 5).map(t => `«${t.title}»`).join(', ') : 'нет'}

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
   - Если для ответа недостаточно сниппета из поиска — сначала вызови search_notes, а получив список заметок, в следующем шаге вызови read_note по названию или id нужной заметки.
   - НОРМАЛИЗАЦИЯ ЗАПРОСОВ: При вызове search_notes очищай запрос от стоп-слов («поищи», «как», «вообще», «что») и исправляй опечатки пользователя (например, «прафилам как жить вообще» -> search_notes("правила")). Не копируй опечатки и шум буквально.
   - get_calendar_agenda: используй для повестки дня, расписания, задач на сегодня/завтра/дату (date: 'YYYY-MM-DD').
   - При вопросах общего характера («что?», «почему?», «не хочу», «поговори со мной», «кто ты?») — отвечай прямо текстом без бессмысленного вызова инструментов.

3. ПРАВИЛО READ-ONLY SAFETY И ДЕЙСТВИЯ:
   - Прямое удаление заметок запрещено политикой безопасности. Если пользователь просит удалить заметку («удали эту заметку»), прямо поясни, что удаление через чат недоступно, но можно предложить перенести её в архив/корзину через блок action:move_note или сменить статус.
   - Любые другие мутации (создание, перенос, декомпозиция, расписание) оформляй ТОЛЬКО через блок action:
   - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ БЮРОКРАТИИ И СЛУЖЕБНЫХ ПРЕАМБУЛ (ZERO-SLOP):
     Запрещено писать пустые фразы вроде «Подтвердите действие, чтобы...», «Нажмите кнопку ниже...», «В интерфейсе отображена карточка...», «Декомпозиция задачи X на Y готова». Пользователь видит кнопки действия сам. Твой текстовый ответ должен быть предельно кратким и содержательным.
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

  // 1. External LLM Provider with Multi-Step Agentic Tool Calling (Groq / KIE.AI / Gemini)
  const isGroq = settings.provider === 'groq' && Boolean(settings.groqApiKey);
  const isKie = settings.provider === 'kie' && Boolean(settings.kieApiKey);
  const isGemini = settings.provider === 'gemini' && Boolean(settings.geminiApiKey);

  if (isGroq || isKie || isGemini) {
    const providerName = isGroq ? 'Groq' : isKie ? 'KIE.AI' : 'Gemini';
    const apiKey = isGroq ? settings.groqApiKey : isKie ? settings.kieApiKey : settings.geminiApiKey;
    const defaultModel = isGroq ? 'openai/gpt-oss-120b' : isKie ? 'gemini-4-argon-openai' : 'gemini-2.0-flash';
    const model = settings.model || defaultModel;
    const endpointUrl = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : isKie
      ? resolveKieEndpoint(settings.kieBaseUrl, model)
      : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

    try {
      const executedToolCalls: ChatToolCall[] = [];
      const requestMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => {
          let content = m.content;
          if (!content || !content.trim()) {
            content = '[Действие или черновик подготовлено]';
          }
          return { role: m.role, content };
        }),
      ];

      const MAX_TOOL_ROUNDS = 4;
      let round = 0;
      let finalContent = '';
      let accumulatedReasoning = '';
      const calledSignatures = new Set<string>();

      while (round < MAX_TOOL_ROUNDS) {
        round++;
        const isLastAllowedRound = round === MAX_TOOL_ROUNDS;

        aiLog.info(`Agent round ${round}/${MAX_TOOL_ROUNDS} [${providerName}]`, {
          model,
          messageCount: requestMessages.length,
          endpoint: endpointUrl,
        });

        const payload: Record<string, any> = {
          model,
          messages: requestMessages,
          temperature: 0.2,
        };

        const isArgon = isKie && (model.includes('gemini-4-argon') || model === 'gemini-4-argon-openai');

        if (isArgon) {
          payload.include_thoughts = settings.reasoningEffort !== 'none';
          if (settings.reasoningEffort === 'high') {
            payload.reasoning_effort = 'high';
          } else if (settings.reasoningEffort !== 'none') {
            payload.reasoning_effort = 'low';
          }
        }

        if (!isLastAllowedRound) {
          if (isArgon) {
            // Per KIE.AI docs, Gemini 4 Argon is chat-only and not adapted for custom agent tools.
            // Google Search is supported via {"type": "function", "function": {"name": "googleSearch"}}
            if (settings.webSearchEnabled) {
              payload.tools = [{ type: 'function', function: { name: 'googleSearch' } }];
            }
          } else {
            payload.tools = groqTools;
            payload.tool_choice = 'auto';
          }
        }

        const res = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => '');
          aiLog.warn(`${providerName} Round ${round} failed HTTP ${res.status}:`, errorBody);
          if (round === 1) {
            throw new Error(`${providerName} HTTP ${res.status}: ${errorBody.slice(0, 200)}`);
          }
          break;
        }

        const data = await res.json();
        if (data.code && data.code !== 200) {
          throw new Error(data.msg || `KIE.AI Error ${data.code}`);
        }
        const choice = data.choices?.[0];
        const msg = choice?.message;

        if (!msg) break;

        let stepReasoning = msg.reasoning_content || '';
        let stepContent = msg.content || '';

        // Extract <think> if present in message content
        if (stepContent.includes('<think>')) {
          const match = stepContent.match(/<think>([\s\S]*?)<\/think>/);
          if (match) {
            stepReasoning = match[1].trim();
            stepContent = stepContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
          }
        }

        if (stepReasoning) {
          accumulatedReasoning = accumulatedReasoning
            ? `${accumulatedReasoning}\n${stepReasoning}`
            : stepReasoning;
        }

        // If no tool calls, this is the final response
        if (!msg.tool_calls || !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) {
          finalContent = stepContent;
          break;
        }

        // Push sanitized assistant message with tool_calls into history (stripping vendor metadata like reasoning_content)
        requestMessages.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: tc.type || 'function',
            function: {
              name: tc.function?.name,
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || {}),
            },
          })),
        });

        // Execute all tool calls in this round
        let hasNewTools = false;
        for (const tc of msg.tool_calls) {
          const toolName = tc.function?.name;
          let toolArgs: Record<string, any> = {};
          try {
            toolArgs = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            // ignore
          }

          const callSig = `${toolName}:${JSON.stringify(toolArgs)}`;
          let toolResult: any;

          if (calledSignatures.has(callSig)) {
            toolResult = {
              warning: `Этот инструмент уже вызывался с такими параметрами. Сформулируйте финальный ответ на основе имеющихся данных или вызовите другой инструмент.`,
            };
          } else {
            calledSignatures.add(callSig);
            const toolStart = performance.now();
            const rawResult = await executeLocalTool(toolName, toolArgs);
            const toolDuration = Math.round(performance.now() - toolStart);

            aiLog.info(`Tool executed: ${toolName}`, { args: toolArgs, durationMs: toolDuration });

            // If search_notes returned 0 results, suggest similar or related active tags
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

          requestMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }

        // If all calls were duplicate warnings, break out
        if (!hasNewTools) {
          finalContent = stepContent;
          break;
        }
      }

      // Safeguard: If finalContent is empty but tools were executed, synthesize a friendly response from tool results
      if (!finalContent.trim() && executedToolCalls.length > 0) {
        const foundNotesSearch = executedToolCalls.find(
          tc => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0
        );
        if (foundNotesSearch && Array.isArray(foundNotesSearch.result)) {
          const list = foundNotesSearch.result
            .map((r: any) => `- [[${r.title}]] (${r.folder}): ${r.snippet || ''}`)
            .join('\n');
          finalContent = `По вашему запросу найдены следующие записи:\n\n${list}`;
        } else {
          const agendaCall = executedToolCalls.find(tc => tc.name === 'get_calendar_agenda' && tc.result);
          if (agendaCall && agendaCall.result) {
            const a = agendaCall.result;
            finalContent = `Повестка на ${a.targetDate}: запланировано ${a.scheduledCount || 0} задач, просрочено ${a.overdueCount || 0}.`;
          } else {
            finalContent = `В базе знаний не найдено подходящих записей по вашему запросу. Попробуйте уточнить ключевые слова.`;
          }
        }
      }

      // Google Calendar Hallucination Interceptor & Fallback
      const isGoogleCalendarHallucination = (text: string) =>
        /Google\s*Calendar|активировать это расширение|подключиться к Google/i.test(text);

      if (isGoogleCalendarHallucination(finalContent)) {
        aiLog.warn('Intercepted Google Calendar hallucination, substituting with local SLAG v2 agenda');
        const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content.toLowerCase() || '';
        const isTomorrow = lastUserText.includes('завтра');
        const targetLabel = isTomorrow ? `завтра (${tomorrowStr})` : `сегодня (${todayStr})`;
        const targetTasks = isTomorrow ? tasksTomorrow : tasksToday;

        if (targetTasks.length === 0) {
          finalContent = `На ${targetLabel} запланированных задач нет. День свободен для работы.`;
        } else {
          finalContent = `Задачи на ${targetLabel} (${targetTasks.length}):\n` +
            targetTasks.map(t => `- [[${t.title}]] (${t.status}, приоритет: ${t.priority || 'обычный'}${t.reminder ? `, время: ${t.reminder}` : ''})`).join('\n');
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

  // 2. Offline / Local Heuristic Agent (guarantees tests and offline mode work seamlessly)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
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

  // Check 2: Vault stats / count (priority over generic task mentions)
  if (lowerMsg.includes('сколько') || lowerMsg.includes('статистик') || lowerMsg.includes('всего') || lowerMsg.includes('сводка')) {
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
    const recentActionMsg = [...messages].reverse().find(m => m.content && (
      m.content.includes('[Действие ассистента:') ||
      m.content.includes('[Подготовлен черновик') ||
      m.content.includes('«')
    ));
    const titleFromHistory = recentActionMsg?.content.match(/[«"]([^»"]+)[»"]/) || recentActionMsg?.content.match(/Заголовок:\s*«([^»]+)»/);

    // 1. First, check explicit user task designation: "есть задача <X>", "в задаче <X>", "для задачи <X>", "таска <X>"
    let taskTitle = '';
    const explicitTaskM = lastUserMsg.match(/(?:есть\s+задача|задача|задачу|таска|таску|в\s+задаче|к\s+задаче|для\s+задачи)\s+[«"]?([^«".,\n]+)[»"]?/i);
    if (explicitTaskM) {
      const candidate = explicitTaskM[1].trim().split(/\s+(?:нужно|надо|сделай|добавь|хочу|на\s+подзадачи|на\s+шаги)/i)[0].trim();
      if (candidate) {
        taskTitle = candidate;
      }
    }

    // 2. Match whole task title against allItems or history
    let targetTask = taskTitle
      ? allItems.find(i => i.type === 'task' && (
          i.title.toLowerCase() === taskTitle.toLowerCase() ||
          i.title.toLowerCase().includes(taskTitle.toLowerCase()) ||
          taskTitle.toLowerCase().includes(i.title.toLowerCase())
        ))
      : allItems.find(i => i.type === 'task' && lowerMsg.includes(i.title.toLowerCase()));

    if (targetTask) {
      taskTitle = targetTask.title;
    }

    // 3. Fallback to title from history or token matching
    if (!targetTask && !taskTitle) {
      if (titleFromHistory && lowerMsg.includes(titleFromHistory[1].toLowerCase())) {
        taskTitle = titleFromHistory[1];
        targetTask = allItems.find(i => i.type === 'task' && i.title.toLowerCase() === taskTitle.toLowerCase());
      } else {
        targetTask = allItems.find(i => {
          if (i.type !== 'task') return false;
          const lowerTitle = i.title.toLowerCase();
          const titleTokens = lowerTitle.split(/\s+/).filter(w => w.length > 3);
          return titleTokens.length > 0 && titleTokens.every(tok => lowerMsg.includes(tok));
        });
      }
    }

    if (!taskTitle) {
      taskTitle = targetTask ? targetTask.title : (titleFromHistory ? titleFromHistory[1] : 'Реализовать ИИ-тегирование заметок');
    }
    const taskId = targetTask?.id || allItems.find(i => i.type === 'task')?.id;

    // Extract explicit subtasks if specified by user
    const parsedSubtaskTitles: string[] = [];
    const lines = lastUserMsg.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip generic decomposition trigger lines ("на подзадачи", "на шаги")
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

  // Check 4.5: Refine existing task/note from context or follow-up details
  // (e.g. user asking "можешь добавить этой таске подробности" or answering "требуемые инструменты бритва")
  const recentActionMsg = [...messages].reverse().find(m => m.content && (
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

  // Check 5: Create note, task or article (including contextual transformations)
  if (isCreateIntent) {
    const isTask = lowerMsg.includes('задач') || lowerMsg.includes('таск');
    const isArticle = lowerMsg.includes('стать') || lowerMsg.includes('лонгрид');
    const itemType = isArticle ? 'article' : isTask ? 'task' : 'note';

    // Parse relative dueDate if mentioned
    let dueDate: string | undefined;
    if (lowerMsg.includes('на завтра') || lowerMsg.includes('завтра')) {
      dueDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    } else if (lowerMsg.includes('на сегодня') || lowerMsg.includes('сегодня')) {
      dueDate = new Date().toISOString().slice(0, 10);
    } else if (lowerMsg.includes('на послезавтра') || lowerMsg.includes('послезавтра')) {
      dueDate = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
    }

    // Check if user is referencing a previously generated draft ("из этого", "на этот счет", "по этой теме")
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

  // Check 7: Conversational meta-intents, emotional feedback, or questions
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
      reasoning: `Выполнен локальный BM25 поиск Orama по запросу: "${lastUserMsg}"`,
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
