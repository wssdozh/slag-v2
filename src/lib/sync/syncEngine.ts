// Owns sync: config, push of local changes, apply of incoming bundles, status reporting.
import { vault } from '../storage/port';
import { openNoteSession } from './notes/session';
import { isLegacySharedKind } from './notes/sharedBody';
import { persistIncomingBundle } from './applyBundle';
import { pushLocalChanges } from './pushBundle';
import { attachmentSignature } from './attachmentSignature';
import { apiBase } from './apiBase';
import {
  loadSentHashes,
  loadCursor,
  saveCursor,
  saveSentHashes,
  clearSyncLedgers,
  hydrateSyncSection,
  requireSyncSectionFlushed,
  SYNC_SECTION,
  loadAttachmentRequests,
  markAttachmentRequestSent as stampAttachmentRequest,
  ATTACHMENT_REQUEST_COOLDOWN_MS,
  isInitialSyncPending,
  setInitialSyncPending,
  saveStateHash,
  type SyncScope,
  type SyncSectionStore,
} from './localBookkeeping';
import { logger } from '../logger/logger';
import { migrateVaultSyncFiles, readProtectedSyncState, validateSyncLedger } from './vaultSyncFiles';
// Re-exported for the sync e2e specs, which drive sync through the real store. The headless
// build swaps this module out (config/vite.node.config.ts), so nothing here reaches the node.
import { storage } from '../storage';
export { storage };
import { accountClient } from './account';
export { accountClient };
import { Outbox } from './outbox/outbox';
import { createSyncOpFromStorageEvent } from './entities/registry';
import { syncErrorText } from './errorText';
import { isPageTimeout, nextPullStep, pullDeadlineMs, shrinkPullBudget } from './pullPage';
import { SyncTransport } from './transport';
import { isAndroidRelayPaused, waitForAndroidSync, watchAndroidSync } from './androidSyncLifecycle';
import * as manifestSchedule from './manifest/schedule';
import * as manifestSync from './manifest/sync';
import { connectSocket, handleIncoming, acknowledgeBundle } from './syncSocket';
import {
  applyAccountDevices,
  addTrustedDevice,
  setDeviceAllowedVaults,
  removeTrustedDevice,
  renameDevice,
  setDeviceSyncMode,
} from './deviceAdmin';
import {
  computeSubscription,
  hydrateConfig,
  loadConfig,
  saveConfig,
  authHeaders,
  refreshServerAuth,
  getVaultSeedPhrase,
  setVaultSeedPhrase,
} from './syncConfig';
import {
  computeHash,
  deriveVaultKey,
  deriveRoomId,
  generateMnemonic,
} from './crypto';
import type {
  SyncConfig,
  SyncStatus,
  SyncChangeItem,
  EncryptedBundle,
  DeviceProfile,
  DeviceSyncMode,
  AttachmentRequestPayload,
  ManifestStatus,
  ManifestTrigger,
} from './types';
import type { SlagItem, SlagAttachment, FolderMeta, WorkspaceState, AssistantMode } from '../../types';
import {
  SYNC_ATTACHMENT_MAX_BYTES,
  SYNC_INTERVALS,
} from '../../config';
import { isPrimaryWindow } from '../platform/windowControls';
import { getCachedSecret, getSecret, SECRET_KEYS } from '../platform/secretStore';
import { isTauri } from '@tauri-apps/api/core';

const syncLog = logger.scope('SYNC');
/** How much older than the tombstone a draft has to be before we call it a clock skew and stay quiet. */
const DRAFT_REASSERT_MIN_SKEW_MS = 60_000;

/** Cheap identity of an attachment's bytes: reading five megabytes to hash them is not. */
/** A bundle handed to the relay but not yet confirmed; holds the bookkeeping commit applies. */
export interface PendingPush {
  bundleId: string;
  encrypted: EncryptedBundle;
  frame: Uint8Array<ArrayBuffer>;
  stateHash: string;
  packedHashes: Record<string, string>;
  opIds: string[];
  changes: number;
  settled: boolean;
  httpInFlight?: boolean;
  attachmentRequestId?: string;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
}

/** One answer of the room's bundle feed: a page sized by weight, plus the room's watermarks. */
interface PullPage {
  bundles: { payload?: unknown; syncId?: unknown }[];
  head: number | null;
  oldest: number;
}

export class SyncEngine {
  public config: SyncConfig;
  public status: SyncStatus;
  private listeners = new Set<(status: SyncStatus) => void>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  public activeVaultKey: CryptoKey | null = null;
  public activeRoomId: string | null = null;
  private noteAbort?: AbortController;
  private noteSession: Awaited<ReturnType<typeof openNoteSession>> = null;
  private noteRoomStatus?: import('./notes/wire').NoteStatus;

  getNoteRoomStatus() { return this.noteRoomStatus; }
  private noteError: string | null = null;
  get noteGeneration() { return this.noteSession?.generation; }
  get hasFolderTreeRegistry() { return this.noteSession?.folderTree === true; }
  get hasAtomicFolderGroups() { return this.noteSession?.atomicGroups === true; }
  get hasSharedRegistry() { return this.noteSession?.sharedRecords === true; }
  get hasRegistryMedia() { return this.noteSession?.registryMedia === true; }
  public bundleQuery() {
    const query = new URLSearchParams({ vault: this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId });
    if (this.noteGeneration) query.set('noteGeneration', String(this.noteGeneration));
    if (this.hasFolderTreeRegistry) query.set('folderTree', '1');
    if (this.hasAtomicFolderGroups) query.set('atomicGroups', '1');
    if (this.hasSharedRegistry) query.set('sharedRecords', '1');
    if (this.hasRegistryMedia) query.set('registryMedia', '1');
    return query;
  }
  public isProcessingSync = false;
  public sequence = 1;
  public appliedBundleIds = new Set<string>();
  public batchUpdating = false;
  /** Set by the headless node: it holds a copy and never sends its own state back. */
  public forceReceiveOnly = false;
  /** A first pull over a tunnel can take minutes; the app on a LAN never needs more than 30s. */
  public pullTimeoutMs = 60_000;
  /** Bundles per pull request. A page of attachment-carrying bundles is megabytes. */
  public pullPageSize = 100;
  /**
   * Page budget in bytes, sent to the relay as `maxBytes`. The relay pages by weight, so one
   * answer stays a page a deadline can cover: with 31 queued attachments the count-based page was
   * hundreds of megabytes and died with an AbortError on every attempt.
   */
  public pullPageBytes: number = SYNC_INTERVALS.PULL_PAGE_BYTES;
  /** How soon a failed pass tries again. Public so a test does not sit through ten real seconds. */
  public retryDelayMs = SYNC_INTERVALS.RETRY_DELAY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  public initGeneration = 0;
  private relayRead: Promise<boolean> | undefined;
  private validatedSyncId: string | undefined;
  private androidPauseEpoch = 0;
  private androidResume?: Promise<void>;
  private androidResumeSocketReady?: () => void;
  private recheckRoomMode = false;
  private pendingPull: { generation: number; promise: Promise<void> } | null = null;
  public currentVaultId: string = 'default_vault';
  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Answers a question the bot forwarded; registered by the app, absent in the node build.
   * The question itself is passed through because only the app can hand it to a model.
   */
  private assistantHandler: ((
    requestId: string,
    question: string,
    mode: AssistantMode,
    reportStage: (stage: 'thinking') => void
  ) => void) | null = null;

  public setAssistantHandler(
    handler: ((
      requestId: string,
      question: string,
      mode: AssistantMode,
      reportStage: (stage: 'thinking') => void
    ) => void) | null
  ): void {
    this.assistantHandler = handler;
  }

  /** Clears the thread on `/clear`; also registered by the app, since the thread is local. */
  private assistantClearHandler: (() => void) | null = null;

  /** Tells the relay whether this device could answer with a model at all. */
  public setAssistantReadyProvider(provider: (() => boolean) | null): void {
    this.transport.assistantReadyProvider = provider ?? (() => false);
  }

  /** `/clear` from the bot: drop the thread this device has been keeping. */
  public setAssistantClearHandler(handler: (() => void) | null): void {
    this.assistantClearHandler = handler;
  }

  /**
   * Runs the action behind a tapped telegram button. Registered only by the app: the node
   * build has no executor, and an unknown frame shape stays `unknown` until it says otherwise.
   */
  private assistantActionHandler: ((requestId: string, action: unknown) => Promise<void> | void) | null = null;

  public setAssistantActionHandler(
    handler: ((requestId: string, action: unknown) => Promise<void> | void) | null
  ): void {
    this.assistantActionHandler = handler;
  }

  private pushDebounceDeadline = 0;
  private pushDebounceTrailing = false;
  /** The root this device last put in the room, so an unchanged vault makes no request. */
  public manifestPostedRoot: string | null = null;
  /** The slow background check: it starts with the room and dies with it. */
  private manifestHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  /** Bundle changes are collected here and written to disk once per burst, not once per bundle. */
  public importBuffer: {
    items: SlagItem[];
    folders: FolderMeta[];
    /**
     * Notes this burst deleted, by id. The write takes exactly these off the disk: a bundle carries
     * changes, and "absent from the list" is not a deletion — that reading once removed every note
     * the sender never mentioned.
     */
    removedIds: string[];
    /** Staged workspace: the field name is the one `importSyncedVaultData` reads. */
    workspaceState?: WorkspaceState;
    detail: { items: boolean; folders: boolean; workspace: boolean; drafts: boolean; memory: boolean };
    /** Bundles in this burst. They are ACKed only once the write below lands. */
    bundles: string[];
  } | null = null;
  private importTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Imports run one at a time. Two overlaps each read `previous` before the other has written,
   * so a note that moved folders lands in both: a new file appears and the old one is never
   * removed, because the second import never saw it. Replaying one day of phone changes as a
   * burst was enough to leave `item_1794860902957` in both `Входящие` and `Проекты/SLAG`.
   */
  private importFlushChain: Promise<void> = Promise.resolve();
  public pendingPushes = new Map<string, PendingPush>();
  public wsSupportsBinary = false;
  public pushDirty = false;
  /** One-shot: the next push may carry a single attachment. */
  public attachmentPass = false;

  public canPackAttachment(): boolean {
    return !this.hasRegistryMedia && this.attachmentPass && this.pendingPull === null;
  }
  /** Set when the relay refuses a bundle for quota: attachments wait for a restart. */
  private attachmentSyncBlocked = false;
  /** Attachments with no bytes on this device, so every push does not re-stat the same files. */
  private unreadableAttachments = new Set<string>();
  /** Draft ids whose deletion this device has already announced again for the current connection. */
  private reassertedDrafts = new Set<string>();
  /** Attachment ids a bundle claimed to deliver but this disk never got. */
  public missingAttachments = new Set<string>();
  /** Files a paired device asked for again: packed even when `sentHashes` calls them delivered. */
  private forcedAttachmentIds = new Set<string>();
  /** Files this device wants from the room, keyed by attachment id; one leaves per bundle. */
  private pendingRequests = new Map<string, AttachmentRequestPayload>();
  /** The one full-vault "do I have every byte" scan per session. */
  private missingScanGeneration = -1;
  public entityHashes = new Map<string, { sig: string; hash: string }>();
  public transport: SyncTransport;

  constructor() {
    this.transport = new SyncTransport({
      onStatus: (state, error) => {
        this.noteSession?.replica.requireCatchUp();
        this.status.state = state;
        if (error !== null) {
          this.status.error = error;
        } else if (state === 'connected') {
          this.status.error = null;
        }
        this.notify();
      },
      onConnectedDevicesCount: (count) => {
        this.status.connectedDevicesCount = count;
        this.notify();
      },
      onBinarySupport: (supported) => {
        this.wsSupportsBinary = supported;
      },
      onPing: (pingMs) => {
        this.status.pingMs = pingMs;
        this.notify();
      },
      onServerAck: (bundleId) => {
        const pending = this.pendingPushes.get(bundleId);
        if (pending && this.canUseVaultRelay()) this.commitPush(pending);
      },
      onNoteMessage: (message) => this.noteSession?.replica.handleMessage(message),
      onRoomModeChanged: () => {
        if (this.isRelayPaused) this.recheckRoomMode = true;
        else void this.init();
      },
      onBundle: async (bundle) => {
        await this.applyIncomingBundle(bundle);
      },
      // The relay forwards the bot's question; whoever registered a handler answers it.
      // Wired from the app, not imported here: the headless node build has no notifier.
      onAssistantQuestion: (requestId, question, mode, reportStage) => {
        this.assistantHandler?.(requestId, question, mode, reportStage);
      },
      onAssistantClear: () => {
        this.assistantClearHandler?.();
      },
      onAssistantAction: (requestId, action) => {
        return this.assistantActionHandler?.(requestId, action);
      },
      onCatchUpPull: (reason) => {
        if (this.isRelayPaused || !this.canUseVaultRelay()) return;
        if (this.androidResume) {
          if (reason === 'welcome') this.androidResumeSocketReady?.();
          return;
        }
        void this.noteSession?.replica.catchUp().catch((error: unknown) => this.reportNoteError(error));
        void this.fetchPendingBundlesHttp().catch((error) => syncLog.warn('Catch-up pull failed:', error));
        // A dropped socket takes the debounce timer with it; asks that survived the reconnect
        // must leave again instead of waiting for the next unrelated edit.
        if (this.pendingRequests.size > 0) this.scheduleDebouncedPush(0);
      },
      onAuthRejected: () => {
        this.disconnect();
      },
    });
    this.currentVaultId = vault().getCurrentVault()?.id || 'default_vault';
    this.status = {
      initialSync: {
        vaultId: this.currentVaultId,
        state: isInitialSyncPending(this.currentVaultId) ? 'loading' : 'idle',
        processed: 0, rejected: 0,
      },
      state: 'idle',
      authRequired: false,
      isAuthenticated: accountClient.isAuthenticated(),
      lastSyncTime: null,
      pingMs: null,
      error: null,
      pendingCount: 0,
      connectedDevicesCount: 1,
      currentRoomId: null,
      subscription: {
        plan: 'free',
        planLabel: 'Проверка сервера',
        expiresAt: null,
        expiresFormatted: '—',
        maxDevices: 0,
        activeDevices: 0,
        maxCacheMb: 0,
        usedCacheMb: 0,
        hasAiLease: false,
        isExpiringSoon: false,
      },
    };
    // The cache is a hint here, not the contract: the engine is built at module load, long before
    // anything can await a keychain, and the headless node reads its config in the same tick (it
    // checks for a seed phrase before `init` exists). `init`/`switchVault` replace this with the
    // authoritative `await getSecret(...)` answer.
    this.config = loadConfig(this, getCachedSecret(SECRET_KEYS.vaultSeed(this.currentVaultId)), this.currentVaultId);
    this.status.subscription = computeSubscription(this);
    accountClient.subscribe((accountState) => {
      this.status.isAuthenticated = accountClient.getToken(this.config.serverUrl) !== null;
      if (this.canUseVaultRelay()) applyAccountDevices(this, accountState);
    });

    vault().subscribeChanges((event) => {
      // Remote-origin writes are already applied state, and an external one came from the disk
      // under us (the MCP server, another editor): pushing it would echo back through the relay
      // and the two devices would ping-pong the same bundle forever.
      if (event.origin === 'remote' || (event.kind === 'item' && event.pendingDisk) || (isTauri() && !this.canUseVaultRelay())) return;
      if (this.hasFolderTreeRegistry && event.kind === 'folder') return;
      if (this.hasSharedRegistry && isLegacySharedKind(event.kind)) return;
      if (this.noteSession && (event.kind === 'item' || event.kind === 'trash')) {
        if (event.origin === 'external' && event.kind === 'item') {
          void this.noteSession.replica.recordExternal(event).catch((error: unknown) => this.reportNoteError(error));
        } else if (event.kind === 'item' && event.action === 'upsert' && (event.payload as SlagItem | undefined)?.attachments?.length) {
          this.scheduleAttachmentPass();
        }
        return;
      }
      if (event.origin === 'external') return;
      const op = createSyncOpFromStorageEvent(event);
      if (op) {
        syncLog.info(`Enqueued outbox op: [${op.kind}:${op.id}] action=${op.action}`);
        this.getOutbox().enqueue(op);
        if (op.kind === 'item' || op.kind === 'trash') this.notify();
        // A draft changes on every keystroke; only notes/folders/workspace drive the fast path.
        const isDraft = op.kind === 'draft';
        this.scheduleDebouncedPush(
          isDraft ? SYNC_INTERVALS.DRAFT_PUSH_DEBOUNCE_MS : SYNC_INTERVALS.PUSH_DEBOUNCE_MS,
          isDraft
        );
      }
    });
  }

  public getConfig(): SyncConfig {
    return { ...this.config };
  }

  private failedItemHashes = new Map<string, string>();
  private itemDeliveryLedger?: { queued: Set<string>; sent: Record<string, string> };

  public getItemDeliveryStatus(item: SlagItem, hash?: string) {
    if (!this.config.enabled) return 'local';
    if (this.noteSession) return this.noteSession.replica.deliveryStatus(item);
    if (this.config.localSyncMode === 'receive-only') return 'local';
    const key = `item:${item.id}`;
    const ledger = this.itemDeliveryLedger ??= {
      queued: new Set(this.getOutbox().pending().filter(({ kind }) => kind === 'item' || kind === 'trash').map(({ id }) => id)),
      sent: loadSentHashes(this.bookkeeping),
    };
    const queued = ledger.queued.has(item.id);
    if (this.activeRoomId && hash) {
      if (ledger.sent[key] === hash && !queued) return 'accepted';
      if ([...this.pendingPushes.values()].some((push) => push.packedHashes[key] === hash)) return 'sending';
      if (this.failedItemHashes.get(key) === hash) return 'error';
    }
    return queued ? 'pending' : 'unconfirmed';
  }

  public getNoteConflicts() {
    const replica = this.noteSession?.replica;
    return replica?.conflicts.map((entry) => {
      const current = replica.confirmedValue(entry.noteId);
      return { ...entry, currentRevision: current?.revision ?? 0, currentItem: current?.item ?? null };
    }) ?? [];
  }

  public async resolveNoteConflict(intentId: string, resolution: 'keep' | 'retry', reviewedRevision: number, content?: string) {
    const replica = this.noteSession?.replica;
    if (!replica) throw new Error('Реестр синхронизации недоступен');
    await replica.resolveConflict(intentId, resolution, reviewedRevision, content);
  }

  public async resolveFolderConflict(groupId: string, resolution: 'keep' | 'retry', reviewed: Readonly<Record<string, number>>) {
    const replica = this.noteSession?.replica;
    if (!replica) throw new Error('Реестр синхронизации недоступен');
    await replica.resolveFolderConflict(groupId, resolution, reviewed);
  }

  public getStatus(): SyncStatus {
    const manifest = this.status.manifest;
    const registry = this.noteSession?.replica;
    const pendingCount = registry ? registry.pendingCount + this.getOutbox().pending().length : this.status.pendingCount;
    const error = this.status.error ?? this.noteError;
    const state = registry && this.status.state === 'connected'
      ? registry.syncHealth === 'error' || error ? 'error'
        : !this.activeRoomId || !this.transport.isOpenFor(this.activeRoomId) ? 'offline'
        : registry.syncHealth !== 'current' || pendingCount || this.pendingPushes.size ? 'syncing' : 'connected'
      : this.status.state;
    return {
      ...this.status,
      state,
      error,
      pendingCount,
      registry: this.noteSession?.progress,
      initialSync: { ...this.status.initialSync },
      subscription: computeSubscription(this),
      // Copied like the fields above: the panel holds this object, and a status the engine keeps
      // mutating under a render is how a listener sees half an update.
      manifest: manifest
        ? {
            ...manifest,
            folders: [...manifest.folders],
            extra: [...manifest.extra],
            missing: [...manifest.missing],
            // Copied one level deeper than the rest: the panel holds this object across renders.
            peers: manifest.peers.map((peer) => ({
              ...peer,
              extra: [...peer.extra],
              missing: [...peer.missing],
            })),
          }
        : undefined,
    };
  }

  /**
   * The same object until the next check replaces it.
   *
   * `getStatus` copies, which is right for a listener and wrong for `useSyncExternalStore`: a new
   * snapshot every render reads as "it changed". This is the stable handle the panel subscribes to.
   */
  public getManifest(): ManifestStatus | null {
    return manifestSync.getManifest(this);
  }

  public subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    this.itemDeliveryLedger = undefined;
    const current = this.getStatus();
    this.listeners.forEach((fn) => fn(current));
  }

  public get isRelayPaused(): boolean { return isAndroidRelayPaused(); }

  private pauseAndroidSync(): void {
    this.androidPauseEpoch++;
    this.androidResumeSocketReady?.();
    this.transport.setPaused(true);
    this.noteSession?.replica.requireCatchUp();
    this.clearRetryTimer();
    this.clearPushDebounce();
    manifestSchedule.clearManifestCheck();
  }

  private resumeAndroidSync(wasPaused: boolean): void {
    if (!this.config.enabled || !this.activeRoomId || !this.canUseVaultRelay()) return;
    const socketUnavailable = !this.transport.isOpenFor(this.activeRoomId) && this.ws?.readyState !== WebSocket.CONNECTING;
    if (this.recheckRoomMode) { void this.init(); return; }
    if (!wasPaused && (!socketUnavailable || this.androidResume)) return;
    const generation = this.initGeneration;
    const pauseEpoch = this.androidPauseEpoch;
    const current = () => generation === this.initGeneration && pauseEpoch === this.androidPauseEpoch
      && !this.isRelayPaused && this.canUseVaultRelay();
    // Coalesce a reconnect's welcome with this pass, but fall back to HTTP even if no
    // socket can be established. An unresponsive transport must not hold the outbox.
    const socketReady = socketUnavailable ? new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SYNC_INTERVALS.RECONNECT_BASE_MS);
      this.androidResumeSocketReady = () => { clearTimeout(timer); resolve(); };
    }) : Promise.resolve();
    const resume = socketReady.then(() => this.catchUpAfterAndroidResume(current, wasPaused))
      .catch((error: unknown) => syncLog.warn('Resume sync failed:', error))
      .finally(() => {
        if (this.androidResume !== resume) return;
        this.androidResume = undefined;
        this.androidResumeSocketReady = undefined;
      });
    this.androidResume = resume;
    if (socketUnavailable) this.connectWebSocket();
  }

  private async catchUpAfterAndroidResume(current: () => boolean, wasPaused: boolean): Promise<void> {
    // Wait out a request that started before the pause: it may hold an older snapshot.
    if (wasPaused && this.pendingPull) await this.pendingPull.promise.catch(() => undefined);
    if (!current()) return;
    try {
      await Promise.all([this.fetchPendingBundlesHttp(), this.noteSession?.replica.catchUpAfterPause()]);
    } catch (error) {
      if (current() && error instanceof Error && error.message === 'note_upgrade_required') await this.init();
      else if (current()) this.reportNoteError(error);
    }
    if (!current()) return;
    await Promise.all([...this.pendingPushes.values()].filter((pending) => pending.fallbackTimer === null)
      .map((pending) => this.deliverPushOverHttp(pending)));
    if (!current()) return;
    this.scheduleAttachmentPass();
    this.scheduleDebouncedPush(0);
  }

  private clearPushDebounce(): void {
    if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
    this.pushDebounceTimer = null;
    this.pushDebounceDeadline = 0;
    this.pushDebounceTrailing = false;
  }

  public scheduleDebouncedPush(delayMs: number = SYNC_INTERVALS.PUSH_DEBOUNCE_MS, trailing = false): void {
    if (this.isRelayPaused) return;
    const deadline = Date.now() + delayMs;
    if (this.pushDebounceTimer) {
      // A note never waits for a slow draft timer: the faster pending push wins.
      if (!trailing && this.pushDebounceDeadline <= deadline) return;
      // And a draft never delays a pending note push — that push already carries it.
      if (trailing && !this.pushDebounceTrailing) return;
    }
    // Trailing pushes restart on every keystroke, so only the last state leaves the device.
    if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
    this.pushDebounceDeadline = deadline;
    this.pushDebounceTrailing = trailing;
    this.pushDebounceTimer = setTimeout(() => {
      this.pushDebounceTimer = null;
      this.pushDebounceDeadline = 0;
      this.pushDebounceTrailing = false;
      void pushLocalChanges(this);
    }, delayMs);
  }

  public getBundleOutbox() {
    return this.getOutbox().pending().filter((op) =>
      (!this.noteGeneration || (op.kind !== 'item' && op.kind !== 'trash'))
      && (!this.hasFolderTreeRegistry || op.kind !== 'folder')
       && (!this.hasSharedRegistry || !isLegacySharedKind(op.kind)));
  }

  public getOutbox(): Outbox {
    return new Outbox(this.bookkeeping);
  }

  /** One manifest check, on the earliest deadline anybody asked for: see `manifest/schedule.ts`. */
  public scheduleManifestCheck(
    delayMs: number = SYNC_INTERVALS.MANIFEST_CHECK_DEBOUNCE_MS,
    trigger: ManifestTrigger = 'push',
  ): void {
    if (!this.isRelayPaused && !this.noteGeneration) manifestSchedule.scheduleManifestCheck(this, delayMs, trigger);
  }

  /** The panel's «сверить сейчас»: one check, now, with the latch out of the way. */
  public requestManifestCheck(): void {
    if (this.isRelayPaused || !this.canUseVaultRelay()) return;
    if (this.noteSession) {
      // The offline capture session exists before disk edits are safe from inbound projection.
      if (this.activeRoomId) void this.noteSession.replica.catchUp(true).catch((error: unknown) => this.reportNoteError(error));
    } else manifestSchedule.requestManifestCheck(this);
  }

  /**
   * Attachment bytes are their own change type and their own bundle: one file per push, so a
   * photo never rides inside a keystroke bundle. The pass is a one-shot flag the push consumes.
   */
  private scheduleAttachmentPass(): void {
    if (this.hasRegistryMedia) return;
    // A queued ask for missing bytes drains one bundle at a time, on the same one-shot push.
    if (this.pendingRequests.size > 0) this.scheduleDebouncedPush(0);
    // A backlog pull owns the channel: one file per push here is slower than the pull and would
    // starve it — the pull died with "Сервер не ответил за 30 с" on a laptop uploading 31 files.
    // The pull asks for the pass again when it is done.
    if (this.pendingPull) {
      syncLog.debug('Attachment pass deferred: a backlog pull is in flight');
      return;
    }
    // init and every confirmed push both call this: one queued pass is enough for both.
    if (this.attachmentPass) {
      this.scheduleDebouncedPush(0);
      return;
    }
    if (this.attachmentSyncBlocked) {
      syncLog.debug('Attachment pass skipped: relay refused the plan quota for this session');
      return;
    }
    const pending = [...this.forcedAttachmentIds].some((id) => !this.isAttachmentInFlight(id)) ? 1 : this.countPendingAttachments();
    if (pending === 0) {
      syncLog.debug('Attachment pass skipped: nothing left to deliver');
      return;
    }
    syncLog.info(`Attachment pass queued: ${pending} file(s) not delivered yet`);
    this.attachmentPass = true;
    this.scheduleDebouncedPush(0);
  }

  private isAttachmentInFlight(id: string): boolean {
    return [...this.pendingPushes.values()].some(({ packedHashes }) => Object.hasOwn(packedHashes, `att:${id}`));
  }

  /** Signature comparison only: no bytes are read to answer "is anything left to send". */
  private countPendingAttachments(): number {
    const sent = loadSentHashes(this.bookkeeping);
    let pending = 0;
    for (const item of vault().getItems()) {
      for (const att of item.attachments ?? []) {
        if (this.unreadableAttachments.has(att.id) || this.isAttachmentInFlight(att.id)) continue;
        const seen = sent[`att:${att.id}`];
        if (seen !== attachmentSignature(att) && seen !== `skip:${attachmentSignature(att)}`) pending++;
      }
    }
    return pending;
  }

  /** Bytes of one attachment as a `dataUrl` change; true as soon as one was packed. */
  public async packOneAttachment(
    item: SlagItem,
    changes: SyncChangeItem[],
    sentHashes: Record<string, string>,
    packedHashes: Record<string, string>
  ): Promise<boolean> {
    if (this.hasRegistryMedia) return false;
    const attachments = item.attachments ?? [];
    const attempted = new Set<string>();
    // A device asked for these bytes after a bundle it ACKed failed to write them: they leave
    // again even though `sentHashes` calls them delivered.
    for (const att of attachments) {
      if (!this.forcedAttachmentIds.has(att.id)) continue;
      attempted.add(att.id);
      if (this.isAttachmentInFlight(att.id)) continue;
      if (await this.packAttachmentBytes(att, changes, sentHashes, packedHashes, true) === 'packed') return true;
      this.forcedAttachmentIds.delete(att.id);
    }
    for (const att of attachments) {
      if (attempted.has(att.id)) continue;
      if (await this.packAttachmentBytes(att, changes, sentHashes, packedHashes, false) === 'packed') return true;
    }
    return false;
  }

  /**
   * One attachment's bytes as a change, or why it stayed home. Forced packing ignores the
   * "already delivered" mark but not the "too big to sync" one: that is a refusal, not a receipt.
   */
  private async packAttachmentBytes(
    att: SlagAttachment,
    changes: SyncChangeItem[],
    sentHashes: Record<string, string>,
    packedHashes: Record<string, string>,
    forced: boolean
  ): Promise<'packed' | 'skipped'> {
    const key = `att:${att.id}`;
    if (this.isAttachmentInFlight(att.id)) return 'skipped';
    const sig = attachmentSignature(att);
    const seen = sentHashes[key];
    if (seen === `skip:${sig}`) {
      syncLog.debug(`Attachment already marked unsyncable: "${att.name}" (${att.size} B)`);
      return 'skipped';
    }
    if (!forced && seen === sig) return 'skipped';

    syncLog.debug(`Reading attachment bytes: "${att.name}" (${Math.round(att.size / 1024)} KB, ${att.mimeType})`);
    const dataUrl = await vault().getAttachmentDataUrl(att);
    if (!dataUrl) {
      // Bytes can appear later (a download, a re-import), so this rests for the session only.
      this.unreadableAttachments.add(att.id);
      syncLog.warn(`Attachment has no local bytes, nothing to send: "${att.name}" (${att.relativePath})`);
      return 'skipped';
    }
    if (dataUrl.length > SYNC_ATTACHMENT_MAX_BYTES * 1.4) {
      // No new state for "give up": a marker in the sent-hashes map is already understood by
      // every reader of it, while a second set would have to be loaded, cleared and migrated.
      sentHashes[key] = `skip:${sig}`;
      saveSentHashes(this.bookkeeping, sentHashes);
      syncLog.warn(
        `Attachment too big to sync: "${att.name}" (${Math.round(att.size / 1024)} KB > ${SYNC_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB)`
      );
      return 'skipped';
    }
    changes.push({
      id: att.id,
      type: 'attachment',
      action: 'upsert',
      version: 1,
      hash: sig,
      payload: { attachment: { ...att, dataUrl: undefined }, dataUrl },
    });
    packedHashes[key] = sig;
    syncLog.info(
      `Attachment packed: "${att.name}" (${Math.round(att.size / 1024)} KB, ${Math.round(dataUrl.length / 1024)} KB as base64)`
    );
    return 'packed';
  }

  /** A paired device lost these bytes: send them again despite the delivered mark. */
  public forceAttachmentSend(attachmentId: string): void {
    if (this.hasRegistryMedia || this.forcedAttachmentIds.has(attachmentId)) return;
    if (this.attachmentSyncBlocked) {
      syncLog.debug('Forced attachment skipped: relay refused the plan quota for this session');
      return;
    }
    this.forcedAttachmentIds.add(attachmentId);
    this.attachmentPass = true;
    this.scheduleDebouncedPush(0);
  }

  /**
   * Ask the room for a file this device knows only as metadata. One ask per file per day: a vault
   * with a dozen broken photos would otherwise ask on every reconnect.
   */
  public requestAttachmentBytes(att: SlagAttachment): void {
    if (this.hasRegistryMedia || this.pendingRequests.has(att.id)) return;
    const lastRequestedAt = loadAttachmentRequests(this.bookkeeping)[`att:${att.id}`] ?? 0;
    if (Date.now() - lastRequestedAt < ATTACHMENT_REQUEST_COOLDOWN_MS) return;
    this.pendingRequests.set(att.id, {
      attachmentId: att.id,
      name: att.name,
      size: att.size,
      relativePath: att.relativePath,
    });
    syncLog.info(`Asking the room for attachment bytes: "${att.name}" (${Math.round(att.size / 1024)} KB)`);
    this.scheduleDebouncedPush(0);
  }

  /**
   * A peer keeps offering a composer draft this vault has already deleted: it never got the
   * delete, so it replays the stale text on every catch-up. Announcing the delete again — with a
   * fresh stamp, which every device treats as "newer" — is the only way that copy goes away.
   * One announcement per draft per connection, and only when the copy is clearly older: a peer
   * whose clock runs a few seconds behind is not holding a deleted draft.
   */
  public reassertDraftDeletion(folder: string, deletedAt: number, staleUpdatedAt: number): void {
    if (deletedAt - staleUpdatedAt < DRAFT_REASSERT_MIN_SKEW_MS) return;
    const id = `composer:${folder}`;
    if (this.reassertedDrafts.has(id)) return;
    this.reassertedDrafts.add(id);
    vault().deleteComposerDraft(folder, 'local');
    syncLog.info(`Re-announced deleted composer draft for "${folder}"`);
  }

  /** At most one request per bundle: the answer is a whole file, not a diff. */
  public nextAttachmentRequest(): AttachmentRequestPayload | null {
    if (this.hasRegistryMedia) return null;
    if (this.pendingRequests.size === 0) return null;
    const inFlight = new Set([...this.pendingPushes.values()].map(({ attachmentRequestId }) => attachmentRequestId));
    for (const request of this.pendingRequests.values()) if (!inFlight.has(request.attachmentId)) return request;
    return null;
  }

  /** Bytes arrived from whichever device answered first: drop the ask that has not left yet. */
  public cancelAttachmentRequest(attachmentId: string): void {
    this.pendingRequests.delete(attachmentId);
  }

  public hasPendingAttachmentRequests(): boolean {
    return this.nextAttachmentRequest() !== null;
  }

  public markAttachmentRequestSent(attachmentId: string): void {
    this.pendingRequests.delete(attachmentId);
    stampAttachmentRequest(this.bookkeeping, attachmentId);
  }

  /**
   * One full-vault pass per session over files this device holds only as metadata. `hasAttachmentBytes`
   * stats the disk, so this is not a per-bundle loop; the per-file cooldown does the rest.
   */
  public async requestMissingAttachments(): Promise<void> {
    if (this.hasRegistryMedia) return;
    if (this.missingScanGeneration === this.initGeneration) return;
    this.missingScanGeneration = this.initGeneration;
    try {
      for (const item of vault().getItems()) {
        for (const att of item.attachments ?? []) {
          if (await vault().hasAttachmentBytes(att.id, att.relativePath)) continue;
          this.requestAttachmentBytes(att);
        }
      }
    } catch (error) {
      syncLog.warn('Attachment byte scan failed:', error);
    }
  }

  /**
   * Bundle changes are applied to a working copy and written once per burst.
   * Writing per bundle made replaying a backlog flicker: a note from an old bundle
   * appeared, then a newer bundle deleted or replaced it a second later.
   */
  public stageImport(
    items: SlagItem[],
    folders: FolderMeta[],
    removedIds: string[],
    workspaceState: WorkspaceState | undefined,
    detail: { items: boolean; folders: boolean; workspace: boolean; drafts: boolean; memory: boolean },
    bundleId: string
  ): void {
    const previous = this.importBuffer?.detail;
    const bundles = this.importBuffer?.bundles ?? [];
    if (!bundles.includes(bundleId)) bundles.push(bundleId);
    // A burst is one write, so a note deleted by the first bundle and named by the second stays
    // named: the union is what the write is allowed to take off the disk.
    const removed = new Set(this.importBuffer?.removedIds ?? []);
    for (const id of removedIds) removed.add(id);
    this.importBuffer = {
      items,
      folders,
      removedIds: [...removed],
      workspaceState: workspaceState ?? this.importBuffer?.workspaceState,
      detail: {
        items: detail.items || Boolean(previous?.items),
        folders: detail.folders || Boolean(previous?.folders),
        workspace: detail.workspace || Boolean(previous?.workspace),
        drafts: detail.drafts || Boolean(previous?.drafts),
        memory: detail.memory || Boolean(previous?.memory),
      },
      bundles,
    };
    if (this.batchUpdating || this.importTimer) return;
    this.importTimer = setTimeout(() => {
      this.importTimer = null;
      void this.flushStagedImport().catch((error) => syncLog.error('Staged sync import failed:', error));
    }, 120);
  }

  private flushStagedImport(): Promise<void> {
    const run = this.importFlushChain.then(() => this.writeStagedImport());
    this.importFlushChain = run.catch(() => undefined);
    return run;
  }

  private async writeStagedImport(): Promise<void> {
    if (this.importTimer) {
      clearTimeout(this.importTimer);
      this.importTimer = null;
    }
    const buffered = this.importBuffer;
    if (!buffered) return;
    this.importBuffer = null;
    const generation = this.initGeneration;
    try {
      // The buffer's fields are the import's fields on purpose: it used to hand the staged
      // workspace over under a name the storage read never looked at, so a profile (and every
      // other workspace field) from another device never landed.
      await vault().importSyncedVaultData({
        items: !this.noteGeneration && buffered.detail.items ? buffered.items : undefined,
        folders: !this.hasFolderTreeRegistry && buffered.detail.folders ? buffered.folders : undefined,
        removedIds: !this.noteGeneration && buffered.detail.items ? buffered.removedIds : undefined,
        registryNotes: Boolean(this.noteGeneration),
        workspaceState: this.hasSharedRegistry ? undefined : buffered.workspaceState,
      });
      await requireSyncSectionFlushed();
    } catch (error) {
      // Nothing reached the disk, so the relay must not be told this burst is done: dropping
      // the ids makes a re-delivery apply again instead of being skipped as "already applied".
      for (const bundleId of buffered.bundles) this.appliedBundleIds.delete(bundleId);
      const msg = error instanceof Error ? error.message : String(error);
      syncLog.error('Failed to persist staged sync import:', msg);
      // A session that already reconnected has no business showing this session's error:
      // its own pull still holds the unACKed bundles.
      if (generation === this.initGeneration) {
        this.status.state = 'error';
        this.status.error = msg;
        this.notify();
      }
      throw error;
    }
    if (generation === this.initGeneration && !this.noteGeneration && buffered.removedIds.length > 0) {
      const activeIds = new Set(vault().getItems().map((item) => item.id));
      syncLog.debug('Legacy import: explicit note deletes after persistence', {
        bundles: buffered.bundles.slice(0, 8),
        bundleCount: buffered.bundles.length,
        requested: buffered.removedIds.length,
        stillActive: buffered.removedIds.filter((id) => activeIds.has(id)).length,
      });
    }
    // One render per burst, after the final state is on disk.
    window.dispatchEvent(
      new CustomEvent('slag-sync-updated', {
        detail: {
          hasItemsChanged: buffered.detail.items,
          hasFoldersChanged: buffered.detail.folders,
          hasWorkspaceChanged: buffered.detail.workspace,
          hasDraftsChanged: buffered.detail.drafts,
          hasMemoryChanged: buffered.detail.memory,
        },
      })
    );
    // Only now is the relay allowed to forget its copy of these bundles. A re-delivery before
    // this point still hits the `appliedBundleIds` check, so nothing is applied twice.
    for (const bundleId of buffered.bundles) {
      if (generation !== this.initGeneration) return;
      try {
        await this.sendAck(bundleId);
      } catch (error) {
        // Allow another delivery to retry; the state is already on disk.
        this.appliedBundleIds.delete(bundleId);
        syncLog.warn(`Failed to ACK applied bundle ${bundleId}:`, error);
      }
    }
  }

  public get bookkeeping(): SyncScope {
    return {
      vaultId: this.currentVaultId,
      roomId: this.activeRoomId,
      accountSync: this.usesAccountSync(),
    };
  }

  /**
   * The `sync` section's home on disk. The vault is captured here because the write is queued: a
   * save that lands after a vault switch would otherwise write this vault's ledgers into the file
   * of the vault that replaced it.
   */
  private syncSectionStore(vaultId: string): SyncSectionStore {
    const meta = storage.getCurrentVault();
    if (meta.id !== vaultId) throw new Error('Хранилище сменилось до чтения журнала');
    return {
      read: () => storage.files.readStateSection(SYNC_SECTION, meta, true),
      write: (patch) => storage.files.writeStateSection(SYNC_SECTION, patch, meta, true),
    };
  }

  /**
   * Config and ledgers, once per init. Both come out of the vault's own `state.json`, and the seed
   * phrase comes out of the secret store — the config in the file never carries it. They are read
   * before the checks below because "is sync on" and "which room" are fields of that config.
   *
   * The web build and the headless node have no disk: `hydrateSyncSection` is not even asked, and
   * every ledger keeps answering from the storage it answered from before.
   */
  private async hydrateSyncState(generation: number, fresh = false): Promise<boolean> {
    const vaultId = this.currentVaultId;
    const isCurrent = () => generation === this.initGeneration && vaultId === this.currentVaultId;
    try {
      const seed = await getSecret(SECRET_KEYS.vaultSeed(vaultId));
      if (!isCurrent()) return false;

      let section: Record<string, unknown> | null = null;
      let protectedBinding = false;
      let protectLegacyRegistry: unknown;
      const meta = isTauri() ? storage.getCurrentVault() : undefined;
      const dir = meta ? storage.files.getVaultDir(meta) : undefined;
      let syncStore: SyncSectionStore | undefined;
      let syncId: string | undefined;
      if (dir && meta) {
        if (meta.id !== vaultId) return false;
        const existing = await readProtectedSyncState(dir, vaultId);
        protectedBinding = !!existing.ledger && !!existing.config;
        syncId = typeof existing.config?.syncId === 'string' ? existing.config.syncId : meta.syncId;
        if (existing.config?.syncId && meta.syncId && existing.config.syncId !== meta.syncId) throw new Error('Изменилась привязка хранилища');
        syncStore = this.syncSectionStore(vaultId);
        const previousSection = await syncStore.read();
        validateSyncLedger(previousSection);
        if (!isCurrent()) return false;
        if (!protectedBinding || existing.ledger?.registryRequired !== true) protectLegacyRegistry = await storage.readNoteRegistry();
        if (!seed && !fresh && (protectedBinding || !!meta.syncId || protectLegacyRegistry !== undefined || previousSection.config !== undefined)) {
          throw new Error('Ключ существующего хранилища недоступен');
        }
        const outcome = await hydrateSyncSection(this.bookkeeping, syncStore, isCurrent, !protectedBinding);
        if (!outcome.persisted) throw new Error('Не удалось загрузить журнал синхронизации', { cause: outcome.error });
        section = outcome.section;
      }
      if (!isCurrent()) return false;
      const config = await hydrateConfig(this, vaultId, seed, section, protectedBinding);
      if (!isCurrent()) return false;
      if (syncStore && dir && meta && !protectedBinding) {
        const source = await syncStore.read();
        const fence = await storage.files.readStateSection('pendingFolderProjection', meta, true);
        if (!isCurrent() || storage.getCurrentVault() !== meta) return false;
        await migrateVaultSyncFiles(dir, vaultId, source, fence, syncId);
      }
      if (!isCurrent()) return false;
      if (meta && !protectedBinding) await storage.files.finishSyncMigration(meta);
      if (!isCurrent()) return false;
      if (protectLegacyRegistry !== undefined) await storage.writeNoteRegistry(protectLegacyRegistry);
      if (!isCurrent()) return false;
      this.validatedSyncId = syncId;
      this.config = config;
      this.status.subscription = computeSubscription(this);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      syncLog.error(`Could not read the sync state of vault ${vaultId}:`, error);
      this.status.initialSync = { vaultId, state: 'idle', processed: 0, rejected: 0 };
      this.status.state = 'error';
      this.status.error = 'Синхронизация остановлена: журнал хранилища не удалось прочитать или сохранить.';
      this.notify();
      return false;
    }
  }

  public getCurrentVaultId(): string {
    return this.currentVaultId;
  }

  public canUseVaultRelay(vaultId = this.currentVaultId): boolean {
    return !isTauri() || (vaultId === this.currentVaultId && storage.getCurrentVault().id === vaultId
      && this.relayRead === storage.getCurrentVaultRead());
  }

  public getSyncVaultId(): string {
    if (isTauri()) {
      if (!this.canUseVaultRelay()) throw new Error('Привязка хранилища не проверена');
      if (this.validatedSyncId) return this.validatedSyncId;
      const saved = storage.getCurrentVault().syncId;
      if (saved) return saved;
    }
    return vault().ensureVaultSyncId(this.currentVaultId);
  }

  public usesAccountSync(): boolean {
    return this.status.authRequired || accountClient.getToken(this.config.serverUrl) !== null;
  }

  public saveConfig(newConfig: Partial<SyncConfig>): void {
    if (!this.canUseVaultRelay()) return;
    saveConfig(this, newConfig);
  }

  public beginInitialSync(vaultId: string): void {
    setInitialSyncPending(vaultId, true);
    this.status.initialSync = { vaultId, state: 'loading', processed: 0, rejected: 0 };
    this.notify();
  }

  public failInitialSync(error: unknown): void {
    this.status.initialSync.state = 'error';
    this.status.error = error instanceof Error ? error.message : String(error);
    this.notify();
  }

  public async retryInitialSync(): Promise<void> {
    const syncId = this.getSyncVaultId();
    const pending = accountClient.getState().invitations.some((entry) => entry.vaultId === syncId);
    if (pending) await accountClient.acceptVault(syncId);
    this.saveConfig({ enabled: true });
    await this.init();
  }

  /**
   * One retry on the clock, whatever failed. `disconnect` bumps the generation on every attempt,
   * so a single timer per engine is all the deduplication this needs.
   */
  public scheduleRetry(): void {
    if (this.retryTimer || !this.config.enabled || this.isRelayPaused) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.retrySync();
    }, this.retryDelayMs);
  }

  /**
   * The repair path for both the timer and the refresh button: drop the stale error, then redo
   * whichever step is missing. A refused first sync never got a room and blocks every push until
   * it succeeds, so that one restarts from `init`; everything else just pulls and pushes again.
   */
  public async retrySync(): Promise<void> {
    this.clearRetryTimer();
    if (this.isRelayPaused) return;
    if (!this.activeRoomId) {
      await this.init();
      return;
    }
    // Unconditional: an error left over from a connection that is back is the whole reason the
    // panel kept saying "Ошибка" after the server answered a health check.
    this.status.error = null;
    this.notify();
    if (!this.config.enabled) return;
    // One pass at a time: a pull already in flight is this retry, and two of them race the cursor.
    if (this.isProcessingSync || this.pendingPull) {
      this.scheduleRetry();
      return;
    }
    if (this.status.initialSync.state === 'error') {
      await this.init();
      return;
    }
    const generation = this.initGeneration;
    try {
      this.status.state = 'syncing';
      this.notify();
      await Promise.all([this.fetchPendingBundlesHttp(), this.noteSession?.replica.catchUp()]);
      if (generation !== this.initGeneration || this.isRelayPaused) return;
      // The pull answered, so the red dot is a lie even before the push below decides anything.
      this.status.state = this.ws && this.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
      this.notify();
      await pushLocalChanges(this);
    } catch (error) {
      if (generation !== this.initGeneration || this.isRelayPaused) return;
      if (error instanceof Error && error.message === 'note_upgrade_required') {
        await this.init();
        return;
      }
      if (this.noteSession) this.reportNoteError(error);
      // The legacy pull reported itself to the status and already asked for the next attempt.
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  public async switchVault(vaultId: string): Promise<void> {
    if (this.currentVaultId === vaultId && this.status.state !== 'idle' && this.status.state !== 'error') {
      return;
    }
    syncLog.info(`SyncEngine switching to vault: ${vaultId}`);
    this.disconnect();
    this.currentVaultId = vaultId;
    this.status.currentRoomId = null;
    await this.init();
  }

  public async init(): Promise<void> {
    if (!isPrimaryWindow()) return;
    this.disconnect();
    const generation = this.initGeneration;
    const startedAt = performance.now();
    const read = isTauri() ? storage.getCurrentVaultRead() : undefined;
    const recovery = isTauri() ? await storage.getCurrentVaultRecovery() : { kind: 'ready', fresh: false };
    if (generation !== this.initGeneration || (read && (storage.getCurrentVaultRead() !== read || storage.getCurrentVault().id !== this.currentVaultId))) return;
    if (recovery.kind !== 'ready') {
      this.status.initialSync = { vaultId: this.currentVaultId, state: 'idle', processed: 0, rejected: 0 };
      this.status.state = 'error';
      this.status.error = 'Синхронизация приостановлена: состояние очереди не подтверждено.';
      this.notify();
      return;
    }
    if (!await this.hydrateSyncState(generation, recovery.fresh) || generation !== this.initGeneration) return;
    if (read && storage.getCurrentVaultRead() !== read) return;
    this.relayRead = read;
    const seedPhrase = this.config.seedPhrase;
    const initial = isInitialSyncPending(this.currentVaultId);
    if (initial) syncLog.info('Initial sync started', { vaultId: this.currentVaultId });
    this.status.initialSync = { vaultId: this.currentVaultId, state: initial ? 'loading' : 'idle', processed: 0, rejected: 0 };
    if (!this.config.enabled) {
      if (initial) this.failInitialSync(new Error('Синхронизация выключена'));
      this.status.state = 'idle';
      this.notify();
      return;
    }
    if (!seedPhrase) {
      this.status.state = 'idle';
      this.status.error = 'Ключ хранилища недоступен. Восстановите seed-фразу на этом устройстве.';
      if (initial) this.status.initialSync.state = 'error';
      this.notify();
      return;
    }

    let initializing = true;
    try {
      this.status.state = 'syncing';
      this.notify();

      const port = vault();
      const serverUrl = apiBase(this.config.serverUrl);
      const vaultId = this.validatedSyncId ?? port.getCurrentVault().syncId;
      const [vaultKey, legacyRoomId] = await Promise.all([deriveVaultKey(seedPhrase), deriveRoomId(seedPhrase)]);
      if (generation !== this.initGeneration || !this.canUseVaultRelay()) return;
      const accountRoom = async (id: string) =>
        `room_${(await computeHash(JSON.stringify(['slag-account-room-v1', id, legacyRoomId]))).slice(0, 32)}`;
      const controller = this.noteAbort = new AbortController();
      const current = () => generation === this.initGeneration && this.canUseVaultRelay();
      this.transport.setPaused(this.isRelayPaused);
      watchAndroidSync(controller.signal, () => this.pauseAndroidSync(), (wasPaused) => {
        this.transport.setPaused(false);
        if (!initializing) this.resumeAndroidSync(wasPaused);
      });
      const waitForRelay = async () => {
        while (current() && this.isRelayPaused) await waitForAndroidSync(controller.signal);
        return current();
      };
      const noteOptions = (roomId: string, syncVaultId: string): Parameters<typeof openNoteSession>[0] => ({
        serverUrl, roomId, vaultId: syncVaultId, key: vaultKey,
        signal: controller.signal, port, headers: (json: boolean) => authHeaders(this, json),
        readOnly: this.config.localSyncMode === 'receive-only', sendLive: (message: string) => this.transport.send(message),
        isLiveOpen: () => this.transport.isOpenFor(roomId),
        isRelayPaused: () => this.isRelayPaused,
        onDeliveryChange: () => this.notify(),
        onStatus: (status) => { if (generation === this.initGeneration) { this.noteRoomStatus = status; this.notify(); } },
        log: (event, data, warning) => warning ? syncLog.warn(event, data) : syncLog.debug(event, data),
        onError: (error: unknown) => this.reportNoteError(error), onProgress: () => {
          if (controller.signal.aborted) return;
          if (this.noteSession?.replica.syncHealth === 'current') this.noteError = null;
          this.status.lastSyncTime = new Date().toLocaleTimeString();
          this.notify();
        },
        onApplied: ({ item }: { item: SlagItem | null }) => {
          window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } }));
          // Registry media is verified and written before onApplied; only legacy needs a peer lookup.
          if (this.hasRegistryMedia) return;
          for (const attachment of item?.attachments ?? []) {
            void port.hasAttachmentBytes(attachment.id, attachment.relativePath).then((present) => {
              if (!controller.signal.aborted && !present) this.requestAttachmentBytes(attachment);
            }).catch((error: unknown) => syncLog.warn('Registry attachment lookup failed', error));
          }
        },
        hasPendingLegacyNotes: (folderTree: boolean, sharedRecords?: boolean) => this.getOutbox().pending().some(({ kind }) =>
           kind === 'item' || kind === 'trash' || (folderTree && kind === 'folder')
           || (sharedRecords === true && isLegacySharedKind(kind))),
      });
      if (isTauri()) {
        const registry = await storage.readNoteRegistry();
        const expectedRoom = registry !== undefined && vaultId ? await accountRoom(vaultId) : undefined;
        if (generation !== this.initGeneration || !this.canUseVaultRelay()) return;
        if (registry !== undefined && (!expectedRoom || !registry || typeof registry !== 'object'
          || !('room' in registry) || registry.room !== expectedRoom)) {
          this.relayRead = undefined;
          throw new Error('Локальный реестр относится к другой комнате; очередь сохранена');
        }
      }
      if (vaultId && accountClient.getToken(this.config.serverUrl) !== null) {
        const roomId = await accountRoom(vaultId);
        if (!current()) return;
        const capture = await openNoteSession(noteOptions(roomId, vaultId), true);
        if (!current()) return;
        this.noteSession = capture;
        if (capture) this.notify();
      }
      if (this.isRelayPaused && !await waitForRelay()) return;
      const canSync = await refreshServerAuth(this, current);
      if (!current()) return;
      if (!canSync) {
        this.status.state = 'idle';
        this.status.error = initial ? 'Войдите в аккаунт для загрузки хранилища' : null;
        if (initial) this.status.initialSync.state = 'error';
        this.activeVaultKey = null;
        this.activeRoomId = null;
        this.status.currentRoomId = null;
        this.notify();
        return;
      }

      if (this.usesAccountSync()) {
        if (this.isRelayPaused && !await waitForRelay()) return;
        await accountClient.refresh();
        if (!current()) return;
        const accountState = accountClient.getState();
        const vault = accountState.vaults.find((entry) => entry.id === this.getSyncVaultId());
        const grant = vault && vault.grants.find((entry) => entry.deviceId === this.config.deviceId);
        if (!grant || grant.status !== 'accepted') {
          this.status.state = 'idle';
          if (initial) this.status.initialSync.state = 'error';
          this.status.error = grant && grant.status === 'revoked' ? 'Доступ отозван. Локальная копия сохранена' : grant && grant.status === 'pending' ? 'Примите приглашение в личном кабинете' : 'Хранилище хранится только на этом устройстве';
          this.notify();
          return;
        }
        this.config.localSyncMode = grant.mode;
        if (this.forceReceiveOnly && grant.mode !== 'receive-only') {
          // A backup node never writes back, whatever the owner granted it. Without this the
          // first push would replay the whole vault to every device with equal timestamps.
          syncLog.info('Device runs as a backup node: local writes stay local');
          this.config.localSyncMode = 'receive-only';
        }
      }

      const syncVaultId = this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId;
      const roomId = this.usesAccountSync() ? await accountRoom(syncVaultId) : legacyRoomId;
      if (!current()) return;
      if (this.isRelayPaused && !await waitForRelay()) return;
      const noteSession = this.noteSession ?? (this.usesAccountSync() ? await openNoteSession(noteOptions(roomId, syncVaultId)) : null);
      if (!current()) return;
      if (this.noteSession) {
        if (!this.usesAccountSync() || syncVaultId !== vaultId) throw new Error('Область синхронизации изменилась; локальная очередь сохранена');
        await this.noteSession.verifyEnrollment(this.config.localSyncMode === 'receive-only');
      }
      if (!current()) return;
      // Journal edits found on disk before the incoming feed can replace their files.
      await noteSession?.captureColdNoteEdits();
      if (!current()) return;
      this.noteSession = noteSession;
      this.activeVaultKey = vaultKey;
      this.activeRoomId = roomId;
      this.status.currentRoomId = roomId;
      if (noteSession) this.notify();

      // The tombstone ledger is in memory by now, from the hydrate at the top of init: a pull that
      // started without it would accept a stale copy of a note this device deleted. Nothing is
      // seeded into it from the index — a note that is merely not loaded yet is not a deletion.
      // `switchVault` lands here too, after the vault id it hydrated from has changed.
      // Presence first. The socket is how every other device and the telegram bot see this one,
      // and the backlog below is a download that can take minutes or die halfway over a tunnel.
      // It used to run before the connect, so a slow backlog left the device invisible for its
      // whole duration and a failed one left it invisible until the next retry. A retry that
      // finds the socket already up on this room keeps it: closing it is a window every question
      // can fall into.
      // Through the public method on purpose: the e2e harness replaces it to keep a synthetic
      // socket, and init used to call it that way before the socket moved to its own module.
      this.batchUpdating = initial;
      let pauseEpoch: number;
      do {
        if (this.isRelayPaused && !await waitForRelay()) return;
        pauseEpoch = this.androidPauseEpoch;
        if (!this.transport.isOpenFor(roomId) && this.ws?.readyState !== WebSocket.CONNECTING) this.connectWebSocket();
        this.startIntervals();
        await Promise.all([this.fetchPendingBundlesHttp(), noteSession?.replica.catchUp()]);
        if (!current()) return;
      } while (this.isRelayPaused || pauseEpoch !== this.androidPauseEpoch);
      initializing = false;
      this.batchUpdating = false;
      await this.flushStagedImport();
      if (!current()) return;
      if (initial) {
        setInitialSyncPending(this.currentVaultId, false);
        this.status.initialSync.state = 'ready';
        syncLog.info('Initial sync queue drained', {
          vaultId: this.currentVaultId, durationMs: Math.round(performance.now() - startedAt),
          applied: this.status.initialSync.processed, rejected: this.status.initialSync.rejected,
        });
        window.dispatchEvent(new CustomEvent('slag-sync-updated', {
          detail: { hasItemsChanged: true, hasFoldersChanged: true, hasWorkspaceChanged: true, hasDraftsChanged: true },
        }));
        this.notify();
      }
      // The pull that just succeeded is proof the connection is back, whatever failed before it.
      this.status.error = null;
      // Bytes a bundle promised but never wrote are gone from the relay once it is ACKed, so the
      // whole vault is checked here — after the backlog is on disk, not mid-pull. A device that
      // missed those bundles entirely (an older build ACKed them) still asks on start.
      void this.requestMissingAttachments();
      await pushLocalChanges(this);
      this.scheduleAttachmentPass();
      // After the pull and the push, not before: the root this device has *now* is the one worth
      // comparing, and a check against the pre-pull state would report a divergence that the pull
      // just fixed.
      this.scheduleManifestCheck(0, 'start');
    } catch (err: unknown) {
      if (generation !== this.initGeneration) return;
      const msg = syncErrorText(err, this.pullTimeoutMs);
      syncLog.error('Sync init error:', msg);
      this.batchUpdating = false;
      if (initial && isInitialSyncPending(this.currentVaultId)) this.status.initialSync.state = 'error';
      this.status.state = 'error';
      this.status.error = msg;
      this.notify();
      this.scheduleRetry();
    } finally {
      initializing = false;
    }
  }

  public getVaultSeedPhrase(vaultId: string): string | null {
    return getVaultSeedPhrase(this, vaultId);
  }

  public async setVaultSeedPhrase(vaultId: string, seedPhrase: string): Promise<void> {
    await setVaultSeedPhrase(this, vaultId, seedPhrase);
  }

  public async updateSeedPhrase(newPhrase: string): Promise<void> {
    if (!this.canUseVaultRelay()) throw new Error('Привязка хранилища не проверена');
    if (newPhrase !== this.config.seedPhrase) {
      // A new phrase is a new room: the checkpoints of the old one mean nothing there, and a stale
      // state hash would silence the full resend into the room this device is about to join.
      clearSyncLedgers(this.bookkeeping);
      this.getOutbox().clear();
    }
    await setVaultSeedPhrase(this, this.currentVaultId, newPhrase);
    this.disconnect();
    await this.init();
  }

  public async updateServerUrl(url: string): Promise<void> {
    if (!this.canUseVaultRelay()) throw new Error('Привязка хранилища не проверена');
    this.saveConfig({ serverUrl: url });
    clearSyncLedgers(this.bookkeeping);
    this.getOutbox().clear();
    this.disconnect();
    await this.init();
  }

  public get ws(): WebSocket | null {
    return this.transport.getWebSocket();
  }

  private set ws(val: WebSocket | null) {
    this.transport.setWebSocket(val);
  }

  public connectWebSocket(): void {
    if (this.isRelayPaused || !this.canUseVaultRelay()) return;
    connectSocket(this);
  }

  public async handleIncomingMessage(data: string): Promise<void> {
    if (!this.canUseVaultRelay()) return;
    await handleIncoming(this, data);
  }

  private incomingQueue: Promise<void> = Promise.resolve();

  private applyIncomingBundle(bundlePayload: unknown): Promise<void> {
    const generation = this.initGeneration;
    const applying = this.incomingQueue.then(async () => {
      if (generation === this.initGeneration && this.canUseVaultRelay()) await persistIncomingBundle(this, bundlePayload);
    });
    this.incomingQueue = applying.catch((error) => {
      syncLog.warn('Incoming bundle queue paused after failure:', error);
    });
    return applying;
  }

  public async pushLocalChanges(): Promise<void> {
    return pushLocalChanges(this);
  }

  public async sendAck(bundleId: string): Promise<void> {
    if (!this.canUseVaultRelay()) return;
    await acknowledgeBundle(this, bundleId);
  }

  
  /** Commits delivery by op ID, never by replacing the deletion ledger with a snapshot. */
  private commitPush(pending: PendingPush): void {
    if (pending.settled) return;
    pending.settled = true;
    if (pending.fallbackTimer) {
      clearTimeout(pending.fallbackTimer);
      pending.fallbackTimer = null;
    }
    this.pendingPushes.delete(pending.bundleId);

    for (const [key, hash] of Object.entries(pending.packedHashes)) {
      if (this.failedItemHashes.get(key) === hash) this.failedItemHashes.delete(key);
      if (key.startsWith('att:')) this.forcedAttachmentIds.delete(key.slice(4));
    }
    if (pending.attachmentRequestId) this.markAttachmentRequestSent(pending.attachmentRequestId);
    saveStateHash(this.bookkeeping, pending.stateHash);
    saveSentHashes(this.bookkeeping, { ...loadSentHashes(this.bookkeeping), ...pending.packedHashes });
    this.getOutbox().markSynced(pending.opIds);
    this.status.lastSyncTime = new Date().toLocaleTimeString();
    this.status.state = this.ws && this.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
    this.status.error = null;
    syncLog.info(`Bundle ${pending.bundleId} confirmed by relay (${pending.changes} changes)`);
    this.notify();
    this.scheduleAttachmentPass();
    // Only after a change actually reached the room: the manifest is the check on what the room
    // holds, and a push that never left has nothing to confirm.
    this.scheduleManifestCheck();
  }

  public async deliverPushOverHttp(pending: PendingPush): Promise<void> {
    if (pending.settled || pending.httpInFlight || !this.canUseVaultRelay()) return;
    if (pending.fallbackTimer) {
      clearTimeout(pending.fallbackTimer);
      pending.fallbackTimer = null;
    }
    if (this.isRelayPaused) return; // Resume replays this same bundle ID if the socket never ACKs.
    pending.httpInFlight = true;
    // A refusal from the relay is an answer, not a failure to repeat: only a lost connection or a
    // timeout is worth another pass, and those schedule one below.
    let retryable = true;
    for (const [key, hash] of Object.entries(pending.packedHashes)) {
      if (this.failedItemHashes.get(key) === hash) this.failedItemHashes.delete(key);
    }
    const generation = this.initGeneration;
    const current = () => generation === this.initGeneration && this.canUseVaultRelay();
    // The deadline is bytes-shaped, not flat. A 7 MB attachment over a home uplink is a legitimate
    // push that needs more than thirty seconds: the fixed deadline cut it off mid-transfer, the pull
    // put that file back in the queue, and the machine sat in a push → timeout → retry loop where
    // the sidebar never stopped spinning. 100 KB/s is the floor we are willing to wait for.
    const body = JSON.stringify(pending.encrypted);
    const timeoutMs = SYNC_INTERVALS.PUSH_TIMEOUT_MS + Math.ceil(body.length / 100_000) * 1000;
    try {
      if (!this.activeRoomId) throw new Error('Sync room is not ready');
      const cleanUrl = apiBase(this.config.serverUrl);
      const response = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundle?${this.bundleQuery()}`, {
        method: 'POST',
        headers: authHeaders(this, true),
        body,
        // Without a deadline a relay that accepts and stalls keeps `init` in its `syncing` phase
        // forever, so the sidebar shows a spinner that never resolves.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!current()) return;
      if (!response.ok) {
        if (response.status === 409) {
          const receipt: unknown = await response.json().catch(() => null);
          // Only an explicit replay receipt acknowledges delivery. Freeze and upgrade are refusals.
          if (!current()) return;
          if (!receipt || typeof receipt !== 'object' || !('error' in receipt) || receipt.error !== 'bundle_replay') {
            throw new Error('Sync push failed: HTTP 409');
          }
        } else if (response.status === 401 || response.status === 403) {
          this.disconnect();
          this.status.state = 'error';
          this.status.error = response.status === 401 ? 'Сессия недействительна. Войдите в личный кабинет' : 'Сервер запретил обмен. Проверьте доступ к хранилищу в личном кабинете';
          this.notify();
          return;
        } else if (response.status === 413) {
          // The plan's cache quota is counted in bundle bytes. Retrying the same ten-megabyte
          // attachment would hammer the relay forever, so attachments rest until a restart.
          retryable = false;
          this.attachmentSyncBlocked = true;
          throw new Error('Квота сервера на синхронизацию кончилась: вложения больше не уходят');
        } else {
          throw new Error(`Sync push failed: HTTP ${response.status}`);
        }
      }
      if (current()) this.commitPush(pending);
    } catch (err: unknown) {
      if (pending.settled || !current()) return;
      this.pendingPushes.delete(pending.bundleId);
      for (const [key, hash] of Object.entries(pending.packedHashes)) {
        if (key.startsWith('item:')) this.failedItemHashes.set(key, hash);
      }
      const msg = syncErrorText(err, timeoutMs);
      syncLog.error(`Failed to push bundle ${pending.bundleId}:`, msg);
      this.status.state = 'error';
      this.status.error = msg;
      this.notify();
      if (retryable) this.scheduleRetry();
    } finally {
      pending.httpInFlight = false;
    }
  }

  private startIntervals(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
    if (this.manifestHeartbeatInterval) clearInterval(this.manifestHeartbeatInterval);

    // Heartbeat ping: this is the only traffic an idle session should produce.
    this.pingInterval = setInterval(() => {
      if (this.isRelayPaused || !this.canUseVaultRelay()) return;
      const ts = Math.floor(Date.now() / 1000);
      this.transport.send(JSON.stringify({ type: 'ping', ts }));
    }, SYNC_INTERVALS.WS_PING_INTERVAL_MS);

    // A device that edits nothing still has to notice a peer that fell behind. One look at the
    // room's rows on a slow clock; `scheduleManifestCheck` coalesces it with the push-driven asks,
    // and a dark connection has nobody to ask through.
    this.manifestHeartbeatInterval = this.noteGeneration ? null : setInterval(() => {
      if (!this.config.enabled || !this.activeRoomId) return;
      if (this.status.state === 'offline' || this.status.state === 'error') return;
      this.scheduleManifestCheck(0, 'push');
    }, SYNC_INTERVALS.MANIFEST_HEARTBEAT_MS);

    // Auto sync check: 15s for realtime (0), or periodic for battery saver
    if (this.config.autoSync) {
      const intervalMs = (this.config.bgSyncIntervalMinutes && this.config.bgSyncIntervalMinutes > 0)
        ? this.config.bgSyncIntervalMinutes * 60 * 1000
        : 15000;

      this.autoSyncInterval = setInterval(() => {
        if (this.isRelayPaused) return;
        const wsOpen = this.ws !== null && this.ws.readyState === WebSocket.OPEN;
        // A live socket delivers remote bundles and drains the outbox, so an idle tick
        // must not wake the radio for an HTTP poll: that was 5.7k requests a day.
        if (!wsOpen) {
          void this.fetchPendingBundlesHttp().catch((error) => syncLog.warn('Background pull failed:', error));
        }
        if (!wsOpen || this.getBundleOutbox().length > 0) {
          void pushLocalChanges(this);
        }
      }, intervalMs);
    }
  }

  public fetchPendingBundlesHttp(): Promise<void> {
    if (this.isRelayPaused || !this.canUseVaultRelay() || !this.activeRoomId || !this.activeVaultKey) return Promise.resolve();
    const generation = this.initGeneration;
    if (this.pendingPull && this.pendingPull.generation === generation) return this.pendingPull.promise;
    const promise = this.pullPendingBundles(generation)
      .finally(() => {
        if (this.pendingPull?.generation === generation) this.pendingPull = null;
      })
      .then(() => {
        if (generation === this.initGeneration) this.scheduleAttachmentPass();
      });
    this.pendingPull = { generation, promise };
    return promise;
  }

  /** One page of the room's feed, sized by weight and by the byte budget of this device. */
  private async fetchPullPage(generation: number, cursor: number): Promise<PullPage | null> {
    const cleanUrl = apiBase(this.config.serverUrl);
    const params = this.bundleQuery();
    params.set('device', this.config.deviceId);
    params.set('limit', String(this.pullPageSize));
    params.set('maxBytes', String(this.pullPageBytes));
    if (cursor > 0) params.set('since', String(cursor));
    const controller = new AbortController();
    const abort = () => controller.abort(new DOMException('Sync pull timed out', 'TimeoutError'));
    let timer = setTimeout(abort, this.pullTimeoutMs);
    try {
      const res = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundles?${params.toString()}`, {
        headers: authHeaders(this),
        signal: controller.signal,
      });
      if (generation !== this.initGeneration || !this.canUseVaultRelay()) return null;
      if (!res.ok) {
        if (res.status === 409 && this.usesAccountSync()) {
          const body: unknown = await res.json().catch(() => null);
          if (generation !== this.initGeneration || !this.canUseVaultRelay()) return null;
          if (body && typeof body === 'object' && 'error' in body && body.error === 'note_upgrade_required') {
            throw new Error('note_upgrade_required');
          }
        }
        throw new Error(`Sync pull failed: HTTP ${res.status}`);
      }
      // The first bundle can exceed the page budget. Use the actual response size when known.
      clearTimeout(timer);
      const length = Number(res.headers.get('Content-Length'));
      const bytes = Number.isSafeInteger(length) && length > 0 ? length : this.pullPageBytes;
      timer = setTimeout(abort, pullDeadlineMs(bytes, this.pullTimeoutMs));
      const data = await res.json();
      if (generation !== this.initGeneration || !this.canUseVaultRelay()) return null;
      if (!Array.isArray(data.bundles)) throw new Error('Invalid sync bundles response');
      return {
        bundles: data.bundles,
        head: typeof data.head === 'number' ? data.head : null,
        oldest: typeof data.oldest === 'number' ? data.oldest : 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async pullPendingBundles(generation: number): Promise<void> {
    try {
      // A full first sync is tens of megabytes; a pull that dies halfway must not start over.
      let cursor = loadCursor(this.bookkeeping);
      while (generation === this.initGeneration && this.canUseVaultRelay() && !this.isRelayPaused) {
        const previousCursor = cursor;
        let page: PullPage | null;
        try {
          page = await this.fetchPullPage(generation, cursor);
        } catch (e) {
          if (generation !== this.initGeneration) return;
          // Retry this cursor with less data; only the request that hit the floor fails the pass.
          if (this.pullPageBytes > SYNC_INTERVALS.PULL_PAGE_MIN_BYTES && isPageTimeout(e)) {
            this.pullPageBytes = shrinkPullBudget(this.pullPageBytes);
            syncLog.warn(
              `Pull page timed out: shrinking to ${Math.round(this.pullPageBytes / 1024)} KB and asking again`
            );
            continue;
          }
          throw e;
        }
        if (!page) return;
        if (cursor > 0 && page.oldest > 0 && cursor + 1 < page.oldest) {
          // Missing transport history cannot make this client's local snapshot authoritative.
          syncLog.warn(`Sync cursor ${cursor} is older than relay history (${page.oldest}): pulling retained bundles only`);
        }
        for (const item of page.bundles) {
          if (generation !== this.initGeneration) return;
          if (!item.payload) throw new Error('Missing sync bundle payload');
          await this.applyIncomingBundle(item.payload);
          if (typeof item.syncId === 'number' && item.syncId > cursor) cursor = item.syncId;
        }
        if (generation !== this.initGeneration || !this.canUseVaultRelay()) return;
        saveCursor(this.bookkeeping, cursor);
        const step = nextPullStep({
          previousCursor,
          cursor,
          bundles: page.bundles.length,
          head: page.head,
          pageSize: this.pullPageSize,
        });
        if (step === 'done') break;
        if (step === 'stuck') throw new Error('Sync pagination cursor did not advance');
      }
    } catch (e) {
      if (generation !== this.initGeneration) return;
      syncLog.warn('HTTP bundles fetch failed:', e);
      this.status.state = 'error';
      this.status.error = syncErrorText(e, pullDeadlineMs(this.pullPageBytes, this.pullTimeoutMs));
      this.notify();
      // A relay hiccup, a laptop that just woke up, a tunnel that dropped: none of those need a
      // person to press anything, so the same pass comes back on the retry clock.
      this.scheduleRetry();
      throw e;
    }
  }

  public setBgSyncInterval(minutes: 0 | 10 | 30): void {
    this.saveConfig({ bgSyncIntervalMinutes: minutes });
    this.startIntervals();
  }

  private reportNoteError(error: unknown): void {
    if (!this.noteSession) return;
    this.noteError = syncErrorText(error, this.pullTimeoutMs);
    this.notify();
  }

  public disconnect(): void {
    ++this.initGeneration;
    this.androidPauseEpoch = 0;
    this.androidResumeSocketReady?.();
    this.androidResumeSocketReady = undefined;
    this.androidResume = undefined;
    this.recheckRoomMode = false;
    this.relayRead = undefined;
    this.validatedSyncId = undefined;
    this.failedItemHashes.clear();
    this.noteAbort?.abort();
    this.noteAbort = undefined;
    this.noteSession = null;
    this.noteRoomStatus = undefined;
    this.noteError = null;
    // A retry belongs to the session it was armed in; a vault switch must not inherit it.
    this.clearRetryTimer();
    this.clearPushDebounce();
    if (this.manifestHeartbeatInterval) clearInterval(this.manifestHeartbeatInterval);
    this.manifestHeartbeatInterval = null;
    manifestSchedule.clearManifestCheck();
    // A new room is a new row: the root this device published belongs to the room it left.
    this.manifestPostedRoot = null;
    if (this.importTimer) clearTimeout(this.importTimer);
    this.importTimer = null;
    this.importBuffer = null;
    this.appliedBundleIds.clear();
    // A reconnect is not a reason to forget what was asked for: the queue belongs to the vault,
    // not to this socket, and a dropped request only comes back twenty-four hours later.
    this.missingAttachments.clear();
    this.entityHashes.clear();
    this.reassertedDrafts.clear();
    this.wsSupportsBinary = false;
    this.pushDirty = false;
    for (const pending of this.pendingPushes.values()) {
      if (pending.fallbackTimer) clearTimeout(pending.fallbackTimer);
    }
    this.pendingPushes.clear();
    this.batchUpdating = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
    this.transport.disconnect();
    this.transport.setPaused(false);
    this.activeVaultKey = null;
    this.activeRoomId = null;
    this.status.currentRoomId = null;
    this.status.manifest = undefined;
    this.status.lastSyncTime = null;
    this.status.state = 'idle';
    this.notify();
  }

  public addTrustedDevice(device: DeviceProfile): void { addTrustedDevice(this, device); }

  public setDeviceAllowedVaults(deviceId: string, allowedVaults: string[]): void { setDeviceAllowedVaults(this, deviceId, allowedVaults); }

  public removeTrustedDevice(deviceId: string): void { removeTrustedDevice(this, deviceId); }

  public renameDevice(deviceId: string, newName: string): void { renameDevice(this, deviceId, newName); }

  public setDeviceSyncMode(deviceId: string, mode: DeviceSyncMode): void { setDeviceSyncMode(this, deviceId, mode); }

  public async rotateVaultKey(): Promise<string> {
    if (!this.canUseVaultRelay()) throw new Error('Привязка хранилища не проверена');
    if (this.usesAccountSync()) {
      const response = await fetch(`${apiBase(this.config.serverUrl)}/api/vaults/${encodeURIComponent(this.getSyncVaultId())}/rotate`, {
        method: 'POST', headers: authHeaders(this, true), body: '{}',
      });
      if (!response.ok) throw new Error('Сервер не подтвердил отзыв старых ключей');
      await accountClient.refresh();
    }
    const newSeed = generateMnemonic(12);
    syncLog.warn('Rotating vault key: resetting trusted devices and migrating to new room');
    await setVaultSeedPhrase(this, this.currentVaultId, newSeed);
    this.saveConfig({
      trustedDevices: [],
    });
    this.disconnect();
    // The rotation lands this device in a new room, so every checkpoint of the old one goes.
    clearSyncLedgers(this.bookkeeping);
    this.getOutbox().clear();
    await this.init();
    return newSeed;
  }
}

export const syncEngine = new SyncEngine();
