import React from 'react';
import { SparklineChart, BarChart } from '../Charts';
import type { AdminAccount, AnalyticsData } from '../useAdminData';
import {
  Check,
  Clock,
  Copy,
  CreditCard,
  FolderSync,
  Laptop,
  Lock,
  Smartphone,
  Trash2,
  TrendingUp,
  Unlock,
  Zap,
} from 'lucide-react';

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

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

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
          <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>рост пользователей (новых за {period})</span>
              </div>
            </div>
            <SparklineChart
              data={analytics.userGrowth.map((g) => ({
                label: g.date.slice(5),
                value: g.total,
              }))}
              color="#10b981"
              unit="юзеров"
            />
          </div>

          <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                <span>активность и заходы в приложение</span>
              </div>
            </div>
            <BarChart
              data={analytics.appLaunches.map((l) => ({
                label: l.date.slice(5),
                value: l.total,
              }))}
              color="#38bdf8"
              unit="заходов"
            />
          </div>
        </div>
      )}

      {/* Filter controls */}
      <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="поиск по id или имени устройства..."
            className="w-full sm:max-w-xs rounded-lg border border-white/[0.08] bg-panel px-3 py-1.5 text-xs text-zinc-100 font-mono outline-none ring-0 focus:border-white/20 transition-colors"
          />
          <span className="text-xs font-mono text-zinc-500 shrink-0">
            найдено: {filteredAccounts.length} / {accounts.length}
          </span>
        </div>

        {/* Multi-facet filter buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.04] text-[11px] font-mono">
          <div className="flex items-center gap-1 pr-2 border-r border-white/[0.06]">
            <span className="text-zinc-500 mr-1">тариф:</span>
            {(['all', 'free', 'smile', 'angry'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlan(p)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  filterPlan === p
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/[0.03] text-zinc-400 hover:text-white'
                }`}
              >
                {p === 'all' ? 'все' : p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r border-white/[0.06]">
            <span className="text-zinc-500 mr-1">статус:</span>
            {(['all', 'active', 'blocked'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  filterStatus === s
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/[0.03] text-zinc-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'все' : s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r border-white/[0.06]">
            <span className="text-zinc-500 mr-1">платформа:</span>
            {(['all', 'desktop', 'mobile'] as const).map((plt) => (
              <button
                key={plt}
                type="button"
                onClick={() => setFilterPlatform(plt)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  filterPlatform === plt
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/[0.03] text-zinc-400 hover:text-white'
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
                : 'bg-white/[0.03] text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-3 h-3 text-amber-400" />
            <span>истекают скоро (≤7д)</span>
            {expiringAccounts.length > 0 && (
              <span className="px-1 rounded bg-amber-500/30 text-[10px] text-amber-200">
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
            <div key={acc.id} className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-3">
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
                  {/* Direct action: inline renewal button */}
                  <button
                    type="button"
                    onClick={() => setInlineGrantAccountId((prev) => (prev === acc.id ? null : acc.id))}
                    className="px-2.5 py-1 text-[11px] font-mono rounded bg-white/10 hover:bg-white/15 text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <CreditCard className="w-3 h-3 text-emerald-400" />
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
                    onClick={() => void onToggleStatus(acc.id)}
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

              {/* Inline Quick Grant Drawer */}
              {isInlineOpen && (
                <div className="p-3 rounded-lg bg-panel border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span>быстрое продление:</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <select
                      value={inlinePlan}
                      onChange={(e) => setInlinePlan(e.target.value as 'smile' | 'angry')}
                      className="rounded bg-surface border border-white/[0.08] px-2 py-1 text-white outline-none"
                    >
                      <option value="smile">Smile (190 ₽)</option>
                      <option value="angry">Angry (490 ₽)</option>
                    </select>
                    <select
                      value={inlineDays}
                      onChange={(e) => setInlineDays(e.target.value)}
                      className="rounded bg-surface border border-white/[0.08] px-2 py-1 text-white outline-none"
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
                            onClick={() => void onRevokeDevice(acc.id, dev.id)}
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
            {accounts.length === 0 ? 'нет зарегистрированных аккаунтов' : 'ничего не найдено под выбранные фильтры'}
          </div>
        )}
      </div>
    </>
  );
};
