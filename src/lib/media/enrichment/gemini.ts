// Native Gemini generateContent: the only transport that reads audio inline instead of Whisper.
import type { AiConnection, SlagAttachment } from '../../../types';
import { resolveGeminiGenerateEndpoint } from '../../ai/connections/endpoints';
import { enrichFetch } from './http';
import { buildImageInstruction, parseEnrichmentReply } from './text';
import type { EnrichmentResult } from './types';

function inlinePart(attachment: SlagAttachment, fallbackMime: string) {
  const base64Data = (attachment.dataUrl || '').split(',')[1] || '';
  return {
    inlineData: {
      mimeType: attachment.mimeType || fallbackMime,
      data: base64Data,
    },
  };
}

async function generate(connection: AiConnection, model: string, parts: unknown[]): Promise<string> {
  const res = await enrichFetch(resolveGeminiGenerateEndpoint(connection, model, connection.apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  return String(data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function analyzeImageGemini(
  attachment: SlagAttachment,
  focalContext: string,
  connection: AiConnection,
  model: string
): Promise<EnrichmentResult> {
  const rawText = await generate(connection, model, [
    { text: buildImageInstruction(focalContext) },
    inlinePart(attachment, 'image/png'),
  ]);
  return parseEnrichmentReply(rawText || '{}');
}

export async function transcribeAudioGemini(
  attachment: SlagAttachment,
  focalContext: string,
  connection: AiConnection,
  model: string
): Promise<EnrichmentResult> {
  const prompt = `Контекст: "${focalContext}". Сделай точную дословную расшифровку аудиозаписи. Без лишних вступительных слов. Выведи строго расшифрованный текст.`;
  const text = await generate(connection, model, [
    { text: prompt },
    inlinePart(attachment, 'audio/webm'),
  ]);
  return { extractedText: text, summary: text.slice(0, 100) };
}
