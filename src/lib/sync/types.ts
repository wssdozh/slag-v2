// Shared sync types: device profile, connection state, subscription and status snapshot.
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
  allowedVaults?: string[];
}

export type SyncConnectionState = 'idle' | 'syncing' | 'connected' | 'error' | 'offline';

export interface SubscriptionInfo {
  plan: 'free' | 'smile' | 'angry' | 'self-hosted' | 'pro';
  planLabel: string;
  expiresAt: string | null;
  expiresFormatted: string;
  maxDevices: number;
  activeDevices: number;
  maxCacheMb: number;
  usedCacheMb: number;
  hasAiLease: boolean;
  isExpiringSoon?: boolean;
}

/**
 * One other device's root as the last check saw it.
 *
 * `deviceId: null` is an old client: the relay cannot name it, nobody can be asked through it, and
 * its row never updates again. `extra`/`missing` stay empty when that peer sent no leaves — there
 * is nothing to name.
 */
export interface ManifestPeerStatus {
  deviceId: string | null;
  /** True for the room's frozen single row: compared, never acted on. */
  anonymous: boolean;
  /** When the relay saved this report, not when the device was last online. */
  at?: number | null;
  root: string;
  inSync: boolean;
  extra: string[];
  missing: string[];
}

/**
 * Is the only disagreement the one with a client nobody can name?
 *
 * Such a row is the room's old single manifest: it stopped updating the day the room started
 * keeping one row per device, its root is somebody else's forever, and no resend can help. The
 * panel says "no data about the peer" about that instead of calling the vaults diverged.
 */
export function anonymousOnlyDrift(peers: ManifestPeerStatus[]): boolean {
  let anonymous = false;
  for (const peer of peers) {
    if (peer.inSync) continue;
    if (!peer.anonymous) return false;
    anonymous = true;
  }
  return anonymous;
}

/**
 * The last manifest check: this device's root, the room's roots, and what was done about them.
 *
 * `remoteRoot: null` means the room had nothing to answer with — not "we agree". `action` is the
 * decision the engine took: `none` or `report` (a named peer snapshot differs).
 * `trigger` says what started this check, because "сходится" after a button press and after a
 * silent pass at start-up are different promises to a person.
 */
export interface ManifestStatus {
  at: string;
  root: string;
  /** The first diverged peer's root, or the first peer's when they all agree. */
  remoteRoot: string | null;
  inSync: boolean;
  folders: string[];
  /** Notes this device holds and the room does not. Empty when the peer sent no leaves. */
  extra: string[];
  /** Notes the room holds and this device does not. Empty when the peer sent no leaves. */
  missing: string[];
  action: 'none' | 'report';
  trigger: ManifestTrigger;
  /** Every peer this check saw, one line each. Empty when no other device has published. */
  peers: ManifestPeerStatus[];
}

/** What started a manifest check. */
export type ManifestTrigger = 'start' | 'push' | 'manual';

export interface SyncStatus {
  initialSync: { vaultId: string; state: 'idle' | 'loading' | 'ready' | 'error'; processed: number; rejected: number };
  state: SyncConnectionState;
  authRequired: boolean;
  isAuthenticated: boolean;
  lastSyncTime: string | null;
  pingMs: number | null;
  error: string | null;
  pendingCount: number;
  connectedDevicesCount: number;
  currentRoomId: string | null;
  subscription: SubscriptionInfo;
  manifest?: ManifestStatus;
  registry?: {
    relayHead: number | null;
    appliedThrough: number;
    application: 'error' | 'catching-up' | 'current';
    media: 'legacy' | 'waiting' | 'applying' | 'error' | 'applied-through-cursor';
  };
}

export interface SyncConfig {
  enabled: boolean;
  serverUrl: string;
  deviceId: string;
  deviceName: string;
  seedPhrase: string;
  autoSync: boolean;
  subscriptionPlan?: 'free' | 'smile' | 'angry';
  bgSyncIntervalMinutes?: 0 | 10 | 30;
  localSyncMode?: DeviceSyncMode;
  canRunAiLease?: boolean;
  trustedDevices: DeviceProfile[];
}

/** A device asking the room for a file whose metadata it holds but whose bytes never landed. */
export interface AttachmentRequestPayload {
  attachmentId: string;
  name: string;
  size: number;
  relativePath: string;
}

/**
 * The owner's words for the assistant: the instructions and the persona.
 *
 * It rides every push instead of the workspace bundle, because the workspace is deduped and a
 * device that joins the room after that bundle was acked would never receive it. Timestamps let
 * a device that missed the last edit lose the field to the newer copy instead of clobbering it.
 */
export interface AssistantPromptPayload {
  prompt: string;
  persona: string;
  personaEnabled: boolean;
  promptAt: number;
  personaAt: number;
}

export interface SyncChangeItem {
  id: string;
  type: 'item' | 'folder' | 'workspace' | 'assistant_prompt' | 'attachment' | 'attachment_request' | 'trash' | 'draft' | 'memory';
  action: 'upsert' | 'delete' | 'rename' | 'restore' | 'purge';
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

export interface PairingExchangePayload {
  /** Legacy self-hosted pairing only. Account pairing never sends the account seed. */
  seedPhrase?: string;
  encryptedKey?: string;
  mode?: DeviceSyncMode;
  vaultId: string;
  vaultName: string;
  hostDeviceId?: string;
  hostDeviceName?: string;
  hostPlatform?: 'desktop' | 'mobile' | 'web';
  allowedVaults?: string[];
}

export interface PairingPollResult {
  sessionId: string;
  status: 'pending_guest' | 'pending_approval' | 'approved' | 'rejected';
  sasCode?: string;
  guestDeviceId?: string;
  exchangePayload?: string;
  expiresIn: number;
}
