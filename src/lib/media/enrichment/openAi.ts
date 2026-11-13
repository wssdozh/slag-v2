// OpenAI-compatible transports: chat-completions for images, multipart for speech.
import type { AiConnection, SlagAttachment } from '../../../types';
import { resolveTranscriptionEndpoint, resolveWire } from '../../ai/connections/endpoints';
import { downscaleImageDataUrl } from '../imageCodec';
import { dataUrlToBlob, enrichFetch } from './http';
import { buildImageInstruction, parseEnrichmentReply, summarizeTranscript } from './text';
import type { EnrichmentResult } from './types';

/**
 * The dev server routes Groq through Vite's `/api/groq` proxy; production webviews talk to
 * the API directly, where Groq answers CORS itself. Any other provider is left untouched.
 */
function transportUrl(connection: AiConnection, url: string): string {
  if (connection.kind !== 'groq' || typeof window === 'undefined') return url;
  const isDevServer =
    window.location.port === '5173' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  if (!isDevServer) return url;
  const base = 'https://api.groq.com/openai/v1';
  return url.startsWith(base) ? `/api/groq${url.slice(base.length)}` : url;
}

export async function analyzeImageOpenAi(
  attachment: SlagAttachment,
  focalContext: string,
  connection: AiConnection,
  model: string
): Promise<EnrichmentResult> {
  if (!attachment.dataUrl) throw new Error('Image dataUrl is missing');

  const optimizedDataUrl = await downscaleImageDataUrl(attachment.dataUrl);
  const { endpointUrl } = resolveWire(connection, model);

  const res = await enrichFetch(transportUrl(connection, endpointUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildImageInstruction(focalContext) },
            { type: 'image_url', image_url: { url: optimizedDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`${connection.label} vision failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  return parseEnrichmentReply(data.choices?.[0]?.message?.content || '{}');
}

export async function transcribeAudioOpenAi(
  attachment: SlagAttachment,
  focalContext: string,
  connection: AiConnection,
  model: string
): Promise<EnrichmentResult> {
  const blob = await dataUrlToBlob(attachment.dataUrl || '');
  const formData = new FormData();
  formData.append('file', blob, attachment.name || `audio_${Date.now()}.webm`);
  formData.append('model', model);
  formData.append('response_format', 'json');
  formData.append('temperature', '0');
  if (focalContext) {
    formData.append('prompt', focalContext);
  }

  const res = await enrichFetch(transportUrl(connection, resolveTranscriptionEndpoint(connection)), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`${connection.label} transcription failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  return summarizeTranscript(String(data.text || '').trim());
}
