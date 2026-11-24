// Serializes local intents and canonical application, not the network. I/O is owned by the host.
import type { FolderMeta, SlagAttachment, SlagItem } from '../../../types/index.ts';
import type { AcceptedNote, NoteMutation, NoteOrigin } from '../../storage/noteRegistry';
import { sha256Hex } from '../../vault/integrity/fingerprint.ts';
import { DEFAULT_INBOX_FOLDER } from '../../../config/storage.ts';
import { NoteChannel } from './channel.ts';
import { confirmedNote, emptyJournal, firstPerNote, recordFolderGroup, recordNote, sameRegistryValue, setConfirmed, settleNote } from './journal.ts';
import type { JournalAttempt, NoteBase, NoteConflict, NoteIntent, NoteIntentSource, NoteJournal, RegistryValue } from './journal.ts';
import { noteDifferences, relayNote } from './merge.ts';
import { LEGACY_CUTOVER, sameLegacyValue } from './legacyCutover.ts';
import { candidate, confirmedBase } from './reconcile.ts';
import type { Candidate } from './reconcile.ts';
import { isSharedRegistryId } from './sharedBody.ts';
import type { SharedBody, SharedMutation } from './sharedBody.ts';
import { checkedSharedBody, isNoteItem } from './wire.ts';
import { FOLDER_TREE_ID, NOTE_BATCH_BYTES, NOTE_BATCH_COUNT, openAnyRegistryBody, openRegistryBody, opaqueNoteId, parseLiveNoteEvents, parseNoteResults, readFolderTree, registryMediaIds, sealFolderTree, sealNote, sealSharedRecord } from './wire.ts';
import type { NoteHead, NoteKeys, NoteOp, NoteResult, NoteResults } from './wire.ts';

interface NoteReplicaHost {
  channel: Pick<NoteChannel, 'events' | 'heads' | 'send'>;
  room: string;
  generation: number;
  keys: NoteKeys;
  signal: AbortSignal;
  readOnly: boolean;
  trackDiskProjection?: boolean;
  sendLive: (data: string) => boolean;
  /** The confirmed socket is open right now, so a first note need not wait for it. */
  isLiveOpen?: () => boolean;
  save: (state: NoteJournal) => Promise<void>;
  apply: (note: AcceptedNote) => Promise<void>;
  applyFolderTree?: (folders: FolderMeta[]) => Promise<void>;
  applyFolderGroup?: (notes: AcceptedNote[], folders: FolderMeta[] | undefined) => Promise<void>;
  atomicGroups?: boolean;
  applyShared?: (body: SharedBody) => Promise<void>;
  uploadAttachment?: (attachment: SlagAttachment) => Promise<string>;
  onError: (error: unknown) => void;
  onProgress: () => void;
  onDeliveryChange?: () => void;
  log?: (event: string, data: Record<string, unknown>, warning?: boolean) => void;
}

const PUSH_DELAY_MS = 50;
const FIRST_NOTE_DELAY_MS = 0;
const RETRY_MS = 10_000;
const WS_ACK_MS = 2_500;

// An encrypted tree can't be inspected by the relay. Before sending a cascade, make
// sure a note learned from the feed since capture hasn't been left out of it.
function omittedFolderMembers(state: NoteJournal, members: ReadonlySet<string>, before: FolderMeta[], after: FolderMeta[]): boolean {
  const remaining = new Set(after.map(({ path }) => path));
  const removed = new Set(before.filter(({ path }) => path !== DEFAULT_INBOX_FOLDER && !remaining.has(path)).map(({ path }) => path));
  return Object.entries(state.confirmed).some(([id, { item }]) => !members.has(id) && isNoteItem(item) && removed.has(item.folder));
}

const normalizeDiskBody = (content: string) => content.replace(/\r\n/g, '\n').trim();

function headRejected(result: NoteResult): boolean {
  return result.status === 'rejected' && (result.code === 'note_head_changed' || result.code === 'note_head_required');
}

export class NoteReplica {
  private state: NoteJournal;
  private chain = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending = false;
  private readonly rebaseCounts = new Map<string, number>();
  private pulling: Promise<void> | undefined;
  private pullRetry: ReturnType<typeof setTimeout> | undefined;
  private observedRevision = 0;
  private durableCursor: number;
  private projectionFailed = false;
  private journalFailed = false;
  private results: { id: string; receive: (value: NoteResults | null) => void } | undefined;
  private ready = false;
  private connectionEpoch = 0;
  private applyingBatch = false;
  private failedIntents = new Set<string>();
  private sendingIntents = new Set<string>();
  private batchLogs?: (() => void)[];

  private logIntent(event: string, intent: NoteIntent, data: Record<string, unknown> = {}, warning = false) {
    const source = intent.source;
    this.host.log?.(event, { generation: this.host.generation, intentId: intent.intentId, kind: intent.kind,
      source: source === 'app' || source === 'disk-watch' || source === 'cold-recovery' || source === 'retry' ? source : 'unknown',
      baseRevision: intent.attempt?.op.baseRevision ?? intent.base?.revision, opId: intent.attempt?.op.opId,
      groupId: intent.folderGroup?.id, ...data }, warning);
  }

  private readonly host: NoteReplicaHost;
  constructor(host: NoteReplicaHost, state = emptyJournal()) {
    this.host = host;
    this.state = state;
    this.durableCursor = state.cursor;
    host.signal.addEventListener('abort', () => {
      clearTimeout(this.timer);
      clearTimeout(this.pullRetry);
      this.results?.receive(null);
    }, { once: true });
  }

  get pendingCount() { return this.state.pending.length; }
  private get needsFeed() { return this.durableCursor < this.observedRevision; }

  get progress() {
    return {
      relayHead: this.observedRevision,
      appliedThrough: this.durableCursor,
      application: this.projectionFailed || this.journalFailed ? 'error' as const
        : this.ready && !this.needsFeed && !this.pendingCount ? 'current' as const : 'catching-up' as const,
    };
  }

  noteRelayHead(revision: number) { this.observe(revision); }

  get syncHealth(): 'error' | 'syncing' | 'current' {
    if (this.journalFailed || this.projectionFailed || this.failedIntents.size || this.conflicts.length) return 'error';
    return this.ready && !this.needsFeed && !this.pendingCount ? 'current' : 'syncing';
  }

  requireCatchUp() {
    this.ready = false;
    this.connectionEpoch++;
  }

  private observe(revision: number) {
    if (revision <= this.observedRevision) return;
    this.observedRevision = revision;
    this.host.onDeliveryChange?.();
  }
  get conflicts(): readonly NoteConflict[] { return this.state.conflicts ?? []; }
  get canReviewCutover() { return this.ready && !this.needsFeed; }

  preserveLegacyAlternatives(alternatives: NoteConflict[]): Promise<void> {
    return this.enqueue(async () => {
      const existing = new Set(this.conflicts.map(({ intentId }) => intentId));
      const fresh = alternatives.filter(({ intentId }) => !existing.has(intentId));
      if (fresh.length) await this.persist({ ...this.state, conflicts: [...this.conflicts, ...fresh] });
    });
  }

  private async clearEquivalentLegacyAlternatives() {
    const conflicts = this.conflicts.filter((entry) => {
      if (!entry.fields.includes(LEGACY_CUTOVER)) return true;
      const current = confirmedNote(this.state, entry.noteId);
      return !current || !sameLegacyValue(current.item, entry.item);
    });
    if (conflicts.length !== this.conflicts.length) await this.persist({ ...this.state, conflicts });
  }

  resolveFolderConflict(groupId: string, resolution: 'keep' | 'retry', reviewed: Readonly<Record<string, number>>): Promise<void> {
    return this.enqueue(async () => {
      const members = this.conflicts.filter(({ folderGroup }) => folderGroup?.id === groupId);
      if (!members.length) throw new Error('Папочный конфликт уже разобран');
      let next = this.state;
      let retryGroupId: string | undefined;
      for (const { noteId } of members) {
        if (!Object.hasOwn(reviewed, noteId) || reviewed[noteId] !== (confirmedNote(next, noteId)?.revision ?? 0)
            || next.pending.some(({ id }) => id === noteId)) {
          throw new Error('Версии папочной операции изменились; проверьте всю группу ещё раз');
        }
      }
      if (resolution === 'retry') {
        if (!this.host.atomicGroups || this.host.readOnly) throw new Error('Групповая запись папок недоступна');
        const tree = members.at(-1);
        const previous = confirmedNote(next, FOLDER_TREE_ID)?.item;
        if (!tree || !Array.isArray(tree.item) || !Array.isArray(previous)) throw new Error('Нет подтверждённого дерева папок');
        const changes = members.slice(0, -1).map(({ noteId, item }) => {
          const current = confirmedNote(next, noteId)?.item;
          if (!isNoteItem(item) || !isNoteItem(current)) throw new Error('Перенос включает удалённую запись');
          return { id: noteId, kind: 'update' as const, item, previous: current };
        });
        if (omittedFolderMembers(next, new Set(changes.map(({ id }) => id)), previous, tree.item)) {
          throw new Error('В исходной папке появились другие записи; заново запустите операцию по текущему дереву');
        }
        retryGroupId = crypto.randomUUID();
        next = recordFolderGroup(next, retryGroupId, changes, tree.item, previous, 'retry');
      }
      await this.persist({ ...next, conflicts: this.conflicts.filter(({ folderGroup }) => folderGroup?.id !== groupId) });
      this.host.log?.('Note group conflict resolved', { generation: this.host.generation, groupId, retryGroupId, resolution, count: members.length });
      this.schedule();
    });
  }

  resolveConflict(intentId: string, resolution: 'keep' | 'retry', reviewedRevision: number, content?: string): Promise<void> {
    return this.enqueue(async () => {
      const conflict = this.conflicts.find((entry) => entry.intentId === intentId);
      if (!conflict) throw new Error('Конфликт уже разобран');
      if (conflict.fields.includes(LEGACY_CUTOVER) && !this.canReviewCutover) {
        throw new Error('Дождитесь загрузки актуальной версии с релея');
      }
      if (conflict.folderGroup) throw new Error('Папочную операцию нужно разобрать целиком');
      let next = this.state;
      const current = confirmedNote(next, conflict.noteId);
      if ((current?.revision ?? 0) !== reviewedRevision || next.pending.some(({ id }) => id === conflict.noteId)) {
        throw new Error('Версия изменилась или есть ожидающая правка; проверьте конфликт ещё раз');
      }
      if (resolution === 'keep' && conflict.fields.includes(LEGACY_CUTOVER) && (current || isSharedRegistryId(conflict.noteId))) {
        await this.applyValue(conflict.noteId, current?.item ?? null, current?.revision ?? 0);
      }
      let retryIntentId: string | undefined;
      if (resolution === 'retry') {
        if (this.host.readOnly) throw new Error('На этом устройстве запись отключена');
        const kind = conflict.item === null ? (current?.item ? 'delete' : null)
          : !current ? 'create' : current.item === null ? 'restore' : 'update';
        let item = conflict.item;
        if (content !== undefined) {
          if (!isNoteItem(item)) throw new Error('У этого конфликта нельзя изменить текст');
          item = { ...item, content };
        }
        if (kind) next = recordNote(next, { id: conflict.noteId, intentId: retryIntentId = crypto.randomUUID(), kind, item, source: 'retry' });
      }
      await this.persist({ ...next, conflicts: this.conflicts.filter((entry) => entry !== conflict) });
      this.host.log?.('Note conflict resolved', { generation: this.host.generation, intentId, revision: reviewedRevision, resolution, retryIntentId });
      this.schedule();
    });
  }

  confirmedValue(noteId: string) { return confirmedNote(this.state, noteId); }

  deliveryStatus(item: SlagItem) {
    if (this.conflicts.some(({ noteId }) => noteId === item.id)) return 'conflict';
    const pending = this.state.pending.filter(({ id }) => id === item.id);
    if (pending.length) {
      if (pending.every(({ intentId }) => this.sendingIntents.has(intentId))) return 'sending';
      return pending.some(({ intentId }) => this.failedIntents.has(intentId)) ? 'error' : 'pending';
    }
    const confirmed = this.confirmedValue(item.id);
    return confirmed && sameRegistryValue(confirmed.item, item) ? 'accepted' : 'unconfirmed';
  }

  setReadOnly(readOnly: boolean) { this.host.readOnly = readOnly; }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.chain.then(async () => {
      this.host.signal.throwIfAborted();
      const before = this.state;
      await task();
      if (this.failedIntents.size && before.pending !== this.state.pending) {
        const pending = new Set(this.state.pending.map(({ intentId }) => intentId));
        for (const id of this.failedIntents) if (!pending.has(id)) this.failedIntents.delete(id);
      }
      if (before.conflicts !== this.state.conflicts) this.host.onProgress();
      else if (before !== this.state) this.host.onDeliveryChange?.();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async persist(state: NoteJournal) {
    this.host.signal.throwIfAborted();
    if (state === this.state) return;
    if (!this.applyingBatch) await this.checkpoint(state);
    this.state = state;
  }

  private async checkpoint(state: NoteJournal) {
    try {
      await this.host.save(state);
      this.durableCursor = state.cursor;
      this.journalFailed = false;
    } catch (error) {
      this.journalFailed = true;
      this.host.log?.('Note journal write failed', { generation: this.host.generation, cursor: state.cursor }, true);
      throw error;
    }
  }

  // One durable snapshot per frame/page. A write failure rolls the cursor and journal back;
  // addressed disk application can safely replay the same operations.
  private async batch(apply: () => Promise<void>) {
    const original = this.state;
    this.applyingBatch = true;
    const logs = this.batchLogs = [] as (() => void)[];
    try {
      await apply();
      this.host.signal.throwIfAborted();
      if (this.state !== original) await this.checkpoint(this.state);
    } catch (error) {
      this.state = original;
      throw error;
    } finally {
      this.applyingBatch = false;
      this.batchLogs = undefined;
    }
    logs.forEach((log) => log());
  }

  recordFolderTree(folders: FolderMeta[], previous: FolderMeta[]): Promise<void> {
    if (!this.host.applyFolderTree || this.host.readOnly) {
      return Promise.reject(new Error('Реестр папок недоступен для записи'));
    }
    return this.enqueue(async () => {
      const id = FOLDER_TREE_ID;
      const kind = confirmedNote(this.state, id) || this.state.pending.some((entry) => entry.id === id) ? 'update' : 'create';
      await this.persist(recordNote(this.state, { id, intentId: crypto.randomUUID(), kind,
        item: readFolderTree(folders, kind), previous, source: 'app' }));
      this.schedule();
    }).catch((err: unknown) => { this.error(err); throw err; });
  }

  recordFolderGroup(changes: NoteMutation[], folders: FolderMeta[], previous: FolderMeta[]): Promise<void> {
    if (!this.host.applyFolderGroup || this.host.readOnly) {
      return Promise.reject(new Error('Групповая запись папок недоступна'));
    }
    return this.enqueue(async () => {
      await this.persist(recordFolderGroup(this.state, crypto.randomUUID(), changes, folders, previous));
      this.schedule();
    }).catch((error: unknown) => { this.error(error); throw error; });
  }

  recordShared(id: string, value: unknown, previous: unknown): Promise<void> {
    return this.recordSharedBatch(() => [{ id, value, previous }]);
  }

  recordSharedBatch(changes: () => SharedMutation[], applyLocal?: () => Promise<void>): Promise<void> {
    if (!this.host.applyShared || this.host.readOnly) return Promise.reject(new Error('Shared registry writes are not enabled'));
    return this.enqueue(async () => {
      const next = changes().reduce((state, change) => this.captureShared(state, change), this.state);
      await this.persist(next);
      this.schedule();
      try {
        await applyLocal?.();
      } catch (error) {
        this.projectionFailed = true;
        throw error;
      }
    }).catch((error: unknown) => { this.error(error); throw error; });
  }

  private captureShared(state: NoteJournal, { id, value, previous, keepAlternative }: SharedMutation): NoteJournal {
    const pending = state.pending.findLast((entry) => entry.id === id);
    if (keepAlternative) {
      // The editor was overtaken by a canonical projection. No CAS may be minted for
      // that edit until the user explicitly reviews the current relay revision.
      const head = confirmedNote(state, id);
      const kind = value === null ? 'delete' : head?.item ? 'update' : head ? 'restore' : 'create';
      const { shared } = checkedSharedBody(id, value, kind);
      const item = shared === null ? null : { shared };
      // Another editor clear can queue behind the local projection of the same delete.
      if ((kind === 'delete' && pending?.kind === 'delete') || sameRegistryValue(head?.item ?? null, item)) return state;
      return { ...state, conflicts: [...(state.conflicts ?? []), { intentId: crypto.randomUUID(), noteId: id,
        kind, item, revision: head?.revision ?? 0, fields: ['editor'], at: Date.now() }] };
    }
    const head = pending ?? confirmedNote(state, id);
    const prior = previous === null ? null : checkedSharedBody(id, previous, 'update').shared;
    if (value === null && (!head || head.item === null)) {
      checkedSharedBody(id, null, 'delete');
      if (prior !== null && !head) throw new Error('Shared record has no reviewed registry base');
      return state;
    }
    const kind = value === null ? 'delete' : !head ? 'create' : head.item === null ? 'restore' : 'update';
    const { shared } = checkedSharedBody(id, value, kind);
    if (previous === null && (kind === 'update' || kind === 'delete')) throw new Error('Missing local shared base');
    if (prior !== null && (kind === 'create' || kind === 'restore')) throw new Error('Shared record has no reviewed registry base');
    if (pending && !sameRegistryValue(pending.item, prior === null ? null : { shared: prior })) {
      throw new Error('Shared edit does not match its pending predecessor');
    }
    return recordNote(state, { id, kind, intentId: crypto.randomUUID(),
      item: shared === null ? null : { shared }, previous: prior === null ? undefined : { shared: prior } });
  }

  record(changes: NoteMutation[], source: NoteIntentSource = 'app'): Promise<void> {
    if (this.host.readOnly) return Promise.resolve();
    const run = this.enqueue(async () => {
      const before = this.state.pending;
      const state = changes.reduce((journal, change) => recordNote(journal, { ...change, source, intentId: change.intentId ?? crypto.randomUUID() }), this.state);
      await this.persist(state);
      for (const intent of state.pending) if (!before.includes(intent)) this.logIntent('Note intent recorded', intent);
      this.schedule(this.firstLiveNote() ? FIRST_NOTE_DELAY_MS : PUSH_DELAY_MS);
    });
    return run.catch((err: unknown) => { this.error(err); throw err; });
  }

  private registryBodyMarker(id: string, revision: number, content: string): Promise<string> {
    return sha256Hex(JSON.stringify([this.host.room, this.host.generation, id, revision, normalizeDiskBody(content)]))
      .then((digest) => `${revision}:${digest}`);
  }

  captureColdNoteEdits(readCopies: (ids: Set<string>) => Promise<{ item: SlagItem; marker?: string }[]>,
    remember?: (note: AcceptedNote, disk: SlagItem) => void): Promise<void> {
    if (this.host.readOnly) return Promise.resolve();
    return this.enqueue(async () => {
      const state = this.state;
      const pending = new Set(state.pending.map(({ id }) => id));
      for (const conflict of this.conflicts) if (conflict.fields.includes(LEGACY_CUTOVER)) pending.add(conflict.noteId);
      const live = new Map(Object.entries(state.confirmed).flatMap(([id, { item }]) =>
        isNoteItem(item) && !pending.has(id) ? [[id, item] as const] : []));
      if (!live.size) return;
      const copies = await readCopies(new Set(live.keys()));
      this.host.signal.throwIfAborted();
      const counts = new Map<string, number>();
      for (const { item: { id } } of copies) counts.set(id, (counts.get(id) ?? 0) + 1);
      let next = state;
      for (const { item: copy, marker } of copies) {
        const previous = live.get(copy.id);
        if (!previous || counts.get(copy.id) !== 1 || previous.folder !== copy.folder
            || previous.title !== copy.title || previous.type !== copy.type) continue;
        const revision = state.confirmed[copy.id].revision;
        if (normalizeDiskBody(previous.content) === normalizeDiskBody(copy.content)) {
          if (remember && marker && marker === await this.registryBodyMarker(copy.id, revision, previous.content)) {
            remember({ id: copy.id, revision, item: previous, registryBodyMarker: marker }, copy);
          }
          continue;
        }
        // The Markdown and its provenance were replaced together. A replayable projection
        // ahead of this journal is not a local edit, even if the relay has since advanced again.
        const projected = marker ? Number(marker.split(':', 1)[0]) : 0;
        if (Number.isSafeInteger(projected) && projected > state.confirmed[copy.id].revision
            && marker === await this.registryBodyMarker(copy.id, projected, copy.content)) continue;
        // Keep the confirmed base. A newer remote revision must conflict, not rebase this edit.
        next = recordNote(next, { id: copy.id, kind: 'update', intentId: crypto.randomUUID(), previous, source: 'cold-recovery',
          item: { ...previous, content: copy.content } });
      }
      await this.persist(next);
      for (const intent of next.pending) if (!state.pending.includes(intent)) this.logIntent('Note intent recorded', intent);
    });
  }

  recordExternal(event: { id: string; action: string; payload?: SlagItem; previous?: SlagItem;
    noteOrigin?: NoteOrigin | null; intentId?: string }): Promise<void> {
    // A watcher reports a missing path, not an explicit delete. An atomic rename,
    // unreadable file, or a folder move must never mint a registry tombstone.
    if ((event.action !== 'upsert' && event.action !== 'conflict') || !event.payload) return Promise.resolve();
    const item = relayNote(event.payload);
    if (!isNoteItem(item) || item.id !== event.id) return Promise.reject(new Error('Invalid note from disk watcher'));
    const head = confirmedNote(this.state, event.id);
    return this.record([{ id: event.id, kind: head || event.previous ? 'update' : 'create', item, previous: event.previous,
      origin: event.noteOrigin, intentId: event.intentId }], 'disk-watch');
  }

  private error(error: unknown) {
    if (!this.host.signal.aborted) this.host.onError(error);
  }

  // One ordinary text edit with a durable journal and an open confirmed socket has nothing
  // to coalesce with, so it skips the batch window. Media, folder groups, retries, a pending
  // feed and an HTTP-only transport keep it: their send is not a single sealed note operation.
  private firstLiveNote(): boolean {
    if (this.pendingCount !== 1 || this.host.isLiveOpen?.() !== true || this.needsFeed) return false;
    const [intent] = this.state.pending;
    const item = intent.item;
    return intent.source === 'app' && !intent.attempt && !intent.folderGroup
      && (intent.kind === 'create' || intent.kind === 'update')
      && intent.id !== FOLDER_TREE_ID && !isSharedRegistryId(intent.id)
      && isNoteItem(item) && (item.attachments ?? []).length === 0;
  }

  private schedule(delay = PUSH_DELAY_MS) {
    if (!this.ready || this.host.readOnly || this.host.signal.aborted || this.sending || this.timer || !this.pendingCount) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // The queue at scheduling time is not a licence to send: a reconnect, read-only
      // switch or abort may land first. Fall back to the ordinary window without touching
      // the journal; a same-tick burst or a media note takes the same path.
      if (delay === FIRST_NOTE_DELAY_MS && (!this.ready || this.host.readOnly || this.host.signal.aborted || !this.firstLiveNote())) {
        this.schedule();
        return;
      }
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
      this.observe(data.events.reduce((max, { revision }) => Math.max(max, revision), 0));
      void this.applyEvents(data.events).then((gap) => gap ? this.catchUp() : undefined).catch((err: unknown) => {
        this.projectionFailed = true;
        this.error(err);
        this.retryPull();
      });
    } catch (err) {
      this.projectionFailed = true;
      this.error(err);
      this.retryPull();
    }
  }

  private async projectedNote(id: string, item: SlagItem | null, revision: number): Promise<AcceptedNote> {
    if (!this.host.trackDiskProjection || !item || !revision) return { id, item, revision };
    return { id, item, revision, registryBodyMarker: await this.registryBodyMarker(id, revision, item.content) };
  }

  private async applyValue(id: string, item: RegistryValue, revision: number, discardLiveCopy = false) {
    if (isSharedRegistryId(id)) {
      if (!this.host.applyShared || (item !== null && !('shared' in item))) throw new Error('Shared registry support is not enabled');
      await this.host.applyShared({ id, shared: item?.shared ?? null });
    } else if (id === FOLDER_TREE_ID) {
      if (!this.host.applyFolderTree || !Array.isArray(item)) throw new Error('Folder tree support is not enabled for this session');
      await this.host.applyFolderTree(item);
    } else {
      if (Array.isArray(item) || (item && 'shared' in item)) throw new Error('Invalid accepted note');
      await this.host.apply({ ...await this.projectedNote(id, item, revision), ...(discardLiveCopy ? { discardLiveCopy: true as const } : {}) });
    }
  }

  private async settle(intent: NoteIntent, head: NoteBase, fields: string[]) {
    let next = settleNote(setConfirmed(this.state, intent.id, head), intent, head.revision, fields.length > 0, head.item);
    if (fields.length) next = { ...next, conflicts: [...this.conflicts, { intentId: intent.intentId, noteId: intent.id,
      kind: intent.kind, revision: head.revision, item: intent.item, fields, at: Date.now() }] };
    if (!next.pending.some((entry) => entry.id === intent.id)) {
      const current = confirmedNote(next, intent.id);
      if (current || fields.includes('folder')) {
        try {
          await this.applyValue(intent.id, current?.item ?? null, current?.revision ?? 0, !!current && !current.item && !!intent.item && fields.length > 0);
        } catch (error) {
          this.logIntent('Note projection failed', intent, { revision: current?.revision }, true);
          throw error;
        }
      }
    }
    await this.persist(next);
    const log = () => {
      if (!this.host.log) return;
      const changed = fields.length && isNoteItem(intent.item) && isNoteItem(head.item) ? noteDifferences(intent.item, head.item) : undefined;
      const known = ['title', 'type', 'folder', 'tags', 'attachments', 'status', 'priority', 'dueDate', 'reminder', 'duration', 'recurrence',
        'subtasks', 'kanbanColumn', 'isPinned', 'isArchived', 'replyToId', 'linkedItemIds', 'streak', 'history', 'lastCompletedDate', 'summary', 'readingTimeMinutes'];
      const reason = ['base', 'lifecycle', 'predecessor', 'folder', 'folders'].includes(fields[0]) ? fields[0]
        : fields.length ? intent.base?.revision === head.revision ? 'different_base_or_transition' : 'revision_changed' : undefined;
      this.logIntent(fields.length ? 'Note conflict saved' : intent.attempt ? 'Note accepted' : 'Equivalent note update skipped', intent,
        { revision: head.revision, stage: intent.attempt ? 'receipt-or-feed' : 'prepare', reason,
          bodyEqual: changed && !changed.includes('content'), properties: changed?.filter((key) => known.includes(key)) }, fields.length > 0);
    };
    if (this.batchLogs) this.batchLogs.push(log);
    else log();
  }

  private async accept(head: NoteHead, applyKnown = false, recovered = false) {
    // Recovery can see surviving heads of an expired group, not the original event batch.
    if (head.group && !this.host.applyFolderGroup) throw new Error('Atomic folder groups are not supported by this session');
    const body = await openAnyRegistryBody(this.host.keys, this.host.room, this.host.generation, head);
    if ('folders' in body && !this.host.applyFolderTree) throw new Error('Folder tree support is not enabled for this session');
    if ('shared' in body && !this.host.applyShared) throw new Error('Shared registry support is not enabled');
    const { id } = body;
    const item = 'folders' in body ? body.folders : 'shared' in body ? (body.shared === null ? null : { shared: body.shared }) : body.item;
    const own = this.state.pending.find((intent) => intent.attempt?.op.opId === head.opId);
    const base = confirmedBase(recovered ? undefined : confirmedNote(this.state, id), head, item, own?.intentId);
    // A heads scan can recover a surviving member, but only a complete receipt settles the group.
    if (own && !own.folderGroup) {
      await this.settle(own, base, own.attempt?.conflicts ?? []);
      return;
    }
    const next = setConfirmed(this.state, id, base);
    if ((next !== this.state || (applyKnown && confirmedNote(next, id)?.revision === head.revision))
        && !next.pending.some((entry) => entry.id === id)) await this.applyValue(id, item, head.revision);
    await this.persist(next);
  }

  private async applyGroup(heads: NoteHead[], cursor: number) {
    const apply = this.host.applyFolderGroup;
    if (!apply) throw new Error('Atomic folder groups are not supported by this session');
    const group = heads[0].group;
    if (!group || group.id !== heads[0].opId || heads.length !== group.size
        || new Set(heads.map(({ noteId }) => noteId)).size !== heads.length
        || heads.some((head, index) => head.group?.id !== group.id || head.group.size !== group.size
          || head.group.index !== index || head.revision !== cursor + index + 1)) {
      throw new Error('Incomplete or invalid folder group');
    }
    const bodies = await Promise.all(heads.map((head) => openRegistryBody(this.host.keys, this.host.room, this.host.generation, head)));
    if (bodies.some((body, index) => ('folders' in body) !== (index === bodies.length - 1))) {
      throw new Error('Folder group must end with the tree');
    }
    let next = this.state;
    const notes: AcceptedNote[] = [];
    let folders: FolderMeta[] | undefined;
    for (const [index, body] of bodies.entries()) {
      const { revision } = heads[index];
      const value = 'folders' in body ? body.folders : body.item;
      next = setConfirmed(next, body.id, confirmedBase(confirmedNote(next, body.id), heads[index], value));
      // Keep the optimistic copy when a local proposal is pending; its base will be
      // checked separately. Never project an older head over a newer confirmation.
      if (confirmedNote(next, body.id)?.revision !== revision || next.pending.some(({ id }) => id === body.id)) continue;
      if ('folders' in body) folders = body.folders;
      else notes.push(await this.projectedNote(body.id, body.item, revision));
    }
    if (folders || notes.length) await apply(notes, folders);
    await this.persist({ ...next, cursor: heads[heads.length - 1].revision });
  }

  private async applyEvents(events: NoteHead[]): Promise<boolean> {
    let gap = false;
    await this.enqueue(async () => {
      for (let start = 0; start < events.length;) {
        const head = events[start];
        if (head.revision <= this.state.cursor) { start++; continue; }
        if (head.revision !== this.state.cursor + 1) { gap = true; break; }
        if (head.group) {
          await this.applyGroup(events.slice(start, start + head.group.size), this.state.cursor);
          start += head.group.size;
        } else {
          let end = start + 1;
          while (end < events.length && !events[end].group) end++;
          await this.batch(async () => {
            for (let i = start; i < end; i++) {
              const next = events[i];
              if (next.revision <= this.state.cursor) continue;
              if (next.revision !== this.state.cursor + 1) { gap = true; break; }
              await this.accept(next);
              await this.persist({ ...this.state, cursor: next.revision });
            }
          });
          if (gap) break;
          start = end;
        }
      }
    });
    return gap;
  }

  private retryPull() {
    if (this.pullRetry || this.host.signal.aborted) return;
    this.pullRetry = setTimeout(() => {
      this.pullRetry = undefined;
      void this.catchUp().catch((error: unknown) => this.error(error));
    }, RETRY_MS);
  }

  catchUp(manual = false): Promise<void> {
    if (this.pulling) return manual ? this.pulling.then(() => this.catchUp(true)) : this.pulling;
    this.pulling = this.pull(manual).then(() => {
      clearTimeout(this.pullRetry);
      this.pullRetry = undefined;
    }, (error: unknown) => {
      this.projectionFailed = true;
      this.error(error);
      this.retryPull();
      throw error;
    }).finally(() => { this.pulling = undefined; });
    return this.pulling;
  }

  private async recover(through: number, since: number): Promise<boolean> {
    let after = '';
    while (true) {
      const page = await this.host.channel.heads(this.host.generation, after, since, through);
      if (page.generation !== this.host.generation) throw new Error('Wrong registry generation');
      if (page.floor > through) return false;
      await this.enqueue(() => this.batch(async () => {
        let previous = after;
        for (const head of page.heads) {
          if (head.noteId <= previous || head.revision <= since || head.revision > through) throw new Error('Invalid registry scan order');
          await this.accept(head, since === 0, true);
          previous = head.noteId;
        }
        if (page.next !== null && (page.next <= after || page.next !== previous)) throw new Error('Registry scan did not advance');
      }));
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
      const epoch = this.connectionEpoch;
      const cursor = this.state.cursor;
      const observedBeforeRead = this.observedRevision;
      const page = await this.host.channel.events(this.host.generation, cursor);
      if (page.generation !== this.host.generation || page.head < cursor) throw new Error('Invalid registry cursor');
      this.observe(page.head);
      if (scan || cursor < page.floor) {
        if (await this.recover(page.head, scan ? 0 : cursor)) scan = false;
        continue;
      }
      if (await this.applyEvents(page.events)) throw new Error('Registry page has a gap');
      if (epoch !== this.connectionEpoch) continue;
      if (this.state.cursor >= Math.max(page.head, this.observedRevision)) {
        if (this.conflicts.some(({ fields }) => fields.includes(LEGACY_CUTOVER))) {
          await this.enqueue(() => this.clearEquivalentLegacyAlternatives());
          if (epoch !== this.connectionEpoch || this.needsFeed) continue;
        }
        this.ready = true;
        this.projectionFailed = false;
        this.host.onProgress();
        this.schedule();
        return;
      }
      // A later WS event may arrive while an older HTTP snapshot is in flight. Its gap can
      // join this pull, but the pull must not end against the snapshot that preceded that gap.
      if (this.state.cursor <= cursor && Math.max(page.head, observedBeforeRead) > cursor) {
        throw new Error('Registry page did not advance');
      }
    }
  }

  private async sealAttempt(intent: NoteIntent, head: NoteBase | undefined, next: Candidate): Promise<JournalAttempt> {
    const observedHead = this.host.atomicGroups ? this.durableCursor : undefined;
    const { keys, room, generation } = this.host;
    const group = intent.folderGroup;
    let value = next.item;
    const prepare = async (attachments: SlagAttachment[]) => {
      const prepared: SlagAttachment[] = [];
      for (const attachment of attachments) {
        const registryBlobId = attachment.registryBlobId ?? await this.host.uploadAttachment?.(attachment);
        prepared.push(registryBlobId ? { ...attachment, registryBlobId } : attachment);
      }
      return prepared;
    };
    let prepared: SlagAttachment[] = [];
    if (value && !Array.isArray(value)) {
      if ('shared' in value) {
        const { shared } = value;
        if (shared && typeof shared === 'object' && 'attachments' in shared && shared.attachments) {
          prepared = await prepare(shared.attachments);
          value = { shared: { ...shared, attachments: prepared } };
        }
      } else {
        prepared = await prepare(value.attachments ?? []);
        value = { ...value, attachments: prepared };
      }
    }
    const mediaIds = registryMediaIds(prepared);
    const meta = { opId: group?.index === 0 ? group.id : crypto.randomUUID(), noteId: await opaqueNoteId(keys, intent.id),
      baseRevision: head?.revision ?? 0, kind: next.kind, ...(group ? { group } : {}), ...(mediaIds.length ? { mediaIds } : {}) };
    const op = Array.isArray(value) ? await sealFolderTree(keys, room, generation, meta, value)
      : value && 'shared' in value ? await sealSharedRecord(keys, room, generation, meta, intent.id, value.shared)
      : value === null && isSharedRegistryId(intent.id) ? await sealSharedRecord(keys, room, generation, meta, intent.id, null)
      : await sealNote(keys, room, generation, meta, intent.id, value);
    return { op, item: value, conflicts: next.conflicts, ...(observedHead !== undefined ? { observedHead } : {}) };
  }

  private async prepareGroup(members: NoteIntent[]): Promise<JournalAttempt[]> {
    if (!this.host.atomicGroups || !this.host.applyFolderGroup) throw new Error('Atomic folder groups are not enabled');
    if (members.every(({ attempt }) => attempt)) return members.map(({ attempt }) => attempt!);
    if (members.some(({ attempt }) => attempt)) throw new Error('Incomplete prepared folder group');
    // Check all captured bases before sealing any member; a mismatch cannot turn into a partial send.
    const inputs = members.map((intent) => {
      const head = confirmedNote(this.state, intent.id);
      const next = candidate(intent, head);
      if (next.skip && !head) throw new Error('Папочная операция требует проверки исходных версий');
      return { intent, head, next };
    });
    const tree = inputs.at(-1)!;
    const missing = Array.isArray(tree.head?.item) && Array.isArray(tree.next.item)
      && omittedFolderMembers(this.state, new Set(members.map(({ id }) => id)), tree.head.item, tree.next.item);
    if (missing || inputs.some(({ next }) => next.conflicts.length)) {
      await this.settleGroup(members, this.state, 'stale_base');
      return [];
    }
    const attempts = await Promise.all(inputs.map(({ intent, head, next }) => this.sealAttempt(intent, head, next)));
    if (JSON.stringify(attempts.map(({ op }) => op)).length > NOTE_BATCH_BYTES) throw new Error('Папочная операция превышает размер пачки');
    return attempts;
  }

  private async prepare(): Promise<{ ops: NoteOp[]; observedHead?: number }> {
    let operations: NoteOp[] = [];
    let observedHead: number | undefined;
    let firstError: unknown;
    await this.enqueue(async () => {
      const attempts = new Map<string, JournalAttempt>();
      const planned: NoteOp[] = [];
      let bytes = 0;
      const first = firstPerNote(this.state);
      const ready = new Set(first);
      for (const intent of first) {
        if ((this.rebaseCounts.get(intent.intentId) ?? 0) >= 3) continue;
        if (intent.folderGroup) {
          if (!this.host.atomicGroups || intent.folderGroup.index !== 0) continue;
          const groupId = intent.folderGroup.id;
          const members = this.state.pending.filter(({ folderGroup }) => folderGroup?.id === groupId);
          if (!members.every((member) => ready.has(member) && !member.predecessor)) continue;
          if (planned.length) break; // A group gets its own request.
          try {
            const group = await this.prepareGroup(members);
            if (!group.length) break;
            observedHead = group[0].observedHead;
            group.forEach((attempt, index) => {
              const member = members[index];
              if (!member.attempt) attempts.set(member.intentId, attempt);
              planned.push(attempt.op);
            });
            break;
          } catch (err) {
            members.forEach(({ intentId }) => this.failedIntents.add(intentId));
            firstError ??= err;
            continue;
          }
        }
        if (this.host.atomicGroups && intent.id === FOLDER_TREE_ID && planned.length) break;
        try {
          if (isSharedRegistryId(intent.id) && !this.host.applyShared) throw new Error('Shared registry support is not enabled');
          let attempt = intent.attempt;
          if (!attempt) {
            if (this.needsFeed && intent.kind === 'update' && intent.provenBase && isNoteItem(intent.item)) continue;
            const head = confirmedNote(this.state, intent.id);
            const next = candidate(intent, head);
            const tree = confirmedNote(this.state, FOLDER_TREE_ID)?.item;
            const destination = isNoteItem(next.item) ? next.item.folder : undefined;
            const missingFolder = this.host.atomicGroups && destination && destination !== DEFAULT_INBOX_FOLDER
              && (!isNoteItem(head?.item) || destination !== head.item.folder)
              && Array.isArray(tree) && !tree.some(({ path }) => path === destination);
            if (missingFolder && this.state.pending.some(({ id }) => id === FOLDER_TREE_ID)) continue;
            if (next.skip || missingFolder) {
              await this.settle(intent, head ?? { revision: 0, item: null }, missingFolder ? ['folder'] : next.conflicts);
              continue;
            }
            if (this.host.atomicGroups && Array.isArray(next.item) && Array.isArray(head?.item)
                && omittedFolderMembers(this.state, new Set(), head.item, next.item)) {
              await this.settle(intent, head, ['folders']);
              continue;
            }
            attempt = await this.sealAttempt(intent, head, next);
          }
          const size = JSON.stringify(attempt.op).length;
          if (planned.length && (bytes + size > NOTE_BATCH_BYTES || observedHead !== attempt.observedHead)) break;
          observedHead = attempt.observedHead;
          if (!intent.attempt) attempts.set(intent.intentId, attempt);
          planned.push(attempt.op);
          bytes += size;
          if (planned.length === NOTE_BATCH_COUNT || (this.host.atomicGroups && intent.id === FOLDER_TREE_ID)) break;
        } catch (err) {
          this.failedIntents.add(intent.intentId);
          firstError ??= err;
        }
      }
      if (attempts.size) await this.persist({ ...this.state, pending: this.state.pending.map((intent) => {
        const attempt = attempts.get(intent.intentId);
        return attempt ? { ...intent, attempt } : intent;
      }) });
      operations = planned;
    });
    if (firstError && !operations.length) throw firstError;
    if (firstError) this.error(firstError);
    return { ops: operations, observedHead };
  }

  private async send(ops: NoteOp[], observedHead?: number) {
    const requestId = crypto.randomUUID();
    const data = { type: 'note_ops', generation: this.host.generation, requestId, ops, observedHead };
    const socketResult = new Promise<NoteResults | null>((resolve) => { this.results = { id: requestId, receive: resolve }; });
    const timeout = setTimeout(() => this.results?.receive(null), WS_ACK_MS);
    try {
      const live = this.host.sendLive(JSON.stringify(data));
      const meta = { generation: data.generation, requestId, count: ops.length, opIds: ops.map(({ opId }) => opId) };
      if (live) this.host.log?.('Sending note operations', { ...meta, transport: 'ws' });
      let response = live ? await socketResult : null;
      if (!response) {
        this.host.log?.('Sending note operations', { ...meta, transport: 'http', fallback: live });
        response = await this.host.channel.send(data.generation, requestId, ops, observedHead);
      }
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

  private async applyGroupReceipt(ops: NoteOp[], results: NoteResult[]): Promise<void> {
    const groupId = ops[0].group?.id;
    const members = this.state.pending.filter(({ folderGroup }) => folderGroup?.id === groupId);
    if (members.length !== ops.length || members.some(({ attempt }, index) => attempt?.op.opId !== ops[index].opId)) {
      throw new Error('Receipt does not match the persisted folder group');
    }
    let next = this.state;
    if (results.every((result) => result.status === 'accepted')) {
      const start = results[0].revision;
      if (results.some(({ revision }, i) => revision !== start + i || revision <= ops[i].baseRevision)) {
        throw new Error('Invalid folder group receipt');
      }
      for (const [index, intent] of members.entries()) {
        next = setConfirmed(next, intent.id, { revision: results[index].revision, item: intent.attempt!.item });
      }
      this.observe(start + results.length - 1);
      return this.settleGroup(members, next, undefined, start);
    }
    if (results.some((result) => result.status === 'accepted')) throw new Error('Partial folder group receipt');
    if (results.every(headRejected)) {
      await this.clearRejectedAttempts(results);
      return;
    }
    const stale = results.flatMap((result, index) => result.status === 'stale' ? [{ current: result.current, index }] : []);
    if (!stale.length) {
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected' && result.code === 'note_media_not_found') await this.refreshAttemptMedia(members[index]);
      }
      const rejected = results.find((result) => result.status === 'rejected' && result.code !== 'note_group_aborted');
      throw new Error(rejected?.status === 'rejected' ? `Релей не принял папочную операцию: ${rejected.code}` : 'Invalid folder group rejection');
    }
    let waiting = false;
    for (const { current, index } of stale) {
      if (!current || current.noteId !== ops[index].noteId || current.revision === ops[index].baseRevision) {
        throw new Error('Invalid stale folder group member');
      }
      const intent = members[index];
      const body = await openRegistryBody(this.host.keys, this.host.room, this.host.generation, current);
      if (body.id !== intent.id) throw new Error('Wrong stale folder group member');
      if (current.group && current.revision > this.state.cursor) { waiting = true; continue; }
      next = setConfirmed(next, body.id, { revision: current.revision, item: 'folders' in body ? body.folders : body.item });
    }
    if (waiting) {
      void this.catchUp().catch((err: unknown) => this.error(err));
      throw new Error('Waiting for the confirmed folder group');
    }
    await this.settleGroup(members, next, 'stale_base');
  }

  private async settleGroup(members: NoteIntent[], next: NoteJournal, conflict?: string, acceptedStart?: number) {
    const conflicts: NoteConflict[] = [];
    for (const [index, intent] of members.entries()) {
      const revision = confirmedNote(next, intent.id)?.revision ?? 0;
      next = settleNote(next, intent, acceptedStart === undefined ? revision : acceptedStart + index, Boolean(conflict));
      if (conflict) conflicts.push({ intentId: intent.intentId, noteId: intent.id, kind: intent.kind,
        revision, item: intent.item, fields: [conflict], at: Date.now(), folderGroup: intent.folderGroup });
    }
    if (conflicts.length) next = { ...next, conflicts: [...this.conflicts, ...conflicts] };
    // A later head may already be known from the feed. Project that head, not an older receipt.
    const notes: AcceptedNote[] = [];
    let folders: FolderMeta[] | undefined;
    for (const { id } of members) {
      if (next.pending.some((entry) => entry.id === id)) continue;
      const base = confirmedNote(next, id);
      if (!base) continue;
      const { item, revision } = base;
      if (id === FOLDER_TREE_ID && Array.isArray(item)) folders = item;
      else if (item === null || isNoteItem(item)) notes.push(await this.projectedNote(id, item, revision));
    }
    if (!this.host.applyFolderGroup) throw new Error('Atomic folder projection is unavailable');
    if (folders || notes.length) await this.host.applyFolderGroup(notes, folders);
    await this.persist(next);
    this.host.log?.(conflict ? 'Note group conflict saved' : 'Note group accepted', {
      generation: this.host.generation, groupId: members[0].folderGroup?.id, count: members.length,
      reason: conflict, acceptedStart,
    }, Boolean(conflict));
  }

  private countRebase(intentId: string) {
    this.rebaseCounts.set(intentId, (this.rebaseCounts.get(intentId) ?? 0) + 1);
  }

  private async clearRejectedAttempts(results: NoteResult[]) {
    // Only an explicit rejection proves these opIds did not commit. Network failures keep them intact.
    const rejected = new Set(results.filter(headRejected).map(({ opId }) => opId));
    for (const intent of this.state.pending) if (intent.attempt && rejected.has(intent.attempt.op.opId)) {
      if (!intent.folderGroup) this.countRebase(intent.intentId);
      this.logIntent('Note requires catch-up', intent, { reason: 'head_changed' });
    }
    await this.persist({ ...this.state, pending: this.state.pending.map((intent) =>
      intent.attempt && rejected.has(intent.attempt.op.opId) ? { ...intent, attempt: undefined } : intent) });
  }

  private async refreshAttemptMedia(intent: NoteIntent) {
    const upload = this.host.uploadAttachment;
    const item = intent.attempt?.item;
    if (!upload || !item || Array.isArray(item)) return;
    const value = 'shared' in item ? item.shared : item;
    if (!value || typeof value !== 'object' || !('attachments' in value)) return;
    for (const attachment of value.attachments ?? []) {
      if (attachment.registryBlobId && await upload(attachment) !== attachment.registryBlobId) {
        throw new Error('Байты вложения изменились после сохранения попытки');
      }
    }
  }

  private async applyResult(result: NoteResult): Promise<void> {
    const intent = this.state.pending.find((entry) => entry.attempt?.op.opId === result.opId);
    if (!intent?.attempt) return; // The matching live event got here first.
    const attempt: JournalAttempt = intent.attempt;
    if (result.status === 'accepted') {
      if (result.revision <= attempt.op.baseRevision) throw new Error('Invalid accepted note revision');
      this.observe(result.revision);
      await this.settle(intent, confirmedBase(confirmedNote(this.state, intent.id), { ...attempt.op, revision: result.revision },
        attempt.item, intent.intentId), attempt.conflicts);
    } else if (result.status === 'stale') {
      if (!result.current || result.current.noteId !== attempt.op.noteId) throw new Error('Wrong stale note');
      if (intent.kind === 'update' && intent.provenBase && intent.source !== 'retry' && intent.source !== 'cold-recovery' && isNoteItem(intent.item)) {
        // A stale reply can jump over delete/restore or intermediate updates. Let the feed
        // establish continuity before attempting to merge; a heads scan cannot guess it.
        this.observe(result.current.revision);
        await this.persist({ ...this.state, pending: this.state.pending.map((entry) =>
          entry === intent ? { ...entry, attempt: undefined } : entry) });
        this.countRebase(intent.intentId);
        return;
      }
      // Keep the sent attempt durable until the rejection and the canonical revision are both
      // accounted for. If a write fails here, retry the same opId on the next pass.
      if (result.current.group) {
        if (this.state.cursor < result.current.revision) {
          // A stale reply only carries one member. Fetch the whole feed range before settling.
          void this.catchUp().catch((err: unknown) => this.error(err));
          throw new Error('Waiting for the confirmed folder group');
        }
      } else await this.accept(result.current);
      const head = confirmedNote(this.state, intent.id);
      if (!head) throw new Error('Missing confirmed revision after stale result');
      const next = candidate(intent, head);
      await this.settle(intent, head, next.skip ? next.conflicts : [intent.kind]);
    } else {
      this.logIntent('Note rejected', intent, { reason: result.code }, true);
      if (result.code === 'note_media_not_found') await this.refreshAttemptMedia(intent);
      throw new Error(`Релей не принял правку: ${result.code}`);
    }
  }

  private async flush() {
    if (this.sending || this.host.signal.aborted) return;
    this.sending = true;
    let delay = PUSH_DELAY_MS;
    let dispatched: ReadonlySet<string> = this.sendingIntents;
    try {
      const pendingBefore = this.pendingCount;
      const { ops, observedHead } = await this.prepare();
      if (ops.length) {
        const ids = new Set(ops.map(({ opId }) => opId));
        const intents = this.state.pending.filter(({ attempt }) => attempt && ids.has(attempt.op.opId));
        dispatched = this.sendingIntents = new Set(intents.map(({ intentId }) => intentId));
        intents.forEach((intent) => {
          const retry = this.failedIntents.delete(intent.intentId);
          this.logIntent('Note attempt dispatched', intent, { retry });
        });
        const response = this.send(ops, observedHead);
        this.host.onDeliveryChange?.();
        const results = await response;
        this.sendingIntents = new Set();
        this.host.onDeliveryChange?.();
        await this.enqueue(async () => {
          if (ops[0].group) return this.applyGroupReceipt(ops, results);
          let failure: unknown;
          if (results.some(headRejected)) await this.clearRejectedAttempts(results);
          for (const result of results) {
            if (headRejected(result)) continue;
            try { await this.applyResult(result); } catch (err) { failure ??= err; }
          }
          if (failure) throw failure;
        });
        if (results.some(headRejected)) await this.catchUp();
        else if (this.needsFeed) await this.catchUp();
        this.host.onProgress();
      } else if (this.needsFeed) {
        await this.catchUp();
      } else if (this.pendingCount < pendingBefore) {
        this.host.onProgress();
      } else if (this.pendingCount) {
        delay = RETRY_MS;
      }
    } catch (error) {
      const pending = new Set(this.state.pending.map(({ intentId }) => intentId));
      for (const id of dispatched) if (pending.has(id)) this.failedIntents.add(id);
      this.host.log?.('Note flush failed', { generation: this.host.generation,
        stage: this.sendingIntents.size ? 'transport' : this.journalFailed ? 'journal' : 'prepare-or-receipt',
        intentIds: [...dispatched] }, true);
      this.error(error);
      delay = RETRY_MS;
    } finally {
      if (this.sendingIntents.size) {
        this.sendingIntents.clear();
        this.host.onDeliveryChange?.();
      }
      this.sending = false;
      const pending = new Set(this.state.pending.map(({ intentId }) => intentId));
      for (const id of this.rebaseCounts.keys()) if (!pending.has(id)) this.rebaseCounts.delete(id);
      if (delay === RETRY_MS) this.rebaseCounts.clear();
      this.schedule(delay);
    }
  }
}
