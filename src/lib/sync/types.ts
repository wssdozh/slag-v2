export type DeviceSyncMode = 'read-write' | 'receive-only';

export interface DeviceProfile {
  id: string;
  name: string;
  platform: 'desktop' | 'mobile' | 'web';
  isCurrent: boolean;
  syncMode?: DeviceSyncMode;
  canRunAiLease?: boolean;
  publicKey?: string;
  pairedAt: string;
  lastSeenAt: string;
}

export type SyncConnectionState = 'idle' | 'syncing' | 'connected' | 'error' | 'offline';

export interface SubscriptionInfo {
  plan: 'pro' | 'free' | 'self-hosted';
  planLabel: string;
  expiresAt: string | null;
  expiresFormatted: string;
  maxDevices: number;
  activeDevices: number;
  isExpiringSoon?: boolean;
}

export interface SyncStatus {
  state: SyncConnectionState;
  lastSyncTime: string | null;
  pingMs: number | null;
  error: string | null;
  pendingCount: number;
  connectedDevicesCount: number;
  currentRoomId: string | null;
  subscription: SubscriptionInfo;
}

export interface SyncConfig {
  enabled: boolean;
  serverUrl: string;
  deviceId: string;
  deviceName: string;
  seedPhrase: string;
  autoSync: boolean;
  localSyncMode?: DeviceSyncMode;
  canRunAiLease?: boolean;
  trustedDevices: DeviceProfile[];
}

export interface SyncChangeItem {
  id: string;
  type: 'item' | 'folder' | 'workspace' | 'attachment';
  action: 'upsert' | 'delete';
  version: number;
  hash: string;
  payload?: unknown;
}

export interface SyncBundle {
  bundleId: string;
  roomId: string;
  fromDeviceId: string;
  sequence: number;
  stateRootHash: string;
  timestamp: string;
  changes: SyncChangeItem[];
}

export interface EncryptedBundle {
  bundleId: string;
  fromDeviceId: string;
  sequence: number;
  timestamp: string;
  iv: string; // Base64
  ciphertext: string; // Base64
}

export interface PairingSessionData {
  pin: string;
  sessionId: string;
  expiresIn: number;
  hostDeviceId: string;
  hostPublicKey: string;
  qrPayload: string;
}

export interface PairingClaimResult {
  sessionId: string;
  sasCode: string;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export interface PairingPollResult {
  sessionId: string;
  status: 'pending_guest' | 'pending_approval' | 'approved' | 'rejected';
  sasCode?: string;
  exchangePayload?: string;
  expiresIn: number;
}
