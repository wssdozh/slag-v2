// HTTP catch-up and fallback share the room's existing account authorization.
import { NOTE_BATCH_BYTES, parseNoteEvents, parseNoteHeads, parseNoteResults, parseNoteStatus } from './wire.ts';
import type { NoteOp } from './wire.ts';

export class NoteHttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`Note registry: HTTP ${status}${code ? ` (${code})` : ''}`);
    this.status = status;
    this.code = code;
  }
}

interface NoteChannelOptions {
  serverUrl: string; roomId: string; vaultId: string;
  headers: (includeJson: boolean) => Record<string, string>;
  signal: AbortSignal;
}

export class NoteChannel {
  private readonly options: NoteChannelOptions;
  constructor(options: NoteChannelOptions) { this.options = options; }


  private async request(action: string, params: Record<string, string | number> = {}, body?: unknown): Promise<unknown> {
    this.options.signal.throwIfAborted();
    const query = new URLSearchParams({ vault: this.options.vaultId });
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    const result = await fetch(`${this.options.serverUrl.replace(/\/+$/, '')}/api/rooms/${encodeURIComponent(this.options.roomId)}/${action}?${query}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: this.options.headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([this.options.signal, AbortSignal.timeout(60_000)]),
    });
    if (!result.ok) {
      const data: unknown = await result.json().catch(() => null);
      const error = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '';
      throw new NoteHttpError(result.status, /^[a-z0-9_]{1,64}$/.test(error) ? error : '');
    }
    return result.json() as Promise<unknown>;
  }

  async status() {
    try {
      return parseNoteStatus(await this.request('note-status'));
    } catch (error) {
      // An old relay has no endpoint. Network/auth/malformed responses are not a legacy vote.
      if (error instanceof NoteHttpError && error.status === 404 && (error.code === 'not_found' || error.code === '')) {
        return { mode: 'legacy' as const, generation: 0, head: 0, floor: 0 };
      }
      throw error;
    }
  }

  async events(generation: number, since: number, maxBytes = NOTE_BATCH_BYTES) {
    return parseNoteEvents(await this.request('note-events', { generation, since, maxBytes }));
  }

  async heads(generation: number, after: string, since: number, through: number, maxBytes = NOTE_BATCH_BYTES) {
    return parseNoteHeads(await this.request('note-heads', { generation, after, since, through, maxBytes }));
  }

  async send(generation: number, requestId: string, ops: NoteOp[]) {
    return parseNoteResults(await this.request('note-ops', {}, { type: 'note_ops', generation, requestId, ops }));
  }
}
