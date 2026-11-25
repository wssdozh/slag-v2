// HTTP catch-up and fallback share the room's existing account authorization.
import { NOTE_BATCH_BYTES, parseNoteEvents, parseNoteHeads, parseNoteResults, parseNoteStatus } from './wire.ts';
import type { NoteKeys, NoteOp, NoteStatus } from './wire.ts';
import { base64ToBytes, bytesToBase64 } from '../../media/byteCodec.ts';
import { openRegistryMedia, REGISTRY_MEDIA_MAX_BYTES, sealRegistryMedia } from './mediaWire.ts';

// Control flow, not a relay or journal error: the unchanged attempt will be retried.
export class RelayPaused extends Error {}

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
  isRelayPaused?: () => boolean;
  atomicGroups?: boolean;
  sharedRecords?: boolean;
  registryMedia?: boolean;
}

export class NoteChannel {
  private readonly options: NoteChannelOptions;
  constructor(options: NoteChannelOptions) { this.options = options; }


  private async request(action: string, params: Record<string, string | number> = {}, body?: unknown,
    method = body === undefined ? 'GET' : 'POST'): Promise<unknown> {
    this.options.signal.throwIfAborted();
    // An accepted revision already being projected still needs its bytes before committing.
    if (!(action === 'note-media' && method === 'GET') && this.options.isRelayPaused?.()) throw new RelayPaused();
    const query = new URLSearchParams({ vault: this.options.vaultId, folderTree: '1' });
    if (this.options.atomicGroups) query.set('atomicGroups', '1');
    if (this.options.sharedRecords) query.set('sharedRecords', '1');
    if (this.options.registryMedia) query.set('registryMedia', '1');
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    const result = await fetch(`${this.options.serverUrl.replace(/\/+$/, '')}/api/rooms/${encodeURIComponent(this.options.roomId)}/${action}?${query}`, {
      method,
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

  async status(): Promise<NoteStatus> {
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

  async uploadMedia(keys: NoteKeys, generation: number, plaintext: Uint8Array, expectedId?: string): Promise<string> {
    const { roomId, signal } = this.options;
    signal.throwIfAborted();
    const { id, bytes } = await sealRegistryMedia(keys, roomId, generation, plaintext);
    if (expectedId !== undefined && id !== expectedId) throw new Error('Байты вложения изменились после сохранения попытки');
    const body = { ciphertext: bytesToBase64(bytes) };
    const put = () => this.request('note-media', { generation, id }, body, 'PUT');
    const result = await put().catch((error: unknown) => {
      signal.throwIfAborted();
      // A lost response is ambiguous. Retry the exact sealed bytes, never a fresh nonce.
      if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === 'TimeoutError')) throw error;
      return put();
    });
    if (!result || typeof result !== 'object' || !('id' in result) || result.id !== id) throw new Error('Invalid registry media receipt');
    signal.throwIfAborted();
    return id;
  }

  async downloadMedia(keys: NoteKeys, generation: number, id: string): Promise<Uint8Array> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid registry media address');
    const result = await this.request('note-media', { generation, id });
    if (!result || typeof result !== 'object' || !('ciphertext' in result) || typeof result.ciphertext !== 'string'
        || result.ciphertext.length > 4 * Math.ceil(REGISTRY_MEDIA_MAX_BYTES / 3)) throw new Error('Invalid registry media response');
    const bytes = await openRegistryMedia(keys, this.options.roomId, generation, id, base64ToBytes(result.ciphertext));
    this.options.signal.throwIfAborted();
    return bytes;
  }

  async send(generation: number, requestId: string, ops: NoteOp[], observedHead?: number) {
    return parseNoteResults(await this.request('note-ops', {}, { type: 'note_ops', generation, requestId, ops, observedHead }));
  }
}
