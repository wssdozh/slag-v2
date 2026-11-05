import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Laptop, Loader2, LogOut, RefreshCw, Server, Shield, Smartphone } from 'lucide-react';
import { isTauriEnvironment } from '../../lib/platform';
import { navigatePage } from '../../lib/navigation';
import { syncEngine } from '../../lib/sync/syncEngine';
import { formatBytes } from '../../lib/formatBytes';

interface AdminStats {
  uptime: number;
  totalAccounts: number;
  totalDevices: number;
  activeRooms: number;
  totalBundles: number;
  totalCacheBytes: number;
}

interface AdminDevice {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
}

interface AdminAccount {
  id: string;
  plan: 'free' | 'smile' | 'angry';
  planLabel: string;
  createdAt: string | null;
  maxDevices: number;
  maxCacheMb: number;
  usedCacheMb: number;
  devices: AdminDevice[];
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

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
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
      const [statsRes, accountsRes] = await Promise.all([
        fetch(`${activeUrl}/api/admin/stats`, { headers }),
        fetch(`${activeUrl}/api/admin/accounts`, { headers }),
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

      const statsData = (await statsRes.json()) as AdminStats;
      const accountsData = (await accountsRes.json()) as { accounts: AdminAccount[] };

      setStats(statsData);
      setAccounts(accountsData.accounts || []);
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
  }, []);

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
    setError(null);
  };

  const handlePlanChange = async (accountId: string, newPlan: 'free' | 'smile' | 'angry') => {
    setUpdatingPlanId(accountId);
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
      setUpdatingPlanId(null);
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
        <div className="flex items-center gap-3">
          <Server className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold tracking-tight text-white">SLAG Relay Admin</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                disabled={loading}
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
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">uptime</span>
                  <span className="text-sm font-semibold text-white">{formatUptime(stats.uptime)}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">аккаунты</span>
                  <span className="text-sm font-semibold text-white">{stats.totalAccounts}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">устройства</span>
                  <span className="text-sm font-semibold text-white">{stats.totalDevices}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-zinc-500">комнаты</span>
                  <span className="text-sm font-semibold text-white">{stats.activeRooms}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-mono text-zinc-500">кеш бандлов</span>
                  <span className="text-sm font-semibold text-white">{formatBytes(stats.totalCacheBytes) || '0 B'}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="поиск по id аккаунта"
                className="w-full max-w-xs rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-1.5 text-xs text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
              />
              <span className="text-xs font-mono text-zinc-500 shrink-0">
                найдено: {filteredAccounts.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {filteredAccounts.map((acc) => {
                const isUpdating = updatingPlanId === acc.id;
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
                      </div>

                      <div className="flex items-center gap-1.5">
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
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>кеш {acc.usedCacheMb} / {acc.maxCacheMb} мб</span>
                      <span>устройств {acc.devices.length} / {acc.maxDevices}</span>
                      {acc.createdAt && (
                        <span className="text-zinc-500">
                          создан {new Date(acc.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>

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
                            <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
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
        )}
      </main>
    </div>
  );
};
