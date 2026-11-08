import React from 'react';
import { DistributionGauge } from '../Charts';
import type { AiLog, AiStats, AnalyticsData } from '../useAdminData';
import { Activity, Loader2, Sparkles, TrendingUp } from 'lucide-react';

interface AiTabProps {
  aiStats: AiStats | null;
  aiLogs: AiLog[];
  analytics: AnalyticsData | null;
  actionBusy: boolean;
  onAiPing: () => void;
}

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export const AiTab: React.FC<AiTabProps> = ({
  aiStats,
  aiLogs,
  analytics,
  actionBusy,
  onAiPing,
}) => {
  return (
    <div className="flex flex-col gap-6">
      {aiStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">статус шлюза</span>
            <span className={`text-sm font-semibold ${aiStats.gatewayStatus === 'operational' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {aiStats.gatewayStatus}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">всего запросов</span>
            <span className="text-sm font-semibold text-white">{aiStats.totalRequests}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">суммарно токенов</span>
            <span className="text-sm font-semibold text-white">{aiStats.totalTokens.toLocaleString('ru-RU')}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">активные модели</span>
            <span className="text-xs font-mono text-zinc-300 truncate">
              {aiStats.activeModels.join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Distribution and Unit-economics */}
      {analytics && analytics.aiDistribution && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>распределение расхода токенов на юзера</span>
              </div>
            </div>
            <DistributionGauge
              min={analytics.aiDistribution.minTokens}
              max={analytics.aiDistribution.maxTokens}
              mean={analytics.aiDistribution.meanTokens}
              median={analytics.aiDistribution.medianTokens}
              unit="tok"
            />
          </div>

          <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>unit-экономика ии-шлюза</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">себестоимость API vs доход</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded bg-white/[0.03] border border-white/[0.04]">
                <span className="block text-[10px] font-mono text-zinc-500">затраты на API</span>
                <span className="text-sm font-semibold text-rose-400">
                  {analytics.aiDistribution.totalCostRub} ₽
                </span>
              </div>
              <div className="p-2.5 rounded bg-white/[0.03] border border-white/[0.04]">
                <span className="block text-[10px] font-mono text-zinc-500">выручка подписок</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {analytics.aiDistribution.totalRevenueRub} ₽
                </span>
              </div>
              <div className="p-2.5 rounded bg-white/[0.03] border border-white/[0.04]">
                <span className="block text-[10px] font-mono text-zinc-500">маржинальность</span>
                <span className="text-sm font-semibold text-white">
                  {analytics.aiDistribution.grossMarginPercent}%
                </span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              себестоимость рассчитывается по 0.14 ₽ за 1k токенов (базовый тариф DeepSeek V4). пока маржинальность выше 80%, лимиты тарифов сбалансированы.
            </p>
          </div>
        </div>
      )}

      {/* Top Spenders Table */}
      {analytics && analytics.aiDistribution && analytics.aiDistribution.topUsers.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-3">
          <span className="text-xs font-medium text-white">топ транжир токенов (риск перерасхода)</span>
          <div className="flex flex-col gap-1.5">
            {analytics.aiDistribution.topUsers.map((u) => {
              const planPrice = u.plan === 'angry' ? 490 : 190;
              const isBurnHigh = u.costRub > planPrice * 0.5;

              return (
                <div
                  key={u.accountId}
                  className="p-2.5 rounded-lg bg-panel border border-white/[0.04] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-white">{shortId(u.accountId)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-zinc-300">
                      {u.plan}
                    </span>
                    <span className="text-[11px] text-zinc-500">({u.requests} запросов)</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono">
                    <span className="text-zinc-300">{u.tokens.toLocaleString('ru-RU')} tok</span>
                    <span className={`font-semibold ${isBurnHigh ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {u.costRub} ₽
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Benchmark Ping Action */}
      <div className="p-4 rounded-xl bg-surface border border-white/[0.06] flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-white">диагностика апстрима</span>
          <span className="text-xs text-zinc-500">проверка задержки и доступности шлюза к моделям</span>
        </div>
        <button
          type="button"
          disabled={actionBusy}
          onClick={() => void onAiPing()}
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
              className="p-3 rounded-lg bg-surface border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
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
  );
};
