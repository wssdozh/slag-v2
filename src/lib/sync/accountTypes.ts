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
  allowAttachments: boolean;
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
