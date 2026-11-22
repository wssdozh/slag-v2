// Admin data loader and its API types: stats, accounts, analytics, audit log.
import { useCallback, useState } from 'react';

// Interfaces from AdminPanel.tsx
export interface AdminStats {
  uptime: number;
  totalAccounts: number;
  totalDevices: number;
  activeRooms: number;
  totalBundles: number;
  totalCacheBytes: number;
  activeSessions: number;
  pendingPairings: number;
  totalVaults: number;
  dbSizeBytes: number;
}

export interface AdminDevice {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
}

export interface AdminVault {
  id: string;
  name: string;
  updatedAt: string | null;
  grantsCount: number;
}

export interface AdminAccount {
  id: string;
  plan: 'free' | 'smile' | 'angry';
  planLabel: string;
  createdAt: string | null;
  expiresAt: string | null;
  status: 'active' | 'blocked';
  maxDevices: number;
  maxCacheMb: number;
  usedCacheMb: number;
  devices: AdminDevice[];
  vaults?: AdminVault[];
}

export interface BillingStats {
  mrr: number;
  totalRevenue: number;
  paidAccounts: number;
  freeAccounts: number;
  conversionRate: number;
}

export interface BillingTransaction {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  plan: string;
  periodDays: number;
  status: string;
  createdAt: string | null;
}

export interface AiStats {
  gatewayStatus: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  activeModels: string[];
}

export interface AiLog {
  id: string;
  accountId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  createdAt: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string | null;
}

export type RoomMigrationAction = 'note-freeze' | 'note-thaw' | 'note-activate';

export interface AdminRoom {
  roomId: string;
  vaultId: string | null;
  lastActiveAt: string | null;
  createdAt: string | null;
  bundlesCount: number;
  cacheBytes: number;
  noteStatus?: { mode: 'legacy' | 'frozen' | 'registry'; generation: number; head: number };
  noteMigration?: boolean;
  noteWriters?: { id: string; name: string }[];
}

export interface AnalyticsData {
  period: '7d' | '30d';
  dates: string[];
  userGrowth: Array<{ date: string; free: number; smile: number; angry: number; total: number }>;
  appLaunches: Array<{ date: string; desktop: number; mobile: number; web: number; total: number }>;
  revenue: Array<{ date: string; amount: number; count: number }>;
  traffic: Array<{ date: string; bytes: number; bundles: number }>;
  funnel: {
    landingViews: number;
    ctaClicks: number;
    paywallViews: number;
    checkoutStarts: number;
    paidConversions: number;
    dropOffRate: number;
    steps: Array<{ name: string; count: number; rate: number }>;
  };
  aiDistribution: {
    meanTokens: number;
    medianTokens: number;
    minTokens: number;
    maxTokens: number;
    totalTokens: number;
    totalCostRub: number;
    totalRevenueRub: number;
    grossMarginPercent: number;
    topUsers: Array<{ accountId: string; tokens: number; costRub: number; plan: string; requests: number }>;
    dailyTokens: Array<{ date: string; promptTokens: number; completionTokens: number; total: number }>;
  };
  syncHealth: {
    totalBundles: number;
    totalAcks: number;
    successRatePercent: number;
    stuckUnackedBundles: number;
    topHeavyRooms: Array<{ roomId: string; vaultId: string | null; bundlesCount: number; cacheBytes: number }>;
  };
}

export const useAdminData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [billingStats, setBillingStats] = useState<BillingStats | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityStats, setSecurityStats] = useState<{ blockedAccountsCount: number; revokedDevicesCount: number } | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const loadData = useCallback(async (activeToken: string, activeUrl: string, activePeriod: '7d' | '30d') => {
    setLoading(true);
    setError(null);
    const headers = {
      Authorization: `Bearer ${activeToken}`,
      'Content-Type': 'application/json',
    };
    try {
      const [statsRes, accountsRes, roomsRes, billStatsRes, txRes, aiStatsRes, aiLogsRes, auditRes, analyticsRes] =
        await Promise.all([
          fetch(`${activeUrl}/api/admin/stats`, { headers }),
          fetch(`${activeUrl}/api/admin/accounts`, { headers }),
          fetch(`${activeUrl}/api/admin/rooms`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/billing/stats`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/billing/transactions`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/ai/stats`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/ai/logs`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/audit`, { headers }).catch(() => null),
          fetch(`${activeUrl}/api/admin/analytics/charts?period=${activePeriod}`, { headers }).catch(() => null),
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

      setStats((await statsRes.json()) as AdminStats);
      const accData = (await accountsRes.json()) as { accounts: AdminAccount[] };
      setAccounts(accData.accounts || []);

      if (roomsRes && roomsRes.ok) {
        const roomsData = (await roomsRes.json()) as { rooms: AdminRoom[] };
        setRooms(roomsData.rooms || []);
      }
      if (billStatsRes && billStatsRes.ok) {
        setBillingStats((await billStatsRes.json()) as BillingStats);
      }
      if (txRes && txRes.ok) {
        const txData = (await txRes.json()) as { transactions: BillingTransaction[] };
        setTransactions(txData.transactions || []);
      }
      if (aiStatsRes && aiStatsRes.ok) {
        setAiStats((await aiStatsRes.json()) as AiStats);
      }
      if (aiLogsRes && aiLogsRes.ok) {
        const logsData = (await aiLogsRes.json()) as { logs: AiLog[] };
        setAiLogs(logsData.logs || []);
      }
      if (auditRes && auditRes.ok) {
        const auditData = (await auditRes.json()) as {
          logs: AuditLog[];
          blockedAccountsCount: number;
          revokedDevicesCount: number;
        };
        setAuditLogs(auditData.logs || []);
        setSecurityStats({
          blockedAccountsCount: auditData.blockedAccountsCount || 0,
          revokedDevicesCount: auditData.revokedDevicesCount || 0,
        });
      }
      if (analyticsRes && analyticsRes.ok) {
        const aData = (await analyticsRes.json()) as AnalyticsData;
        setAnalytics(aData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
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
  };
};
