// The websocket link to the relay: connect, heartbeat, reconnect, route incoming bundles.
import { logger } from '../logger/logger';
import { accountClient } from './account';
import { SYNC_INTERVALS } from '../../config';
import type { SyncConnectionState } from './types';

const syncLog = logger.scope('SYNC');

export interface TransportCallbacks {
  onStatus: (state: SyncConnectionState, error: string | null) => void;
  onConnectedDevicesCount?: (count: number) => void;
  onBinarySupport?: (supported: boolean) => void;
  onPing?: (pingMs: number) => void;
  onServerAck?: (bundleId: string) => void;
  onBundle: (bundlePayload: unknown) => Promise<void> | void;
  /** The bot got a question: answer it from this device, or nobody will. */
  onAssistantQuestion?: (requestId: string, question: string) => Promise<void> | void;
  onCatchUpPull?: () => void;
  onAuthRejected?: () => void;
}

export interface TransportOptions {
  serverUrl: string;
  deviceId: string;
  vaultId: string;
  roomId: string;
  enabled: boolean;
}

export interface SendAckOptions {
  bundleId: string;
  roomId: string | null;
  serverUrl: string;
  vaultId: string;
  deviceId: string;
  authHeaders: (includeJson?: boolean) => Record<string, string>;
}

export class SyncTransport {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private currentOptions: TransportOptions | null = null;
  private callbacks: TransportCallbacks;

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks;
  }

  public getWebSocket(): WebSocket | null {
    return this.ws;
  }

  public setWebSocket(ws: WebSocket | null): void {
    this.ws = ws;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public send(data: string | Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data instanceof Uint8Array ? data.slice().buffer : data);
    }
  }

  public async sendAck(options: SendAckOptions): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ack', bundleId: options.bundleId }));
      syncLog.info(`ACK sent for bundle ${options.bundleId}`);
      return;
    }
    const roomId = options.roomId;
    if (!roomId) return;
    const serverUrl = options.serverUrl.replace(/\/+$/, '');
    const response = await fetch(`${serverUrl}/api/rooms/${roomId}/ack?vault=${encodeURIComponent(options.vaultId)}`, {
      method: 'POST',
      headers: options.authHeaders(true),
      body: JSON.stringify({ deviceId: options.deviceId, bundleIds: [options.bundleId] }),
    });
    if (!response.ok) throw new Error(`Sync ACK failed: HTTP ${response.status}`);
  }

  public connect(options: TransportOptions): void {
    this.currentOptions = options;
    this.clearReconnectTimeout();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    if (!options.enabled || !options.roomId) return;

    try {
      const baseWsUrl = options.serverUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/+$/, '');
      const authParams = new URLSearchParams({
        device: options.deviceId,
        vault: options.vaultId,
      });
      const token = accountClient.getToken(options.serverUrl);
      if (token) authParams.set('token', token);
      const fullWsUrl = `${baseWsUrl}/ws/${options.roomId}?${authParams.toString()}`;

      syncLog.info(`Connecting sync WS for vault ${options.vaultId}`);
      this.ws = new WebSocket(fullWsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        syncLog.info('Sync WebSocket connected');
        this.callbacks.onStatus('connected', null);
      };

      this.ws.onmessage = async (event: MessageEvent) => {
        await this.handleIncomingMessage(typeof event.data === 'string' ? event.data : String(event.data));
      };

      this.ws.onerror = () => {
        syncLog.warn('Sync WebSocket connection error');
        this.callbacks.onStatus('error', 'Сбой подключения к релею');
      };

      this.ws.onclose = (event: CloseEvent | { code: number; reason?: string }) => {
        this.ws = null;
        if (event.code === 1008 || event.code === 4401 || event.code === 4403) {
          this.disconnect();
          this.callbacks.onStatus('error', 'Соединение отклонено сервером. Проверьте вход и доступ к хранилищу');
          this.callbacks.onAuthRejected?.();
          return;
        }
        const retryMs = Math.min(
          SYNC_INTERVALS.RECONNECT_BASE_MS * 2 ** Math.min(this.reconnectAttempts++, SYNC_INTERVALS.RECONNECT_MAX_EXPONENT),
          SYNC_INTERVALS.RECONNECT_MAX_MS
        );
        syncLog.info(`Sync WebSocket closed (code ${event.code}${event.reason ? `, reason: ${event.reason.slice(0, 120)}` : ''}), retrying in ${retryMs}ms`);
        this.callbacks.onStatus('offline', null);
        this.callbacks.onCatchUpPull?.();
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (this.currentOptions && this.currentOptions.enabled && this.currentOptions.roomId) {
            this.connect(this.currentOptions);
          }
        }, retryMs);
      };
    } catch (e) {
      syncLog.error('WebSocket spawn error:', e);
      this.callbacks.onStatus('error', null);
    }
  }

  public async handleIncomingMessage(data: string): Promise<void> {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'welcome') {
        if (typeof msg.connectedDevices === 'number') {
          this.callbacks.onConnectedDevicesCount?.(msg.connectedDevices);
        } else {
          this.callbacks.onConnectedDevicesCount?.(1);
        }
        // Relay advertises the binary uplink frame; older relays simply omit it.
        this.callbacks.onBinarySupport?.(msg.binary === true);
        // Catch up on anything missed while the socket was down: connect is the only
        // moment a full pull is mandatory now that push no longer pulls first.
        this.callbacks.onCatchUpPull?.();
      } else if (msg.type === 'server_ack' && typeof msg.bundleId === 'string') {
        this.callbacks.onServerAck?.(msg.bundleId);
      } else if (msg.type === 'pong') {
        const now = Date.now();
        if (msg.ts) {
          const pingMs = Math.max(1, now - msg.ts * 1000);
          this.callbacks.onPing?.(pingMs);
        }
      } else if (msg.type === 'bundle') {
        await this.callbacks.onBundle(msg.bundle);
      } else if (msg.type === 'assistant_question' && typeof msg.id === 'string') {
        await this.callbacks.onAssistantQuestion?.(msg.id, typeof msg.question === 'string' ? msg.question : '');
      } else if (msg.type === 'error') {
        syncLog.warn(`Relay refused a message: ${msg.code ?? 'unknown'}`);
      }
    } catch (e) {
      syncLog.error('Failed to parse incoming message:', e);
    }
  }

  public disconnect(): void {
    this.clearReconnectTimeout();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}
