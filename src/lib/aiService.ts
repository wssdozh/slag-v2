import type { SlagItem, FolderMeta, AiSettings } from '../types';
import { storage } from './storage';
import { logger } from './logger';
import {
  assistantOrchestrator,
  resolveKieEndpoint,
  extractActionBlock,
  type SendAssistantChatParams,
  type SendAssistantChatResult,
} from './ai/orchestrator';

export {
  resolveKieEndpoint,
  extractActionBlock,
  type SendAssistantChatParams,
  type SendAssistantChatResult,
};

const aiLog = logger.scope('AI');

export interface TriageSuggestion {
  itemId: string;
  itemTitle: string;
  targetFolder: string;
  reason: string;
}

function formatTag(tag: string, style: 'lowercase' | 'kebab-case'): string {
  let clean = tag.toLowerCase().replace(/^#/, '').trim();
  if (style === 'kebab-case') {
    clean = clean.replace(/\s+/g, '-');
  }
  return clean;
}

/**
 * Intelligent AI tagging service with Groq, KIE (Claude / Gemini) & Gemini providers and tag taxonomy indexing.
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
      const isGptOss = model.includes('gpt-oss');
      const payload: Record<string, any> = {
        model,
        messages: [
          { role: 'system', content: baseInstructions },
          { role: 'user', content: content.slice(0, 2000) },
        ],
        temperature: 0.2,
      };

      if (!isGptOss) {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.groqApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content;
        if (rawContent) {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
          if (parsed.reasoning) {
            aiLog.debug('Groq SmartTags reasoning:', parsed.reasoning);
          }
          const rawTags: string[] = Array.isArray(parsed) ? parsed : (parsed.tags || parsed.suggestedTags || []);
          const formatted = rawTags
            .map((t) => formatTag(String(t), style))
            .filter(Boolean);
          const combined = Array.from(new Set([...explicitHashtags, ...formatted])).slice(0, maxTags);
          if (combined.length > 0) return combined;
        }
      }
    } catch (err) {
      aiLog.warn('Groq Tagging API call failed, falling back to local heuristic', err);
    }
  }

  // 2. KIE.AI Provider (supports Claude via Anthropic API and other models via OpenAI API)
  if (settings.provider === 'kie' && settings.kieApiKey) {
    try {
      const model = settings.model || 'gemini-3-8-flash-openai';
      const isClaude = model.toLowerCase().startsWith('claude-');
      const baseUrl = (settings.kieBaseUrl || 'https://api.kie.ai').replace(/\/+$/, '');
      const authHeader = settings.kieApiKey.startsWith('Bearer ') ? settings.kieApiKey : `Bearer ${settings.kieApiKey}`;

      let rawContent = '';

      if (isClaude) {
        const endpoint = `${baseUrl}/claude/v1/messages`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: baseInstructions,
            messages: [{ role: 'user', content: content.slice(0, 2000) }],
            temperature: 0.2,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.content)) {
            for (const b of data.content) {
              if (b.type === 'text') rawContent += b.text || '';
            }
          }
        }
      } else {
        const endpoint = resolveKieEndpoint(settings.kieBaseUrl, model);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
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
          rawContent = data.choices?.[0]?.message?.content || '';
        }
      }

      if (rawContent) {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
        if (parsed.reasoning) {
          aiLog.debug('KIE SmartTags reasoning:', parsed.reasoning);
        }
        const rawTags: string[] = Array.isArray(parsed) ? parsed : (parsed.tags || parsed.suggestedTags || []);
        const formatted = rawTags
          .map((t) => formatTag(String(t), style))
          .filter(Boolean);
        const combined = Array.from(new Set([...explicitHashtags, ...formatted])).slice(0, maxTags);
        if (combined.length > 0) return combined;
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
            aiLog.debug('Gemini SmartTags reasoning:', parsed.reasoning);
          }
          const rawTags: string[] = Array.isArray(parsed) ? parsed : (parsed.tags || parsed.suggestedTags || []);
          const formatted = rawTags
            .map((t) => formatTag(String(t), style))
            .filter(Boolean);
          const combined = Array.from(new Set([...explicitHashtags, ...formatted])).slice(0, maxTags);
          if (combined.length > 0) return combined;
        }
      }
    } catch (err) {
      aiLog.warn('Gemini Tagging API call failed, falling back to local heuristic', err);
    }
  }

  // 4. Fallback Local Heuristic Tag Generator (Offline / No API Key)
  const lower = content.toLowerCase();
  const matchedExisting = existingTags.filter((tag) => {
    const clean = tag.toLowerCase().trim();
    if (clean.length < 3) return false;
    const regex = new RegExp(`\\b${clean}\\b`, 'i');
    return regex.test(lower);
  });

  const keywords: Record<string, string[]> = {
    геймдев: ['геймдев', 'game', 'игра', 'геймдизайн', 'unity', 'unreal', 'godot'],
    архитектура: ['архитектур', 'модул', 'рефактор', 'паттерн', 'solid'],
    frontend: ['фронтенд', 'frontend', 'react', 'vite', 'tailwind', 'css', 'ui'],
    backend: ['бэкенд', 'backend', 'api', 'node', 'server', 'база данных', 'sql'],
    задачи: ['задач', 'таск', 'дедлайн', 'план', 'сделать'],
    идеи: ['идея', 'мысль', 'инсайт', 'концепт', 'гипотеза'],
  };

  const detected: string[] = [];
  for (const [tag, triggers] of Object.entries(keywords)) {
    if (triggers.some((tr) => lower.includes(tr))) {
      detected.push(formatTag(tag, style));
    }
  }

  const result = Array.from(
    new Set([...explicitHashtags, ...matchedExisting.map((t) => formatTag(t, style)), ...detected])
  ).slice(0, maxTags);

  return result.length > 0 ? result : [formatTag('заметка', style)];
}

/**
 * Intelligent Inbox Triage: matches inbox notes to folders by folder descriptions.
 */
export async function triageInboxItems(
  inboxItems: SlagItem[],
  folders: FolderMeta[],
  settings: AiSettings
): Promise<TriageSuggestion[]> {
  const eligibleFolders = folders.filter((f) => f.path !== 'Входящие');
  if (inboxItems.length === 0 || eligibleFolders.length === 0) {
    return [];
  }

  const foldersContext = eligibleFolders.map((f) => ({
    path: f.path,
    name: f.name,
    description: f.description || 'Общие заметки этой темы',
  }));

  const itemsContext = inboxItems.map((it) => ({
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
            { role: 'system', content: 'Ты — автономный ассистент каталогизации базы знаний SLAG. Отвечай строго валидным JSON массивом объектов.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
          const list: TriageSuggestion[] = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.items || []);
          return list.map((s) => {
            const item = inboxItems.find((i) => i.id === s.itemId);
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

  // 2. KIE.AI Provider (Claude / OpenAI)
  if (settings.provider === 'kie' && settings.kieApiKey) {
    try {
      const model = settings.model || 'gemini-3-8-flash-openai';
      const isClaude = model.toLowerCase().startsWith('claude-');
      const baseUrl = (settings.kieBaseUrl || 'https://api.kie.ai').replace(/\/+$/, '');
      const authHeader = settings.kieApiKey.startsWith('Bearer ') ? settings.kieApiKey : `Bearer ${settings.kieApiKey}`;

      let raw = '';
      if (isClaude) {
        const endpoint = `${baseUrl}/claude/v1/messages`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: 'Ты — автономный ассистент каталогизации базы знаний SLAG. Отвечай строго валидным JSON массивом объектов.',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.content)) {
            for (const b of data.content) {
              if (b.type === 'text') raw += b.text || '';
            }
          }
        }
      } else {
        const endpoint = resolveKieEndpoint(settings.kieBaseUrl, model);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
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
          raw = data.choices?.[0]?.message?.content || '';
        }
      }

      if (raw) {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        const list: TriageSuggestion[] = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.items || []);
        return list.map((s) => {
          const item = inboxItems.find((i) => i.id === s.itemId);
          return {
            ...s,
            itemTitle: item?.title || 'Без названия',
          };
        });
      }
    } catch (err) {
      aiLog.warn('KIE Triage API failed, falling back to local matching', err);
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
          return list.map((s) => {
            const item = inboxItems.find((i) => i.id === s.itemId);
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

  // 4. Fallback Local Matcher
  return inboxItems.map((item) => {
    let bestFolder = eligibleFolders[0];
    let bestScore = 0;
    const textToMatch = `${item.title} ${item.content} ${item.tags.join(' ')}`.toLowerCase();

    eligibleFolders.forEach((folder) => {
      let score = 0;
      const folderTerms = `${folder.name} ${folder.description}`.toLowerCase().split(/\s+/);
      folderTerms.forEach((term) => {
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
 * Assistant Chat with Multi-Round Tool Calling via Parent Orchestrator.
 * Strictly scopes queries to currentFolder (or entire vault when in "Входящие").
 */
export async function sendAssistantChat(params: SendAssistantChatParams): Promise<SendAssistantChatResult> {
  return assistantOrchestrator.runChat(params);
}
