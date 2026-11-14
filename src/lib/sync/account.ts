// The sync account: session and sign-in, what the plan is, and the device identity it is bound to.
import { generateAccountIdentity, renameStoredDevice, signDeviceChallenge } from './accountCrypto';
import type {
  AccountDevice,
  AccountDeviceInput,
  AccountInfo,
  AccountLoginResult,
  LocalDeviceIdentity,
  AccountSession,
  AccountState,
  AccountVault,
  AssistantAnswerPayload,
  AssistantAnswerResult,
  AssistantAppliedPayload,
  AssistantAppliedResult,
  AssistantLinkPayload,
  AssistantPendingRequest,
  NotifyArmPayload,
  NotifyArmResult,
  NotifyChannelState,
  NotifyInvite,
} from './accountTypes';
import type { DeviceSyncMode } from './types';
import { logger } from '../logger/logger';
import {
  DEFAULT_SYNC_SERVER_URL,
  SYNC_INTERVALS,
} from '../../config';
import { deleteSecret, getCachedSecret, SECRET_KEYS, setSecret } from '../platform/secretStore';

const accountLog = logger.scope('SYNC');

const DEFAULT_SERVER_URL = DEFAULT_SYNC_SERVER_URL;
const POLL_INTERVAL_MS = SYNC_INTERVALS.POLL_INTERVAL_MS;

interface AuthResponse {
  token?: string;
  status?: string;
  account?: AccountInfo;
  device?: AccountDevice;
  requestId?: string;
  continuationSecret?: string;
  expiresAt?: string;
}

interface PendingLogin {
  requestId: string;
  continuationSecret: string;
  accountId: string;
  deviceId: string;
  serverUrl: string;
  expiresAt: string;
}

interface AccountResponse {
  account: AccountInfo;
  devices: AccountDevice[];
}

interface ServerVaultInvitation {
  id: string;
  name: string;
  vaultId?: string;
  vaultName?: string;
  mode: DeviceSyncMode;
  encryptedKey: string;
  invitedBy?: string;
  createdAt?: string;
}

interface VaultsResponse {
  vaults: AccountVault[];
  invitations: ServerVaultInvitation[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeServerUrl(serverUrl: string): string {
  const normalized = serverUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('Server URL is required');
  return normalized;
}

function requireSecureAccountTransport(serverUrl: string): void {
  const url = new URL(serverUrl);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return;
  // ponytail: temporary public HTTP acceptance testing; remove before release and require HTTPS.
  if (url.origin === 'http://152.53.199.71:8320') return;
  // The headless node can sit behind a plain-TCP tunnel (bore) where TLS is not ours to add.
  // The app never sets this, so a browser still refuses plain HTTP.
  if (typeof process !== 'undefined' && process.env?.SLAG_ALLOW_INSECURE_RELAY === '1') return;
  throw new Error('Для входа в аккаунт нужен HTTPS. HTTP временно разрешён только для тестового сервера SLAG.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseError(data: unknown, status: number, statusText: string): string {
  if (typeof data === 'string' && data.trim()) return data;
  if (isRecord(data)) {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    if (isRecord(data.error) && typeof data.error.message === 'string') return data.error.message;
  }
  return `Request failed: ${status} ${statusText}`.trim();
}

function loadSession(): AccountSession | null {
  const raw = getCachedSecret(SECRET_KEYS.accountSession);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    void deleteSecret(SECRET_KEYS.accountSession).catch(() => undefined);
    throw new Error('Stored account session is not valid JSON', { cause: error });
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.token !== 'string' ||
    !parsed.token ||
    typeof parsed.accountId !== 'string' ||
    typeof parsed.deviceId !== 'string'
  ) {
    void deleteSecret(SECRET_KEYS.accountSession).catch(() => undefined);
    throw new Error('Stored account session is invalid');
  }
  return parsed as unknown as AccountSession;
}

class AccountClient {
  private state: AccountState;
  private session: AccountSession | null;
  private serverUrl: string;
  private listeners = new Set<(state: AccountState) => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private loadingCount = 0;
  private pendingLogin: PendingLogin | null = null;

  constructor() {
    let session: AccountSession | null = null;
    let startupError: string | null = null;
    try {
      session = loadSession();
    } catch (error) {
      startupError = errorMessage(error);
    }
    this.session = session;
    this.serverUrl = session && session.serverUrl ? session.serverUrl : DEFAULT_SERVER_URL;
    this.state = {
      session,
      account: session && session.account ? session.account : null,
      devices: [],
      vaults: [],
      invitations: [],
      authRequired: true,
      isLoading: false,
      error: startupError,
    };
  }

  getSession(): AccountSession | null {
    return this.session ? { ...this.session } : null;
  }

  getToken(serverUrl = this.serverUrl): string | null {
    return this.session && this.session.serverUrl === normalizeServerUrl(serverUrl) ? this.session.token : null;
  }

  get token(): string | null {
    return this.getToken();
  }

  get authHeader(): string | null {
    const token = this.getToken();
    return token ? `Bearer ${token}` : null;
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  getState(): AccountState {
    return {
      ...this.state,
      session: this.getSession(),
      devices: [...this.state.devices],
      vaults: [...this.state.vaults],
      invitations: [...this.state.invitations],
    };
  }

  subscribe(listener: (state: AccountState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private patch(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.loadingCount++;
    this.patch({ isLoading: true, error: null });
    try {
      return await operation();
    } catch (error) {
      this.patch({ error: errorMessage(error) });
      throw error;
    } finally {
      this.loadingCount--;
      this.patch({ isLoading: this.loadingCount > 0 });
    }
  }

  private writeSession(session: AccountSession): Promise<void> {
    return setSecret(SECRET_KEYS.accountSession, JSON.stringify(session));
  }

  private async setSession(session: AccountSession): Promise<void> {
    this.session = session;
    await this.writeSession(session);
    this.patch({
      session,
      account: session.account ? session.account : null,
      devices: session.device ? [session.device] : [],
      vaults: [],
      invitations: [],
    });
  }

  private async clearSession(): Promise<void> {
    await deleteSecret(SECRET_KEYS.accountSession);
    this.session = null;
    this.patch({ session: null, account: null, devices: [], vaults: [], invitations: [] });
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = true
  ): Promise<T> {
    const token = authenticated ? this.getToken() : null;
    if (authenticated && !token) throw new Error('Authentication required');
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (token) {
      requireSecureAccountTransport(this.serverUrl);
      headers.set('Authorization', `Bearer ${token}`);
    }
    // A relay that accepts the request and then says nothing used to hold the caller forever:
    // the sync status stayed "syncing" and the sidebar spinner span all session.
    const response = await fetch(`${this.serverUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (response.status === 401 && authenticated && this.getToken() === token) {
      await this.clearSession();
    }
    if (!response.ok) throw new Error(responseError(data, response.status, response.statusText));
    return data as T;
  }

  async detectServer(serverUrl: string): Promise<boolean> {
    this.serverUrl = normalizeServerUrl(serverUrl);
    return this.run(async () => {
      const health = await this.request<unknown>('/health', {}, false);
      if (!isRecord(health) || typeof health.authRequired !== 'boolean') {
        throw new Error('Server health response does not contain authRequired');
      }
      this.patch({ authRequired: health.authRequired });
      return health.authRequired;
    });
  }

  private async authenticate(
    path: '/api/auth/register' | '/api/auth/login',
    seed: string,
    serverUrl: string,
    device: LocalDeviceIdentity
  ): Promise<AccountLoginResult> {
    this.serverUrl = normalizeServerUrl(serverUrl);
    requireSecureAccountTransport(this.serverUrl);
    return this.run(async () => {
      const identity = await generateAccountIdentity(seed);
      const challengeResponse = await this.request<unknown>(
        '/api/auth/challenge',
        {
          method: 'POST',
          body: JSON.stringify({ accountId: identity.accountId }),
        },
        false
      );
      if (!isRecord(challengeResponse) || typeof challengeResponse.challenge !== 'string') {
        throw new Error('Server response does not contain a challenge');
      }
      const challenge = challengeResponse.challenge;
      const deviceInput: AccountDeviceInput = {
        id: device.deviceId,
        name: device.name,
        platform: device.platform,
        publicKey: device.publicKey,
      };
      const auth = await this.request<AuthResponse>(
        path,
        {
          method: 'POST',
          body: JSON.stringify({
            accountId: identity.accountId,
            publicKey: identity.publicKey,
            challenge,
            signature: identity.signChallenge(challenge),
            deviceSignature: signDeviceChallenge(device.deviceId, challenge),
            device: deviceInput,
          }),
        },
        false
      );
      if (!auth || typeof auth.token !== 'string' || !auth.token) {
        if (auth && auth.status === 'pending_device') {
          await this.clearSession();
          if (typeof auth.requestId !== 'string' || typeof auth.continuationSecret !== 'string' || typeof auth.expiresAt !== 'string') {
            throw new Error('Сервер не поддерживает автоматическое подтверждение входа. Обновите сервер.');
          }
          this.pendingLogin = { requestId: auth.requestId, continuationSecret: auth.continuationSecret, expiresAt: auth.expiresAt,
            accountId: identity.accountId, deviceId: device.deviceId, serverUrl: this.serverUrl };
          accountLog.info('Device approval requested', { deviceId: device.deviceId });
          return 'pending_device';
        }
        throw new Error('Server response does not contain an authentication token');
      }

      await renameStoredDevice(device.deviceId, device.name);
      await this.setSession({
        token: auth.token,
        accountId: identity.accountId,
        deviceId: device.deviceId,
        account: auth.account,
        device: auth.device,
        serverUrl: this.serverUrl,
      });
      await this.fetchRemoteState();
      return 'authenticated';
    });
  }

  cancelPendingLogin(): void {
    this.pendingLogin = null;
  }

  async completePendingLogin(): Promise<'pending' | 'authenticated' | 'expired' | 'rejected'> {
    const pending = this.pendingLogin;
    if (!pending) return 'expired';
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      this.cancelPendingLogin();
      return 'expired';
    }
    this.serverUrl = pending.serverUrl;
    requireSecureAccountTransport(this.serverUrl);
    const challenge = await this.request<{ challenge: string }>('/api/auth/challenge', {
      method: 'POST', body: JSON.stringify({ accountId: pending.accountId }),
    }, false);
    if (typeof challenge.challenge !== 'string') throw new Error('Сервер не вернул challenge');
    const auth = await this.request<AuthResponse>(`/api/auth/device-requests/${encodeURIComponent(pending.requestId)}/complete`, {
      method: 'POST', body: JSON.stringify({ continuationSecret: pending.continuationSecret,
        challenge: challenge.challenge, deviceSignature: signDeviceChallenge(pending.deviceId, challenge.challenge) }),
    }, false);
    if (this.pendingLogin !== pending) return 'expired';
    if (auth.status === 'pending') return 'pending';
    if (auth.status === 'expired' || auth.status === 'rejected') {
      this.cancelPendingLogin();
      return auth.status;
    }
    if (typeof auth.token !== 'string' || !auth.token) throw new Error('Сервер не вернул сессию после подтверждения');
    this.cancelPendingLogin();
    accountLog.info('Device approval completed', { deviceId: pending.deviceId });
    if (auth.device) await renameStoredDevice(pending.deviceId, auth.device.name);
    await this.setSession({ token: auth.token, accountId: pending.accountId, deviceId: pending.deviceId,
      account: auth.account, device: auth.device, serverUrl: pending.serverUrl });
    await this.fetchRemoteState();
    return 'authenticated';
  }

  register(
    seed: string,
    serverUrl: string,
    device: LocalDeviceIdentity
  ): Promise<AccountLoginResult> {
    return this.authenticate('/api/auth/register', seed, serverUrl, device);
  }

  login(
    seed: string,
    serverUrl: string,
    device: LocalDeviceIdentity
  ): Promise<AccountLoginResult> {
    return this.authenticate('/api/auth/login', seed, serverUrl, device);
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      await this.run(() => this.request<void>('/api/auth/logout', { method: 'POST' }));
    } finally {
      await this.clearSession();
    }
  }

  private async fetchRemoteState(): Promise<void> {
    const session = this.session;
    if (!session) {
      this.patch({ account: null, devices: [], vaults: [], invitations: [] });
      return;
    }
    if (!this.getToken()) return;
    const serverUrl = this.serverUrl;
    const [accountResponse, vaultsResponse] = await Promise.all([
      this.request<AccountResponse>('/api/account'),
      this.request<VaultsResponse>('/api/vaults'),
    ]);
    if (!this.session || this.session.token !== session.token || this.serverUrl !== serverUrl) return;
    if (
      !accountResponse ||
      !Array.isArray(accountResponse.devices) ||
      !vaultsResponse ||
      !Array.isArray(vaultsResponse.vaults) ||
      !Array.isArray(vaultsResponse.invitations)
    ) {
      throw new Error('Server returned an invalid account state');
    }
    const currentDevice = accountResponse.devices.find((device) => device.id === session.deviceId);
    const nextSession: AccountSession = {
      ...session,
      account: accountResponse.account,
      device: currentDevice ?? session.device,
      serverUrl: this.serverUrl,
    };
    this.session = nextSession;
    await this.writeSession(nextSession);
    this.patch({
      session: nextSession,
      account: accountResponse.account,
      devices: accountResponse.devices,
      vaults: vaultsResponse.vaults,
      invitations: vaultsResponse.invitations.map((invitation) => ({
        ...invitation,
        vaultId: invitation.vaultId ?? invitation.id,
        vaultName: invitation.vaultName ?? invitation.name,
      })),
    });
  }

  refresh(): Promise<void> {
    return this.run(() => this.fetchRemoteState());
  }

  startPolling(serverUrl: string): void {
    this.serverUrl = normalizeServerUrl(serverUrl);
    this.stopPolling();
    const poll = (): void => {
      if (!this.session) return;
      void this.refresh().catch((error: unknown) => {
        this.patch({ error: errorMessage(error) });
      });
    };
    poll();
    this.pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async mutate(path: string, init: RequestInit): Promise<void> {
    const label = `${(init.method ?? 'GET').toUpperCase()} ${path}`;
    try {
      await this.run(() => this.request<void>(path, init));
      await this.refresh();
    } catch (error) {
      accountLog.error(`Account mutation failed: ${label}`, { error: errorMessage(error) });
      throw error;
    }
  }

  approveDevice(deviceId: string): Promise<void> {
    accountLog.info('Device request approved', { deviceId });
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}/approve`, {
      method: 'POST',
    });
  }

  restoreDevice(deviceId: string): Promise<void> {
    accountLog.info('Revoked device restored', { deviceId });
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}/approve`, {
      method: 'POST',
    });
  }

  async renameDevice(deviceId: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean || clean.length > 64) throw new Error('Имя устройства должно содержать от 1 до 64 символов');
    await this.mutate(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH', body: JSON.stringify({ name: clean }),
    });
    accountLog.info('Device renamed', { deviceId });
    if (this.session && this.session.deviceId === deviceId) await renameStoredDevice(deviceId, clean);
  }

  revokeDevice(deviceId: string): Promise<void> {
    accountLog.warn('Device access revoked', { deviceId });
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });
  }

  forgetDevice(deviceId: string): Promise<void> {
    accountLog.warn('Device forgotten permanently', { deviceId });
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}?purge=1`, {
      method: 'DELETE',
    });
  }

  /**
   * The profile name, mirrored to the account.
   *
   * It really lives in the vault (the whole point of the profile block), but the telegram bot
   * greets a person in `/start` and the relay cannot read an encrypted vault. One short string,
   * set by hand in settings, is the cheapest thing that makes that greeting human.
   */
  setProfileName(name: string): Promise<void> {
    const clean = name.trim().slice(0, 64);
    return this.mutate('/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: clean }),
    });
  }

  registerVault(vaultId: string, name: string): Promise<void> {
    return this.mutate(`/api/vaults/${encodeURIComponent(vaultId)}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  }

  grantVault(
    vaultId: string,
    deviceId: string,
    mode: DeviceSyncMode,
    encryptedKey: string
  ): Promise<void> {
    return this.mutate(
      `/api/vaults/${encodeURIComponent(vaultId)}/grants/${encodeURIComponent(deviceId)}`,
      { method: 'PUT', body: JSON.stringify({ mode, encryptedKey }) }
    );
  }

  acceptVault(vaultId: string): Promise<void> {
    return this.mutate(`/api/vaults/${encodeURIComponent(vaultId)}/accept`, { method: 'POST' });
  }

  declineVault(vaultId: string): Promise<void> {
    return this.mutate(`/api/vaults/${encodeURIComponent(vaultId)}/decline`, { method: 'POST' });
  }

  revokeVaultGrant(vaultId: string, deviceId: string): Promise<void> {
    return this.mutate(
      `/api/vaults/${encodeURIComponent(vaultId)}/grants/${encodeURIComponent(deviceId)}`,
      { method: 'DELETE' }
    );
  }

  /**
   * A one-time code the recipient redeems in the bot. Binding starts on their
   * side, so a paying account cannot push messages to a stranger.
   */
  requestNotifyInvite(vaultId: string): Promise<NotifyInvite> {
    return this.request<NotifyInvite>('/api/notify/invite', {
      method: 'POST',
      body: JSON.stringify({ vaultId }),
    });
  }

  armNotifications(payload: NotifyArmPayload): Promise<NotifyArmResult> {
    return this.request<NotifyArmResult>('/api/notify/arm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** Has the recipient opened the bot yet? The invite dialog asks until the answer is `active`. */
  notifyStatus(vaultId: string, routeToken: string): Promise<NotifyChannelState> {
    // A delivery token is a capability: it goes in the body, where proxies and access logs do
    // not keep it, instead of a query string.
    return this.request<NotifyChannelState>('/api/notify/status', {
      method: 'POST',
      body: JSON.stringify({ vaultId, routeToken }),
    });
  }

  /** Opts a bound channel into the question/answer path at the chosen depth. */
  setAssistantLink(payload: AssistantLinkPayload): Promise<{ enabled: boolean; mode: string }> {
    return this.request<{ enabled: boolean; mode: string }>('/api/assistant/enable', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** Hands the answer back to the relay, which forwards it to the chat that asked. */
  answerAssistant(payload: AssistantAnswerPayload): Promise<AssistantAnswerResult> {
    return this.request<AssistantAnswerResult>('/api/assistant/answer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Reports what a tapped button did. The relay edits its own message with this line, so a
   * failure has to travel too: silence would leave a button that can be tapped forever.
   */
  appliedAssistant(payload: AssistantAppliedPayload): Promise<AssistantAppliedResult> {
    return this.request<AssistantAppliedResult>('/api/assistant/applied', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** Questions the relay is still holding: what a device missed while its socket was down. */
  pendingAssistant(vaultId: string): Promise<{ requests: AssistantPendingRequest[] }> {
    const query = new URLSearchParams({ vaultId });
    return this.request<{ requests: AssistantPendingRequest[] }>(`/api/assistant/pending?${query.toString()}`);
  }
}

export const accountClient = new AccountClient();
export { generateMnemonic } from './crypto';
export type {
  AccountDevice,
  AccountDeviceInput,
  AccountInfo,
  AccountLoginResult,
  LocalDeviceIdentity,
  AccountSession,
  AccountState,
  AccountVault,
  VaultInvitation,
  NotifyArmPayload,
  NotifyArmResult,
  NotifyArmRoute,
  NotifyDropReason,
  NotifyInvite,
  NotifyChannelState,
  AssistantAnswerPayload,
  AssistantAnswerResult,
  AssistantActionPayload,
  AssistantAppliedPayload,
  AssistantAppliedResult,
  AssistantLinkPayload,
  AssistantPendingRequest,
} from './accountTypes';
