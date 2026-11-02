import { generateAccountIdentity, signDeviceChallenge } from './accountCrypto';
import type {
  AccountDevice,
  AccountDeviceInput,
  AccountInfo,
  AccountLoginResult,
  LocalDeviceIdentity,
  AccountSession,
  AccountState,
  AccountVault,
} from './accountTypes';
import type { DeviceSyncMode } from './types';

const SESSION_KEY = 'slag_account_session_v1';
const DEFAULT_SERVER_URL = 'http://152.53.199.71:8320';
const POLL_INTERVAL_MS = 5000;

interface AuthResponse {
  token?: string;
  status?: string;
  account?: AccountInfo;
  device?: AccountDevice;
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
  if (import.meta.env.DEV && localStorage.getItem('slag_allow_insecure_account_test') === 'true' && url.origin === 'http://152.53.199.71:8320') return;
  throw new Error('Для входа в аккаунт нужен HTTPS. Для тестирования используйте локальный SSH-туннель.');
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
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(SESSION_KEY);
    throw new Error('Stored account session is not valid JSON', { cause: error });
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.token !== 'string' ||
    !parsed.token ||
    typeof parsed.accountId !== 'string' ||
    typeof parsed.deviceId !== 'string'
  ) {
    localStorage.removeItem(SESSION_KEY);
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

  private writeSession(session: AccountSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  private setSession(session: AccountSession): void {
    this.session = session;
    this.writeSession(session);
    this.patch({
      session,
      account: session.account ? session.account : null,
      devices: session.device ? [session.device] : [],
      vaults: [],
      invitations: [],
    });
  }

  private clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
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
    const response = await fetch(`${this.serverUrl}${path}`, { ...init, headers });
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
      this.clearSession();
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
          this.clearSession();
          return 'pending_device';
        }
        throw new Error('Server response does not contain an authentication token');
      }

      this.setSession({
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
      this.clearSession();
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
    this.writeSession(nextSession);
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
    await this.run(() => this.request<void>(path, init));
    await this.refresh();
  }

  approveDevice(deviceId: string): Promise<void> {
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}/approve`, {
      method: 'POST',
    });
  }

  renameDevice(deviceId: string, name: string): Promise<void> {
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  revokeDevice(deviceId: string): Promise<void> {
    return this.mutate(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
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
} from './accountTypes';
