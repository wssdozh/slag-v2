import type { SlagItem, FolderMeta, AiSettings } from '../../types';
import { storage } from '../storage';
import { logger } from '../logger/logger';
import { aiClient } from './aiClient';
import {
  assistantOrchestrator,
  resolveKieEndpoint,
  type SendAssistantChatParams,
  type SendAssistantChatResult,
} from './orchestrator';
import {
  DEFAULT_INBOX_FOLDER,
  AI_STOP_TAGS,
  AI_CATEGORY_KEYWORDS,
} from '../../config';

export {
  resolveKieEndpoint,
  type SendAssistantChatParams,
  type SendAssistantChatResult,
};

const aiLog = logger.scope('AI');

export interface CategorizeResult {
  targetFolder: string;
  tags: string[];
  reason: string;
  suggestedTitle?: string;
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

const STOP_TAGS = AI_STOP_TAGS;

function isStopTag(tag: string): boolean {
  const normalized = tag.toLowerCase().replace(/^#/, '').trim();
  return STOP_TAGS.has(normalized);
}

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
    if (clean && !isStopTag(clean) && !explicit.includes(clean)) {
      explicit.push(clean);
    }
  }
  return explicit;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (clean.length < 3 || isStopTag(clean)) return false;
    const escaped = escapeRegex(clean);
    // ponytail: JS RegExp \b does not match Cyrillic boundaries; use unicode boundary
    const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`, 'iu');
    return regex.test(lower);
  });

  const keywords = AI_CATEGORY_KEYWORDS;

  const detected: string[] = [];
  for (const [tag, triggers] of Object.entries(keywords)) {
    if (triggers.some((tr) => lower.includes(tr))) {
      detected.push(formatTag(tag, style));
    }
  }

  const result = Array.from(
    new Set([...explicit, ...matchedExisting.map((t) => formatTag(t, style)), ...detected])
  )
    .filter((t) => !isStopTag(t))
    .slice(0, maxTags);

  return result;
}

function localMatchFolder(
  text: string,
  folders: FolderMeta[],
  fallbackFolder: string
): { folder: string; reason: string } {
  const eligible = folders.filter((f) => f.path !== DEFAULT_INBOX_FOLDER);
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

/**
 * Shared low-level JSON LLM dispatcher across providers (Groq, KIE, Gemini, Relay).
 * Delegates to unified aiClient.
 */
async function callJsonLlm<T>(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  temperature = 0.1
): Promise<T | null> {
  return aiClient.completeJson<T>(settings, { systemPrompt, userPrompt, temperature });
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

  const eligibleFolders = folders.filter((f) => f.path !== DEFAULT_INBOX_FOLDER);
  const foldersContext = eligibleFolders.map((f) => ({
    path: f.path,
    name: f.name,
    description: f.description || 'Общие заметки этой темы',
  }));

  const systemPrompt = `Ты — экспертный диспетчер каталогизации и таксономист персональной базы знаний SLAG.
Твоя задача — для текста заметки определить:
1. Наиболее подходящую целевую папку (targetFolder).
2. От 0 до ${maxTags} лучших тегов (tags).
3. Краткую причину (reason, 5-8 слов на русском).
4. Сформулировать ёмкий, нормализованный заголовок (suggestedTitle, 3-6 слов на русском, без спецсимволов и кавычек).

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
   - От 0 до ${maxTags} точных тегов. Если в заметке нет выраженной темы или это бытовой фрагмент/тест/слишком короткий текст — верни пустой массив [].
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать в качестве тегов типы сущностей ("заметка", "таска", "задача", "статья", "файл", "аудио", "фото").
   - Используй существующие теги из словаря при точном совпадении, либо смело создавай новые точные теги.
   - Формат тегов: ${style === 'kebab-case' ? 'kebab-case без пробелов' : 'строчные буквы без знака #'}.
3. ПРИЧИНА:
   - 5-8 слов на русском языке, объясняющих выбор.
4. ЗАГОЛОВОК:
   - 3-6 слов на русском, отражающих суть.
${settings.customTagRules ? `Пользовательские правила: ${settings.customTagRules}` : ''}

Ответь СТРОГО в формате JSON:
{
  "suggestedTitle": "краткий заголовок",
  "targetFolder": "путь_папки",
  "tags": ["тег1", "тег2"],
  "reason": "краткая причина"
}`;

  const userPrompt = `Текст заметки:\n${content.slice(0, 2000)}`;

  aiLog.info(`Draft classification requested: len=${content.length} chars, folder="${currentFolder}", folders=${eligibleFolders.length}, tags=${existingTags.length}`);
  const startTime = performance.now();

  const parsed = await callJsonLlm<{
    suggestedTitle?: string;
    targetFolder?: string;
    tags?: string[];
    reason?: string;
  }>(systemPrompt, userPrompt, settings, 0.2);

  const durationMs = Math.round(performance.now() - startTime);

  if (parsed) {
    const rawTags: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];
    const formatted = rawTags
      .map((t) => formatTag(String(t), style))
      .filter((t) => Boolean(t) && !isStopTag(t));
    const combinedTags = Array.from(new Set([...explicit, ...formatted])).slice(0, maxTags);

    let targetFolder = parsed.targetFolder?.trim() || currentFolder;
    const folderExists = eligibleFolders.some((f) => f.path === targetFolder) || targetFolder === currentFolder || targetFolder === DEFAULT_INBOX_FOLDER;
    if (!folderExists) {
      targetFolder = currentFolder;
    }

    const finalResult = {
      targetFolder,
      tags: combinedTags,
      reason: parsed.reason?.trim() || 'По смыслу заметки',
      suggestedTitle: parsed.suggestedTitle?.trim() || undefined,
    };
    aiLog.info(`Draft categorized in ${durationMs}ms: title="${finalResult.suggestedTitle || ''}" -> "${finalResult.targetFolder}" [${finalResult.tags.map(t => '#' + t).join(' ')}]`);
    return finalResult;
  }

  // Local fallback
  const localMatch = currentFolder === DEFAULT_INBOX_FOLDER
    ? localMatchFolder(content, eligibleFolders, currentFolder)
    : { folder: currentFolder, reason: 'Текущая папка' };

  const fallbackResult = {
    targetFolder: localMatch.folder,
    tags: localHeuristicTags(content, existingTags, style, maxTags),
    reason: localMatch.reason,
  };
  aiLog.info(`Draft categorized (heuristic): -> "${fallbackResult.targetFolder}" [${fallbackResult.tags.map(t => '#' + t).join(' ')}]`);
  return fallbackResult;
}

/**
 * Intelligent AI tagging (backwards-compatible wrapper around categorizeDraft).
 */
export async function generateSmartTags(content: string, settings: AiSettings): Promise<string[]> {
  const result = await categorizeDraft(content, DEFAULT_INBOX_FOLDER, [], settings);
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
  const eligibleFolders = folders.filter((f) => f.path !== DEFAULT_INBOX_FOLDER);
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
  const totalChunks = Math.ceil(inboxItems.length / CHUNK_SIZE);
  aiLog.info(`Starting batch triage for ${inboxItems.length} items (${totalChunks} chunks)`);

  for (let i = 0; i < inboxItems.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
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
2. Подобрать от 0 до ${maxTags} точных тегов (tags). Если тема не выражена или это бытовой фрагмент — верни пустой массив []. Запрещено использовать в качестве тегов слова "заметка", "таска", "задача", "статья", "файл", "аудио", "фото".
3. Написать краткую причину на русском языке (reason, 5-8 слов).
4. Сформулировать ёмкий, нормализованный заголовок заметки (suggestedTitle, 3-6 слов на русском, без спецсимволов и кавычек). Если текущий заголовок уже информативен, оставь его.

СПИСОК ДОСТУПНЫХ ПАПОК:
${JSON.stringify(foldersContext, null, 2)}

СЛОВАРЬ СУЩЕСТВУЮЩИХ ТЕГОВ:
[${existingTags.join(', ')}]

ПРАВИЛА:
1. targetFolder должен в точности совпадать с полем path одной из папок.
2. Теги должны отражать суть заметки (${style === 'kebab-case' ? 'kebab-case' : 'строчные буквы без #'}). Если тема не выражена — верни пустой массив tags: [].
3. reason — 5-8 слов на русском.
4. suggestedTitle — 3-6 слов на русском, суть заметки для имени файла.
5. Верни ТОЛЬКО JSON-массив объектов: [{ "itemId": "...", "suggestedTitle": "...", "targetFolder": "...", "tags": ["..."], "reason": "..." }]`;

    const userPrompt = `НЕРАЗОБРАННЫЕ ЗАМЕТКИ (ПАКЕТ):\n${JSON.stringify(itemsContext, null, 2)}`;

    let chunkResult: TriageSuggestion[] | null = null;

    try {
      const parsed = await callJsonLlm<
        Array<{ itemId: string; suggestedTitle?: string; targetFolder: string; tags?: string[]; reason: string }>
      >(systemPrompt, userPrompt, settings, 0.1);

      if (Array.isArray(parsed) && parsed.length > 0) {
        chunkResult = chunk.map((item) => {
          const match = parsed.find((s) => s.itemId === item.id);
          const rawTags = Array.isArray(match?.tags) ? match!.tags : [];
          const formatted = rawTags
            .map((t) => formatTag(String(t), style))
            .filter((t) => Boolean(t) && !isStopTag(t));
          const itemExisting = (item.tags || []).filter((t) => !isStopTag(t));
          const mergedTags = Array.from(new Set([...itemExisting, ...formatted])).slice(0, maxTags);
          const targetFolder = match?.targetFolder && eligibleFolders.some((f) => f.path === match.targetFolder)
            ? match.targetFolder
            : eligibleFolders[0].path;

          return {
            itemId: item.id,
            itemTitle: item.title || 'Без названия',
            suggestedTitle: match?.suggestedTitle?.trim() || item.title || 'Без названия',
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
        const itemExisting = (item.tags || []).filter((t) => !isStopTag(t));
        const mergedTags = Array.from(new Set([...itemExisting, ...tags])).slice(0, maxTags);

        return {
          itemId: item.id,
          itemTitle: item.title,
          suggestedTitle: item.title,
          targetFolder: matched.folder,
          tags: mergedTags,
          reason: matched.reason,
        };
      });
    }

    allSuggestions.push(...chunkResult);
    processedCount += chunk.length;
    aiLog.debug(`Triage chunk ${chunkIndex}/${totalChunks} completed (${chunk.length} items)`, {
      processed: processedCount,
      total: inboxItems.length,
    });

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
