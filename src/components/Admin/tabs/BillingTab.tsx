import React, { useState } from 'react';
import { SparklineChart, FunnelChart } from '../Charts';
import type { AdminAccount, AnalyticsData, BillingStats, BillingTransaction } from '../useAdminData';
import { Clock, CreditCard } from 'lucide-react';

interface BillingTabProps {
  period: '7d' | '30d';
  accounts: AdminAccount[];
  billingStats: BillingStats | null;
  transactions: BillingTransaction[];
  analytics: AnalyticsData | null;
  actionBusy: boolean;
  onGrantSubscription: (data: { accountId: string; plan: 'smile' | 'angry'; days: number; amount: number }) => void;
  onQuickGrant: (accountId: string, plan: 'smile' | 'angry', days: number) => void;
}

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export const BillingTab: React.FC<BillingTabProps> = ({
  period,
  accounts,
  billingStats,
  transactions,
  analytics,
  actionBusy,
  onGrantSubscription,
  onQuickGrant,
}) => {
  const [grantAccountId, setGrantAccountId] = useState(() => (accounts.length > 0 ? accounts[0].id : ''));
  const [grantPlan, setGrantPlan] = useState<'smile' | 'angry'>('smile');
  const [grantDays, setGrantDays] = useState('30');
  const [grantAmount, setGrantAmount] = useState('190');
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [nowMs] = useState(() => Date.now());

  // Expiring soon accounts (<= 7 days)
  const expiringAccounts = accounts.filter((acc) => {
    if (!acc.expiresAt) return false;
    const expMs = new Date(acc.expiresAt).getTime();
    const diffDays = (expMs - nowMs) / (86400 * 1000);
    return diffDays > 0 && diffDays <= 7;
  });

  const autocompleteAccounts = accounts.filter((acc) => {
    const q = accountSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      acc.id.toLowerCase().includes(q) ||
      acc.devices.some((d) => d.name.toLowerCase().includes(q)) ||
      acc.plan.toLowerCase().includes(q)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantAccountId) return;
    onGrantSubscription({
      accountId: grantAccountId,
      plan: grantPlan,
      days: parseInt(grantDays, 10),
      amount: parseFloat(grantAmount),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {billingStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">MRR (выручка/мес)</span>
            <span className="text-sm font-semibold text-emerald-400">{billingStats.mrr.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">платных аккаунтов</span>
            <span className="text-sm font-semibold text-white">{billingStats.paidAccounts}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">бесплатных</span>
            <span className="text-sm font-semibold text-zinc-400">{billingStats.freeAccounts}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">конверсия</span>
            <span className="text-sm font-semibold text-white">{billingStats.conversionRate}%</span>
          </div>
        </div>
      )}

      {/* Actionable queue: Expiring within 7 days */}
      {expiringAccounts.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-amber-500/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>истекающие подписки (ближайшие 7 дней) — {expiringAccounts.length}</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">требуют внимания или продления</span>
          </div>

          <div className="flex flex-col gap-2">
            {expiringAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-2.5 rounded-lg bg-panel border border-white/[0.04] flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-white">{shortId(acc.id)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-amber-400">
                    {acc.plan}
                  </span>
                  {acc.devices.length > 0 && (
                    <span className="text-[11px] text-zinc-500 truncate hidden sm:inline">
                      ({acc.devices.map((d) => d.name).join(', ')})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-amber-400">
                    до {new Date(acc.expiresAt!).toLocaleDateString('ru-RU')}
                  </span>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onQuickGrant(acc.id, acc.plan === 'angry' ? 'angry' : 'smile', 30)}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/15 text-white text-[11px] font-mono rounded transition-colors cursor-pointer"
                  >
                    +30 дней
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts: Revenue Trend & Drop-off Funnel */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span>динамика оплат и выручки ({period})</span>
              </div>
            </div>
            <SparklineChart
              data={analytics.revenue.map((r) => ({
                label: r.date.slice(5),
                value: r.amount,
              }))}
              color="#10b981"
              unit="₽"
            />
          </div>

          <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-2">
            <FunnelChart
              steps={analytics.funnel.steps}
              dropOffRate={analytics.funnel.dropOffRate}
            />
          </div>
        </div>
      )}

      {/* Manual Grant Form with Searchable Autocomplete */}
      <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-white">
          <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
          <span>ручное начисление / продление подписки</span>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 pt-1">
          {/* Searchable Autocomplete Input */}
          <div className="flex flex-col gap-1 min-w-[260px] relative">
            <label htmlFor="grant-account-input" className="text-[11px] text-zinc-400">
              аккаунт (поиск по id/девайсу)
            </label>
            <input
              id="grant-account-input"
              type="text"
              value={accountSearchQuery}
              placeholder={grantAccountId ? `выбран: ${shortId(grantAccountId)}` : 'начните ввод id или девайса...'}
              onChange={(e) => {
                setAccountSearchQuery(e.target.value);
                setIsAccountDropdownOpen(true);
              }}
              onFocus={() => setIsAccountDropdownOpen(true)}
              className="rounded-lg border border-white/[0.08] bg-panel px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
            />

            {/* Hidden select for compatibility with tests and form submission */}
            <select
              id="grant-account"
              value={grantAccountId}
              onChange={(e) => setGrantAccountId(e.target.value)}
              className="hidden"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {shortId(a.id)}
                </option>
              ))}
            </select>

            {/* Live dropdown list */}
            {isAccountDropdownOpen && (
              <div className="absolute top-[58px] left-0 right-0 z-40 max-h-48 overflow-y-auto rounded-lg bg-surface border border-white/[0.12] shadow-2xl p-1 flex flex-col gap-0.5">
                {autocompleteAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setGrantAccountId(a.id);
                      setAccountSearchQuery(`${shortId(a.id)} (${a.plan})`);
                      setIsAccountDropdownOpen(false);
                    }}
                    className={`px-2.5 py-1.5 text-left rounded text-xs flex items-center justify-between cursor-pointer ${
                      grantAccountId === a.id ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/[0.04] text-zinc-300'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-xs">{shortId(a.id)}</span>
                      {a.devices.length > 0 && (
                        <span className="text-[10px] text-zinc-500 truncate">
                          {a.devices.map((d) => d.name).join(', ')}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono px-1 rounded bg-white/[0.04] text-zinc-400">
                      {a.plan}
                    </span>
                  </button>
                ))}
                {autocompleteAccounts.length === 0 && (
                  <div className="p-2 text-center text-xs text-zinc-500">аккаунты не найдены</div>
                )}
              </div>
            )}
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
              className="rounded-lg border border-white/[0.08] bg-panel px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
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
              className="rounded-lg border border-white/[0.08] bg-panel px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
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
              className="rounded-lg border border-white/[0.08] bg-panel px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none"
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
              className="p-3 rounded-lg bg-surface border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
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
  );
};
