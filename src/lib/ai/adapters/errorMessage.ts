/**
 * One answer to "what did the provider actually say".
 *
 * The three protocol adapters ship the same error body in three different JSON shapes, so the
 * wording of a 429 or a bad-key turns up in logs and toasts from here — not from each adapter.
 */
export function extractErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.msg) return parsed.msg;
    if (parsed.error && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON
  }
  const clean = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 160) : `HTTP ${status}`;
}
