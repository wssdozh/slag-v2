// Admin security tab: blocked accounts, revoked devices, encryption note, audit log.
import React from 'react';
import type { AuditLog } from '../useAdminData';
import { shortId } from '../../../lib/text/shortId';

interface SecurityTabProps {
  securityStats: { blockedAccountsCount: number; revokedDevicesCount: number } | null;
  auditLogs: AuditLog[];
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  securityStats,
  auditLogs,
}) => {
  return (
    <div className="flex flex-col gap-6">
      {securityStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">заблокировано аккаунтов</span>
            <span className={`text-sm font-semibold ${securityStats.blockedAccountsCount > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
              {securityStats.blockedAccountsCount}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-zinc-500">отозвано устройств</span>
            <span className="text-sm font-semibold text-zinc-400">
              {securityStats.revokedDevicesCount}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-surface border border-white/[0.06] flex flex-col gap-1 col-span-2 sm:col-span-1">
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
              className="p-3 rounded-lg bg-surface border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs"
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
  );
};
