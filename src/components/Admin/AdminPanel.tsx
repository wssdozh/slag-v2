import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  CreditCard,
  Database,
  FolderSync,
  Laptop,
  Loader2,
  Lock,
  LogOut,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Wrench,
} from 'lucide-react';
import { isTauriEnvironment } from '../../lib/platform';
import { navigatePage } from '../../lib/navigation';
import { syncEngine } from '../../lib/sync/syncEngine';
import { formatBytes } from '../../lib/formatBytes';

type AdminTab = 'accounts' | 'billing' | 'ai' | 'relay' | 'security';

interface AdminStats {
  uptime: number;
  totalAccounts: number;
  totalDevices: number;
  activeRooms: number;
  totalBundles: number;
  totalCacheBytes: number;
  activeSessions: number;
  pendingPairings: number;
  totalVaults: number;
  dbSizeBytes: number;
}

interface AdminDevice {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
}

interface AdminVault {
  id: string;
  name: string;
  updatedAt: string | null;
  grantsCount: number;
}

interface AdminAccount {
  id: string;
  plan: 'free' | 'smile' | 'angry';
  planLabel: string;
  createdAt: string | null;
  expiresAt: string | null;
  status: 'active' | 'blocked';
  maxDevices: number;
  maxCacheMb: number;
  usedCacheMb: number;
  devices: AdminDevice[];
  vaults?: AdminVault[];
}

interface BillingStats {
  mrr: number;
  totalRevenue: number;
  paidAccounts: number;
  freeAccounts: number;
  conversionRate: number;
}

interface BillingTransaction {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  plan: string;
  periodDays: number;
  status: string;
  createdAt: string | null;
}

interface AiStats {
  gatewayStatus: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  activeModels: string[];
}

interface AiLog {
  id: string;
  accountId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  createdAt: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string | null;
}

interface AdminRoom {
  roomId: string;
  vaultId: string | null;
  lastActiveAt: string | null;
  createdAt: string | null;
  bundlesCount: number;
  cacheBytes: number;
}

const TOKEN_STORAGE_KEY = 'slag_admin_token';
const SERVER_STORAGE_KEY = 'slag_admin_server_url';
const PLANS: Array<'free' | 'smile' | 'angry'> = ['free', 'smile', 'angry'];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${seconds}с`;
}

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export const AdminPanel: React.FC = () => {
  const isTauri = isTauriEnvironment();
  const [serverUrl, setServerUrl] = useState(() => {
    if (sessionStorage.getItem(SERVER_STORAGE_KEY)) {
      return sessionStorage.getItem(SERVER_STORAGE_KEY)!;
    }
    if (typeof window !== 'undefined' && window.location.origin.startsWith('http') && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return window.location.origin;
    }
    return syncEngine.getConfig().serverUrl || 'http://152.53.199.71:8320';
  });
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(sessionStorage.getItem(TOKEN_STORAGE_KEY)));

  const [inputToken, setInputToken] = useState('');
  const [inputServerUrl, setInputServerUrl] = useState(serverUrl);

  const [activeTab, setActiveTab] = useState<AdminTab>('accounts');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [billingStats, setBillingStats] = useState<BillingStats | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityStats, setSecurityStats] = useState<{ blockedAccountsCount: number; revokedDevicesCount: number } | null>(null);

  // Form states
  const [grantAccountId, setGrantAccountId] = useState('');
  const [grantPlan, setGrantPlan] = useState<'smile' | 'angry'>('smile');
  const [grantDays, setGrantDays] = useState('30');
  const [grantAmount, setGrantAmount] = useState('190');

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async (activeToken: string, activeUrl: string) => {
    setLoading(true);
    setError(null);
    const headers = {
      Authorization: `Bearer ${activeToken}`,
      'Content-Type': 'application/json',
    };
    try {
      const [statsRes, accountsRes, roomsRes, billStatsRes, txRes, aiStatsRes, aiLogsRes, auditRes] =
        await Promise.all([
          fetch(`${activeUrl}/api/admin/stats`, { headers }),
          fetch(`${activeUrl}/api/admin/accounts`, { headers }),
          fetch(`${activeUrl}/api/admin/rooms`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/billing/stats`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/billing/transactions`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/ai/stats`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/ai/logs`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/audit`, { headers }).catch(() => null),
        ]);

      if (statsRes.status === 401 || accountsRes.status === 401) {
        throw new Error('неверный админ-токен');
      }
      if (statsRes.status === 403 || accountsRes.status === 403) {
        throw new Error('админ-токен не настроен на сервере');
      }
      if (!statsRes.ok || !accountsRes.ok) {
        throw new Error(`ошибка сервера (${statsRes.status}/${accountsRes.status})`);
      }

      setStats((await statsRes.json()) as AdminStats);
      const accData = (await accountsRes.json()) as { accounts: AdminAccount[] };
      setAccounts(accData.accounts || []);
      if (!grantAccountId && accData.accounts.length > 0) {
        setGrantAccountId(accData.accounts[0].id);
      }

      if (roomsRes && roomsRes.ok) {
        const roomsData = (await roomsRes.json()) as { rooms: AdminRoom[] };
        setRooms(roomsData.rooms || []);
      }
      if (billStatsRes && billStatsRes.ok) {
        setBillingStats((await billStatsRes.json()) as BillingStats);
      }
      if (txRes && txRes.ok) {
        const txData = (await txRes.json()) as { transactions: BillingTransaction[] };
        setTransactions(txData.transactions || []);
      }
      if (aiStatsRes && aiStatsRes.ok) {
        setAiStats((await aiStatsRes.json()) as AiStats);
      }
      if (aiLogsRes && aiLogsRes.ok) {
        const logsData = (await aiLogsRes.json()) as { logs: AiLog[] };
        setAiLogs(logsData.logs || []);
      }
      if (auditRes && auditRes.ok) {
        const auditData = (await auditRes.json()) as {
          logs: AuditLog[];
          blockedAccountsCount: number;
          revokedDevicesCount: number;
        };
        setAuditLogs(auditData.logs || []);
        setSecurityStats({
          blockedAccountsCount: auditData.blockedAccountsCount || 0,
          revokedDevicesCount: auditData.revokedDevicesCount || 0,
        });
      }

      setIsAuthenticated(true);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, activeToken);
      sessionStorage.setItem(SERVER_STORAGE_KEY, activeUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (err instanceof Error && (err.message.includes('неверный') || err.message.includes('401'))) {
        setIsAuthenticated(false);
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } finally {
      setLoading(false);
    }
  }, [grantAccountId]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      await loadData(token, serverUrl);
    });
    return () => {
      active = false;
    };
  }, [isAuthenticated, token, serverUrl, loadData]);

  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setStatusMessage(null);
    setError(null);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = inputToken.trim();
    const cleanUrl = inputServerUrl.trim().replace(/\/+$/, '');
    if (!cleanToken) {
      setError('введите админ-токен');
      return;
    }
    setToken(cleanToken);
    setServerUrl(cleanUrl);
    void loadData(cleanToken, cleanUrl);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setIsAuthenticated(false);
    setStats(null);
    setAccounts([]);
    setRooms([]);
    setBillingStats(null);
    setTransactions([]);
    setAiStats(null);
    setAiLogs([]);
    setAuditLogs([]);
    setError(null);
    setStatusMessage(null);
  };

  const handlePlanChange = async (accountId: string, newPlan: 'free' | 'smile' | 'angry') => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `ошибка ${res.status}`);
      }
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === accountId
            ? {
                ...acc,
                plan: newPlan,
                planLabel: newPlan.charAt(0).toUpperCase() + newPlan.slice(1),
                maxDevices: newPlan === 'free' ? 2 : newPlan === 'smile' ? 5 : 15,
                maxCacheMb: newPlan === 'free' ? 1024 : newPlan === 'smile' ? 10240 : 51200,
              }
            : acc
        )
      );
    } catch (err) {
      setError(`не удалось сменить тариф: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleAccountStatus = async (accountId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/accounts/${encodeURIComponent(accountId)}/toggle-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `ошибка ${res.status}`);
      }
      const data = (await res.json()) as { account: AdminAccount };
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? { ...acc, status: data.account.status } : acc))
      );
    } catch (err) {
      setError(`не удалось изменить статус: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleRevokeDevice = async (accountId: string, deviceId: string) => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${serverUrl}/api/admin/accounts/${encodeURIComponent(accountId)}/devices/${encodeURIComponent(deviceId)}/revoke`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `ошибка ${res.status}`);
      }
      setAccounts((prev) =>
        prev.map((acc) => {
          if (acc.id !== accountId) return acc;
          return {
            ...acc,
            devices: acc.devices.map((d) => (d.id === deviceId ? { ...d, status: 'revoked' } : d)),
          };
        })
      );
    } catch (err) {
      setError(`не удалось отозвать устройство: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleGrantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantAccountId) return;
    setActionBusy(true);
    setStatusMessage(null);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/billing/grant`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: grantAccountId,
          plan: grantPlan,
          periodDays: parseInt(grantDays, 10),
          amount: parseFloat(grantAmount),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `ошибка ${res.status}`);
      }
      setStatusMessage(`подписка ${grantPlan} начислена аккаунту ${shortId(grantAccountId)}`);
      await loadData(token, serverUrl);
    } catch (err) {
      setError(`ошибка начисления: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleAiPing = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/ai/ping`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'deepseek-v4-1-flash' }),
      });
      if (!res.ok) throw new Error(`ошибка ${res.status}`);
      const data = (await res.json()) as { latencyMs: number; model: string };
      setStatusMessage(`шлюз отвечает: пинг ${data.latencyMs} мс (${data.model})`);
      await loadData(token, serverUrl);
    } catch (err) {
      setError(`ошибка пинга шлюза: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCleanup = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/maintenance/cleanup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`ошибка ${res.status}`);
      setStatusMessage('очистка выполнена: устаревшие бандлы и сессии удалены');
      await loadData(token, serverUrl);
    } catch (err) {
      setError(`ошибка очистки: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleVacuum = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/maintenance/vacuum`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`ошибка ${res.status}`);
      const data = (await res.json()) as { bytesBefore: number; bytesAfter: number; freedBytes: number };
      setStatusMessage(
        `база сжата: ${formatBytes(data.bytesBefore)} → ${formatBytes(data.bytesAfter)} (освобождено ${formatBytes(data.freedBytes) || '0 B'})`
      );
      await loadData(token, serverUrl);
    } catch (err) {
      setError(`ошибка сжатия базы: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const copyAccountId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard access denied
    }
  };

  if (isTauri) {
    return (
      <div className="min-h-screen bg-[#08090a] text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <Shield className="w-10 h-10 text-amber-400 mb-4" />
        <p className="text-sm font-medium text-zinc-200">доступно только в веб-версии</p>
        <p className="text-xs text-zinc-500 mt-1 mb-6">админ-панель релея работает только на сайте</p>
        <button
          type="button"
          onClick={() => navigatePage(null, 'replace')}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-xs text-zinc-100 transition-colors cursor-pointer"
        >
          вернуться в приложение
        </button>
      </div>
    );
  }

  const filteredAccounts = accounts.filter((acc) =>
    acc.id.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 selection:bg-white/20 selection:text-white">
      <header className="border-b border-white/[0.06] bg-[#0c0c0e] px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Server className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold tracking-tight text-white">SLAG Relay Admin</span>
          </div>
          {isAuthenticated && (
            <nav className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                data-testid="tab-accounts"
                onClick={() => switchTab('accounts')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'accounts'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>аккаунты</span>
              </button>
              <button
                type="button"
                data-testid="tab-billing"
                onClick={() => switchTab('billing')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'billing'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>биллинг</span>
              </button>
              <button
                type="button"
                data-testid="tab-ai"
                onClick={() => switchTab('ai')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ии-шлюз</span>
              </button>
              <button
                type="button"
                data-testid="tab-relay"
                onClick={() => switchTab('relay')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'relay'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>релей</span>
              </button>
              <button
                type="button"
                data-testid="tab-security"
                onClick={() => switchTab('security')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'security'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>безопасность</span>
              </button>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                disabled={loading || actionBusy}
                onClick={() => void loadData(token, serverUrl)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>обновить</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>выйти</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigatePage('landing')}
              className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              на сайт
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        {error && (
          <div role="status" className="p-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            {error}
          </div>
        )}

        {statusMessage && (
          <div role="status" className="p-3 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            {statusMessage}
          </div>
        )}

        {!isAuthenticated ? (
          <div className="max-w-md mx-auto w-full pt-12 flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-semibold text-white">вход в админ-панель</h1>
              <p className="text-xs text-zinc-500 mt-1">управление аккаунтами и тарифами relay</p>
            </div>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-server-url" className="text-xs text-zinc-400">
                  адрес сервера
                </label>
                <input
                  id="admin-server-url"
                  type="text"
                  value={inputServerUrl}
                  onChange={(e) => setInputServerUrl(e.target.value)}
                  required
                  className="rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-token" className="text-xs text-zinc-400">
                  секретный токен
                </label>
                <input
                  id="admin-token"
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="токен из SLAG_ADMIN_TOKEN"
                  autoFocus
                  required
                  className="rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inputToken.trim()}
                className="mt-2 px-4 py-2 bg-white text-black font-medium text-xs rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>войти</span>
              </button>
            </form>
          </div>
        ) : activeTab === 'accounts' ? (
          /* 1. Accounts Tab */
          <>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="поиск по id аккаунта"
                className="w-full max-w-xs rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-1.5 text-xs text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
              />
              <span className="text-xs font-mono text-zinc-500 shrink-0">
                аккаунтов: {filteredAccounts.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {filteredAccounts.map((acc) => {
                const isUpdating = actionBusy;
                return (
                  <div key={acc.id} className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono font-medium text-white break-all" title={acc.id}>
                          {acc.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyAccountId(acc.id)}
                          className="text-zinc-500 hover:text-white transition-colors cursor-pointer shrink-0"
                          title="скопировать id"
                        >
                          {copiedId === acc.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <span
                          className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                            acc.status === 'blocked' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-zinc-500'
                          }`}
                        >
                          {acc.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {PLANS.map((plan) => {
                            const isActive = acc.plan === plan;
                            return (
                              <button
                                key={plan}
                                type="button"
                                disabled={isUpdating || isActive}
                                onClick={() => void handlePlanChange(acc.id, plan)}
                                className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer disabled:cursor-default ${
                                  isActive
                                    ? 'bg-white text-black font-medium'
                                    : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                                }`}
                              >
                                {plan}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => void handleToggleAccountStatus(acc.id)}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            acc.status === 'blocked'
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-white/[0.04] text-zinc-400 hover:text-rose-400 hover:bg-white/[0.08]'
                          }`}
                          title={acc.status === 'blocked' ? 'разблокировать' : 'заблокировать'}
                        >
                          {acc.status === 'blocked' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>кеш {acc.usedCacheMb} / {acc.maxCacheMb} мб</span>
                      <span>устройств {acc.devices.length} / {acc.maxDevices}</span>
                      {acc.vaults && acc.vaults.length > 0 && <span>хранилищ: {acc.vaults.length}</span>}
                      {acc.createdAt && (
                        <span className="text-zinc-500">
                          создан {new Date(acc.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                      {acc.expiresAt && (
                        <span className="text-amber-400/90 font-mono text-[11px]">
                          подписка до {new Date(acc.expiresAt).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>

                    {acc.vaults && acc.vaults.length > 0 && (
                      <div className="border-t border-white/[0.04] pt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                        {acc.vaults.map((v) => (
                          <span
                            key={v.id}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.04]"
                          >
                            <FolderSync className="w-3 h-3 text-zinc-500" />
                            <span className="text-zinc-300">{v.name}</span>
                            <span className="text-zinc-500 font-mono">({v.grantsCount} девайсов)</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {acc.devices.length > 0 && (
                      <div className="border-t border-white/[0.04] pt-2.5 flex flex-col gap-1.5">
                        {acc.devices.map((dev) => (
                          <div key={dev.id} className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              {dev.platform === 'mobile' ? (
                                <Smartphone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              ) : (
                                <Laptop className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              )}
                              <span className="text-zinc-300 truncate">{dev.name}</span>
                              <span className="text-[11px] font-mono text-zinc-600 truncate" title={dev.id}>
                                {shortId(dev.id)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                              <span
                                className={
                                  dev.status === 'active'
                                    ? 'text-emerald-400'
                                    : dev.status === 'pending'
                                    ? 'text-amber-400'
                                    : 'text-zinc-500'
                                }
                              >
                                {dev.status}
                              </span>
                              {dev.lastSeenAt && (
                                <span className="text-zinc-500 hidden sm:inline">
                                  {new Date(dev.lastSeenAt).toLocaleDateString('ru-RU')}
                                </span>
                              )}
                              {dev.status === 'active' && (
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleRevokeDevice(acc.id, dev.id)}
                                  className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-40"
                                  title="отозвать доступ"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredAccounts.length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-500">
                  {accounts.length === 0 ? 'нет зарегистрированных аккаунтов' : 'ничего не найдено'}
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'billing' ? (
          /* 2. Billing Tab */
          <div className="flex flex-col gap-6">
            {billingStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">MRR (выручка/мес)</span>
                  <span className="text-sm font-semibold text-emerald-400">{billingStats.mrr.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">платных аккаунтов</span>
                  <span className="text-sm font-semibold text-white">{billingStats.paidAccounts}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">бесплатных</span>
                  <span className="text-sm font-semibold text-zinc-400">{billingStats.freeAccounts}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">конверсия</span>
                  <span className="text-sm font-semibold text-white">{billingStats.conversionRate}%</span>
                </div>
              </div>
            )}

            {/* Manual Grant Form */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                <span>ручное начисление / продление подписки</span>
              </div>
              <form onSubmit={handleGrantSubscription} className="flex flex-wrap items-end gap-3 pt-1">
                <div className="flex flex-col gap-1 min-w-[200px]">
                  <label htmlFor="grant-account" className="text-[11px] text-zinc-400">аккаунт</label>
                  <select
                    id="grant-account"
                    value={grantAccountId}
                    onChange={(e) => setGrantAccountId(e.target.value)}
                    required
                    className="rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {shortId(a.id)} ({a.plan})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="grant-plan" className="text-[11px] text-zinc-400">тариф</label>
                  <select
                    id="grant-plan"
                    value={grantPlan}
                    onChange={(e) => {
                      const p = e.target.value as 'smile' | 'angry';
                      setGrantPlan(p);
                      setGrantAmount(p === 'smile' ? '190' : '490');
                    }}
                    className="rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
                  >
                    <option value="smile">Smile (190 ₽)</option>
                    <option value="angry">Angry (490 ₽)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="grant-days" className="text-[11px] text-zinc-400">дней</label>
                  <select
                    id="grant-days"
                    value={grantDays}
                    onChange={(e) => setGrantDays(e.target.value)}
                    className="rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
                  >
                    <option value="30">30 дней</option>
                    <option value="90">90 дней</option>
                    <option value="365">365 дней</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-24">
                  <label htmlFor="grant-amount" className="text-[11px] text-zinc-400">сумма (₽)</label>
                  <input
                    id="grant-amount"
                    type="number"
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    required
                    className="rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionBusy || !grantAccountId}
                  className="px-3.5 py-2 bg-white text-black font-medium text-xs rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-40"
                >
                  начислить
                </button>
              </form>
            </div>

            {/* Transactions List */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-white">история операций ({transactions.length})</span>
              <div className="flex flex-col gap-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 rounded-lg bg-[#141417] border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-zinc-400">{tx.id}</span>
                      <span className="font-mono text-white" title={tx.accountId}>
                        {shortId(tx.accountId)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[11px] font-mono text-zinc-300">
                        {tx.plan} ({tx.periodDays}д)
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-400 shrink-0">
                      <span className="text-emerald-400 font-semibold">{tx.amount} {tx.currency}</span>
                      <span className="text-zinc-500">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('ru-RU') : '—'}
                      </span>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="py-6 text-center text-xs text-zinc-500">транзакций пока нет</div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'ai' ? (
          /* 3. AI Gateway Tab */
          <div className="flex flex-col gap-6">
            {aiStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">статус шлюза</span>
                  <span className={`text-sm font-semibold ${aiStats.gatewayStatus === 'operational' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {aiStats.gatewayStatus}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">всего запросов</span>
                  <span className="text-sm font-semibold text-white">{aiStats.totalRequests}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">суммарно токенов</span>
                  <span className="text-sm font-semibold text-white">{aiStats.totalTokens.toLocaleString('ru-RU')}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">активные модели</span>
                  <span className="text-xs font-mono text-zinc-300 truncate">
                    {aiStats.activeModels.join(', ')}
                  </span>
                </div>
              </div>
            )}

            {/* AI Benchmark Ping Action */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-white">диагностика апстрима</span>
                <span className="text-xs text-zinc-500">проверка задержки и доступности шлюза к моделям</span>
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleAiPing()}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-zinc-200 text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-2"
              >
                {actionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Activity className="w-3.5 h-3.5" />
                <span>проверить пинг шлюза</span>
              </button>
            </div>

            {/* AI Logs */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-white">лог обращений ({aiLogs.length})</span>
              <div className="flex flex-col gap-2">
                {aiLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-[#141417] border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-zinc-400">{log.id}</span>
                      <span className="font-mono text-zinc-200">{shortId(log.accountId)}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[11px] font-mono text-zinc-300">
                        {log.model}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-400 shrink-0">
                      <span>{log.promptTokens + log.completionTokens} tok</span>
                      <span className="text-emerald-400">{log.latencyMs} ms</span>
                      {log.createdAt && (
                        <span className="text-zinc-500">
                          {new Date(log.createdAt).toLocaleTimeString('ru-RU')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {aiLogs.length === 0 && (
                  <div className="py-6 text-center text-xs text-zinc-500">запросов к ИИ пока нет</div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'relay' ? (
          /* 4. Relay Health Tab */
          <div className="flex flex-col gap-6">
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">uptime</span>
                  <span className="text-sm font-semibold text-white">{formatUptime(stats.uptime)}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">размер базы</span>
                  <span className="text-sm font-semibold text-white">{formatBytes(stats.dbSizeBytes) || '0 B'}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">активные сессии</span>
                  <span className="text-sm font-semibold text-white">{stats.activeSessions}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">пакетов в очереди</span>
                  <span className="text-sm font-semibold text-white">{stats.totalBundles}</span>
                </div>
              </div>
            )}

            {/* Maintenance Actions */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <Wrench className="w-3.5 h-3.5 text-zinc-400" />
                <span>инструменты обслуживания</span>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleCleanup()}
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-zinc-200 text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-2"
                >
                  {actionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>очистить истекшие данные</span>
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleVacuum()}
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-zinc-200 text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-2"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>сжать базу (vacuum)</span>
                </button>
              </div>
            </div>

            {/* Rooms List */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-medium text-white">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>комнаты синхронизации ({rooms.length})</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {rooms.map((r) => (
                  <div
                    key={r.roomId}
                    className="p-3 rounded-lg bg-[#141417] border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-zinc-200 truncate" title={r.roomId}>
                        {shortId(r.roomId)}
                      </span>
                      {r.vaultId && (
                        <span className="text-[11px] font-mono text-zinc-500 truncate" title={r.vaultId}>
                          vault: {shortId(r.vaultId)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-400 shrink-0">
                      <span>бандлов: {r.bundlesCount}</span>
                      <span>кеш: {formatBytes(r.cacheBytes) || '0 B'}</span>
                      {r.lastActiveAt && (
                        <span className="text-zinc-500">
                          активность {new Date(r.lastActiveAt).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {rooms.length === 0 && (
                  <div className="py-6 text-center text-xs text-zinc-500">нет активных комнат</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* 5. Security Tab */
          <div className="flex flex-col gap-6">
            {securityStats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">заблокировано аккаунтов</span>
                  <span className={`text-sm font-semibold ${securityStats.blockedAccountsCount > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                    {securityStats.blockedAccountsCount}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">отозвано устройств</span>
                  <span className="text-sm font-semibold text-zinc-400">
                    {securityStats.revokedDevicesCount}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-mono text-zinc-500">политика шифрования</span>
                  <span className="text-sm font-semibold text-emerald-400">P-256 E2EE (Zero-Knowledge)</span>
                </div>
              </div>
            )}

            {/* Audit Log Table */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-white">журнал аудита действий ({auditLogs.length})</span>
              <div className="flex flex-col gap-2">
                {auditLogs.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-[#141417] border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[11px] font-mono text-zinc-300">
                        {item.action}
                      </span>
                      <span className="font-mono text-zinc-400">
                        {item.targetType}:{shortId(item.targetId)}
                      </span>
                      <span className="text-zinc-500 text-[11px] truncate">{item.details}</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '—'}
                    </span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="py-6 text-center text-xs text-zinc-500">записей аудита пока нет</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
