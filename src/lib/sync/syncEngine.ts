import { storage } from '../storage';
export { storage };
import { logger } from '../logger';
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
import type { SlagItem, FolderMeta, WorkspaceState } from '../../types';

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
  private initGeneration = 0;
  private currentVaultId: string = 'default_vault';

  constructor() {
    this.currentVaultId =
      (typeof storage !== 'undefined' && storage.getCurrentVault
        ? storage.getCurrentVault()?.id
        : 'default_vault') || 'default_vault';
    this.status = {
      state: 'idle',
      lastSyncTime: null,
      pingMs: null,
      error: null,
      pendingCount: 0,
      connectedDevicesCount: 1,
      currentRoomId: null,
      subscription: {
        plan: 'smile',
        planLabel: 'SLAG Smile',
        expiresAt: null,
        expiresFormatted: 'Бессрочно',
        maxDevices: 5,
        activeDevices: 1,
        maxCacheMb: 10240,
        usedCacheMb: 12,
        allowAttachments: true,
        hasAiLease: true,
        isExpiringSoon: false,
      },
    };
    this.config = this.loadConfig(this.currentVaultId);
    this.status.subscription = this.computeSubscription(this.config);
  }

  private computeSubscription(cfg: SyncConfig): SyncStatus['subscription'] {
    const isOfficial = cfg.serverUrl.includes('152.53.199.71') || cfg.serverUrl.includes('slag.app');
    const activeCount = 1 + (cfg.trustedDevices?.length || 0);

    if (!isOfficial) {
      return {
        plan: 'self-hosted',
        planLabel: 'Self-hosted релей',
        expiresAt: null,
        expiresFormatted: 'Бессрочно',
        maxDevices: 999,
        activeDevices: activeCount,
        maxCacheMb: 999999,
        usedCacheMb: 14,
        allowAttachments: true,
        hasAiLease: true,
        isExpiringSoon: false,
      };
    }

    const plan = cfg.subscriptionPlan || 'smile';
    if (plan === 'free') {
      return {
        plan: 'free',
        planLabel: 'SLAG Free',
        expiresAt: null,
        expiresFormatted: 'Бессрочно',
        maxDevices: 2,
        activeDevices: activeCount,
        maxCacheMb: 1024,
        usedCacheMb: 8,
        allowAttachments: false,
        hasAiLease: false,
        isExpiringSoon: false,
      };
    }

    if (plan === 'angry') {
      return {
        plan: 'angry',
        planLabel: 'SLAG Angry',
        expiresAt: '2027-11-12T00:00:00Z',
        expiresFormatted: '12 ноября 2027',
        maxDevices: 15,
        activeDevices: activeCount,
        maxCacheMb: 51200,
        usedCacheMb: 42,
        allowAttachments: true,
        hasAiLease: true,
        isExpiringSoon: false,
      };
    }

    // Default official plan: 'smile' (our current Pro)
    return {
      plan: 'smile',
      planLabel: 'SLAG Smile',
      expiresAt: '2027-11-12T00:00:00Z',
      expiresFormatted: '12 ноября 2027',
      maxDevices: 5,
      activeDevices: activeCount,
      maxCacheMb: 10240,
      usedCacheMb: 14,
      allowAttachments: true,
      hasAiLease: true,
      isExpiringSoon: false,
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

  private getStateHashKey(vaultId?: string): string {
    const vid = vaultId || this.currentVaultId;
    return `${LAST_STATE_HASH_KEY}_${vid}`;
  }

  public getCurrentVaultId(): string {
    return this.currentVaultId;
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
          deviceId: parsed.deviceId || generateDeviceId(),
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
      deviceId: inheritedDeviceId,
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

      const [vaultKey, roomId] = await Promise.all([
        deriveVaultKey(seedPhrase),
        deriveRoomId(seedPhrase),
      ]);
      if (generation !== this.initGeneration) return;
      this.activeVaultKey = vaultKey;
      this.activeRoomId = roomId;
      this.status.currentRoomId = roomId;

      this.connectWebSocket();
      this.startIntervals();
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

  public async updateSeedPhrase(newPhrase: string): Promise<void> {
    if (newPhrase !== this.config.seedPhrase) {
      localStorage.removeItem(this.getStateHashKey());
      if (this.currentVaultId === 'default_vault') localStorage.removeItem(LAST_STATE_HASH_KEY);
    }
    this.saveConfig({ seedPhrase: newPhrase });
    this.disconnect();
    await this.init();
  }

  public async updateServerUrl(url: string): Promise<void> {
    this.saveConfig({ serverUrl: url });
    this.disconnect();
    await this.init();
  }

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
      const fullWsUrl = `${baseWsUrl}/ws/${this.activeRoomId}?device=${encodeURIComponent(this.config.deviceId)}`;

      syncLog.info(`Connecting sync WS: ${fullWsUrl}`);
      this.ws = new WebSocket(fullWsUrl);

      this.ws.onopen = () => {
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
        syncLog.info(`Sync WebSocket closed (code ${event.code}), retrying in 5s`);
        this.ws = null;
        this.status.state = 'offline';
        this.notify();
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (this.config.enabled) this.connectWebSocket();
        }, 5000);
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
    const deviceId = this.config.deviceId;
    const serverUrl = this.config.serverUrl.replace(/\/+$/, '');

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
        bundle = bundlePayload as SyncBundle;
      }

      if (generation !== this.initGeneration) return;
      if (bundle.fromDeviceId === this.config.deviceId) {
        return; // ignore self echo
      }

      const sender = this.config.trustedDevices.find((d) => d.id === bundle.fromDeviceId);
      if (sender?.syncMode === 'receive-only') {
        syncLog.warn(`Ignored mutation bundle from receive-only device: ${bundle.fromDeviceId}`);
        return;
      }
      if (sender?.allowedVaults && sender.allowedVaults.length > 0 && !sender.allowedVaults.includes(this.currentVaultId)) {
        syncLog.warn(`Ignored bundle for vault ${this.currentVaultId} from device without access: ${bundle.fromDeviceId}`);
        return;
      }

      syncLog.info(
        `Received bundle ${bundle.bundleId} from ${bundle.fromDeviceId} (${bundle.changes.length} changes)`
      );

      let hasItemsChanged = false;
      let hasFoldersChanged = false;
      let hasWorkspaceChanged = false;
      let workspaceState: WorkspaceState | undefined;

      const currentItems: SlagItem[] = [...storage.getItems()];
      const currentFolders: FolderMeta[] = [...storage.getFolders()];

      for (const ch of bundle.changes) {
        if (ch.type === 'item') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as SlagItem;
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0) {
              currentItems[idx] = incoming;
            } else {
              currentItems.unshift(incoming);
            }
            hasItemsChanged = true;
          } else if (ch.action === 'delete') {
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0) {
              currentItems.splice(idx, 1);
              hasItemsChanged = true;
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
          }
        } else if (ch.type === 'workspace' && ch.payload) {
          workspaceState = ch.payload as WorkspaceState;
          hasWorkspaceChanged = true;
        }
      }

      if (hasItemsChanged || hasFoldersChanged || hasWorkspaceChanged) {
        await storage.importSyncedVaultData({
          items: hasItemsChanged ? currentItems : undefined,
          folders: hasFoldersChanged ? currentFolders : undefined,
          workspaceState,
        });
      }
      if (generation !== this.initGeneration) return;

      // Send ACK only after persistence succeeds.
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ack', bundleId: bundle.bundleId }));
        syncLog.info(`ACK sent for bundle ${bundle.bundleId}`);
      } else {
        const response = await fetch(`${serverUrl}/api/rooms/${roomId}/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, bundleIds: [bundle.bundleId] }),
        });
        if (!response.ok) throw new Error(`Sync ACK failed: HTTP ${response.status}`);
      }
      if (generation !== this.initGeneration) return;

      this.status.lastSyncTime = new Date().toLocaleTimeString();
      this.status.state = 'connected';
      this.notify();

      // Dispatch global window event so React UI re-renders cleanly
      window.dispatchEvent(
        new CustomEvent('slag-sync-updated', {
          detail: { hasItemsChanged, hasFoldersChanged, hasWorkspaceChanged },
        })
      );
    } catch (err) {
      syncLog.error('Error applying incoming bundle:', err);
      if (generation !== this.initGeneration) return;
      this.status.state = 'error';
      this.status.error = 'Не удалось расшифровать или сохранить изменения';
      this.notify();
    }
  }

  public async pushLocalChanges(): Promise<void> {
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

      const stateHash = await computeStateRootHash(items, folders);
      if (generation !== this.initGeneration) return;
      const lastSyncedHash =
        localStorage.getItem(hashKey) ||
        (this.currentVaultId === 'default_vault' ? localStorage.getItem(LAST_STATE_HASH_KEY) : null);

      if (lastSyncedHash === stateHash) {
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

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'bundle', bundle: encrypted }));
      } else {
        // Fallback HTTP push
        const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
        const response = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(encrypted),
        });
        if (!response.ok) throw new Error(`Sync push failed: HTTP ${response.status}`);
      }

      syncLog.info(
        `Pushed bundle ${bundle.bundleId} (${changes.length} changes, ${encrypted.ciphertext.length} B) -> room ${this.activeRoomId?.slice(0, 10)}...`
      );

      localStorage.setItem(hashKey, stateHash);
      if (this.currentVaultId === 'default_vault') {
        localStorage.setItem(LAST_STATE_HASH_KEY, stateHash);
      }
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
      const res = await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundles?device=${encodeURIComponent(this.config.deviceId)}`);
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
