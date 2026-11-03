import { storage } from '../storage';
export { storage };
import { logger } from '../logger';
import { accountClient } from './account';
export { accountClient };
import { Outbox } from './outbox/outbox';
import { createSyncOpFromStorageEvent } from './entities/registry';
import {
  deriveVaultKey,
  deriveRoomId,
  encryptBundle,
  decryptBundle,
  generateMnemonic,
  generateDeviceId,
  computeStateRootHash,
  computeHash,
} from './crypto';
import type {
  SyncConfig,
  SyncStatus,
  SyncBundle,
  SyncChangeItem,
  EncryptedBundle,
  DeviceProfile,
  DeviceSyncMode,
} from './types';
import type { SlagItem, FolderMeta, WorkspaceState, ComposerDraft, FullscreenDraft } from '../../types';

const SYNC_CONFIG_KEY = 'slag_sync_config_v2';
const LAST_STATE_HASH_KEY = 'slag_sync_last_state_hash';
const DEFAULT_SERVER_URL = 'http://152.53.199.71:8320';

const syncLog = logger.scope('SYNC');

export class SyncEngine {
  private config: SyncConfig;
  private status: SyncStatus;
  private listeners = new Set<(status: SyncStatus) => void>();
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  private activeVaultKey: CryptoKey | null = null;
  private activeRoomId: string | null = null;
  private isProcessingSync = false;
  private sequence = 1;
  private lastAppliedBundleId: string | null = null;
  private initGeneration = 0;
  private currentVaultId: string = 'default_vault';
  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.currentVaultId =
      (typeof storage !== 'undefined' && storage.getCurrentVault
        ? storage.getCurrentVault()?.id
        : 'default_vault') || 'default_vault';
    this.status = {
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
        allowAttachments: false,
        hasAiLease: false,
        isExpiringSoon: false,
      },
    };
    this.config = this.loadConfig(this.currentVaultId);
    this.status.subscription = this.computeSubscription(this.config);
    accountClient.subscribe((accountState) => {
      this.status.isAuthenticated = accountClient.getToken(this.config.serverUrl) !== null;
      if (!this.usesAccountSync()) return;
      this.config.trustedDevices = accountState.devices
        .filter((device) => device.status === 'active' && device.id !== this.config.deviceId)
        .map((device) => ({
          id: device.id, name: device.name, platform: device.platform,
          publicKey: device.publicKey, isCurrent: false,
          pairedAt: device.createdAt || '', lastSeenAt: device.lastSeenAt || '',
          allowedVaults: accountState.vaults
            .filter((vault) => vault.grants.some((grant) => grant.deviceId === device.id && grant.status === 'accepted'))
            .map((vault) => vault.id),
        }));
      const ownVault = accountState.vaults.find((vault) => vault.id === this.getSyncVaultId());
      const ownGrant = ownVault && ownVault.grants.find((grant) => grant.deviceId === this.config.deviceId);
      if (ownGrant && ownGrant.status === 'accepted') this.config.localSyncMode = ownGrant.mode;
      if (!this.status.isAuthenticated || !ownGrant || ownGrant.status !== 'accepted') {
        if (this.activeRoomId || this.ws) this.disconnect();
      }
      this.notify();
    });

    if (typeof storage !== 'undefined' && typeof storage.subscribeChanges === 'function') {
      storage.subscribeChanges((event) => {
        const op = createSyncOpFromStorageEvent(event);
        if (op) {
          syncLog.info(`Enqueued outbox op: [${op.kind}:${op.id}] action=${op.action}`);
          this.getOutbox().enqueue(op);
          this.scheduleDebouncedPush();
        }
      });
    }
  }

  private computeSubscription(cfg: SyncConfig): SyncStatus['subscription'] {
    const accountState = accountClient.getState();
    const account = accountClient.getToken(cfg.serverUrl) ? accountState.account : null;
    const activeCount = 1 + cfg.trustedDevices.length;
    if (account) {
      return {
        ...account,
        expiresFormatted: account.expiresAt ? new Date(account.expiresAt).toLocaleDateString('ru-RU') : 'Бессрочно',
        activeDevices: accountState.devices.filter((device) => device.status === 'active').length,
        isExpiringSoon: false,
      };
    }
    if (!this.status.authRequired) {
      return {
        plan: 'self-hosted',
        planLabel: 'Self-hosted релей',
        expiresAt: null,
        expiresFormatted: 'Бессрочно',
        maxDevices: 999,
        activeDevices: activeCount,
        maxCacheMb: 999999,
        usedCacheMb: 0,
        allowAttachments: true,
        hasAiLease: true,
        isExpiringSoon: false,
      };
    }

    return {
      plan: 'free', planLabel: 'SLAG ID · требуется вход', expiresAt: null,
      expiresFormatted: '—', maxDevices: 0, activeDevices: 0,
      maxCacheMb: 0, usedCacheMb: 0, allowAttachments: false, hasAiLease: false,
    };
  }
  public getConfig(): SyncConfig {
    return { ...this.config };
  }

  public getStatus(): SyncStatus {
    return {
      ...this.status,
      subscription: this.computeSubscription(this.config),
    };
  }

  public subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const current = this.getStatus();
    this.listeners.forEach((fn) => fn(current));
  }

  public scheduleDebouncedPush(delayMs: number = 300): void {
    if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
    this.pushDebounceTimer = setTimeout(() => {
      this.pushDebounceTimer = null;
      void this.pushLocalChanges();
    }, delayMs);
  }

  public getOutbox(): Outbox {
    return new Outbox(this.currentVaultId);
  }

  private getStateHashKey(vaultId?: string): string {
    const vid = vaultId || this.currentVaultId;
    // Account rooms have their own checkpoint: a new mapping must resend the full local state.
    return this.usesAccountSync() && this.activeRoomId
      ? `${LAST_STATE_HASH_KEY}_${vid}_${this.activeRoomId}`
      : `${LAST_STATE_HASH_KEY}_${vid}`;
  }

  private getSyncedIdsKey(vaultId?: string): string {
    return `slag_sync_synced_ids_${vaultId || this.currentVaultId}`;
  }

  private getTombstonesKey(vaultId?: string): string {
    return `slag_sync_tombstones_${vaultId || this.currentVaultId}`;
  }

  private loadSyncedIds(): Set<string> {
    try {
      const raw = localStorage.getItem(this.getSyncedIdsKey());
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  }

  private loadTombstones(): Record<string, number> {
    try {
      const raw = localStorage.getItem(this.getTombstonesKey());
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private ensureSyncedIdsSeed(): void {
    if (localStorage.getItem(this.getSyncedIdsKey())) return;
    localStorage.setItem(this.getSyncedIdsKey(), JSON.stringify(storage.getItems().map((it) => it.id)));
  }

  public getCurrentVaultId(): string {
    return this.currentVaultId;
  }

  public getSyncVaultId(): string {
    return storage.ensureVaultSyncId(this.currentVaultId);
  }

  private usesAccountSync(): boolean {
    return this.status.authRequired || accountClient.getToken(this.config.serverUrl) !== null;
  }

  private authHeaders(includeJson = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    const token = accountClient.getToken(this.config.serverUrl);
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async refreshServerAuth(): Promise<boolean> {
    try {
      const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Health check failed: HTTP ${response.status}`);
      const health = await response.json();
      this.status.authRequired = Boolean(health.authRequired);
    } catch {
      const isOfficial = this.config.serverUrl.includes('152.53.199.71') || this.config.serverUrl.includes('slag.app');
      this.status.authRequired = isOfficial;
    }
    this.status.isAuthenticated = accountClient.getToken(this.config.serverUrl) !== null;
    this.notify();
    return !this.status.authRequired || this.status.isAuthenticated;
  }

  private loadConfig(targetVaultId?: string): SyncConfig {
    const vid = targetVaultId || (typeof storage !== 'undefined' && storage.getCurrentVault ? storage.getCurrentVault()?.id : 'default_vault') || 'default_vault';
    this.currentVaultId = vid;
    const key = `${SYNC_CONFIG_KEY}_${vid}`;
    try {
      let raw = localStorage.getItem(key);
      if (!raw && vid === 'default_vault') {
        raw = localStorage.getItem(SYNC_CONFIG_KEY);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          enabled: parsed.enabled ?? true,
          serverUrl: parsed.serverUrl || DEFAULT_SERVER_URL,
          deviceId: accountClient.getToken(parsed.serverUrl || DEFAULT_SERVER_URL)
            ? accountClient.getSession()!.deviceId
            : parsed.deviceId || generateDeviceId(),
          deviceName: parsed.deviceName || 'Это устройство',
          seedPhrase: parsed.seedPhrase || generateMnemonic(12),
          autoSync: parsed.autoSync ?? true,
          subscriptionPlan: parsed.subscriptionPlan || 'smile',
          bgSyncIntervalMinutes: parsed.bgSyncIntervalMinutes ?? 0,
          localSyncMode: parsed.localSyncMode || 'read-write',
          canRunAiLease: parsed.canRunAiLease ?? true,
          trustedDevices: parsed.trustedDevices || [],
        };
      }
    } catch {
      // fallback
    }

    let inheritedDeviceId = generateDeviceId();
    let inheritedDeviceName = 'Мой ПК';
    let inheritedServerUrl = DEFAULT_SERVER_URL;
    let inheritedPlan: 'free' | 'smile' | 'angry' = 'smile';
    let inheritedBgSync: 0 | 10 | 30 = 0;

    const baseRaw = localStorage.getItem(SYNC_CONFIG_KEY) || localStorage.getItem(`${SYNC_CONFIG_KEY}_default_vault`);
    if (baseRaw) {
      try {
        const base = JSON.parse(baseRaw);
        if (base.deviceId) inheritedDeviceId = base.deviceId;
        if (base.deviceName) inheritedDeviceName = base.deviceName;
        if (base.serverUrl) inheritedServerUrl = base.serverUrl;
        if (base.subscriptionPlan) inheritedPlan = base.subscriptionPlan;
        if (typeof base.bgSyncIntervalMinutes === 'number') inheritedBgSync = base.bgSyncIntervalMinutes;
      } catch {
        // ignore
      }
    }

    const initial: SyncConfig = {
      enabled: true,
      serverUrl: inheritedServerUrl,
      deviceId: accountClient.getToken(inheritedServerUrl)
        ? accountClient.getSession()!.deviceId
        : inheritedDeviceId,
      deviceName: inheritedDeviceName,
      seedPhrase: generateMnemonic(12),
      autoSync: true,
      subscriptionPlan: inheritedPlan,
      bgSyncIntervalMinutes: inheritedBgSync,
      localSyncMode: 'read-write',
      canRunAiLease: true,
      trustedDevices: [],
    };
    this.saveConfig(initial);
    return initial;
  }

  public saveConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    try {
      const key = `${SYNC_CONFIG_KEY}_${this.currentVaultId}`;
      localStorage.setItem(key, JSON.stringify(this.config));
      if (this.currentVaultId === 'default_vault') {
        localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(this.config));
      }
    } catch (e) {
      syncLog.error('Failed to save sync config:', e);
    }
    if (this.status) {
      this.status.subscription = this.computeSubscription(this.config);
      this.notify();
    }
  }

  public async switchVault(vaultId: string): Promise<void> {
    if (this.currentVaultId === vaultId && this.status.state !== 'idle' && this.status.state !== 'error') {
      return;
    }
    syncLog.info(`SyncEngine switching to vault: ${vaultId}`);
    this.disconnect();
    this.currentVaultId = vaultId;
    this.config = this.loadConfig(vaultId);
    this.status.subscription = this.computeSubscription(this.config);
    this.status.currentRoomId = null;
    this.notify();
    await this.init();
  }

  public async init(): Promise<void> {
    const generation = ++this.initGeneration;
    const seedPhrase = this.config.seedPhrase;
    if (!this.config.enabled) {
      this.status.state = 'idle';
      this.notify();
      return;
    }

    try {
      this.status.state = 'syncing';
      this.notify();

      const canSync = await this.refreshServerAuth();
      if (generation !== this.initGeneration) return;
      if (!canSync) {
        this.status.state = 'idle';
        this.status.error = null;
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

      this.connectWebSocket();
      this.startIntervals();
      this.ensureSyncedIdsSeed();
      await this.pushLocalChanges();
    } catch (err: unknown) {
      if (generation !== this.initGeneration) return;
      const msg = err instanceof Error ? err.message : String(err);
      syncLog.error('Sync init error:', msg);
      this.status.state = 'error';
      this.status.error = msg;
      this.notify();
    }
  }

  public getVaultSeedPhrase(vaultId: string): string | null {
    if (vaultId === this.currentVaultId) return this.config.seedPhrase;
    try {
      const raw = localStorage.getItem(`${SYNC_CONFIG_KEY}_${vaultId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed.seedPhrase === 'string' ? parsed.seedPhrase : null;
    } catch {
      return null;
    }
  }

  public setVaultSeedPhrase(vaultId: string, seedPhrase: string): void {
    if (vaultId === this.currentVaultId) {
      this.saveConfig({ seedPhrase });
      return;
    }
    const raw = localStorage.getItem(`${SYNC_CONFIG_KEY}_${vaultId}`);
    const base = raw ? JSON.parse(raw) : this.config;
    localStorage.setItem(`${SYNC_CONFIG_KEY}_${vaultId}`, JSON.stringify({
      ...base,
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      serverUrl: this.config.serverUrl,
      seedPhrase,
    }));
  }

  public async updateSeedPhrase(newPhrase: string): Promise<void> {
    if (newPhrase !== this.config.seedPhrase) {
      localStorage.removeItem(this.getStateHashKey());
      localStorage.removeItem(this.getSyncedIdsKey());
      localStorage.removeItem(this.getTombstonesKey());
      this.getOutbox().clear();
      if (this.currentVaultId === 'default_vault') localStorage.removeItem(LAST_STATE_HASH_KEY);
    }
    this.saveConfig({ seedPhrase: newPhrase });
    this.disconnect();
    await this.init();
  }

  public async updateServerUrl(url: string): Promise<void> {
    this.saveConfig({ serverUrl: url });
    localStorage.removeItem(this.getSyncedIdsKey());
    localStorage.removeItem(this.getTombstonesKey());
    this.getOutbox().clear();
    this.disconnect();
    await this.init();
  }

  private reconnectAttempts = 0;

  private connectWebSocket(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    if (!this.config.enabled || !this.activeRoomId) return;

    try {
      const baseWsUrl = this.config.serverUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/+$/, '');
      const authParams = new URLSearchParams({
        device: this.config.deviceId,
        vault: this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId,
      });
      const token = accountClient.getToken(this.config.serverUrl);
      if (token) authParams.set('token', token);
      const fullWsUrl = `${baseWsUrl}/ws/${this.activeRoomId}?${authParams.toString()}`;

      syncLog.info(`Connecting sync WS for vault ${this.currentVaultId}`);
      this.ws = new WebSocket(fullWsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        syncLog.info('Sync WebSocket connected');
        this.status.state = 'connected';
        this.status.error = null;
        this.notify();
      };

      this.ws.onmessage = async (event) => {
        await this.handleIncomingMessage(event.data);
      };

      this.ws.onerror = () => {
        syncLog.warn('Sync WebSocket connection error');
        this.status.state = 'error';
        this.status.error = 'Сбой подключения к релею';
        this.notify();
      };

      this.ws.onclose = (event) => {
        this.ws = null;
        if (event.code === 1008 || event.code === 4401 || event.code === 4403) {
          this.disconnect();
          this.status.state = 'error';
          this.status.error = 'Соединение отклонено сервером. Проверьте вход и доступ к хранилищу';
          this.notify();
          return;
        }
        const retryMs = Math.min(5000 * 2 ** Math.min(this.reconnectAttempts++, 4), 60000);
        syncLog.info(`Sync WebSocket closed (code ${event.code}), retrying in ${retryMs}ms`);
        this.status.state = 'offline';
        this.notify();
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (this.config.enabled && this.activeRoomId) this.connectWebSocket();
        }, retryMs);
      };
    } catch (e) {
      syncLog.error('WebSocket spawn error:', e);
      this.status.state = 'error';
      this.notify();
    }
  }

  private async handleIncomingMessage(data: string): Promise<void> {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'welcome') {
        this.status.connectedDevicesCount = msg.connectedDevices || 1;
        this.notify();
      } else if (msg.type === 'pong') {
        const now = Date.now();
        if (msg.ts) {
          this.status.pingMs = Math.max(1, now - msg.ts * 1000);
          this.notify();
        }
      } else if (msg.type === 'bundle') {
        await this.applyIncomingBundle(msg.bundle);
      }
    } catch (e) {
      syncLog.error('Failed to parse incoming message:', e);
    }
  }

  private incomingQueue: Promise<void> = Promise.resolve();

  private applyIncomingBundle(bundlePayload: unknown): Promise<void> {
    const generation = this.initGeneration;
    this.incomingQueue = this.incomingQueue.then(async () => {
      if (generation === this.initGeneration) await this.persistIncomingBundle(bundlePayload);
    });
    return this.incomingQueue;
  }

  private async persistIncomingBundle(bundlePayload: unknown): Promise<void> {
    if (!this.activeVaultKey) return;
    const generation = this.initGeneration;
    const roomId = this.activeRoomId;

    try {
      this.status.state = 'syncing';
      this.notify();

      let bundle: SyncBundle;
      if (
        typeof bundlePayload === 'object' &&
        bundlePayload !== null &&
        'ciphertext' in bundlePayload
      ) {
        bundle = await decryptBundle(bundlePayload as EncryptedBundle, this.activeVaultKey);
      } else {
        if (this.usesAccountSync()) throw new Error('Account sync requires an encrypted bundle');
        bundle = bundlePayload as SyncBundle;
      }

      if (generation !== this.initGeneration) return;
      if (bundle.roomId !== roomId || !Array.isArray(bundle.changes)) throw new Error('Bundle room or changes are invalid');
      if (typeof bundlePayload === 'object' && bundlePayload !== null && 'fromDeviceId' in bundlePayload &&
          bundlePayload.fromDeviceId !== bundle.fromDeviceId) throw new Error('Bundle sender does not match authenticated envelope');
      if (bundle.fromDeviceId === this.config.deviceId) {
        return; // ignore self echo
      }
      if (bundle.bundleId === this.lastAppliedBundleId) {
        // ponytail: relay re-delivers pending bundles until ACK; skip a re-apply we already did.
        await this.sendAck(bundle.bundleId);
        return;
      }

      let sender = this.config.trustedDevices.find((d) => d.id === bundle.fromDeviceId);
      if (!sender && this.usesAccountSync()) {
        syncLog.warn(`Ignored bundle from unregistered account device: ${bundle.fromDeviceId}`);
        return;
      }
      if (!sender) {
        sender = {
          id: bundle.fromDeviceId,
          name: `Устройство ${bundle.fromDeviceId.replace('slag-', '').slice(0, 8)}`,
          platform: 'desktop',
          isCurrent: false,
          syncMode: 'read-write',
          canRunAiLease: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: 'Только что',
          allowedVaults: [this.currentVaultId],
        };
        this.addTrustedDevice(sender);
      } else {
        const updatedList = this.config.trustedDevices.map((d) =>
          d.id === bundle.fromDeviceId ? { ...d, lastSeenAt: 'Только что' } : d
        );
        this.saveConfig({ trustedDevices: updatedList });
      }
      if (sender.syncMode === 'receive-only') {
        syncLog.warn(`Ignored mutation bundle from receive-only device: ${bundle.fromDeviceId}`);
        return;
      }
      if (sender.allowedVaults !== undefined && !sender.allowedVaults.includes(this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId)) {
        syncLog.warn(`Ignored bundle for vault ${this.currentVaultId} from device without access: ${bundle.fromDeviceId}`);
        return;
      }

      syncLog.info(
        `Received bundle ${bundle.bundleId} from ${bundle.fromDeviceId} (${bundle.changes.length} changes)`
      );

      let hasItemsChanged = false;
      let hasFoldersChanged = false;
      let hasWorkspaceChanged = false;
      let hasDraftsChanged = false;
      let workspaceState: WorkspaceState | undefined;

      const currentItems: SlagItem[] = [...storage.getItems()];
      const currentFolders: FolderMeta[] = [...storage.getFolders()];
      const tombstones = this.loadTombstones();
      let tombstonesDirty = false;

      for (const ch of bundle.changes) {
        if (ch.type === 'item') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as SlagItem;
            const tomb = tombstones[ch.id];
            // ponytail: wall-clock LWW; server-assigned version when clocks skew matters.
            if (tomb !== undefined && (incoming.updatedAt ?? 0) < tomb) continue;
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0) {
              if ((incoming.updatedAt ?? 0) < (currentItems[idx].updatedAt ?? 0)) continue;
              currentItems[idx] = incoming;
            } else {
              currentItems.unshift(incoming);
            }
            if (tomb !== undefined) {
              delete tombstones[ch.id];
              tombstonesDirty = true;
            }
            hasItemsChanged = true;
          } else if (ch.action === 'delete') {
            const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0 && (currentItems[idx].updatedAt ?? 0) <= deletedAt) {
              currentItems.splice(idx, 1);
              hasItemsChanged = true;
            }
            if (deletedAt > (tombstones[ch.id] ?? 0)) {
              tombstones[ch.id] = deletedAt;
              tombstonesDirty = true;
            }
          }
        } else if (ch.type === 'folder') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as FolderMeta;
            const idx = currentFolders.findIndex((f) => f.path === ch.id);
            if (idx >= 0) {
              currentFolders[idx] = incoming;
            } else {
              currentFolders.push(incoming);
            }
            hasFoldersChanged = true;
          } else if (ch.action === 'delete') {
            const folderPath = ch.id;
            const remaining = currentFolders.filter((f) => f.path !== folderPath && !f.path.startsWith(folderPath + '/'));
            if (remaining.length !== currentFolders.length) {
              currentFolders.length = 0;
              currentFolders.push(...remaining);
              hasFoldersChanged = true;
              // Reroute child items to "Входящие"
              for (let i = 0; i < currentItems.length; i++) {
                if (currentItems[i].folder === folderPath || currentItems[i].folder.startsWith(folderPath + '/')) {
                  currentItems[i] = { ...currentItems[i], folder: 'Входящие', updatedAt: Date.now() };
                  hasItemsChanged = true;
                }
              }
            }
          } else if (ch.action === 'rename') {
            const payload = ch.payload as { oldPath?: string; folder?: FolderMeta } | undefined;
            const oldPath = payload?.oldPath;
            const updatedFolder = payload?.folder || (ch.payload as FolderMeta);
            if (oldPath && updatedFolder && updatedFolder.path) {
              for (let i = 0; i < currentFolders.length; i++) {
                if (currentFolders[i].path === oldPath) {
                  currentFolders[i] = updatedFolder;
                  hasFoldersChanged = true;
                } else if (currentFolders[i].path.startsWith(oldPath + '/')) {
                  const subPath = updatedFolder.path + currentFolders[i].path.slice(oldPath.length);
                  const subName = subPath.split('/').pop() || currentFolders[i].name;
                  currentFolders[i] = { ...currentFolders[i], path: subPath, name: subName };
                  hasFoldersChanged = true;
                }
              }
              for (let i = 0; i < currentItems.length; i++) {
                if (currentItems[i].folder === oldPath) {
                  currentItems[i] = { ...currentItems[i], folder: updatedFolder.path, updatedAt: Date.now() };
                  hasItemsChanged = true;
                } else if (currentItems[i].folder.startsWith(oldPath + '/')) {
                  const subFolder = updatedFolder.path + currentItems[i].folder.slice(oldPath.length);
                  currentItems[i] = { ...currentItems[i], folder: subFolder, updatedAt: Date.now() };
                  hasItemsChanged = true;
                }
              }
            }
          }
        } else if (ch.type === 'trash') {
          if (ch.action === 'restore' && ch.payload) {
            const restored = ch.payload as SlagItem;
            const idx = currentItems.findIndex((it) => it.id === restored.id);
            if (idx >= 0) {
              currentItems[idx] = restored;
            } else {
              currentItems.unshift(restored);
            }
            if (tombstones[restored.id] !== undefined) {
              delete tombstones[restored.id];
              tombstonesDirty = true;
            }
            hasItemsChanged = true;
          }
        } else if (ch.type === 'workspace' && ch.payload) {
          workspaceState = ch.payload as WorkspaceState;
          hasWorkspaceChanged = true;
        } else if (ch.type === 'draft') {
          const draftTombKey = `slag_sync_draft_tomb_${this.currentVaultId}_${ch.id}`;
          const lastDeletedAt = Number(localStorage.getItem(draftTombKey) || 0);

          if (ch.id.startsWith('composer:')) {
            const folder = ch.id.slice('composer:'.length);
            if (ch.action === 'upsert' && ch.payload) {
              const incoming = ch.payload as ComposerDraft;
              if ((incoming.updatedAt ?? 0) <= lastDeletedAt) {
                syncLog.info(`Ignored stale composer draft for "${folder}" (updatedAt <= deletedAt)`);
                continue;
              }
              const existing = storage.getComposerDraft(folder);
              if (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
                storage.saveComposerDraft(folder, incoming, 'remote');
                hasDraftsChanged = true;
                syncLog.info(`Applied remote composer draft for folder "${folder}" (${incoming.content.length} chars)`);
              }
            } else if (ch.action === 'delete') {
              const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
              localStorage.setItem(draftTombKey, String(deletedAt));
              storage.deleteComposerDraft(folder, 'remote');
              hasDraftsChanged = true;
              syncLog.info(`Deleted remote composer draft for folder "${folder}"`);
            }
          } else if (ch.id.startsWith('fullscreen:')) {
            const itemId = ch.id.slice('fullscreen:'.length);
            if (ch.action === 'upsert' && ch.payload) {
              const incoming = ch.payload as FullscreenDraft;
              if ((incoming.updatedAt ?? 0) <= lastDeletedAt) {
                syncLog.info(`Ignored stale fullscreen draft for "${itemId}" (updatedAt <= deletedAt)`);
                continue;
              }
              const existing = storage.getFullscreenDraft(itemId);
              if (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
                storage.saveFullscreenDraft(itemId, incoming, 'remote');
                hasDraftsChanged = true;
                syncLog.info(`Applied remote fullscreen draft for item "${itemId}" ("${incoming.title}")`);
              }
            } else if (ch.action === 'delete') {
              const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
              localStorage.setItem(draftTombKey, String(deletedAt));
              storage.clearFullscreenDraft(itemId, 'remote');
              hasDraftsChanged = true;
              syncLog.info(`Cleared remote fullscreen draft for item "${itemId}"`);
            }
          }
        }
      }

      if (tombstonesDirty) {
        localStorage.setItem(this.getTombstonesKey(), JSON.stringify(tombstones));
      }

      if (hasItemsChanged || hasFoldersChanged || hasWorkspaceChanged) {
        await storage.importSyncedVaultData({
          items: hasItemsChanged ? currentItems : undefined,
          folders: hasFoldersChanged ? currentFolders : undefined,
          workspaceState,
        });
      }
      if (generation !== this.initGeneration) return;

      this.lastAppliedBundleId = bundle.bundleId;
      await this.sendAck(bundle.bundleId);
      if (generation !== this.initGeneration) return;

      this.status.lastSyncTime = new Date().toLocaleTimeString();
      this.status.state = 'connected';
      this.notify();

      // Dispatch global window event so React UI re-renders cleanly
      window.dispatchEvent(
        new CustomEvent('slag-sync-updated', {
          detail: { hasItemsChanged, hasFoldersChanged, hasWorkspaceChanged, hasDraftsChanged },
        })
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('Local state changed')) {
        // ponytail: a local edit raced the incoming persist; re-fetch pending now instead of
        // waiting for the next WS reconnect to re-deliver the un-acked bundle.
        syncLog.warn('Local changed during sync persist; refetching pending bundles');
        if (generation === this.initGeneration) void this.fetchPendingBundlesHttp();
        return;
      }
      syncLog.error('Error applying incoming bundle:', err);
      if (generation !== this.initGeneration) return;
      this.status.state = 'error';
      this.status.error = 'Не удалось расшифровать или сохранить изменения';
      this.notify();
    }
  }

  private async sendAck(bundleId: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ack', bundleId }));
      syncLog.info(`ACK sent for bundle ${bundleId}`);
      return;
    }
    const roomId = this.activeRoomId;
    if (!roomId) return;
    const serverUrl = this.config.serverUrl.replace(/\/+$/, '');
    const response = await fetch(`${serverUrl}/api/rooms/${roomId}/ack?vault=${encodeURIComponent(this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId)}`, {
      method: 'POST',
      headers: this.authHeaders(true),
      body: JSON.stringify({ deviceId: this.config.deviceId, bundleIds: [bundleId] }),
    });
    if (!response.ok) throw new Error(`Sync ACK failed: HTTP ${response.status}`);
  }

  public async pushLocalChanges(): Promise<void> {
    if (this.status.authRequired && !accountClient.getToken(this.config.serverUrl)) return;
    if (this.config.localSyncMode === 'receive-only') {
      syncLog.info('Skipping pushLocalChanges: device is in receive-only mode');
      return;
    }
    if (this.isProcessingSync || !this.activeVaultKey || !this.activeRoomId) return;
    this.isProcessingSync = true;
    const generation = this.initGeneration;
    const roomId = this.activeRoomId;
    const vaultKey = this.activeVaultKey;
    const hashKey = this.getStateHashKey();

    try {
      const items = storage.getItems();
      const folders = storage.getFolders();
      const workspaceState = storage.getWorkspaceState();
      const pendingOps = this.getOutbox().pending();

      const stateHash = await computeStateRootHash(items, folders);
      if (generation !== this.initGeneration) return;
      const lastSyncedHash =
        localStorage.getItem(hashKey) ||
        (!this.usesAccountSync() && this.currentVaultId === 'default_vault' ? localStorage.getItem(LAST_STATE_HASH_KEY) : null);

      if (lastSyncedHash === stateHash && pendingOps.length === 0) {
        // Nothing changed
        this.status.state = this.ws && this.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
        this.isProcessingSync = false;
        this.notify();
        return;
      }

      this.status.state = 'syncing';
      this.notify();

      const changes: SyncChangeItem[] = [];

      // Pack all current items as upsert changes
      for (const item of items) {
        const itemHash = await computeHash(JSON.stringify(item));
        changes.push({
          id: item.id,
          type: 'item',
          action: 'upsert',
          version: 1,
          hash: itemHash,
          payload: item,
        });
      }

      // Pack folders
      for (const folder of folders) {
        const folderHash = await computeHash(JSON.stringify(folder));
        changes.push({
          id: folder.path,
          type: 'folder',
          action: 'upsert',
          version: 1,
          hash: folderHash,
          payload: folder,
        });
      }

      // Pack workspace state (kanban columns, views)
      changes.push({
        id: 'workspace_state',
        type: 'workspace',
        action: 'upsert',
        version: 1,
        hash: await computeHash(JSON.stringify(workspaceState)),
        payload: workspaceState,
      });

      // Pack deletions as explicit tombstones so a stale snapshot cannot resurrect them.
      const syncedIds = this.loadSyncedIds();
      const currentIds = new Set(items.map((it) => it.id));
      const tombstones = this.loadTombstones();
      for (const id of syncedIds) {
        if (currentIds.has(id)) continue;
        const deletedAt = tombstones[id] ?? Date.now();
        tombstones[id] = deletedAt;
        changes.push({
          id,
          type: 'item',
          action: 'delete',
          version: 1,
          hash: String(deletedAt),
          payload: { deletedAt },
        });
      }
      for (const id of currentIds) {
        delete tombstones[id];
      }

      // Pack folder mutations, trash operations, and drafts from Outbox
      for (const op of pendingOps) {
        if (op.kind === 'folder') {
          if (op.action === 'delete') {
            changes.push({
              id: op.id,
              type: 'folder',
              action: 'delete',
              version: 1,
              hash: String(op.timestamp),
              payload: { path: op.id },
            });
          } else if (op.action === 'rename') {
            changes.push({
              id: op.id,
              type: 'folder',
              action: 'rename',
              version: 1,
              hash: String(op.timestamp),
              payload: { oldPath: op.oldPath, folder: op.payload },
            });
          }
        } else if (op.kind === 'trash' && op.action === 'restore') {
          changes.push({
            id: op.id,
            type: 'trash',
            action: 'restore',
            version: 1,
            hash: String(op.timestamp),
            payload: op.payload,
          });
        } else if (op.kind === 'draft') {
          changes.push({
            id: op.id,
            type: 'draft',
            action: op.action,
            version: 1,
            hash: String(op.timestamp),
            payload: op.action === 'delete' ? { deletedAt: op.timestamp } : op.payload,
          });
        }
      }

      const bundle: SyncBundle = {
        bundleId: `bnd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        roomId,
        fromDeviceId: this.config.deviceId,
        sequence: this.sequence++,
        stateRootHash: stateHash,
        timestamp: new Date().toISOString(),
        changes,
      };

      const encrypted = await encryptBundle(bundle, vaultKey);
      if (generation !== this.initGeneration) return;

      // Always push over HTTP POST: a synchronous 200/409 ack means a lost WebSocket
      // cannot drop a bundle (at-least-once). WS stays receive-only.
      const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundle?vault=${encodeURIComponent(this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId)}`, {
        method: 'POST',
        headers: this.authHeaders(true),
        body: JSON.stringify(encrypted),
      });
      if (!response.ok) {
        if (response.status === 409) {
          // ponytail: relay dedups by bundle_id; replay means it is already delivered.
        } else if (response.status === 401 || response.status === 403) {
          this.disconnect();
          throw new Error(response.status === 401 ? 'Сессия недействительна. Войдите в личный кабинет' : 'Сервер запретил обмен. Проверьте доступ к хранилищу в личном кабинете');
        } else {
          throw new Error(`Sync push failed: HTTP ${response.status}`);
        }
      }

      const draftChangesCount = changes.filter((c) => c.type === 'draft').length;
      const itemChangesCount = changes.filter((c) => c.type === 'item').length;
      const folderChangesCount = changes.filter((c) => c.type === 'folder').length;
      syncLog.info(
        `Pushed bundle ${bundle.bundleId} (${changes.length} changes: ${itemChangesCount} items, ${folderChangesCount} folders, ${draftChangesCount} drafts, ${encrypted.ciphertext.length} B) -> room ${this.activeRoomId?.slice(0, 10)}...`
      );

      localStorage.setItem(hashKey, stateHash);
      if (!this.usesAccountSync() && this.currentVaultId === 'default_vault') {
        localStorage.setItem(LAST_STATE_HASH_KEY, stateHash);
      }
      localStorage.setItem(this.getSyncedIdsKey(), JSON.stringify([...currentIds]));
      localStorage.setItem(this.getTombstonesKey(), JSON.stringify(tombstones));
      this.getOutbox().markSynced(pendingOps.map((o) => o.opId));
      this.status.lastSyncTime = new Date().toLocaleTimeString();
      this.status.state = 'connected';
      this.status.error = null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      syncLog.error('Failed to push sync bundle:', msg);
      this.status.state = 'error';
      this.status.error = msg;
    } finally {
      this.isProcessingSync = false;
      this.notify();
    }
  }

  private startIntervals(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);

    // Heartbeat ping every 25 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const ts = Math.floor(Date.now() / 1000);
        this.ws.send(JSON.stringify({ type: 'ping', ts }));
      }
    }, 25000);

    // Auto sync check: 15s for realtime (0), or periodic for battery saver
    if (this.config.autoSync) {
      const intervalMs = (this.config.bgSyncIntervalMinutes && this.config.bgSyncIntervalMinutes > 0)
        ? this.config.bgSyncIntervalMinutes * 60 * 1000
        : 15000;

      this.autoSyncInterval = setInterval(() => {
        void this.pushLocalChanges();
        if (this.config.bgSyncIntervalMinutes && this.config.bgSyncIntervalMinutes > 0) {
          void this.fetchPendingBundlesHttp();
        }
      }, intervalMs);
    }
  }

  public async fetchPendingBundlesHttp(): Promise<void> {
    if (!this.activeRoomId || !this.activeVaultKey) return;
    const generation = this.initGeneration;
    try {
      const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
      const params = new URLSearchParams({ device: this.config.deviceId, vault: this.usesAccountSync() ? this.getSyncVaultId() : this.currentVaultId });
      const res = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundles?${params.toString()}`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.bundles)) {
        for (const item of data.bundles) {
          if (generation !== this.initGeneration) return;
          if (item.payload) {
            await this.applyIncomingBundle(item.payload);
          }
        }
      }
    } catch (e) {
      syncLog.warn('HTTP bundles fetch failed:', e);
    }
  }

  public setSubscriptionPlan(plan: 'free' | 'smile' | 'angry'): void {
    this.saveConfig({ subscriptionPlan: plan });
  }

  public setBgSyncInterval(minutes: 0 | 10 | 30): void {
    this.saveConfig({ bgSyncIntervalMinutes: minutes });
    this.startIntervals();
  }

  public disconnect(): void {
    ++this.initGeneration;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.activeVaultKey = null;
    this.activeRoomId = null;
    this.status.currentRoomId = null;
    this.status.state = 'idle';
    this.notify();
  }

  public addTrustedDevice(device: DeviceProfile): void {
    const list = this.config.trustedDevices.filter((d) => d.id !== device.id);
    list.push({
      ...device,
      syncMode: device.syncMode || 'read-write',
      canRunAiLease: device.canRunAiLease ?? false,
      allowedVaults: device.allowedVaults,
    });
    this.saveConfig({ trustedDevices: list });
  }

  public setDeviceAllowedVaults(deviceId: string, allowedVaults: string[]): void {
    const list = this.config.trustedDevices.map((d) =>
      d.id === deviceId ? { ...d, allowedVaults } : d
    );
    this.saveConfig({ trustedDevices: list });
  }

  public removeTrustedDevice(deviceId: string): void {
    const list = this.config.trustedDevices.filter((d) => d.id !== deviceId);
    this.saveConfig({ trustedDevices: list });
  }

  public renameDevice(deviceId: string, newName: string): void {
    const clean = newName.trim();
    if (deviceId === this.config.deviceId) {
      this.saveConfig({ deviceName: clean || 'Это устройство' });
      return;
    }
    const list = this.config.trustedDevices.map((d) =>
      d.id === deviceId ? { ...d, name: clean || d.name } : d
    );
    this.saveConfig({ trustedDevices: list });
  }

  public setDeviceSyncMode(deviceId: string, mode: DeviceSyncMode): void {
    if (deviceId === this.config.deviceId) {
      this.saveConfig({ localSyncMode: mode });
      return;
    }
    const list = this.config.trustedDevices.map((d) =>
      d.id === deviceId ? { ...d, syncMode: mode } : d
    );
    this.saveConfig({ trustedDevices: list });
  }

  public setDeviceAiLease(deviceId: string, canRun: boolean): void {
    if (deviceId === this.config.deviceId) {
      this.saveConfig({ canRunAiLease: canRun });
      return;
    }
    const list = this.config.trustedDevices.map((d) =>
      d.id === deviceId ? { ...d, canRunAiLease: canRun } : d
    );
    this.saveConfig({ trustedDevices: list });
  }

  public async rotateVaultKey(): Promise<string> {
    if (this.usesAccountSync()) {
      const response = await fetch(`${this.config.serverUrl.replace(/\/+$/, '')}/api/vaults/${encodeURIComponent(this.getSyncVaultId())}/rotate`, {
        method: 'POST', headers: this.authHeaders(true), body: '{}',
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
    localStorage.removeItem(this.getStateHashKey());
    if (this.currentVaultId === 'default_vault') {
      localStorage.removeItem(LAST_STATE_HASH_KEY);
    }
    await this.init();
    return newSeed;
  }
}

export const syncEngine = new SyncEngine();
