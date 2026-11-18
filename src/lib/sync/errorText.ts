// What the status row says when a request dies before the relay answers.
//
// `AbortSignal.timeout` rejects with a bare "Fetch is aborted" in WebKit, and that string is what
// a person reads in the settings panel: it names neither the request nor the wait it gave up on.
const ABORT_PATTERN = /abort|timeout/i;

/** A timeout becomes "the server did not answer in N s"; every other message stands as is. */
export function syncErrorText(error: unknown, timeoutMs: number): string {
  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = error instanceof Error
    ? error.name === 'AbortError' || error.name === 'TimeoutError' || ABORT_PATTERN.test(message)
    : ABORT_PATTERN.test(message);
  if (!isTimeout) return message;
  return `Сервер не ответил за ${Math.round(timeoutMs / 1000)} с, повторяю`;
}
