// App-facing AI calls: categorize a note, triage a folder, send a chat turn.
import type { SlagItem, FolderMeta, AiSettings } from '../../types';
import { storage } from '../storage';
import { logger } from '../logger/logger';
import { completeJson } from './aiClient';
import {
  assistantOrchestrator,
  resolveKieEndpoint,
  type SendAssistantChatParams,
  type SendAssistantChatResult,
} from './orchestrator';
import {
  DEFAULT_INBOX_FOLDER,
  AI_CATEGORY_KEYWORDS,
} from '../../config';
import { formatTag, isStopTag } from './tags';
import {
  buildDraftTaggingPrompt,
  buildTriageTaggingPrompt,
  sortTagsByUsage,
  type TagUsage,
} from './taggingPrompt';

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

/** Tag counters, most used first: reuse beats invention, so the fallback reads them in that order. */
function collectTagUsage(): TagUsage[] {
  return sortTagsByUsage(
    Object.entries(storage.getVaultStats().tags)
      .filter(([tag, count]) => tag.length > 0 && count > 0 && !isStopTag(tag))
      .map(([tag, count]) => ({ tag, count }))
  );
}

/** JS RegExp \b has no Cyrillic boundaries, so word edges are spelled out with unicode classes. */
function matchesWord(lower: string, word: string): boolean {
  const escaped = escapeRegex(word);
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`, 'u').test(lower);
}

/** Stems match a word start only: `ui` must not fire inside `build`. */
function matchesStem(lower: string, stem: string): boolean {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegex(stem)}`, 'u').test(lower);
}

function localHeuristicTags(
  content: string,
  tagUsage: TagUsage[],
  style: 'lowercase' | 'kebab-case',
  maxTags: number,
  allowNewTags: boolean
): string[] {
  const explicit = extractExplicitHashtags(content, style);
  const lower = content.toLowerCase();
  const matchedExisting = tagUsage
    .filter(({ tag }) => tag.length >= 3 && !isStopTag(tag) && matchesWord(lower, tag))
    .map(({ tag }) => formatTag(tag, style));

  // Keyword categories are general by construction, never picked from the note's own words, and
  // they are new tags — so they queue behind dictionary matches and vanish when new tags are off.
  const detected: string[] = [];
  if (allowNewTags) {
    for (const [tag, triggers] of Object.entries(AI_CATEGORY_KEYWORDS)) {
      if (triggers.some((trigger) => matchesStem(lower, trigger))) {
        detected.push(formatTag(tag, style));
      }
    }
  }

  // The user's own hashtags survive the slice: they are intent, not a guess.
  return Array.from(new Set([...explicit, ...matchedExisting, ...detected]))
    .filter((t) => !isStopTag(t))
    .slice(0, maxTags);
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
 * Unified Draft Categorization (Pre-save in Composer):
 * Classifies note content into a target folder, taxonomy-based tags, and reasoning.
 */
export async function categorizeDraft(
  content: string,
  currentFolder: string,
  folders: FolderMeta[],
  settings: AiSettings
): Promise<CategorizeResult> {
  const tagUsage = collectTagUsage();
  const maxTags = settings.maxTagsPerNote || 4;
  const style = settings.tagCaseStyle || 'lowercase';
  const allowNewTags = settings.allowNewTags !== false;
  const explicit = extractExplicitHashtags(content, style);

  const eligibleFolders = folders.filter((f) => f.path !== DEFAULT_INBOX_FOLDER);

  const { systemPrompt, userPrompt } = buildDraftTaggingPrompt({
    content,
    currentFolder,
    inboxFolder: DEFAULT_INBOX_FOLDER,
    folders: eligibleFolders.map((f) => ({
      path: f.path,
      description: f.description || 'Общие заметки этой темы',
    })),
    tags: tagUsage,
    style,
    maxTags,
    allowNewTags,
    customRules: settings.customTagRules,
  });

  aiLog.info(`Draft classification requested: len=${content.length} chars, folder="${currentFolder}", folders=${eligibleFolders.length}, tags=${tagUsage.length}`);
  const startTime = performance.now();

  const parsed = await completeJson<{
    suggestedTitle?: string;
    targetFolder?: string;
    tags?: string[];
    reason?: string;
  }>(settings, { systemPrompt, userPrompt, temperature: 0.2 });

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
    tags: localHeuristicTags(content, tagUsage, style, maxTags, allowNewTags),
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

  const tagUsage = collectTagUsage();
  const maxTags = settings.maxTagsPerNote || 4;
  const style = settings.tagCaseStyle || 'lowercase';
  const allowNewTags = settings.allowNewTags !== false;

  const folderContext = eligibleFolders.map((f) => ({
    path: f.path,
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

    const { systemPrompt, userPrompt } = buildTriageTaggingPrompt({
      notes: chunk.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        tags: item.tags,
      })),
      currentFolder: DEFAULT_INBOX_FOLDER,
      inboxFolder: DEFAULT_INBOX_FOLDER,
      folders: folderContext,
      tags: tagUsage,
      style,
      maxTags,
      allowNewTags,
      customRules: settings.customTagRules,
    });

    let chunkResult: TriageSuggestion[] | null = null;

    try {
      const parsed = await completeJson<
        Array<{ itemId: string; suggestedTitle?: string; targetFolder: string; tags?: string[]; reason: string }>
      >(settings, { systemPrompt, userPrompt, temperature: 0.1 });

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
        const tags = localHeuristicTags(textToMatch, tagUsage, style, maxTags, allowNewTags);
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
