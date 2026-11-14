// Shapes of the relay account API: plans, devices, vault grants and invitations.
import type { AssistantMode, SuggestedAction } from '../../types';
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
  /** Which template the relay renders: a timed reminder or the daily overdue ping. */
  kind: 'task' | 'overdue';
  /** The deadline in the sender's own words, e.g. `13 нояб., 14:30`. Empty when there is none. */
  stamp: string;
  /** Wrap the body in a tap-to-reveal spoiler. */
  spoiler: boolean;
  /** Minutes east of UTC on the arming device: the relay refuses to move a job across zones. */
  tz: number;
  routes: NotifyArmRoute[];
}

export type NotifyDropReason = 'not_linked' | 'blocked';

/** What the relay knows about one channel. Unknown and foreign both answer `pending`. */
export interface NotifyChannelState {
  state: 'pending' | 'active' | 'blocked';
}

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

/** Opts one telegram channel into the question/answer path at a chosen depth. */
export interface AssistantLinkPayload {
  vaultId: string;
  routeToken: string;
  enabled: boolean;
  /** Ignored when `enabled` is false; defaults to `minimal` on the relay. */
  mode?: AssistantMode;
}

/**
 * The card an action wears, worded on the device that answered: the relay only escapes and
 * joins these lines, and the app renders the same descriptor as the confirmation card.
 */
export interface AssistantActionCard {
  /** `Черновик таски`, an owner-written label, or `Обновление записи`. */
  kind: string;
  folder: string;
  title: string;
  /** `пн, 16 ноя`; empty when the action carries no deadline. */
  due: string;
  priority: 'none' | 'low' | 'medium' | 'high';
  /** The button's caption: `Сохранить`, `Запланировать`, `Применить (3)`. */
  actionLabel: string;
}

/**
 * The action a model offered, packed so the relay can put it on a button.
 * `payload` is opaque to the relay: it is echoed back untouched when the person taps.
 */
export interface AssistantActionPayload {
  id: string;
  /** Button caption. */
  label: string;
  /** One line for a human: what exactly the button will touch. */
  summary: string;
  /** Absent on an answer from a device too old to word a card: then no card is drawn. */
  card?: AssistantActionCard;
  payload: SuggestedAction;
}

export interface AssistantAnswerPayload {
  vaultId: string;
  requestId: string;
  answer: string;
  /** Absent when the model proposed nothing: then the answer carries no button. */
  action?: AssistantActionPayload;
}

/** What the tapped button ended up doing. Sent even on failure, or the button outlives the tap. */
export interface AssistantAppliedPayload {
  vaultId: string;
  requestId: string;
  ok: boolean;
  /** One short line for a human: what was created or changed, or why it did not happen. */
  text: string;
}

export interface AssistantAppliedResult {
  /** `already` when another device answered the same tap first; `gone` when the request expired. */
  reason?: 'already' | 'gone';
}

/** What the relay holds while a question waits: the text a reconnecting device needs. */
export interface AssistantPendingRequest {
  requestId: string;
  question: string;
  mode: AssistantMode;
  /** UNIX seconds; the device must answer before this or say nothing. */
  expiresAt: number;
}

export interface AssistantAnswerResult {
  delivered: boolean;
  /** `already` when another device won the race; the answer is dropped, not retried. */
  reason?: 'already' | 'gone';
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
