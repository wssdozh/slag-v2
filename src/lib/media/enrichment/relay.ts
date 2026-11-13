// Subscription media: the relay owns the provider keys, the client only carries its token.
import type { MediaTarget } from '../../ai/connections/resolve';
import { enrichFetch } from './http';
import type { EnrichmentResult } from './types';

type RelayTarget = Extract<MediaTarget, { transport: 'relay' }>;

export async function callRelayMedia(
  target: RelayTarget,
  kind: 'vision' | 'audio',
  payload: Record<string, unknown>
): Promise<EnrichmentResult> {
  const res = await enrichFetch(`${target.serverUrl}/api/ai/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.token}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Relay ${kind} failed (${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  return {
    extractedText: String(data.extractedText || '').trim(),
    summary: String(data.summary || '').trim(),
  };
}
