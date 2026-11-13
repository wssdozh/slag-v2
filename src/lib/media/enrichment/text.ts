// Instructions sent to vision/audio/file models, and the parsing of their replies.
import { AI_LIMITS } from '../../../config';
import type { EnrichmentResult } from './types';

/**
 * Extracts a compact, high-value focal context snapshot (under 50 tokens).
 * This prevents context overflow while giving Whisper and Vision models
 * exact terminology, names, and user intent.
 */
export function extractFocalContext(item: { title?: string; tags?: string[]; content?: string }): string {
  const parts: string[] = [];
  if (item.title && item.title.trim()) {
    parts.push(`Тема: ${item.title.trim()}`);
  }
  if (item.tags && item.tags.length > 0) {
    parts.push(`Теги: ${item.tags.join(', ')}`);
  }
  if (item.content && item.content.trim()) {
    // Keep only focal characters to avoid noise and token waste
    const snippet = item.content.trim().slice(0, AI_LIMITS.FOCAL_CONTEXT_MAX_CHARS).replace(/\s+/g, ' ');
    parts.push(`Контекст: ${snippet}`);
  }
  return parts.join(' | ');
}

export function buildImageInstruction(focalContext: string): string {
  return `Ты — модуль анализа изображений и OCR.
Задачи:
1. Извлечь весь читаемый текст на изображении (OCR), если он есть (чеки, код, скриншоты, надписи, ценники).
2. Сформулировать краткую выжимку в 1-2 предложения с учетом контекста заметки: "${focalContext}".
Если текста на картинке нет, extractedText оставь пустым.
Ответ верни СТРОГО в формате JSON без разметки:
{"extractedText": "весь найденный текст или пусто", "summary": "краткое описание"}`;
}

export function buildFileInstruction(focalContext: string, fileName: string, sample: string): string {
  return `Контекст заметки: "${focalContext}".
Имя файла: "${fileName}".
Фрагмент файла (первые 4 КБ):
\`\`\`
${sample.slice(0, AI_LIMITS.FILE_SAMPLE_SLICE_CHARS)}
\`\`\`

Сформулируй краткую суть файла в 1-2 предложениях (что внутри, ключевые параметры, ошибки или данные).
Ответ верни СТРОГО в JSON:
{"summary": "суть файла", "extractedText": "ключевые строки/ошибки/тезисы"}`;
}

/** Models occasionally wrap JSON in prose or fences; anything unparsable becomes a summary. */
export function parseEnrichmentReply(raw: string): EnrichmentResult {
  try {
    const parsed = JSON.parse(raw) as { extractedText?: unknown; summary?: unknown };
    return {
      extractedText: String(parsed.extractedText || '').trim(),
      summary: String(parsed.summary || '').trim(),
    };
  } catch {
    return { extractedText: '', summary: raw.slice(0, AI_LIMITS.SUMMARY_FALLBACK_CHARS).trim() };
  }
}

/** A transcript is already the text; the note only needs a one-line gist of it. */
export function summarizeTranscript(text: string): EnrichmentResult {
  if (text.length <= 120) return { extractedText: text, summary: text };
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
  return {
    extractedText: text,
    summary: firstSentence && firstSentence.length >= 10 ? firstSentence : text.slice(0, AI_LIMITS.SUMMARY_FALLBACK_CHARS),
  };
}
