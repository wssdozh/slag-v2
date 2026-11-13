// Picks a transport per attachment type, tries the role's connection first, then the rest.
import type { AiSettings, SlagAttachment, SlagItem } from '../../../types';
import { AI_LIMITS } from '../../../config';
import { logger } from '../../logger/logger';
import { storage } from '../../storage';
import { blobToDataUrl } from '../blobToDataUrl';
import { downscaleImageDataUrl } from '../imageCodec';
import {
  chatTargetForConnection,
  isSubscriptionMode,
  mediaTargetForConnection,
  resolveChatTarget,
  resolveMediaTarget,
  type MediaTarget,
  type ResolvedAiTarget,
} from '../../ai/connections/resolve';
import { connectionSupports } from '../../ai/connections/presets';
import { isConnectionReadyFor, normalizeAiSettings } from '../../ai/connections/settings';
import { buildFileInstruction, buildImageInstruction, extractFocalContext, parseEnrichmentReply } from './text';
import { dataUrlToText } from './http';
import { analyzeImageOpenAi, transcribeAudioOpenAi } from './openAi';
import { analyzeImageGemini, transcribeAudioGemini } from './gemini';
import { callRelayMedia } from './relay';
import type { EnrichmentResult } from './types';

const enrichLog = logger.scope('AI');

/** The note keeps attachment metadata; the bytes live in IndexedDB or `.attachments/`. */
async function withBytes(attachment: SlagAttachment): Promise<SlagAttachment> {
  if (attachment.dataUrl) return attachment;
  const url = await storage.getAttachmentUrl(attachment.id, attachment.relativePath, attachment.mimeType);
  if (!url) return attachment;
  if (url.startsWith('data:')) return { ...attachment, dataUrl: url };

  const blob = await (await fetch(url)).blob();
  const dataUrl = await blobToDataUrl(blob);
  return { ...attachment, dataUrl };
}

/** The connection picked for the role, then every other ready one that can serve it. */
function mediaChain(settings: AiSettings, role: 'vision' | 'stt'): MediaTarget[] {
  const primary = resolveMediaTarget(settings, role);
  const targets: MediaTarget[] = primary ? [primary] : [];
  if (isSubscriptionMode(settings)) return targets;

  for (const connection of settings.connections) {
    if (!connectionSupports(connection, role) || !isConnectionReadyFor(connection, role)) continue;
    if (primary && 'connection' in primary && primary.connection.id === connection.id) continue;
    const target = mediaTargetForConnection(connection, role);
    if (target) targets.push(target);
  }
  return targets;
}

function chatChain(settings: AiSettings): ResolvedAiTarget[] {
  const primary = resolveChatTarget(settings);
  const targets: ResolvedAiTarget[] = primary ? [primary] : [];
  if (isSubscriptionMode(settings)) return targets;

  for (const connection of settings.connections) {
    if (!connectionSupports(connection, 'chat') || !isConnectionReadyFor(connection, 'chat')) continue;
    if (primary?.connectionId === connection.id) continue;
    const target = chatTargetForConnection(connection);
    if (target) targets.push(target);
  }
  return targets;
}

async function runMediaTarget(
  target: MediaTarget,
  attachment: SlagAttachment,
  focalContext: string
): Promise<EnrichmentResult> {
  const isImage = attachment.type === 'image';

  if (target.transport === 'relay') {
    if (isImage) {
      const dataUrl = await downscaleImageDataUrl(attachment.dataUrl || '');
      return callRelayMedia(target, 'vision', { dataUrl, prompt: buildImageInstruction(focalContext) });
    }
    return callRelayMedia(target, 'audio', {
      dataUrl: attachment.dataUrl || '',
      prompt: focalContext,
      fileName: attachment.name,
    });
  }

  if (target.transport === 'openai') {
    return isImage
      ? analyzeImageOpenAi(attachment, focalContext, target.connection, target.model)
      : transcribeAudioOpenAi(attachment, focalContext, target.connection, target.model);
  }

  return isImage
    ? analyzeImageGemini(attachment, focalContext, target.connection, target.model)
    : transcribeAudioGemini(attachment, focalContext, target.connection, target.model);
}

function isLikelyTextFile(attachment: SlagAttachment): boolean {
  return (
    attachment.mimeType.startsWith('text/') ||
    attachment.mimeType.includes('json') ||
    attachment.mimeType.includes('javascript') ||
    attachment.mimeType.includes('typescript') ||
    /\.(log|txt|md|json|yml|yaml|ts|tsx|js|jsx|py|rs|css|html|env|toml|csv)$/i.test(attachment.name)
  );
}

async function runFileTarget(
  target: ResolvedAiTarget,
  attachment: SlagAttachment,
  focalContext: string
): Promise<EnrichmentResult> {
  if (!isLikelyTextFile(attachment) || !attachment.dataUrl) {
    const readableSize =
      attachment.size > 1024 * 1024
        ? `${(attachment.size / (1024 * 1024)).toFixed(1)} МБ`
        : `${Math.round(attachment.size / 1024)} КБ`;
    return {
      extractedText: '',
      summary: `Вложенный файл ${attachment.name} (${readableSize})`,
    };
  }

  const sample = await dataUrlToText(attachment.dataUrl, AI_LIMITS.FILE_SAMPLE_MAX_BYTES);
  if (!sample.trim()) {
    return { extractedText: '', summary: `Файл ${attachment.name}` };
  }

  const response = await target.adapter.executeTurn({
    systemPrompt: buildFileInstruction(focalContext, attachment.name, sample),
    messages: [{ role: 'user', content: `Проанализируй файл «${attachment.name}».` }],
    tools: [],
    apiKey: target.apiKey,
    endpointUrl: target.endpointUrl,
    model: target.model,
    reasoningEffort: 'none',
    webSearchEnabled: false,
    turnHistory: [],
    isLastAllowedRound: true,
  });

  return parseEnrichmentReply(response.content || '{}');
}

export function canEnrichAttachments(rawSettings: AiSettings): boolean {
  const settings = normalizeAiSettings(rawSettings);
  return Boolean(
    resolveMediaTarget(settings, 'vision') ||
      resolveMediaTarget(settings, 'stt') ||
      resolveChatTarget(settings)
  );
}

/**
 * Single Entrypoint: Enriches any attachment using context-aware dispatching.
 */
export async function enrichAttachment(
  attachmentInput: SlagAttachment,
  focalContext: string,
  rawSettings: AiSettings
): Promise<SlagAttachment> {
  // Settings reach this boundary from storage and from tests; normalizing here means a
  // half-migrated or partial object cannot crash the transports below.
  const settings = normalizeAiSettings(rawSettings);
  const attachment = await withBytes(attachmentInput);
  const isMedia = attachment.type === 'image' || attachment.type === 'audio' || attachment.type === 'video';

  const mediaTargets = isMedia
    ? mediaChain(settings, attachment.type === 'image' ? 'vision' : 'stt')
    : [];
  const chatTargets = isMedia ? [] : chatChain(settings);

  if (mediaTargets.length === 0 && chatTargets.length === 0) {
    return { ...attachment, enrichmentStatus: 'idle' };
  }

  const startMs = performance.now();
  const route = isMedia ? mediaTargets[0]?.label : chatTargets[0]?.providerName;
  enrichLog.info(`Enriching attachment "${attachment.name}" (${attachment.type})`, {
    context: focalContext.slice(0, 60),
    route: route || 'none',
  });

  try {
    let result: EnrichmentResult | null = null;
    let lastError: unknown = null;

    for (const target of mediaTargets) {
      try {
        result = await runMediaTarget(target, attachment, focalContext);
        break;
      } catch (err) {
        lastError = err;
        enrichLog.warn(`Attachment channel failed for "${attachment.name}", trying next`, {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!result) {
      for (const target of chatTargets) {
        try {
          result = await runFileTarget(target, attachment, focalContext);
          break;
        } catch (err) {
          lastError = err;
          enrichLog.warn(`File channel failed for "${attachment.name}", trying next`, {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (!result) throw lastError ?? new Error('Разбор вложения не удался');

    const duration = Math.round(performance.now() - startMs);
    enrichLog.info(`Enriched "${attachment.name}" in ${duration}ms`, {
      hasText: Boolean(result.extractedText),
      summary: result.summary.slice(0, 60),
    });

    const enriched: SlagAttachment = {
      ...attachment,
      extractedText: result.extractedText || undefined,
      summary: result.summary || undefined,
      enrichmentStatus: 'ready',
      enrichmentError: undefined,
    };

    // The bytes are what makes the enrichment usable later, and this path is already async:
    // waiting for the write here closes the window where a reload loses the cached copy.
    await storage.saveAttachment(enriched);
    return enriched;
  } catch (err: any) {
    enrichLog.warn(`Enrichment failed for "${attachment.name}":`, err?.message || err);
    return {
      ...attachment,
      enrichmentStatus: 'error',
      enrichmentError: err?.message || 'Ошибка обработки',
    };
  }
}

/**
 * Enriches all pending/idle attachments for a given note item asynchronously.
 * Updates the note in storage and triggers the callback so UI and Orama search update.
 */
export async function enrichItemAttachments(
  item: SlagItem,
  onUpdated: (updatedItem: SlagItem) => void,
  settings: AiSettings
): Promise<void> {
  if (!item.attachments || item.attachments.length === 0) return;
  if (!canEnrichAttachments(settings)) return;

  const needsEnrichment = item.attachments.some(
    (a) => !a.extractedText && !a.summary && a.enrichmentStatus !== 'processing'
  );
  if (!needsEnrichment) return;

  const focalContext = extractFocalContext(item);

  // Mark in-flight in UI
  const inFlightAttachments = item.attachments.map((a) => {
    if (!a.extractedText && !a.summary && a.enrichmentStatus !== 'processing') {
      return { ...a, enrichmentStatus: 'processing' as const };
    }
    return a;
  });

  const inFlightItem: SlagItem = {
    ...item,
    attachments: inFlightAttachments,
    updatedAt: Date.now(),
  };
  onUpdated(inFlightItem);

  // One at a time. Five photos enriched in parallel are five vision requests inside one second,
  // and the provider meters tokens per minute: the burst comes back as 429 and the whole note
  // ends up with an error instead of text.
  const enrichedAttachments: SlagAttachment[] = [];
  for (const att of inFlightAttachments) {
    enrichedAttachments.push(
      att.enrichmentStatus === 'processing'
        ? await enrichAttachment(att, focalContext, settings)
        : att
    );
  }

  const finalItem: SlagItem = {
    ...item,
    attachments: enrichedAttachments,
    updatedAt: Date.now(),
  };

  onUpdated(finalItem);
}
