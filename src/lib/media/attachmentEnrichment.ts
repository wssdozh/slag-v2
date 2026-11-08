import type { SlagAttachment, SlagItem, AiSettings } from '../../types';
import { logger } from '../logger';
import { storage } from '../storage';
import { AI_ENDPOINTS, DEFAULT_AI_MODELS, AI_LIMITS } from '../../config';

const enrichLog = logger.scope('AI');

/**
 * Extracts a compact, high-value focal context snapshot (under 50 tokens).
 * This prevents context overflow while providing Whisper and Vision models
 * with exact terminology, names, and user intent.
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

/**
 * Converts a base64 / blob data URL into a native Web Blob.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/**
 * Extracts up to maxBytes of text content from a text/file data URL.
 */
export async function dataUrlToText(dataUrl: string, maxBytes: number = 8192): Promise<string> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const slice = blob.slice(0, maxBytes);
    return await slice.text();
  } catch {
    return '';
  }
}

function getGroqApiUrl(endpoint: string): string {
  // If running in Vite dev server (e.g. localhost:5173), route through local Vite proxy
  // to avoid browser CORS / NetworkError
  if (
    typeof window !== 'undefined' &&
    (window.location.port === '5173' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  ) {
    return `/api/groq${endpoint}`;
  }
  return `${AI_ENDPOINTS.DEFAULT_GROQ_BASE_URL}${endpoint}`;
}

/**
 * Transcribes audio/video using Groq Whisper API (whisper-large-v3-turbo).
 */
async function transcribeAudioGroq(
  attachment: SlagAttachment,
  focalContext: string,
  apiKey: string
): Promise<{ extractedText: string; summary: string }> {
  const blob = await dataUrlToBlob(attachment.dataUrl || '');
  const formData = new FormData();
  const ext = attachment.type === 'video' ? 'webm' : 'webm';
  const fileName = attachment.name || `audio_${Date.now()}.${ext}`;

  formData.append('file', blob, fileName);
  formData.append('model', DEFAULT_AI_MODELS.WHISPER_DEFAULT);
  formData.append('response_format', 'json');
  formData.append('temperature', '0');

  if (focalContext) {
    formData.append('prompt', focalContext);
  }

  const res = await fetch(getGroqApiUrl('/audio/transcriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq Whisper failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const extractedText = (data.text || '').trim();

  // Create a concise summary if text is substantial
  let summary = '';
  if (extractedText.length > 120) {
    const firstSentence = extractedText.split(/[.!?\n]/)[0]?.trim();
    summary = firstSentence && firstSentence.length >= 10 ? firstSentence : extractedText.slice(0, 100);
  } else {
    summary = extractedText;
  }

  return { extractedText, summary };
}

/**
 * Fallback: Transcribes audio with Gemini 2.0 Flash.
 */
async function transcribeAudioGemini(
  attachment: SlagAttachment,
  focalContext: string,
  apiKey: string
): Promise<{ extractedText: string; summary: string }> {
  const base64Data = (attachment.dataUrl || '').split(',')[1] || '';
  const prompt = `Контекст: "${focalContext}". Сделай точную дословную расшифровку аудиозаписи. Без лишних вступительных слов. Выведи строго расшифрованный текст.`;

  const res = await fetch(
    `${AI_ENDPOINTS.DEFAULT_GEMINI_BASE_URL}/models/${DEFAULT_AI_MODELS.GEMINI_DEFAULT}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: attachment.mimeType || 'audio/webm',
                  data: base64Data,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini Audio failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  return { extractedText: text, summary: text.slice(0, 100) };
}

/**
 * Downscales an image data URL to a maximum dimension to stay within token/payload budgets.
 */
export async function downscaleImageDataUrl(dataUrl: string, maxDim: number = AI_LIMITS.IMAGE_DOWNSCALE_MAX_DIM): Promise<string> {
  if (typeof window === 'undefined' || !dataUrl.startsWith('data:image')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim && dataUrl.length < AI_LIMITS.IMAGE_MAX_PAYLOAD_BYTES) {
        resolve(dataUrl);
        return;
      }
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', AI_LIMITS.IMAGE_JPEG_QUALITY));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Analyzes an image with Groq Vision with automatic model failover.
 */
async function analyzeImageGroq(
  attachment: SlagAttachment,
  focalContext: string,
  apiKey: string
): Promise<{ extractedText: string; summary: string }> {
  if (!attachment.dataUrl) {
    throw new Error('Image dataUrl is missing');
  }

  const optimizedDataUrl = await downscaleImageDataUrl(attachment.dataUrl);

  const systemInstruction = `Ты — модуль анализа изображений и OCR.
Задачи:
1. Извлечь весь читаемый текст на изображении (OCR), если он есть (чеки, код, скриншоты, надписи, ценники).
2. Сформулировать краткую выжимку в 1-2 предложения с учетом контекста заметки: "${focalContext}".
Если текста на картинке нет, extractedText оставь пустым.
Ответ верни СТРОГО в формате JSON без разметки:
{"extractedText": "весь найденный текст или пусто", "summary": "краткое описание"}`;

  const candidateModels = DEFAULT_AI_MODELS.GROQ_VISION_CANDIDATES;

  let lastError = '';
  for (const model of candidateModels) {
    try {
      const res = await fetch(getGroqApiUrl('/chat/completions'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemInstruction },
                {
                  type: 'image_url',
                  image_url: { url: optimizedDataUrl },
                },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `Model ${model} (${res.status}): ${errText.slice(0, 120)}`;
        enrichLog.warn(`Groq Vision ${model} failed, trying next candidate:`, lastError);
        continue;
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(rawContent);
        return {
          extractedText: (parsed.extractedText || '').trim(),
          summary: (parsed.summary || '').trim(),
        };
      } catch {
        return {
          extractedText: '',
          summary: rawContent.slice(0, 150).trim(),
        };
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  throw new Error(`Groq Vision failed: ${lastError}`);
}

/**
 * Fallback: Analyzes image with Gemini 2.0 Flash.
 */
async function analyzeImageGemini(
  attachment: SlagAttachment,
  focalContext: string,
  apiKey: string
): Promise<{ extractedText: string; summary: string }> {
  const base64Data = (attachment.dataUrl || '').split(',')[1] || '';
  const prompt = `Контекст: "${focalContext}". Извлеки весь читаемый текст на изображении (OCR) и дай краткое описание сути в 1-2 предложениях.
Ответ верни СТРОГО в формате JSON: {"extractedText": "найденный текст", "summary": "краткое описание"}`;

  const res = await fetch(
    `${AI_ENDPOINTS.DEFAULT_GEMINI_BASE_URL}/models/${DEFAULT_AI_MODELS.GEMINI_DEFAULT}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: attachment.mimeType || 'image/png',
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini Vision failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    const parsed = JSON.parse(rawText);
    return {
      extractedText: (parsed.extractedText || '').trim(),
      summary: (parsed.summary || '').trim(),
    };
  } catch {
    return { extractedText: '', summary: rawText.slice(0, 150).trim() };
  }
}

/**
 * Analyzes arbitrary files (logs, code, configs, text) with Groq LLM.
 */
async function analyzeFileGroq(
  attachment: SlagAttachment,
  focalContext: string,
  apiKey: string
): Promise<{ extractedText: string; summary: string }> {
  const isLikelyText =
    attachment.mimeType.startsWith('text/') ||
    attachment.mimeType.includes('json') ||
    attachment.mimeType.includes('javascript') ||
    attachment.mimeType.includes('typescript') ||
    /\.(log|txt|md|json|yml|yaml|ts|tsx|js|jsx|py|rs|css|html|env|toml|csv)$/i.test(attachment.name);

  if (!isLikelyText || !attachment.dataUrl) {
    const readableSize = attachment.size > 1024 * 1024
      ? `${(attachment.size / (1024 * 1024)).toFixed(1)} МБ`
      : `${Math.round(attachment.size / 1024)} КБ`;
    return {
      extractedText: '',
      summary: `Вложенный файл ${attachment.name} (${readableSize})`,
    };
  }

  const sample = await dataUrlToText(attachment.dataUrl, AI_LIMITS.FILE_SAMPLE_MAX_BYTES);
  if (!sample.trim()) {
    return {
      extractedText: '',
      summary: `Файл ${attachment.name}`,
    };
  }

  const prompt = `Контекст заметки: "${focalContext}".
Имя файла: "${attachment.name}".
Фрагмент файла (первые 4 КБ):
\`\`\`
${sample.slice(0, AI_LIMITS.FILE_SAMPLE_SLICE_CHARS)}
\`\`\`

Сформулируй краткую суть файла в 1-2 предложениях (что внутри, ключевые параметры, ошибки или данные).
Ответ верни СТРОГО в JSON:
{"summary": "суть файла", "extractedText": "ключевые строки/ошибки/тезисы"}`;

  const res = await fetch(getGroqApiUrl('/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_AI_MODELS.GROQ_DEFAULT,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    return {
      extractedText: sample.slice(0, 300),
      summary: `Файл ${attachment.name} (${sample.length} символов)`,
    };
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(rawContent);
    return {
      extractedText: (parsed.extractedText || sample.slice(0, 300)).trim(),
      summary: (parsed.summary || '').trim(),
    };
  } catch {
    return {
      extractedText: sample.slice(0, 300),
      summary: rawContent.slice(0, 150).trim(),
    };
  }
}

/**
 * Single Entrypoint: Enriches any attachment using context-aware dispatching.
 */
export async function enrichAttachment(
  attachment: SlagAttachment,
  focalContext: string,
  settings: AiSettings
): Promise<SlagAttachment> {
  const groqKey = settings.groqApiKey || '';
  if (!groqKey) {
    return {
      ...attachment,
      enrichmentStatus: 'idle',
    };
  }

  const startMs = performance.now();
  enrichLog.info(`Enriching attachment "${attachment.name}" (${attachment.type})`, {
    context: focalContext.slice(0, 60),
  });

  try {
    let result: { extractedText: string; summary: string };

    if (attachment.type === 'audio' || attachment.type === 'video') {
      if (groqKey) {
        try {
          result = await transcribeAudioGroq(attachment, focalContext, groqKey);
        } catch (groqErr) {
          if (settings.geminiApiKey) {
            result = await transcribeAudioGemini(attachment, focalContext, settings.geminiApiKey);
          } else {
            throw groqErr;
          }
        }
      } else if (settings.geminiApiKey) {
        result = await transcribeAudioGemini(attachment, focalContext, settings.geminiApiKey);
      } else {
        throw new Error('API ключ Groq не указан в настройках');
      }
    } else if (attachment.type === 'image') {
      if (groqKey) {
        try {
          result = await analyzeImageGroq(attachment, focalContext, groqKey);
        } catch (groqErr) {
          if (settings.geminiApiKey) {
            result = await analyzeImageGemini(attachment, focalContext, settings.geminiApiKey);
          } else {
            throw groqErr;
          }
        }
      } else if (settings.geminiApiKey) {
        result = await analyzeImageGemini(attachment, focalContext, settings.geminiApiKey);
      } else {
        throw new Error('API ключ Groq не указан в настройках');
      }
    } else {
      result = await analyzeFileGroq(attachment, focalContext, groqKey);
    }

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

    // Cache updated attachment in local storage
    storage.saveAttachment(enriched);
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
  if (!settings.groqApiKey) return;

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

  // Run enrichments in parallel
  const enrichedAttachments = await Promise.all(
    inFlightAttachments.map(async (att) => {
      if (att.enrichmentStatus === 'processing') {
        return await enrichAttachment(att, focalContext, settings);
      }
      return att;
    })
  );

  const finalItem: SlagItem = {
    ...item,
    attachments: enrichedAttachments,
    updatedAt: Date.now(),
  };

  onUpdated(finalItem);
}
