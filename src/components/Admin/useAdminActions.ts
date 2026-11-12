import type { Dispatch, SetStateAction } from 'react';
import type { AdminAccount } from './useAdminData';

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export interface GrantSubscriptionInput {
  accountId: string;
  plan: 'smile' | 'angry';
  days: number;
  amount: number;
}

export interface AdminActionsDeps {
  token: string;
  serverUrl: string;
  period: '7d' | '30d';
  loadData: (activeToken: string, activeUrl: string, activePeriod: '7d' | '30d') => Promise<void>;
  setAccounts: Dispatch<SetStateAction<AdminAccount[]>>;
  setActionBusy: Dispatch<SetStateAction<boolean>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
  setCustomError: Dispatch<SetStateAction<string | null>>;
}

export const useAdminActions = ({
  token,
  serverUrl,
  period,
  loadData,
  setAccounts,
  setActionBusy,
  setStatusMessage,
  setCustomError,
}: AdminActionsDeps) => {
  const planChange = async (accountId: string, newPlan: 'free' | 'smile' | 'angry') => {
    setActionBusy(true);
    setCustomError(null);
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
      setCustomError(`не удалось сменить тариф: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const toggleStatus = async (accountId: string) => {
    setActionBusy(true);
    setCustomError(null);
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
      const data = (await res.json()) as { account: { status: 'active' | 'blocked' } };
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === accountId ? { ...acc, status: data.account.status } : acc))
      );
    } catch (err) {
      setCustomError(`не удалось изменить статус: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const revokeDevice = async (accountId: string, deviceId: string) => {
    setActionBusy(true);
    setCustomError(null);
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
      setCustomError(`не удалось отозвать устройство: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const grantSubscription = async (data: GrantSubscriptionInput) => {
    setActionBusy(true);
    setStatusMessage(null);
    setCustomError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/billing/grant`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: data.accountId,
          plan: data.plan,
          periodDays: data.days,
          amount: data.amount,
        }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `ошибка ${res.status}`);
      }
      setStatusMessage(`подписка ${data.plan} начислена аккаунту ${shortId(data.accountId)}`);
      await loadData(token, serverUrl, period);
    } catch (err) {
      setCustomError(`ошибка начисления: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const quickGrant = async (accountId: string, plan: 'smile' | 'angry' = 'smile', days = 30) => {
    setActionBusy(true);
    setStatusMessage(null);
    setCustomError(null);
    try {
      const amount = plan === 'smile' ? 190 : 490;
      const res = await fetch(`${serverUrl}/api/admin/billing/grant`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId, plan, periodDays: days, amount }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `ошибка ${res.status}`);
      }
      setStatusMessage(`подписка ${plan} начислена аккаунту ${shortId(accountId)}`);
      await loadData(token, serverUrl, period);
    } catch (err) {
      setCustomError(`ошибка начисления: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const purgeRoom = async (roomId: string) => {
    setActionBusy(true);
    setStatusMessage(null);
    setCustomError(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/rooms/${encodeURIComponent(roomId)}/purge-unacked`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`ошибка ${res.status}`);
      const data = (await res.json()) as { deletedBundles?: number };
      setStatusMessage(`кеш комнаты ${shortId(roomId)} сброшен (удалено ${data.deletedBundles || 0} пакетов)`);
      await loadData(token, serverUrl, period);
    } catch (err) {
      setCustomError(`ошибка очистки комнаты: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const aiPing = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    setCustomError(null);
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
      await loadData(token, serverUrl, period);
    } catch (err) {
      setCustomError(`ошибка пинга шлюза: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const cleanup = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    setCustomError(null);
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
      await loadData(token, serverUrl, period);
    } catch (err) {
      setCustomError(`ошибка очистки: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  const vacuum = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    setCustomError(null);
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
        `база сжата: ${data.bytesBefore} → ${data.bytesAfter} (освобождено ${data.freedBytes || 0} B)`
      );
      await loadData(token, serverUrl, period);
    } catch (err) {
      setCustomError(`ошибка сжатия базы: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionBusy(false);
    }
  };

  return {
    planChange,
    toggleStatus,
    revokeDevice,
    grantSubscription,
    quickGrant,
    purgeRoom,
    aiPing,
    cleanup,
    vacuum,
  };
};
