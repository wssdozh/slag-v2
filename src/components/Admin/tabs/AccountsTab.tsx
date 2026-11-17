// Admin accounts tab: search, plan/status filters, per-account actions, devices.
import React from 'react';
import { SparklineChart, BarChart } from '../Charts';
import type { AdminAccount, AnalyticsData } from '../useAdminData';
import { shortId } from '../../../lib/text/shortId';
import { Icon } from '../../UI/icons/Icon';
interface AccountsTabProps {
  period: '7d' | '30d';
  accounts: AdminAccount[];
  analytics: AnalyticsData | null;
  actionBusy: boolean;
  onPlanChange: (accountId: string, plan: 'free' | 'smile' | 'angry') => void;
  onToggleStatus: (accountId: string) => void;
  onRevokeDevice: (accountId: string, deviceId: string) => void;
  onQuickGrant: (accountId: string, plan: 'smile' | 'angry', days: number) => void;
}

const PLANS: Array<'free' | 'smile' | 'angry'> = ['free', 'smile', 'angry'];

export const AccountsTab: React.FC<AccountsTabProps> = ({
  period,
  accounts,
  analytics,
  actionBusy,
  onPlanChange,
  onToggleStatus,
  onRevokeDevice,
  onQuickGrant,
}) => {
  const [search, setSearch] = React.useState('');
  const [filterPlan, setFilterPlan] = React.useState<'all' | 'free' | 'smile' | 'angry'>('all');
  const [filterStatus, setFilterStatus] = React.useState<'all' | 'active' | 'blocked'>('all');
  const [filterPlatform, setFilterPlatform] = React.useState<'all' | 'desktop' | 'mobile'>('all');
  const [filterExpiringSoon, setFilterExpiringSoon] = React.useState(false);
  const [inlineGrantAccountId, setInlineGrantAccountId] = React.useState<string | null>(null);
  const [inlinePlan, setInlinePlan] = React.useState<'smile' | 'angry'>('smile');
  const [inlineDays, setInlineDays] = React.useState('30');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [nowMs] = React.useState(() => Date.now());

  const filteredAccounts = accounts.filter((acc) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      acc.id.toLowerCase().includes(q) ||
      acc.devices.some((d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
    const matchesPlan = filterPlan === 'all' || acc.plan === filterPlan;
    const matchesStatus = filterStatus === 'all' || acc.status === filterStatus;
    const matchesPlatform =
      filterPlatform === 'all' || acc.devices.some((d) => d.platform === filterPlatform);
    const matchesExpiring =
      !filterExpiringSoon ||
      (acc.expiresAt &&
        new Date(acc.expiresAt).getTime() > nowMs &&
        new Date(acc.expiresAt).getTime() - nowMs <= 7 * 86400 * 1000);

    return matchesSearch && matchesPlan && matchesStatus && matchesPlatform && matchesExpiring;
  });

  const expiringAccounts = accounts.filter((acc) => {
    if (!acc.expiresAt) return false;
    const expMs = new Date(acc.expiresAt).getTime();
    const diffDays = (expMs - nowMs) / (86400 * 1000);
    return diffDays > 0 && diffDays <= 7;
  });

  const copyAccountId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard access denied
    }
  };

  return (
    <>
      {/* Charts: User Growth & App Launches */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <Icon name="admin.trend" size="sm" tone="success" />
                <span>рост пользователей (новых за {period})</span>
              </div>
            </div>
            <SparklineChart
              data={analytics.userGrowth.map((g) => ({
                label: g.date.slice(5),
                value: g.total,
              }))}
              color="var(--color-success)"
              unit="юзеров"
            />
          </div>

          <div className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <Icon name="status.priority" size="sm" tone="info" />
                <span>активность и заходы в приложение</span>
              </div>
            </div>
            <BarChart
              data={analytics.appLaunches.map((l) => ({
                label: l.date.slice(5),
                value: l.total,
              }))}
              color="var(--color-mention)"
              unit="заходов"
            />
          </div>
        </div>
      )}

      {/* Filter controls */}
      <div className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="поиск по id или имени устройства..."
            className="w-full sm:max-w-xs rounded-lg border border-tint-8 bg-panel px-3 py-1.5 text-xs text-fg-primary font-mono outline-none ring-0 focus:border-tint-20 transition-colors"
          />
          <span className="text-xs font-mono text-fg-muted shrink-0">
            найдено: {filteredAccounts.length} / {accounts.length}
          </span>
        </div>

        {/* Multi-facet filter buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-tint-4 text-2xs font-mono">
          <div className="flex items-center gap-1 pr-2 border-r border-tint-6">
            <span className="text-fg-muted mr-1">тариф:</span>
            {(['all', 'free', 'smile', 'angry'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlan(p)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  filterPlan === p
                    ? 'bg-white text-black font-semibold'
                    : 'bg-tint-3 text-fg-secondary hover:text-white'
                }`}
              >
                {p === 'all' ? 'все' : p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r border-tint-6">
            <span className="text-fg-muted mr-1">статус:</span>
            {(['all', 'active', 'blocked'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  filterStatus === s
                    ? 'bg-white text-black font-semibold'
                    : 'bg-tint-3 text-fg-secondary hover:text-white'
                }`}
              >
                {s === 'all' ? 'все' : s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r border-tint-6">
            <span className="text-fg-muted mr-1">платформа:</span>
            {(['all', 'desktop', 'mobile'] as const).map((plt) => (
              <button
                key={plt}
                type="button"
                onClick={() => setFilterPlatform(plt)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  filterPlatform === plt
                    ? 'bg-white text-black font-semibold'
                    : 'bg-tint-3 text-fg-secondary hover:text-white'
                }`}
              >
                {plt === 'all' ? 'все' : plt}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFilterExpiringSoon((prev) => !prev)}
            className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterExpiringSoon
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-tint-3 text-fg-secondary hover:text-white'
            }`}
          >
            <Icon name="time.time" size="sm" tone="warning" />
            <span>истекают скоро (≤7д)</span>
            {expiringAccounts.length > 0 && (
              <span className="px-1 rounded bg-amber-500/30 text-3xs text-amber-200">
                {expiringAccounts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Accounts list */}
      <div className="flex flex-col gap-3">
        {filteredAccounts.map((acc) => {
          const isUpdating = actionBusy;
          const isInlineOpen = inlineGrantAccountId === acc.id;

          return (
            <div key={acc.id} className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-medium text-white break-all" title={acc.id}>
                    {acc.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyAccountId(acc.id)}
                    className="text-fg-muted hover:text-white transition-colors cursor-pointer shrink-0"
                    title="скопировать id"
                  >
                    {copiedId === acc.id ? <Icon name="action.check" size="sm" tone="success" /> : <Icon name="action.copy" size="sm" tone="inherit" />}
                  </button>
                  <span
                    className={`text-2xs font-mono px-1.5 py-0.5 rounded ${
                      acc.status === 'blocked' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-fg-muted'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Direct action: inline renewal button */}
                  <button
                    type="button"
                    onClick={() => setInlineGrantAccountId((prev) => (prev === acc.id ? null : acc.id))}
                    className="px-2.5 py-1 text-2xs font-mono rounded bg-tint-10 hover:bg-tint-15 text-fg-soft flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Icon name="admin.billing" size="sm" tone="success" />
                    <span>{isInlineOpen ? 'скрыть' : '+ подписка'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {PLANS.map((plan) => {
                      const isActive = acc.plan === plan;
                      return (
                        <button
                          key={plan}
                          type="button"
                          disabled={isUpdating || isActive}
                          onClick={() => void onPlanChange(acc.id, plan)}
                          className={`px-2.5 py-1 text-2xs font-mono rounded transition-colors cursor-pointer disabled:cursor-default ${
                            isActive
                              ? 'bg-white text-black font-medium'
                              : 'bg-tint-4 text-fg-secondary hover:text-white hover:bg-tint-8'
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
                    onClick={() => void onToggleStatus(acc.id)}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${
                      acc.status === 'blocked'
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-tint-4 text-fg-secondary hover:text-rose-400 hover:bg-tint-8'
                    }`}
                    title={acc.status === 'blocked' ? 'разблокировать' : 'заблокировать'}
                  >
                    {acc.status === 'blocked' ? <Icon name="status.unlocked" size="sm" tone="inherit" /> : <Icon name="action.lock" size="sm" tone="inherit" />}
                  </button>
                </div>
              </div>

              {/* Inline Quick Grant Drawer */}
              {isInlineOpen && (
                <div className="p-3 rounded-lg bg-panel border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-fg-tertiary">
                    <Icon name="status.priority" size="sm" tone="success" />
                    <span>быстрое продление:</span>
                  </div>
                  <div className="flex items-center gap-2 text-2xs font-mono">
                    <select
                      value={inlinePlan}
                      onChange={(e) => setInlinePlan(e.target.value as 'smile' | 'angry')}
                      className="rounded bg-surface border border-tint-8 px-2 py-1 text-white outline-none"
                    >
                      <option value="smile">Smile (190 ₽)</option>
                      <option value="angry">Angry (490 ₽)</option>
                    </select>
                    <select
                      value={inlineDays}
                      onChange={(e) => setInlineDays(e.target.value)}
                      className="rounded bg-surface border border-tint-8 px-2 py-1 text-white outline-none"
                    >
                      <option value="30">30 дней</option>
                      <option value="90">90 дней</option>
                      <option value="365">365 дней</option>
                    </select>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void onQuickGrant(acc.id, inlinePlan, parseInt(inlineDays, 10))}
                      className="px-3 py-1 bg-emerald-400 text-black font-semibold rounded hover:bg-emerald-300 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      начислить
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-secondary">
                <span>кеш {acc.usedCacheMb} / {acc.maxCacheMb} мб</span>
                <span>устройств {acc.devices.length} / {acc.maxDevices}</span>
                {acc.vaults && acc.vaults.length > 0 && <span>хранилищ: {acc.vaults.length}</span>}
                {acc.createdAt && (
                  <span className="text-fg-muted">
                    создан {new Date(acc.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                )}
                {acc.expiresAt && (
                  <span className="text-amber-400/90 font-mono text-2xs">
                    подписка до {new Date(acc.expiresAt).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>

              {acc.vaults && acc.vaults.length > 0 && (
                <div className="border-t border-tint-4 pt-2 flex flex-wrap gap-2 text-2xs text-fg-secondary">
                  {acc.vaults.map((v) => (
                    <span
                      key={v.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-tint-3 border border-tint-4"
                    >
                      <Icon name="entity.folderSynced" size="sm" tone="muted" />
                      <span className="text-fg-tertiary">{v.name}</span>
                      <span className="text-fg-muted font-mono">({v.grantsCount} девайсов)</span>
                    </span>
                  ))}
                </div>
              )}

              {acc.devices.length > 0 && (
                <div className="border-t border-tint-4 pt-2.5 flex flex-col gap-1.5">
                  {acc.devices.map((dev) => (
                    <div key={dev.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {dev.platform === 'mobile' ? (
                          <Icon name="entity.phone" size="sm" tone="muted" className="shrink-0" />
                        ) : (
                          <Icon name="entity.desktop" size="sm" tone="muted" className="shrink-0" />
                        )}
                        <span className="text-fg-tertiary truncate">{dev.name}</span>
                        <span className="text-2xs font-mono text-fg-dim truncate" title={dev.id}>
                          {shortId(dev.id)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-2xs font-mono shrink-0">
                        <span
                          className={
                            dev.status === 'active'
                              ? 'text-emerald-400'
                              : dev.status === 'pending'
                              ? 'text-amber-400'
                              : 'text-fg-muted'
                          }
                        >
                          {dev.status}
                        </span>
                        {dev.lastSeenAt && (
                          <span className="text-fg-muted hidden sm:inline">
                            {new Date(dev.lastSeenAt).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                        {dev.status === 'active' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void onRevokeDevice(acc.id, dev.id)}
                            className="text-fg-muted hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-40"
                            title="отозвать доступ"
                          >
                            <Icon name="action.delete" size="sm" tone="inherit" />
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
          <div className="py-8 text-center text-xs text-fg-muted">
            {accounts.length === 0 ? 'нет зарегистрированных аккаунтов' : 'ничего не найдено под выбранные фильтры'}
          </div>
        )}
      </div>
    </>
  );
};
