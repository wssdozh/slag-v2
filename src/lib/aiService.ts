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

export interface CategorizeResult {
  targetFolder: string;
  tags: string[];
  reason: string;
}

export interface TriageSuggestion extends CategorizeResult {
  itemId: string;
  itemTitle: string;
}

export interface TriageProgress {
  processed: number;
  total: number;
}

export type TriageProgressCallback = (
  chunkSuggestions: TriageSuggestion[],
  progress: TriageProgress
) => void;

function formatTag(tag: string, style: 'lowercase' | 'kebab-case'): string {
  let clean = tag.toLowerCase().replace(/^#/, '').trim();
  if (style === 'kebab-case') {
    clean = clean.replace(/\s+/g, '-');
  }
  return clean;
}

function extractExplicitHashtags(content: string, style: 'lowercase' | 'kebab-case'): string[] {
  const inlineHashtagRegex = /#([\p{L}\p{N}_-]+)/gu;
  const explicit: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = inlineHashtagRegex.exec(content)) !== null) {
    const clean = formatTag(match[1], style);
    if (clean && !explicit.includes(clean)) {
      explicit.push(clean);
    }
  }
  return explicit;
}

function localHeuristicTags(
  content: string,
  existingTags: string[],
  style: 'lowercase' | 'kebab-case',
  maxTags: number
): string[] {
  const explicit = extractExplicitHashtags(content, style);
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
    new Set([...explicit, ...matchedExisting.map((t) => formatTag(t, style)), ...detected])
  ).slice(0, maxTags);

  return result.length > 0 ? result : [formatTag('заметка', style)];
}

function localMatchFolder(
  text: string,
  folders: FolderMeta[],
  fallbackFolder: string
): { folder: string; reason: string } {
  const eligible = folders.filter((f) => f.path !== 'Входящие');
  if (eligible.length === 0) {
    return { folder: fallbackFolder, reason: 'По умолчанию' };
  }

  let bestFolder = eligible[0];
  let bestScore = 0;
  const lower = text.toLowerCase();

  eligible.forEach((folder) => {
    let score = 0;
    const folderTerms = `${folder.name} ${folder.path} ${folder.description || ''}`
      .toLowerCase()
      .split(/[\s/,.-]+/)
      .filter((t) => t.length > 2);

    folderTerms.forEach((term) => {
      const stem = term.length > 4 ? term.slice(0, -1) : term;
      if (lower.includes(stem)) {
        score += 1;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestFolder = folder;
    }
  });

  return {
    folder: bestScore > 0 ? bestFolder.path : fallbackFolder,
    reason: bestScore > 0 ? `Ключевые слова папки «${bestFolder.name}»` : `Предложено в «${bestFolder.name}»`,
  };
}

function parseJsonContent<T>(raw: string): T | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

/**
 * Shared low-level JSON LLM dispatcher across providers (Groq, KIE, Gemini).
 * Cuts duplicate networking boilerplate across tagging and triage.
 */
async function callJsonLlm<T>(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  temperature = 0.1
): Promise<T | null> {
  // 1. Groq Provider
  if (settings.provider === 'groq' && settings.groqApiKey) {
    try {
      const model = settings.model || 'openai/gpt-oss-120b';
      const isGptOss = model.includes('gpt-oss');
      const payload: Record<string, any> = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
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
        const raw = data.choices?.[0]?.message?.content;
        if (raw) return parseJsonContent<T>(raw);
      }
    } catch (err) {
      aiLog.warn('Groq LLM call failed, falling back to local heuristic', err);
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
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            temperature,
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
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code && data.code !== 200) {
            throw new Error(data.msg || `KIE error ${data.code}`);
          }
          raw = data.choices?.[0]?.message?.content || '';
        }
      }

      if (raw) return parseJsonContent<T>(raw);
    } catch (err) {
      aiLog.warn('KIE LLM call failed, falling back to local heuristic', err);
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
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return parseJsonContent<T>(text);
      }
    } catch (err) {
      aiLog.warn('Gemini LLM call failed, falling back to local heuristic', err);
    }
  }

  return null;
}

/**
 * Unified Draft Categorization (Pre-save in Composer):
 * Classifies note content into a target folder, taxonomy-based tags, and reasoning.
 */
export async function categorizeDraft(
  content: string,
  currentFolder: string,
  folders: FolderMeta[],
  settings: AiSettings
): Promise<CategorizeResult> {
  const existingTags = storage.getAllExistingTags();
  const maxTags = settings.maxTagsPerNote || 4;
  const style = settings.tagCaseStyle || 'lowercase';
  const explicit = extractExplicitHashtags(content, style);

  const eligibleFolders = folders.filter((f) => f.path !== 'Входящие');
  const foldersContext = eligibleFolders.map((f) => ({
    path: f.path,
    name: f.name,
    description: f.description || 'Общие заметки этой темы',
  }));

  const systemPrompt = `Ты — экспертный диспетчер каталогизации и таксономист персональной базы знаний SLAG.
Твоя задача — для текста заметки определить:
1. Наиболее подходящую целевую папку (targetFolder).
2. От 1 до ${maxTags} лучших тегов (tags).
3. Краткую причину (reason, 5-8 слов на русском).

СЛОВАРЬ СУЩЕСТВУЮЩИХ ТЕГОВ:
[${existingTags.join(', ')}]

СПИСОК ДОСТУПНЫХ ПАПОК:
${JSON.stringify(foldersContext, null, 2)}
ТЕКУЩАЯ ПАПКА ПОЛЬЗОВАТЕЛЯ: "${currentFolder}"

ПРАВИЛА:
1. ПАПКА:
   - Если текущая папка пользователя — не "Входящие" (например, проект или конкретная тема), отдавай ей приоритет, если заметка подходит по смыслу.
   - Если текущая папка — "Входящие", обязательно выбери наиболее подходящую папку из доступных по их смыслу и описанию (targetFolder должен совпадать с полем path одной из папок). Если ни одна явно не подходит, верни "${currentFolder}".
2. ТЕГИ:
   - Выдели суть темы, стек, ключевые сущности.
   - Используй существующие теги из словаря при точном совпадении, либо смело создавай новые точные теги.
   - Формат тегов: ${style === 'kebab-case' ? 'kebab-case без пробелов' : 'строчные буквы без знака #'}.
3. ПРИЧИНА:
   - 5-8 слов на русском языке, объясняющих выбор.
${settings.customTagRules ? `Пользовательские правила: ${settings.customTagRules}` : ''}

Ответь СТРОГО в формате JSON:
{
  "targetFolder": "путь_папки",
  "tags": ["тег1", "тег2"],
  "reason": "краткая причина"
}`;

  const userPrompt = `Текст заметки:\n${content.slice(0, 2000)}`;

  const parsed = await callJsonLlm<{
    targetFolder?: string;
    tags?: string[];
    reason?: string;
  }>(systemPrompt, userPrompt, settings, 0.2);

  if (parsed) {
    const rawTags: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];
    const formatted = rawTags
      .map((t) => formatTag(String(t), style))
      .filter(Boolean);
    const combinedTags = Array.from(new Set([...explicit, ...formatted])).slice(0, maxTags);

    let targetFolder = parsed.targetFolder?.trim() || currentFolder;
    const folderExists = eligibleFolders.some((f) => f.path === targetFolder) || targetFolder === currentFolder || targetFolder === 'Входящие';
    if (!folderExists) {
      targetFolder = currentFolder;
    }

    return {
      targetFolder,
      tags: combinedTags.length > 0 ? combinedTags : localHeuristicTags(content, existingTags, style, maxTags),
      reason: parsed.reason?.trim() || 'По смыслу заметки',
    };
  }

  // Local fallback
  const localMatch = currentFolder === 'Входящие'
    ? localMatchFolder(content, eligibleFolders, currentFolder)
    : { folder: currentFolder, reason: 'Текущая папка' };

  return {
    targetFolder: localMatch.folder,
    tags: localHeuristicTags(content, existingTags, style, maxTags),
    reason: localMatch.reason,
  };
}

/**
 * Intelligent AI tagging (backwards-compatible wrapper around categorizeDraft).
 */
export async function generateSmartTags(content: string, settings: AiSettings): Promise<string[]> {
  const result = await categorizeDraft(content, 'Входящие', [], settings);
  return result.tags;
}

/**
 * Intelligent Inbox Triage: matches inbox notes to folders and suggests taxonomy tags in batches of 5.
 * Emits progressive chunk results via onProgress callback.
 */
export async function triageInboxItems(
  inboxItems: SlagItem[],
  folders: FolderMeta[],
  settings: AiSettings,
  onProgress?: TriageProgressCallback
): Promise<TriageSuggestion[]> {
  const eligibleFolders = folders.filter((f) => f.path !== 'Входящие');
  if (inboxItems.length === 0 || eligibleFolders.length === 0) {
    return [];
  }

  const existingTags = storage.getAllExistingTags();
  const maxTags = settings.maxTagsPerNote || 4;
  const style = settings.tagCaseStyle || 'lowercase';

  const foldersContext = eligibleFolders.map((f) => ({
    path: f.path,
    name: f.name,
    description: f.description || 'Общие заметки этой темы',
  }));

  const CHUNK_SIZE = 5;
  const allSuggestions: TriageSuggestion[] = [];
  let processedCount = 0;

  for (let i = 0; i < inboxItems.length; i += CHUNK_SIZE) {
    const chunk = inboxItems.slice(i, i + CHUNK_SIZE);
    const itemsContext = chunk.map((it) => ({
      id: it.id,
      title: it.title,
      content: it.content.slice(0, 350),
      tags: it.tags,
      type: it.type,
    }));

    const systemPrompt = `Ты — интеллектуальный диспетчер сортировки заметок (AI Triage) и таксономист базы знаний SLAG.
Твоя задача — для каждой неразобранной заметки из папки "Входящие":
1. Выбрать наиболее подходящую целевую папку (targetFolder) на основе описаний папок.
2. Подобрать от 1 до ${maxTags} точных тегов (tags).
3. Написать краткую причину на русском языке (reason, 5-8 слов).

СПИСОК ДОСТУПНЫХ ПАПОК:
${JSON.stringify(foldersContext, null, 2)}

СЛОВАРЬ СУЩЕСТВУЮЩИХ ТЕГОВ:
[${existingTags.join(', ')}]

ПРАВИЛА:
1. targetFolder должен в точности совпадать с полем path одной из папок.
2. Теги должны отражать суть заметки (${style === 'kebab-case' ? 'kebab-case' : 'строчные буквы без #'}).
3. reason — 5-8 слов на русском.
4. Верни ТОЛЬКО JSON-массив объектов: [{ "itemId": "...", "targetFolder": "...", "tags": ["..."], "reason": "..." }]`;

    const userPrompt = `НЕРАЗОБРАННЫЕ ЗАМЕТКИ (ПАКЕТ):\n${JSON.stringify(itemsContext, null, 2)}`;

    let chunkResult: TriageSuggestion[] | null = null;

    try {
      const parsed = await callJsonLlm<
        Array<{ itemId: string; targetFolder: string; tags?: string[]; reason: string }>
      >(systemPrompt, userPrompt, settings, 0.1);

      if (Array.isArray(parsed) && parsed.length > 0) {
        chunkResult = chunk.map((item) => {
          const match = parsed.find((s) => s.itemId === item.id);
          const rawTags = Array.isArray(match?.tags) ? match!.tags : [];
          const formatted = rawTags.map((t) => formatTag(String(t), style)).filter(Boolean);
          const itemExisting = item.tags || [];
          const mergedTags = Array.from(new Set([...itemExisting, ...formatted])).slice(0, maxTags);
          const targetFolder = match?.targetFolder && eligibleFolders.some((f) => f.path === match.targetFolder)
            ? match.targetFolder
            : eligibleFolders[0].path;

          return {
            itemId: item.id,
            itemTitle: item.title || 'Без названия',
            targetFolder,
            tags: mergedTags,
            reason: match?.reason || 'Распределено по смыслу',
          };
        });
      }
    } catch (err) {
      aiLog.warn('Chunk triage failed, fallback to local heuristic for this chunk', err);
    }

    // Local fallback for this chunk if LLM failed
    if (!chunkResult) {
      chunkResult = chunk.map((item) => {
        const textToMatch = `${item.title} ${item.content} ${item.tags.join(' ')}`;
        const matched = localMatchFolder(textToMatch, eligibleFolders, eligibleFolders[0].path);
        const tags = localHeuristicTags(textToMatch, existingTags, style, maxTags);
        const mergedTags = Array.from(new Set([...item.tags, ...tags])).slice(0, maxTags);

        return {
          itemId: item.id,
          itemTitle: item.title,
          targetFolder: matched.folder,
          tags: mergedTags,
          reason: matched.reason,
        };
      });
    }

    allSuggestions.push(...chunkResult);
    processedCount += chunk.length;

    if (onProgress) {
      onProgress(chunkResult, {
        processed: processedCount,
        total: inboxItems.length,
      });
    }
  }

  return allSuggestions;
}

/**
 * Assistant Chat with Multi-Round Tool Calling via Parent Orchestrator.
 * Strictly scopes queries to currentFolder (or entire vault when in "Входящие").
 */
export async function sendAssistantChat(params: SendAssistantChatParams): Promise<SendAssistantChatResult> {
  return assistantOrchestrator.runChat(params);
}
