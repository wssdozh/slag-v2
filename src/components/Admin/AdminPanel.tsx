// Admin console shell: server/token login and five tabs over the relay's API.
import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Loader2,
  LogOut,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { isDesktopApp } from '../../lib/platform/windowControls';
import { openExternalUrl } from '../../lib/platform/openExternal';
import { navigatePage } from '../../lib/navigation';
import { SITE_URL } from '../../config/site';
import { syncEngine } from '../../lib/sync/syncEngine';
import { useAdminData } from './useAdminData';
import { useAdminActions } from './useAdminActions';
import { AccountsTab } from './tabs/AccountsTab';
import { BillingTab } from './tabs/BillingTab';
import { AiTab } from './tabs/AiTab';
import { RelayTab } from './tabs/RelayTab';
import { SecurityTab } from './tabs/SecurityTab';

type AdminTab = 'accounts' | 'billing' | 'ai' | 'relay' | 'security';

const TOKEN_STORAGE_KEY = 'slag_admin_token';
const SERVER_STORAGE_KEY = 'slag_admin_server_url';

export const AdminPanel: React.FC = () => {
  const isDesktopShell = isDesktopApp();
  const [serverUrl, setServerUrl] = useState(() => {
    if (sessionStorage.getItem(SERVER_STORAGE_KEY)) {
      return sessionStorage.getItem(SERVER_STORAGE_KEY)!;
    }
    if (
      typeof window !== 'undefined' &&
      window.location.origin.startsWith('http') &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname)
    ) {
      return window.location.origin;
    }
    return syncEngine.getConfig().serverUrl || 'http://152.53.199.71:8320';
  });
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(sessionStorage.getItem(TOKEN_STORAGE_KEY)));

  const [inputToken, setInputToken] = useState('');
  const [inputServerUrl, setInputServerUrl] = useState(serverUrl);

  const [activeTab, setActiveTab] = useState<AdminTab>('accounts');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');

  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const {
    loading,
    error: dataError,
    stats,
    accounts,
    rooms,
    billingStats,
    transactions,
    aiStats,
    aiLogs,
    auditLogs,
    securityStats,
    analytics,
    loadData,
    setAccounts,
  } = useAdminData();

  const error = customError || dataError;

  const {
    planChange,
    toggleStatus,
    revokeDevice,
    grantSubscription,
    quickGrant,
    purgeRoom,
    aiPing,
    cleanup,
    vacuum,
  } = useAdminActions({
    token,
    serverUrl,
    period,
    loadData,
    setAccounts,
    setActionBusy,
    setStatusMessage,
    setCustomError,
  });

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        await loadData(token, serverUrl, period);
      } catch (err) {
        if (err instanceof Error && (err.message.includes('неверный') || err.message.includes('401'))) {
          setIsAuthenticated(false);
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [isAuthenticated, token, serverUrl, period, loadData]);

  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setStatusMessage(null);
    setCustomError(null);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = inputToken.trim();
    const cleanUrl = inputServerUrl.trim().replace(/\/+$/, '');
    if (!cleanToken) {
      setCustomError('введите админ-токен');
      return;
    }
    setToken(cleanToken);
    setServerUrl(cleanUrl);
    setCustomError(null);
    void loadData(cleanToken, cleanUrl, period)
      .then(() => {
        setIsAuthenticated(true);
        sessionStorage.setItem(TOKEN_STORAGE_KEY, cleanToken);
        sessionStorage.setItem(SERVER_STORAGE_KEY, cleanUrl);
      })
      .catch((err) => {
        setCustomError(err instanceof Error ? err.message : String(err));
      });
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setIsAuthenticated(false);
    setCustomError(null);
    setStatusMessage(null);
  };

  if (isDesktopShell) {
    return (
      <div className="min-h-screen bg-canvas-subtle text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
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

  return (
    <div className="min-h-screen bg-canvas-subtle text-zinc-100 selection:bg-white/20 selection:text-white">
      <header className="border-b border-white/[0.06] bg-panel px-6 h-14 flex items-center justify-between">
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
              {/* Period toggle */}
              <div className="flex items-center bg-surface p-0.5 rounded-lg border border-white/[0.06] text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setPeriod('7d')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    period === '7d' ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  7 дней
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('30d')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    period === '30d' ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  30 дней
                </button>
              </div>

              <button
                type="button"
                disabled={loading || actionBusy}
                onClick={() => void loadData(token, serverUrl, period)}
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
              onClick={() => void openExternalUrl(SITE_URL)}
              className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              на сайт
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
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
                  className="rounded-lg border border-white/[0.08] bg-panel px-3 py-2 text-sm text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
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
                  className="rounded-lg border border-white/[0.08] bg-panel px-3 py-2 text-sm text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
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
          <AccountsTab
            period={period}
            accounts={accounts}
            analytics={analytics}
            actionBusy={actionBusy}
            onPlanChange={planChange}
            onToggleStatus={toggleStatus}
            onRevokeDevice={revokeDevice}
            onQuickGrant={quickGrant}
          />
        ) : activeTab === 'billing' ? (
          <BillingTab
            period={period}
            accounts={accounts}
            billingStats={billingStats}
            transactions={transactions}
            analytics={analytics}
            actionBusy={actionBusy}
            onGrantSubscription={grantSubscription}
            onQuickGrant={quickGrant}
          />
        ) : activeTab === 'ai' ? (
          <AiTab
            aiStats={aiStats}
            aiLogs={aiLogs}
            analytics={analytics}
            actionBusy={actionBusy}
            onAiPing={aiPing}
          />
        ) : activeTab === 'relay' ? (
          <RelayTab
            period={period}
            stats={stats}
            rooms={rooms}
            analytics={analytics}
            actionBusy={actionBusy}
            onPurgeRoom={purgeRoom}
            onCleanup={cleanup}
            onVacuum={vacuum}
          />
        ) : (
          <SecurityTab
            securityStats={securityStats}
            auditLogs={auditLogs}
          />
        )}
      </main>
    </div>
  );
};
