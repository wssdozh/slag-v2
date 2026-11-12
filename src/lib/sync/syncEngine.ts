import { storage } from '../storage';
import { persistIncomingBundle } from './applyBundle';
import { pushLocalChanges } from './pushBundle';
import { attachmentSignature } from './attachmentSignature';
import {
  loadSentHashes,
  saveSentHashes,
  seedSyncedIds,
  stateHashKey,
  syncedIdsKey,
  tombstonesKey,
  type SyncScope,
} from './localBookkeeping';
export { storage };
import { logger } from '../logger/logger';
import { accountClient } from './account';
export { accountClient };
import { Outbox } from './outbox/outbox';
import { createSyncOpFromStorageEvent } from './entities/registry';
import { SyncTransport } from './transport';
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
} from './types';
import type { SlagItem, FolderMeta, WorkspaceState } from '../../types';
import {
  SYNC_ATTACHMENT_MAX_BYTES,
  SYNC_STORAGE_KEYS,
  SYNC_INTERVALS,
} from '../../config';
import { isPrimaryWindow } from '../platform/windowControls';

const LAST_STATE_HASH_KEY = SYNC_STORAGE_KEYS.LAST_STATE_HASH;

const syncLog = logger.scope('SYNC');

/** Cheap identity of an attachment's bytes: reading five megabytes to hash them is not. */
/** A bundle handed to the relay but not yet confirmed; holds the bookkeeping commit applies. */
export interface PendingPush {
  bundleId: string;
  encrypted: EncryptedBundle;
  frame: Uint8Array<ArrayBuffer>;
  hashKey: string;
  stateHash: string;
  packedHashes: Record<string, string>;
  syncedIds: string[];
  tombstones: Record<string, number>;
  opIds: string[];
  changes: number;
  settled: boolean;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
}

export class SyncEngine {
  public config: SyncConfig;
  public status: SyncStatus;
  private listeners = new Set<(status: SyncStatus) => void>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  public activeVaultKey: CryptoKey | null = null;
  public activeRoomId: string | null = null;
  public isProcessingSync = false;
  public sequence = 1;
  public appliedBundleIds = new Set<string>();
  public batchUpdating = false;
  public forceFullPush = false;
  public initGeneration = 0;
  private pendingPull: { generation: number; promise: Promise<void> } | null = null;
  public currentVaultId: string = 'default_vault';
  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pushDebounceDeadline = 0;
  private pushDebounceTrailing = false;
  /** Bundle changes are collected here and written to disk once per burst, not once per bundle. */
  public importBuffer: {
    items: SlagItem[];
    folders: FolderMeta[];
    workspace?: WorkspaceState;
    detail: { items: boolean; folders: boolean; workspace: boolean; drafts: boolean };
    /** Bundles in this burst. They are ACKed only once the write below lands. */
    bundles: string[];
  } | null = null;
  private importTimer: ReturnType<typeof setTimeout> | null = null;
  public pendingPushes = new Map<string, PendingPush>();
  public wsSupportsBinary = false;
  public pushDirty = false;
  /** One-shot: the next push may carry a single attachment. */
  public attachmentPass = false;
  /** Set when the relay refuses a bundle for quota: attachments wait for a restart. */
  private attachmentSyncBlocked = false;
  /** Attachments with no bytes on this device, so every push does not re-stat the same files. */
  private unreadableAttachments = new Set<string>();
  public entityHashes = new Map<string, { sig: string; hash: string }>();
  public transport: SyncTransport;

  constructor() {
    this.transport = new SyncTransport({
      onStatus: (state, error) => {
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
        if (pending) this.commitPush(pending);
      },
      onBundle: async (bundle) => {
        await this.applyIncomingBundle(bundle);
      },
      onCatchUpPull: () => {
        void this.fetchPendingBundlesHttp().catch((error) => syncLog.warn('Catch-up pull failed:', error));
      },
      onAuthRejected: () => {
        this.disconnect();
      },
    });
    this.currentVaultId =
      (typeof storage !== 'undefined' && storage.getCurrentVault
        ? storage.getCurrentVault()?.id
        : 'default_vault') || 'default_vault';
    this.status = {
      initialSync: {
        vaultId: this.currentVaultId,
        state: localStorage.getItem(`slag_initial_sync_${this.currentVaultId}`) === 'pending' ? 'loading' : 'idle',
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
    this.config = loadConfig(this, this.currentVaultId);
    this.status.subscription = computeSubscription(this);
    accountClient.subscribe((accountState) => {
      this.status.isAuthenticated = accountClient.getToken(this.config.serverUrl) !== null;
      applyAccountDevices(this, accountState);
    });

    if (typeof storage !== 'undefined' && typeof storage.subscribeChanges === 'function') {
      storage.subscribeChanges((event) => {
        // Remote-origin writes are already applied state; echoing them re-queues a push and
        // two devices ping-pong the same bundle forever.
        if (event.origin === 'remote') return;
        const op = createSyncOpFromStorageEvent(event);
        if (op) {
          syncLog.info(`Enqueued outbox op: [${op.kind}:${op.id}] action=${op.action}`);
          this.getOutbox().enqueue(op);
          // A draft changes on every keystroke; only notes/folders/workspace drive the fast path.
          const isDraft = op.kind === 'draft';
          this.scheduleDebouncedPush(
            isDraft ? SYNC_INTERVALS.DRAFT_PUSH_DEBOUNCE_MS : SYNC_INTERVALS.PUSH_DEBOUNCE_MS,
            isDraft
          );
        }
      });
    }
  }

  public getConfig(): SyncConfig {
    return { ...this.config };
  }

  public getStatus(): SyncStatus {
    return {
      ...this.status,
      initialSync: { ...this.status.initialSync },
      subscription: computeSubscription(this),
    };
  }

  public subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    const current = this.getStatus();
    this.listeners.forEach((fn) => fn(current));
  }

  public scheduleDebouncedPush(delayMs: number = SYNC_INTERVALS.PUSH_DEBOUNCE_MS, trailing = false): void {
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

  public getOutbox(): Outbox {
    return new Outbox(this.currentVaultId);
  }

  /**
   * Attachment bytes are their own change type and their own bundle: one file per push, so a
   * photo never rides inside a keystroke bundle. The pass is a one-shot flag the push consumes.
   */
  private scheduleAttachmentPass(): void {
    // init and every confirmed push both call this: one queued pass is enough for both.
    if (this.attachmentPass) return;
    if (this.attachmentSyncBlocked) {
      syncLog.debug('Attachment pass skipped: relay refused the plan quota for this session');
      return;
    }
    const pending = this.countPendingAttachments();
    if (pending === 0) {
      syncLog.debug('Attachment pass skipped: nothing left to deliver');
      return;
    }
    syncLog.info(`Attachment pass queued: ${pending} file(s) not delivered yet`);
    this.attachmentPass = true;
    this.scheduleDebouncedPush(0);
  }

  /** Signature comparison only: no bytes are read to answer "is anything left to send". */
  private countPendingAttachments(): number {
    const sent = loadSentHashes(this.bookkeeping);
    let pending = 0;
    for (const item of storage.getItems()) {
      for (const att of item.attachments ?? []) {
        if (this.unreadableAttachments.has(att.id)) continue;
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
    for (const att of item.attachments ?? []) {
      const key = `att:${att.id}`;
      const sig = attachmentSignature(att);
      const seen = sentHashes[key];
      if (seen === sig) continue;
      if (seen === `skip:${sig}`) {
        syncLog.debug(`Attachment already marked unsyncable: "${att.name}" (${att.size} B)`);
        continue;
      }

      syncLog.debug(`Reading attachment bytes: "${att.name}" (${Math.round(att.size / 1024)} KB, ${att.mimeType})`);
      const dataUrl = await storage.getAttachmentDataUrl(att);
      if (!dataUrl) {
        // Bytes can appear later (a download, a re-import), so this rests for the session only.
        this.unreadableAttachments.add(att.id);
        syncLog.warn(`Attachment has no local bytes, nothing to send: "${att.name}" (${att.relativePath})`);
        continue;
      }
      if (dataUrl.length > SYNC_ATTACHMENT_MAX_BYTES * 1.4) {
        // No new state for "give up": a marker in the sent-hashes map is already understood by
        // every reader of it, while a second set would have to be loaded, cleared and migrated.
        sentHashes[key] = `skip:${sig}`;
        saveSentHashes(this.bookkeeping, sentHashes);
        syncLog.warn(
          `Attachment too big to sync: "${att.name}" (${Math.round(att.size / 1024)} KB > ${SYNC_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB)`
        );
        continue;
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
      return true;
    }
    return false;
  }

  /**
   * Bundle changes are applied to a working copy and written once per burst.
   * Writing per bundle made replaying a backlog flicker: a note from an old bundle
   * appeared, then a newer bundle deleted or replaced it a second later.
   */
  public stageImport(
    items: SlagItem[],
    folders: FolderMeta[],
    workspace: WorkspaceState | undefined,
    detail: { items: boolean; folders: boolean; workspace: boolean; drafts: boolean },
    bundleId: string
  ): void {
    const previous = this.importBuffer?.detail;
    const bundles = this.importBuffer?.bundles ?? [];
    if (!bundles.includes(bundleId)) bundles.push(bundleId);
    this.importBuffer = {
      items,
      folders,
      workspace: workspace ?? this.importBuffer?.workspace,
      detail: {
        items: detail.items || Boolean(previous?.items),
        folders: detail.folders || Boolean(previous?.folders),
        workspace: detail.workspace || Boolean(previous?.workspace),
        drafts: detail.drafts || Boolean(previous?.drafts),
      },
      bundles,
    };
    if (this.batchUpdating || this.importTimer) return;
    this.importTimer = setTimeout(() => {
      this.importTimer = null;
      void this.flushStagedImport().catch((error) => syncLog.error('Staged sync import failed:', error));
    }, 120);
  }

  private async flushStagedImport(): Promise<void> {
    if (this.importTimer) {
      clearTimeout(this.importTimer);
      this.importTimer = null;
    }
    const buffered = this.importBuffer;
    if (!buffered) return;
    this.importBuffer = null;
    const generation = this.initGeneration;
    try {
      await storage.importSyncedVaultData(buffered);
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
    // One render per burst, after the final state is on disk.
    window.dispatchEvent(
      new CustomEvent('slag-sync-updated', {
        detail: {
          hasItemsChanged: buffered.detail.items,
          hasFoldersChanged: buffered.detail.folders,
          hasWorkspaceChanged: buffered.detail.workspace,
          hasDraftsChanged: buffered.detail.drafts,
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
        // An unconfirmed ACK only means another delivery; the state is already on disk.
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

  public getCurrentVaultId(): string {
    return this.currentVaultId;
  }

  public getSyncVaultId(): string {
    return storage.ensureVaultSyncId(this.currentVaultId);
  }

  public usesAccountSync(): boolean {
    return this.status.authRequired || accountClient.getToken(this.config.serverUrl) !== null;
  }

  public saveConfig(newConfig: Partial<SyncConfig>): void {
    saveConfig(this, newConfig);
  }

  public beginInitialSync(vaultId: string): void {
    localStorage.setItem(`slag_initial_sync_${vaultId}`, 'pending');
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

  public async switchVault(vaultId: string): Promise<void> {
    if (this.currentVaultId === vaultId && this.status.state !== 'idle' && this.status.state !== 'error') {
      return;
    }
    syncLog.info(`SyncEngine switching to vault: ${vaultId}`);
    this.disconnect();
    this.currentVaultId = vaultId;
    this.config = loadConfig(this, vaultId);
    this.status.subscription = computeSubscription(this);
    this.status.currentRoomId = null;
    this.notify();
    await this.init();
  }

  public async init(): Promise<void> {
    if (!isPrimaryWindow()) return;
    this.disconnect();
    const generation = this.initGeneration;
    const seedPhrase = this.config.seedPhrase;
    const initial = localStorage.getItem(`slag_initial_sync_${this.currentVaultId}`) === 'pending';
    const startedAt = performance.now();
    if (initial) syncLog.info('Initial sync started', { vaultId: this.currentVaultId });
    this.status.initialSync = { vaultId: this.currentVaultId, state: initial ? 'loading' : 'idle', processed: 0, rejected: 0 };
    if (!this.config.enabled) {
      if (initial) this.failInitialSync(new Error('Синхронизация выключена'));
      this.status.state = 'idle';
      this.notify();
      return;
    }

    try {
      this.status.state = 'syncing';
      this.notify();

      const canSync = await refreshServerAuth(this);
      if (generation !== this.initGeneration) return;
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
        await accountClient.refresh();
        if (generation !== this.initGeneration) return;
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
      }

      const [vaultKey, legacyRoomId] = await Promise.all([
        deriveVaultKey(seedPhrase),
        deriveRoomId(seedPhrase),
      ]);
      if (generation !== this.initGeneration) return;
      // Never claim an anonymous legacy room: it has no authenticated owner metadata.
      const roomId = this.usesAccountSync()
        ? `room_${(await computeHash(JSON.stringify(['slag-account-room-v1', this.getSyncVaultId(), legacyRoomId]))).slice(0, 32)}`
        : legacyRoomId;
      if (generation !== this.initGeneration) return;
      this.activeVaultKey = vaultKey;
      this.activeRoomId = roomId;
      this.status.currentRoomId = roomId;

      seedSyncedIds(this.bookkeeping, storage.getItems().map((it) => it.id));
      this.batchUpdating = initial;
      await this.fetchPendingBundlesHttp();
      if (generation !== this.initGeneration) return;
      this.batchUpdating = false;
      await this.flushStagedImport();
      if (initial) {
        localStorage.removeItem(`slag_initial_sync_${this.currentVaultId}`);
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
      // Through the public method on purpose: the e2e harness replaces it to keep a synthetic
      // socket, and init used to call it that way before the socket moved to its own module.
      this.connectWebSocket();
      this.startIntervals();
      await pushLocalChanges(this);
      this.scheduleAttachmentPass();
    } catch (err: unknown) {
      if (generation !== this.initGeneration) return;
      const msg = err instanceof Error ? err.message : String(err);
      syncLog.error('Sync init error:', msg);
      this.batchUpdating = false;
      if (initial && localStorage.getItem(`slag_initial_sync_${this.currentVaultId}`) === 'pending') this.status.initialSync.state = 'error';
      this.status.state = 'error';
      this.status.error = msg;
      this.notify();
    }
  }

  public getVaultSeedPhrase(vaultId: string): string | null {
    return getVaultSeedPhrase(this, vaultId);
  }

  public setVaultSeedPhrase(vaultId: string, seedPhrase: string): void {
    setVaultSeedPhrase(this, vaultId, seedPhrase);
  }

  public async updateSeedPhrase(newPhrase: string): Promise<void> {
    if (newPhrase !== this.config.seedPhrase) {
      localStorage.removeItem(stateHashKey(this.bookkeeping));
      localStorage.removeItem(syncedIdsKey(this.bookkeeping));
      localStorage.removeItem(tombstonesKey(this.bookkeeping));
      this.getOutbox().clear();
      if (this.currentVaultId === 'default_vault') localStorage.removeItem(LAST_STATE_HASH_KEY);
    }
    this.saveConfig({ seedPhrase: newPhrase });
    this.disconnect();
    await this.init();
  }

  public async updateServerUrl(url: string): Promise<void> {
    this.saveConfig({ serverUrl: url });
    localStorage.removeItem(syncedIdsKey(this.bookkeeping));
    localStorage.removeItem(tombstonesKey(this.bookkeeping));
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
    connectSocket(this);
  }

  public async handleIncomingMessage(data: string): Promise<void> {
    await handleIncoming(this, data);
  }

  private incomingQueue: Promise<void> = Promise.resolve();

  private applyIncomingBundle(bundlePayload: unknown): Promise<void> {
    const generation = this.initGeneration;
    const applying = this.incomingQueue.then(async () => {
      if (generation === this.initGeneration) await persistIncomingBundle(this, bundlePayload);
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
    await acknowledgeBundle(this, bundleId);
  }

  
  /** Commits a confirmed push: hashes, tombstones and the outbox advance only once the relay has it. */
  private commitPush(pending: PendingPush): void {
    if (pending.settled) return;
    pending.settled = true;
    if (pending.fallbackTimer) {
      clearTimeout(pending.fallbackTimer);
      pending.fallbackTimer = null;
    }
    this.pendingPushes.delete(pending.bundleId);

    localStorage.setItem(pending.hashKey, pending.stateHash);
    saveSentHashes(this.bookkeeping, { ...loadSentHashes(this.bookkeeping), ...pending.packedHashes });
    if (!this.usesAccountSync() && this.currentVaultId === 'default_vault') {
      localStorage.setItem(LAST_STATE_HASH_KEY, pending.stateHash);
    }
    localStorage.setItem(syncedIdsKey(this.bookkeeping), JSON.stringify(pending.syncedIds));
    localStorage.setItem(tombstonesKey(this.bookkeeping), JSON.stringify(pending.tombstones));
    this.getOutbox().markSynced(pending.opIds);
    this.status.lastSyncTime = new Date().toLocaleTimeString();
    this.status.state = this.ws && this.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
    this.status.error = null;
    syncLog.info(`Bundle ${pending.bundleId} confirmed by relay (${pending.changes} changes)`);
    this.notify();
    this.scheduleAttachmentPass();
  }

  public async deliverPushOverHttp(pending: PendingPush): Promise<void> {
    if (pending.settled) return;
    if (pending.fallbackTimer) {
      clearTimeout(pending.fallbackTimer);
      pending.fallbackTimer = null;
    }
    try {
      if (!this.activeRoomId) throw new Error('Sync room is not ready');
      const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundle?vault=${encodeURIComponent(this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId)}`, {
        method: 'POST',
        headers: authHeaders(this, true),
        body: JSON.stringify(pending.encrypted),
        // Without a deadline a relay that accepts and stalls keeps `init` in its `syncing` phase
        // forever, so the sidebar shows a spinner that never resolves.
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status === 409) {
          // ponytail: relay dedups by bundle_id; replay means it is already delivered.
        } else if (response.status === 401 || response.status === 403) {
          this.disconnect();
          throw new Error(response.status === 401 ? 'Сессия недействительна. Войдите в личный кабинет' : 'Сервер запретил обмен. Проверьте доступ к хранилищу в личном кабинете');
        } else if (response.status === 413) {
          // The plan's cache quota is counted in bundle bytes. Retrying the same ten-megabyte
          // attachment would hammer the relay forever, so attachments rest until a restart.
          this.attachmentSyncBlocked = true;
          throw new Error('Квота сервера на синхронизацию кончилась: вложения больше не уходят');
        } else {
          throw new Error(`Sync push failed: HTTP ${response.status}`);
        }
      }
      this.commitPush(pending);
    } catch (err: unknown) {
      if (pending.settled) return;
      this.pendingPushes.delete(pending.bundleId);
      const msg = err instanceof Error ? err.message : String(err);
      syncLog.error(`Failed to push bundle ${pending.bundleId}:`, msg);
      this.status.state = 'error';
      this.status.error = msg;
      this.notify();
    }
  }

  private startIntervals(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);

    // Heartbeat ping: this is the only traffic an idle session should produce.
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const ts = Math.floor(Date.now() / 1000);
        this.ws.send(JSON.stringify({ type: 'ping', ts }));
      }
    }, SYNC_INTERVALS.WS_PING_INTERVAL_MS);

    // Auto sync check: 15s for realtime (0), or periodic for battery saver
    if (this.config.autoSync) {
      const intervalMs = (this.config.bgSyncIntervalMinutes && this.config.bgSyncIntervalMinutes > 0)
        ? this.config.bgSyncIntervalMinutes * 60 * 1000
        : 15000;

      this.autoSyncInterval = setInterval(() => {
        const wsOpen = this.ws !== null && this.ws.readyState === WebSocket.OPEN;
        // A live socket delivers remote bundles and drains the outbox, so an idle tick
        // must not wake the radio for an HTTP poll: that was 5.7k requests a day.
        if (!wsOpen) {
          void this.fetchPendingBundlesHttp().catch((error) => syncLog.warn('Background pull failed:', error));
        }
        if (!wsOpen || this.getOutbox().pending().length > 0) {
          void pushLocalChanges(this);
        }
      }, intervalMs);
    }
  }

  public fetchPendingBundlesHttp(): Promise<void> {
    if (!this.activeRoomId || !this.activeVaultKey) return Promise.resolve();
    const generation = this.initGeneration;
    if (this.pendingPull && this.pendingPull.generation === generation) return this.pendingPull.promise;
    const promise = this.pullPendingBundles(generation).finally(() => {
      if (this.pendingPull && this.pendingPull.generation === generation) this.pendingPull = null;
    });
    this.pendingPull = { generation, promise };
    return promise;
  }

  private async pullPendingBundles(generation: number): Promise<void> {
    try {
      const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
      const params = new URLSearchParams({ device: this.config.deviceId, vault: this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId });
      let cursor = 0;
      while (generation === this.initGeneration) {
        const previousCursor = cursor;
        if (cursor > 0) params.set('since', String(cursor));
        const res = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundles?${params.toString()}`, {
          headers: authHeaders(this),
          signal: AbortSignal.timeout(30_000),
        });
        if (generation !== this.initGeneration) return;
        if (!res.ok) throw new Error(`Sync pull failed: HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data.bundles)) throw new Error('Invalid sync bundles response');
        const requestedSince = cursor;
        if (requestedSince > 0 && typeof data.oldest === 'number' && data.oldest > 0 && requestedSince + 1 < data.oldest) {
          // The cursor points before the oldest bundle the relay still keeps: everything in
          // between expired, so a delta can never close the gap — resend the full state once.
          syncLog.warn(`Sync cursor ${requestedSince} is older than relay history (${data.oldest}): scheduling a full resend`);
          this.forceFullPush = true;
        }
        for (const item of data.bundles) {
          if (generation !== this.initGeneration) return;
          if (!item.payload) throw new Error('Missing sync bundle payload');
          await this.applyIncomingBundle(item.payload);
          if (typeof item.syncId === 'number' && item.syncId > cursor) cursor = item.syncId;
        }
        if (data.bundles.length < 100) break;
        if (cursor <= previousCursor) throw new Error('Sync pagination cursor did not advance');
      }
    } catch (e) {
      if (generation !== this.initGeneration) return;
      syncLog.warn('HTTP bundles fetch failed:', e);
      this.status.state = 'error';
      this.status.error = e instanceof Error ? e.message : String(e);
      this.notify();
      throw e;
    }
  }

  public setBgSyncInterval(minutes: 0 | 10 | 30): void {
    this.saveConfig({ bgSyncIntervalMinutes: minutes });
    this.startIntervals();
  }

  public disconnect(): void {
    ++this.initGeneration;
    if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
    this.pushDebounceTimer = null;
    this.pushDebounceDeadline = 0;
    this.pushDebounceTrailing = false;
    if (this.importTimer) clearTimeout(this.importTimer);
    this.importTimer = null;
    this.importBuffer = null;
    this.appliedBundleIds.clear();
    this.entityHashes.clear();
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
    this.activeVaultKey = null;
    this.activeRoomId = null;
    this.status.currentRoomId = null;
    this.status.state = 'idle';
    this.notify();
  }

  public addTrustedDevice(device: DeviceProfile): void { addTrustedDevice(this, device); }

  public setDeviceAllowedVaults(deviceId: string, allowedVaults: string[]): void { setDeviceAllowedVaults(this, deviceId, allowedVaults); }

  public removeTrustedDevice(deviceId: string): void { removeTrustedDevice(this, deviceId); }

  public renameDevice(deviceId: string, newName: string): void { renameDevice(this, deviceId, newName); }

  public setDeviceSyncMode(deviceId: string, mode: DeviceSyncMode): void { setDeviceSyncMode(this, deviceId, mode); }

  public async rotateVaultKey(): Promise<string> {
    if (this.usesAccountSync()) {
      const response = await fetch(`${this.config.serverUrl.replace(/\/+$/, '')}/api/vaults/${encodeURIComponent(this.getSyncVaultId())}/rotate`, {
        method: 'POST', headers: authHeaders(this, true), body: '{}',
      });
      if (!response.ok) throw new Error('Сервер не подтвердил отзыв старых ключей');
      await accountClient.refresh();
    }
    const newSeed = generateMnemonic(12);
    syncLog.warn('Rotating vault key: resetting trusted devices and migrating to new room');
    this.saveConfig({
      seedPhrase: newSeed,
      trustedDevices: [],
    });
    this.disconnect();
    localStorage.removeItem(stateHashKey(this.bookkeeping));
    if (this.currentVaultId === 'default_vault') {
      localStorage.removeItem(LAST_STATE_HASH_KEY);
    }
    await this.init();
    return newSeed;
  }
}

export const syncEngine = new SyncEngine();
