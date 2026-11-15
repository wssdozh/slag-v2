// Admin relay tab: uptime, rooms, storage and the purge/cleanup/vacuum controls.
import React from 'react';
import { BarChart } from '../Charts';
import type { AdminRoom, AdminStats, AnalyticsData } from '../useAdminData';
import { formatBytes } from '../../../lib/text/formatBytes';
import { shortId } from '../../../lib/text/shortId';
import { Icon } from '../../UI/icons/Icon';
interface RelayTabProps {
  period: '7d' | '30d';
  stats: AdminStats | null;
  rooms: AdminRoom[];
  analytics: AnalyticsData | null;
  actionBusy: boolean;
  onPurgeRoom: (roomId: string) => void;
  onCleanup: () => void;
  onVacuum: () => void;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${seconds}с`;
}

export const RelayTab: React.FC<RelayTabProps> = ({
  period,
  stats,
  rooms,
  analytics,
  actionBusy,
  onPurgeRoom,
  onCleanup,
  onVacuum,
}) => {
  return (
    <div className="flex flex-col gap-6">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface border border-tint-6 flex flex-col gap-1">
            <span className="text-2xs font-mono text-fg-muted">uptime</span>
            <span className="text-sm font-semibold text-white">{formatUptime(stats.uptime)}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-tint-6 flex flex-col gap-1">
            <span className="text-2xs font-mono text-fg-muted">размер базы</span>
            <span className="text-sm font-semibold text-white">{formatBytes(stats.dbSizeBytes) || '0 B'}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-tint-6 flex flex-col gap-1">
            <span className="text-2xs font-mono text-fg-muted">активные сессии</span>
            <span className="text-sm font-semibold text-white">{stats.activeSessions}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-tint-6 flex flex-col gap-1">
            <span className="text-2xs font-mono text-fg-muted">пакетов в очереди</span>
            <span className="text-sm font-semibold text-white">{stats.totalBundles}</span>
          </div>
        </div>
      )}

      {/* Sync health metrics & Traffic chart */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <Icon name="status.live" size="sm" tone="success" />
                <span>трафик синхронизации (бандлов за {period})</span>
              </div>
            </div>
            <BarChart
              data={analytics.traffic.map((t) => ({
                label: t.date.slice(5),
                value: t.bundles,
              }))}
              color="var(--color-success)"
              unit="бандлов"
            />
          </div>

          <div className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-xs font-medium text-white">
              <div className="flex items-center gap-2">
                <Icon name="admin.activity" size="sm" tone="success" />
                <span>здоровье синхронизации (error rate)</span>
              </div>
              <span className="text-2xs font-mono text-emerald-400">
                {analytics.syncHealth.successRatePercent}% успех
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded bg-tint-3 border border-tint-4">
                <span className="block text-3xs font-mono text-fg-muted">подтверждений (acks)</span>
                <span className="text-sm font-semibold text-white">
                  {analytics.syncHealth.totalAcks}
                </span>
              </div>
              <div className="p-2.5 rounded bg-tint-3 border border-tint-4">
                <span className="block text-3xs font-mono text-fg-muted">зависших пакетов</span>
                <span className={`text-sm font-semibold ${analytics.syncHealth.stuckUnackedBundles > 50 ? 'text-amber-400' : 'text-fg-tertiary'}`}>
                  {analytics.syncHealth.stuckUnackedBundles}
                </span>
              </div>
            </div>

            <p className="text-2xs text-fg-secondary leading-relaxed">
              зависшие пакеты возникают, когда один из девайсов пользователя долго оффлайн или не шлет acks. их можно сбросить вручную ниже в инспекторе хранилища.
            </p>
          </div>
        </div>
      )}

      {/* Storage Runaway Inspector */}
      {analytics && analytics.syncHealth.topHeavyRooms.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-amber-500/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <Icon name="status.warning" size="md" tone="warning" />
              <span>инспектор хранилища (топ комнат по весу кеша)</span>
            </div>
            <span className="text-2xs font-mono text-fg-muted">защита от переполнения диска</span>
          </div>

          <div className="flex flex-col gap-2">
            {analytics.syncHealth.topHeavyRooms.map((room) => (
              <div
                key={room.roomId}
                className="p-2.5 rounded-lg bg-panel border border-tint-4 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-white">{shortId(room.roomId)}</span>
                  {room.vaultId && (
                    <span className="text-3xs font-mono text-fg-muted truncate">
                      vault: {shortId(room.vaultId)}
                    </span>
                  )}
                  <span className="text-2xs font-mono text-fg-secondary">
                    ({room.bundlesCount} бандлов)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xs font-mono font-semibold text-amber-400">
                    {formatBytes(room.cacheBytes) || '0 B'}
                  </span>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onPurgeRoom(room.roomId)}
                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-2xs font-mono rounded transition-colors cursor-pointer"
                  >
                    сбросить зависшие пакеты
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance Actions */}
      <div className="p-4 rounded-xl bg-surface border border-tint-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-white">
          <Icon name="admin.maintenance" size="sm" />
          <span>инструменты обслуживания</span>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void onCleanup()}
            className="px-3.5 py-2 bg-tint-10 hover:bg-tint-15 text-fg-soft text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-2"
          >
            {actionBusy && <Icon name="status.loading" size="sm" tone="inherit" className="animate-spin" />}
            <span>очистить истекшие данные</span>
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void onVacuum()}
            className="px-3.5 py-2 bg-tint-10 hover:bg-tint-15 text-fg-soft text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-2"
          >
            <Icon name="entity.vault" size="sm" tone="inherit" />
            <span>сжать базу (vacuum)</span>
          </button>
        </div>
      </div>

      {/* Rooms List */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-medium text-white">
          <div className="flex items-center gap-2">
            <Icon name="status.live" size="sm" tone="success" />
            <span>комнаты синхронизации ({rooms.length})</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {rooms.map((r) => (
            <div
              key={r.roomId}
              className="p-3 rounded-lg bg-surface border border-tint-4 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-fg-soft truncate" title={r.roomId}>
                  {shortId(r.roomId)}
                </span>
                {r.vaultId && (
                  <span className="text-2xs font-mono text-fg-muted truncate" title={r.vaultId}>
                    vault: {shortId(r.vaultId)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-2xs font-mono text-fg-secondary shrink-0">
                <span>бандлов: {r.bundlesCount}</span>
                <span>кеш: {formatBytes(r.cacheBytes) || '0 B'}</span>
                {r.lastActiveAt && (
                  <span className="text-fg-muted">
                    активность {new Date(r.lastActiveAt).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>
            </div>
          ))}

          {rooms.length === 0 && (
            <div className="py-6 text-center text-xs text-fg-muted">нет активных комнат</div>
          )}
        </div>
      </div>
    </div>
  );
};
