// Serializes local intents and canonical application, not the network. I/O is owned by the host.
import type { SlagItem } from '../../../types/index.ts';
import type { AcceptedNote, NoteMutation } from '../../storage/noteRegistry';
import { NoteChannel } from './channel.ts';
import { confirmedNote, emptyJournal, firstPerNote, recordNote, setAttempt, setConfirmed, settleNote } from './journal.ts';
import type { JournalAttempt, NoteBase, NoteIntent, NoteJournal } from './journal.ts';
import { mergeNote, sameNote } from './merge.ts';
import { NOTE_BATCH_BYTES, NOTE_BATCH_COUNT, openNote, opaqueNoteId, parseLiveNoteEvents, parseNoteResults, sealNote } from './wire.ts';
import type { NoteHead, NoteKeys, NoteOp, NoteResult, NoteResults } from './wire.ts';

export interface NoteConflict {
  intentId: string;
  noteId: string;
  kind: NoteIntent['kind'];
  revision: number;
  item: SlagItem | null;
  fields: string[];
  at: number;
}

interface NoteReplicaHost {
  channel: NoteChannel;
  room: string;
  generation: number;
  keys: NoteKeys;
  signal: AbortSignal;
  readOnly: boolean;
  sendLive: (data: string) => boolean;
  save: (state: NoteJournal) => Promise<void>;
  apply: (note: AcceptedNote) => Promise<void>;
  storeConflict: (conflict: NoteConflict) => Promise<void>;
  onError: (error: unknown) => void;
  onProgress: () => void;
}

const PUSH_DELAY_MS = 50;
const RETRY_MS = 10_000;
const WS_ACK_MS = 2_500;

type Candidate = { item: SlagItem | null; kind: NoteOp['kind']; conflicts: string[]; skip?: true };

function candidate(intent: NoteIntent, head: NoteBase | undefined): Candidate {
  const { base, kind, item } = intent;
  const current = head?.item ?? null;
  if (!base && !intent.attempt) throw new Error('Неизвестна исходная версия заметки; правка осталась в очереди');
  if (sameNote(item, current)) return { item, kind, conflicts: [], skip: true };
  if (!head && kind === 'create') return { item, kind, conflicts: [] };
  if (!head) throw new Error('Эталон заметки не найден; правка осталась в очереди');
  if (kind === 'restore' && current === null && base?.revision === head.revision) return { item, kind, conflicts: [] };
  if (kind === 'update' && base?.item && item && current) {
    const merged = mergeNote(base.item, item, current);
    return { ...merged, kind, ...(sameNote(merged.item, current) ? { skip: true as const } : {}) };
  }
  if (kind === 'delete' && current && base?.item && sameNote(base.item, current)) return { item, kind, conflicts: [] };
  return { item: current, kind, conflicts: [kind], skip: true };
}

export class NoteReplica {
  private state: NoteJournal;
  private chain = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending = false;
  private pulling: Promise<void> | undefined;
  private results: { id: string; receive: (value: NoteResults | null) => void } | undefined;
  private ready = false;
  private staleCounts = new Map<string, number>();

  constructor(private readonly host: NoteReplicaHost, state = emptyJournal()) {
    this.state = state;
    host.signal.addEventListener('abort', () => {
      clearTimeout(this.timer);
      this.results?.receive(null);
    }, { once: true });
  }

  get pendingCount() { return this.state.pending.length; }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.chain.then(() => {
      this.host.signal.throwIfAborted();
      return task();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async persist(state: NoteJournal) {
    this.host.signal.throwIfAborted();
    if (state === this.state) return;
    await this.host.save(state);
    this.state = state;
  }

  record(changes: NoteMutation[]): Promise<void> {
    if (this.host.readOnly) return Promise.resolve();
    const run = this.enqueue(async () => {
      const state = changes.reduce((journal, change) => recordNote(journal, { ...change, intentId: crypto.randomUUID() }), this.state);
      await this.persist(state);
      this.schedule();
    });
    return run.catch((err: unknown) => { this.error(err); throw err; });
  }

  private error(error: unknown) {
    if (!this.host.signal.aborted) this.host.onError(error);
  }

  private schedule(delay = PUSH_DELAY_MS) {
    if (!this.ready || this.host.readOnly || this.host.signal.aborted || this.sending || this.timer || !this.pendingCount) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
  }

  handleMessage(message: unknown) {
    if (this.host.signal.aborted) return;
    try {
      if (message && typeof message === 'object' && 'type' in message && message.type === 'note_results') {
        const data = parseNoteResults(message);
        if (data.generation === this.host.generation && this.results?.id === data.requestId) this.results.receive(data);
        return;
      }
      const data = parseLiveNoteEvents(message);
      if (data.generation !== this.host.generation) return;
      void this.applyEvents(data.events).then((gap) => gap ? this.catchUp() : undefined).catch((err: unknown) => this.error(err));
    } catch (err) {
      this.error(err);
    }
  }

  private async retainConflict(intent: NoteIntent, revision: number, fields: string[]) {
    if (fields.length) await this.host.storeConflict({ intentId: intent.intentId, noteId: intent.id, kind: intent.kind,
      revision, item: intent.item, fields, at: Date.now() });
  }

  private async settle(intent: NoteIntent, head: NoteBase, fields: string[]) {
    await this.retainConflict(intent, head.revision, fields);
    const next = settleNote(setConfirmed(this.state, intent.id, head), intent, head.revision);
    if (!next.pending.some((entry) => entry.id === intent.id)) {
      const current = confirmedNote(next, intent.id);
      if (current) await this.host.apply({ id: intent.id, item: current.item });
    }
    await this.persist(next);
    this.staleCounts.delete(intent.intentId);
  }

  private async accept(head: NoteHead, applyKnown = false) {
    const { id, item } = await openNote(this.host.keys, this.host.room, this.host.generation, head);
    const base = { revision: head.revision, item };
    const own = this.state.pending.find((intent) => intent.attempt?.op.opId === head.opId);
    if (own) {
      await this.settle(own, base, own.attempt?.conflicts ?? []);
      return;
    }
    const next = setConfirmed(this.state, id, base);
    if ((next !== this.state || (applyKnown && confirmedNote(next, id)?.revision === head.revision))
        && !next.pending.some((entry) => entry.id === id)) await this.host.apply({ id, item });
    await this.persist(next);
  }

  private async applyEvents(events: NoteHead[]): Promise<boolean> {
    let gap = false;
    await this.enqueue(async () => {
      for (const head of events) {
        if (head.revision <= this.state.cursor) continue;
        if (head.revision !== this.state.cursor + 1) { gap = true; break; }
        await this.accept(head);
        await this.persist({ ...this.state, cursor: head.revision });
      }
    });
    return gap;
  }

  catchUp(manual = false): Promise<void> {
    if (this.pulling) return this.pulling;
    this.pulling = this.pull(manual).finally(() => { this.pulling = undefined; });
    return this.pulling;
  }

  private async recover(through: number, since: number): Promise<boolean> {
    let after = '';
    while (true) {
      const page = await this.host.channel.heads(this.host.generation, after, since, through);
      if (page.generation !== this.host.generation) throw new Error('Wrong registry generation');
      if (page.floor > through) return false;
      await this.enqueue(async () => {
        let previous = after;
        for (const head of page.heads) {
          if (head.noteId <= previous || head.revision <= since || head.revision > through) throw new Error('Invalid registry scan order');
          await this.accept(head, since === 0);
          previous = head.noteId;
        }
        if (page.next !== null && (page.next <= after || page.next !== previous)) throw new Error('Registry scan did not advance');
      });
      if (page.next === null) break;
      after = page.next;
    }
    await this.enqueue(async () => {
      if (this.state.cursor < through) await this.persist({ ...this.state, cursor: through });
    });
    return true;
  }

  private async pull(manual: boolean) {
    let scan = manual;
    for (;;) {
      const cursor = this.state.cursor;
      const page = await this.host.channel.events(this.host.generation, cursor);
      if (page.generation !== this.host.generation || page.head < cursor) throw new Error('Invalid registry cursor');
      if (scan || cursor < page.floor) {
        if (await this.recover(page.head, scan ? 0 : cursor)) scan = false;
        continue;
      }
      if (await this.applyEvents(page.events)) throw new Error('Registry page has a gap');
      if (this.state.cursor >= page.head) break;
      if (this.state.cursor <= cursor) throw new Error('Registry page did not advance');
    }
    this.ready = true;
    this.host.onProgress();
    this.schedule();
  }

  private async prepare(): Promise<NoteOp[]> {
    let operations: NoteOp[] = [];
    let firstError: unknown;
    await this.enqueue(async () => {
      const planned: NoteOp[] = [];
      let bytes = 0;
      for (const intent of firstPerNote(this.state)) {
        try {
          let attempt = intent.attempt;
          if (!attempt) {
            if ((this.staleCounts.get(intent.intentId) ?? 0) >= 2) continue;
            const head = confirmedNote(this.state, intent.id);
            const next = candidate(intent, head);
            if (next.skip) {
              await this.settle(intent, head ?? { revision: 0, item: null }, next.conflicts);
              continue;
            }
            const op = await sealNote(this.host.keys, this.host.room, this.host.generation, {
              opId: crypto.randomUUID(), noteId: await opaqueNoteId(this.host.keys, intent.id),
              baseRevision: head?.revision ?? 0, kind: next.kind,
            }, intent.id, next.item);
            attempt = { op, item: next.item, conflicts: next.conflicts };
          }
          const size = JSON.stringify(attempt.op).length;
          if (planned.length && bytes + size > NOTE_BATCH_BYTES) break;
          if (!intent.attempt) await this.persist(setAttempt(this.state, intent.intentId, attempt));
          planned.push(attempt.op);
          bytes += size;
          if (planned.length === NOTE_BATCH_COUNT) break;
        } catch (err) {
          firstError ??= err;
        }
      }
      operations = planned;
    });
    if (firstError && !operations.length) throw firstError;
    if (firstError) this.error(firstError);
    return operations;
  }

  private async send(ops: NoteOp[]) {
    const requestId = crypto.randomUUID();
    const data = { type: 'note_ops', generation: this.host.generation, requestId, ops };
    const socketResult = new Promise<NoteResults | null>((resolve) => { this.results = { id: requestId, receive: resolve }; });
    const timeout = setTimeout(() => this.results?.receive(null), WS_ACK_MS);
    try {
      const live = this.host.sendLive(JSON.stringify(data));
      const response = (live ? await socketResult : null) ?? await this.host.channel.send(data.generation, requestId, ops);
      if (response.generation !== data.generation || response.requestId !== requestId
          || response.results.length !== ops.length || response.results.some((result, i) => result.opId !== ops[i].opId)) {
        throw new Error('Incomplete note operation results');
      }
      return response.results;
    } finally {
      clearTimeout(timeout);
      this.results = undefined;
    }
  }

  private async applyResult(result: NoteResult): Promise<void> {
    const intent = this.state.pending.find((entry) => entry.attempt?.op.opId === result.opId);
    if (!intent?.attempt) return; // The matching live event got here first.
    const attempt: JournalAttempt = intent.attempt;
    if (result.status === 'accepted') {
      if (result.revision <= attempt.op.baseRevision) throw new Error('Invalid accepted note revision');
      await this.settle(intent, { revision: result.revision, item: attempt.item }, attempt.conflicts);
    } else if (result.status === 'stale') {
      if (result.current) {
        if (result.current.noteId !== attempt.op.noteId) throw new Error('Wrong stale note');
        await this.accept(result.current);
      }
      await this.persist(setAttempt(this.state, intent.intentId, undefined));
      this.staleCounts.set(intent.intentId, (this.staleCounts.get(intent.intentId) ?? 0) + 1);
    } else {
      throw new Error(`Релей не принял правку: ${result.code}`);
    }
  }

  private async flush() {
    if (this.sending || this.host.signal.aborted) return;
    this.sending = true;
    let delay = PUSH_DELAY_MS;
    try {
      const ops = await this.prepare();
      if (ops.length) {
        const results = await this.send(ops);
        await this.enqueue(async () => {
          let failure: unknown;
          for (const result of results) {
            try { await this.applyResult(result); } catch (err) { failure ??= err; }
          }
          if (failure) throw failure;
        });
        this.host.onProgress();
      } else if (this.pendingCount) {
        this.staleCounts.clear();
        delay = RETRY_MS;
      }
    } catch (error) {
      this.error(error);
      delay = RETRY_MS;
    } finally {
      this.sending = false;
      this.schedule(delay);
    }
  }
}
