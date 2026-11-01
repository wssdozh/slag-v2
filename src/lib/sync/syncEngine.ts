import { storage } from '../storage';
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
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  private activeVaultKey: CryptoKey | null = null;
  private activeRoomId: string | null = null;
  private isProcessingSync = false;
  private sequence = 1;

  constructor() {
    this.config = this.loadConfig();
    this.status = {
      state: 'idle',
      lastSyncTime: null,
      pingMs: null,
      error: null,
      pendingCount: 0,
      connectedDevicesCount: 1,
      currentRoomId: null,
      subscription: this.computeSubscription(this.config),
    };
  }

  private computeSubscription(cfg: SyncConfig): SyncStatus['subscription'] {
    const isOfficial = cfg.serverUrl.includes('152.53.199.71') || cfg.serverUrl.includes('slag.app');
    const activeCount = 1 + (cfg.trustedDevices?.length || 0);

    if (isOfficial) {
      return {
        plan: 'pro',
        planLabel: 'SLAG Pro',
        expiresAt: '2027-11-12T00:00:00Z',
        expiresFormatted: '12 ноября 2027',
        maxDevices: 5,
        activeDevices: activeCount,
        isExpiringSoon: false,
      };
    }

    return {
      plan: 'self-hosted',
      planLabel: 'Self-hosted релей',
      expiresAt: null,
      expiresFormatted: 'Бессрочно',
      maxDevices: 999,
      activeDevices: activeCount,
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

  private loadConfig(): SyncConfig {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          enabled: parsed.enabled ?? true,
          serverUrl: parsed.serverUrl || DEFAULT_SERVER_URL,
          deviceId: parsed.deviceId || generateDeviceId(),
          deviceName: parsed.deviceName || 'Это устройство',
          seedPhrase: parsed.seedPhrase || generateMnemonic(12),
          autoSync: parsed.autoSync ?? true,
          trustedDevices: parsed.trustedDevices || [],
        };
      }
    } catch {
      // fallback
    }

    const initial: SyncConfig = {
      enabled: true,
      serverUrl: DEFAULT_SERVER_URL,
      deviceId: generateDeviceId(),
      deviceName: 'Мой ПК',
      seedPhrase: generateMnemonic(12),
      autoSync: true,
      trustedDevices: [],
    };
    this.saveConfig(initial);
    return initial;
  }

  public saveConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      syncLog.error('Failed to save sync config:', e);
    }
    this.notify();
  }

  public async init(): Promise<void> {
    if (!this.config.enabled) {
      this.status.state = 'idle';
      this.notify();
      return;
    }

    try {
      this.status.state = 'syncing';
      this.notify();

      this.activeVaultKey = await deriveVaultKey(this.config.seedPhrase);
      this.activeRoomId = await deriveRoomId(this.config.seedPhrase);
      this.status.currentRoomId = this.activeRoomId;

      this.connectWebSocket();
      this.startIntervals();
      await this.pushLocalChanges();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      syncLog.error('Sync init error:', msg);
      this.status.state = 'error';
      this.status.error = msg;
      this.notify();
    }
  }

  public async updateSeedPhrase(newPhrase: string): Promise<void> {
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
    if (this.ws) {
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

      this.ws.onclose = () => {
        syncLog.info('Sync WebSocket closed, retrying in 5s');
        this.status.state = 'offline';
        this.notify();
        setTimeout(() => {
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

  private async applyIncomingBundle(bundlePayload: unknown): Promise<void> {
    if (!this.activeVaultKey) return;

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

      if (bundle.fromDeviceId === this.config.deviceId) {
        return; // ignore self echo
      }

      syncLog.info(`Applying bundle ${bundle.bundleId} with ${bundle.changes.length} changes`);

      let hasItemsChanged = false;
      let hasFoldersChanged = false;
      let hasWorkspaceChanged = false;

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
          storage.saveWorkspaceState(ch.payload as WorkspaceState);
          hasWorkspaceChanged = true;
        }
      }

      if (hasItemsChanged || hasFoldersChanged) {
        storage.importVaultData({
          items: hasItemsChanged ? currentItems : undefined,
          folders: hasFoldersChanged ? currentFolders : undefined,
        });
      }

      // Send ACK back
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ack', bundleId: bundle.bundleId }));
      }

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
      this.status.state = 'error';
      this.status.error = 'Ошибка расшифровки дельты';
      this.notify();
    }
  }

  public async pushLocalChanges(): Promise<void> {
    if (this.isProcessingSync || !this.activeVaultKey || !this.activeRoomId) return;
    this.isProcessingSync = true;

    try {
      const items = storage.getItems();
      const folders = storage.getFolders();
      const workspaceState = storage.getWorkspaceState();

      const stateHash = await computeStateRootHash(items, folders);
      const lastSyncedHash = localStorage.getItem(LAST_STATE_HASH_KEY);

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
        roomId: this.activeRoomId,
        fromDeviceId: this.config.deviceId,
        sequence: this.sequence++,
        stateRootHash: stateHash,
        timestamp: new Date().toISOString(),
        changes,
      };

      const encrypted = await encryptBundle(bundle, this.activeVaultKey);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'bundle', bundle: encrypted }));
      } else {
        // Fallback HTTP push
        const cleanUrl = this.config.serverUrl.replace(/\/+$/, '');
        await fetch(`${cleanUrl}/api/rooms/${this.activeRoomId}/bundle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(encrypted),
        });
      }

      localStorage.setItem(LAST_STATE_HASH_KEY, stateHash);
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

    // Auto sync check every 15 seconds
    if (this.config.autoSync) {
      this.autoSyncInterval = setInterval(() => {
        void this.pushLocalChanges();
      }, 15000);
    }
  }

  public disconnect(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status.state = 'idle';
    this.notify();
  }

  public addTrustedDevice(device: DeviceProfile): void {
    const list = this.config.trustedDevices.filter((d) => d.id !== device.id);
    list.push(device);
    this.saveConfig({ trustedDevices: list });
  }

  public removeTrustedDevice(deviceId: string): void {
    const list = this.config.trustedDevices.filter((d) => d.id !== deviceId);
    this.saveConfig({ trustedDevices: list });
  }
}

export const syncEngine = new SyncEngine();
