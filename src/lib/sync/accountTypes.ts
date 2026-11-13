// Shapes of the relay account API: plans, devices, vault grants and invitations.
import type { DeviceSyncMode } from './types';

export interface AccountInfo {
  id: string;
  accountId?: string;
  publicKey?: string;
  plan: 'free' | 'smile' | 'angry' | 'self-hosted' | 'pro';
  planLabel: string;
  expiresAt: string | null;
  maxDevices: number;
  maxCacheMb: number;
  usedCacheMb: number;
  hasAiLease: boolean;
  createdAt?: string;
}

export interface AccountDevice {
  id: string;
  name: string;
  platform: 'desktop' | 'mobile' | 'web';
  publicKey: string;
  status: 'active' | 'pending' | 'revoked';
  createdAt?: string;
  approvedAt?: string | null;
  lastSeenAt?: string | null;
  isCurrent?: boolean;
}

export interface VaultGrant {
  deviceId: string;
  mode: DeviceSyncMode;
  status: 'pending' | 'accepted' | 'revoked';
}

export interface AccountVault {
  id: string;
  name: string;
  ownerAccountId: string;
  grants: VaultGrant[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultInvitation {
  id: string;
  name: string;
  vaultId: string;
  vaultName: string;
  mode: DeviceSyncMode;
  encryptedKey: string;
  invitedBy?: string;
  createdAt?: string;
}

export interface AccountSession {
  token: string;
  accountId: string;
  deviceId: string;
  account?: AccountInfo;
  device?: AccountDevice;
  serverUrl?: string;
}

/** One telegram recipient of a reminder. The relay matches the token to a chat, never to an account. */
export interface NotifyArmRoute {
  token: string;
  title: string;
  body: string;
}

export interface NotifyArmPayload {
  vaultId: string;
  itemKey: string;
  /** null cancels every pending job of this item. */
  eventKey: string | null;
  /** UNIX seconds; null on a cancel. */
  fireAt: number | null;
  routes: NotifyArmRoute[];
}

export type NotifyDropReason = 'not_linked' | 'blocked';

export interface NotifyArmResult {
  armed: number;
  dropped: { token: string; reason: NotifyDropReason }[];
}

/** A one-time code the recipient redeems in the bot, so binding always starts on their side. */
export interface NotifyInvite {
  /** What the human types into the bot. Never used as a delivery token. */
  code: string;
  /** The opaque delivery token this vault arms jobs with. */
  routeToken: string;
  link: string | null;
  expiresAt: string | number;
  expiresIn: number;
}

export interface AccountState {
  session: AccountSession | null;
  account: AccountInfo | null;
  devices: AccountDevice[];
  vaults: AccountVault[];
  invitations: VaultInvitation[];
  authRequired: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AccountDeviceInput {
  id: string;
  name: string;
  platform: 'desktop' | 'mobile' | 'web';
  publicKey: string;
}

export interface LocalDeviceIdentity {
  deviceId: string;
  name: string;
  platform: 'desktop' | 'mobile' | 'web';
  publicKey: string;
}

export type AccountLoginResult = 'authenticated' | 'pending_device';
