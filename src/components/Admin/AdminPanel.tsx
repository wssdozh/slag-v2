import type { RoomMigrationAction } from './useAdminData';
// Admin console shell: server/token login and five tabs over the relay's API.
import React, { useEffect, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
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

  const migrateRoom = async (roomId: string, action: RoomMigrationAction, body: object) => {
    const response = await fetch(`${serverUrl}/api/admin/rooms/${encodeURIComponent(roomId)}/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(120_000),
    }).catch(() => null);
    await loadData(token, serverUrl, period);
    if (!response) throw new Error('Ответ релея не получен. Проверьте показанный режим комнаты, прежде чем повторить действие.');
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      const reasons: Record<string, string> = {
        note_prepare_changed: 'Подготовка или поколение изменились. Перечитайте статус комнаты.',
        note_prepare_writers_changed: 'Список писателей изменился или подготовка начата старым инструментом. Отмените и подготовьте переход заново.',
        note_backup_failed: 'Не удалось сохранить резервную копию. Реестр не включён.',
        note_no_writers: 'Нет устройств с правом записи.',
        invalid_note_seed: 'Пакет не соответствует выбранной комнате или поколению.',
        cache_limit_exceeded: 'Пакет не помещается в квоту хранилища.',
        payload_too_large: 'Пакет превышает лимит загрузки; используйте операторский инструмент.',
      };
      throw new Error(reasons[result?.error ?? ''] ?? `Релей отклонил действие (HTTP ${response.status}).`);
    }
  };

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
      <div className="min-h-screen bg-canvas-subtle text-fg-primary flex flex-col items-center justify-center p-6 text-center">
        <Icon name="system.security" size="xl" tone="warning" className="mb-4" />
        <p className="text-sm font-medium text-fg-soft">доступно только в веб-версии</p>
        <p className="text-xs text-fg-muted mt-1 mb-6">админ-панель релея работает только на сайте</p>
        <button
          type="button"
          onClick={() => navigatePage(null, 'replace')}
          className="px-4 py-2 bg-tint-10 hover:bg-tint-15 rounded-lg text-xs text-fg-primary transition-colors cursor-pointer"
        >
          вернуться в приложение
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-subtle text-fg-primary selection:bg-tint-20 selection:text-white">
      <header className="border-b border-tint-6 bg-panel px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Icon name="admin.server" size="md" />
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
                    ? 'bg-tint-10 text-white font-medium'
                    : 'text-fg-secondary hover:text-white hover:bg-tint-4'
                }`}
              >
                <Icon name="admin.users" size="sm" tone="inherit" />
                <span>аккаунты</span>
              </button>
              <button
                type="button"
                data-testid="tab-billing"
                onClick={() => switchTab('billing')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'billing'
                    ? 'bg-tint-10 text-white font-medium'
                    : 'text-fg-secondary hover:text-white hover:bg-tint-4'
                }`}
              >
                <Icon name="admin.billing" size="sm" tone="inherit" />
                <span>биллинг</span>
              </button>
              <button
                type="button"
                data-testid="tab-ai"
                onClick={() => switchTab('ai')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-tint-10 text-white font-medium'
                    : 'text-fg-secondary hover:text-white hover:bg-tint-4'
                }`}
              >
                <Icon name="system.ai" size="sm" tone="inherit" />
                <span>ии-шлюз</span>
              </button>
              <button
                type="button"
                data-testid="tab-relay"
                onClick={() => switchTab('relay')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'relay'
                    ? 'bg-tint-10 text-white font-medium'
                    : 'text-fg-secondary hover:text-white hover:bg-tint-4'
                }`}
              >
                <Icon name="status.live" size="sm" tone="inherit" />
                <span>релей</span>
              </button>
              <button
                type="button"
                data-testid="tab-security"
                onClick={() => switchTab('security')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                  activeTab === 'security'
                    ? 'bg-tint-10 text-white font-medium'
                    : 'text-fg-secondary hover:text-white hover:bg-tint-4'
                }`}
              >
                <Icon name="system.security" size="sm" tone="inherit" />
                <span>безопасность</span>
              </button>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {/* Period toggle */}
              <div className="flex items-center bg-surface p-0.5 rounded-lg border border-tint-6 text-2xs font-mono">
                <button
                  type="button"
                  onClick={() => setPeriod('7d')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    period === '7d' ? 'bg-tint-10 text-white font-medium' : 'text-fg-muted hover:text-fg-tertiary'
                  }`}
                >
                  7 дней
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('30d')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    period === '30d' ? 'bg-tint-10 text-white font-medium' : 'text-fg-muted hover:text-fg-tertiary'
                  }`}
                >
                  30 дней
                </button>
              </div>

              <button
                type="button"
                disabled={loading || actionBusy}
                onClick={() => void loadData(token, serverUrl, period)}
                className="flex items-center gap-1.5 text-xs text-fg-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                <Icon name="action.refresh" size="sm" tone="inherit" className={`${loading ? 'animate-spin' : ''}`} />
                <span>обновить</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-fg-secondary hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Icon name="action.logout" size="sm" tone="inherit" />
                <span>выйти</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void openExternalUrl(SITE_URL)}
              className="text-xs text-fg-secondary hover:text-white transition-colors cursor-pointer"
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
              <p className="text-xs text-fg-muted mt-1">управление аккаунтами и тарифами relay</p>
            </div>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-server-url" className="text-xs text-fg-secondary">
                  адрес сервера
                </label>
                <input
                  id="admin-server-url"
                  type="text"
                  value={inputServerUrl}
                  onChange={(e) => setInputServerUrl(e.target.value)}
                  required
                  className="rounded-lg border border-tint-8 bg-panel px-3 py-2 text-sm text-fg-primary font-mono outline-none ring-0 focus:border-tint-20 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-token" className="text-xs text-fg-secondary">
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
                  className="rounded-lg border border-tint-8 bg-panel px-3 py-2 text-sm text-fg-primary font-mono outline-none ring-0 focus:border-tint-20 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inputToken.trim()}
                className="mt-2 px-4 py-2 bg-white text-black font-medium text-xs rounded-lg hover:bg-fg-soft transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Icon name="status.loading" size="sm" tone="inherit" className="animate-spin" />}
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
            onMigrateRoom={migrateRoom}
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
