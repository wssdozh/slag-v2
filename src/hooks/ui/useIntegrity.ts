// The storage panel's state: run a check, hand the plan to the repair, keep the last report.
import { useCallback, useState } from 'react';
import type { Finding, IntegrityStatus, RepairPlan } from '../../lib/vault/integrity/types';
import { applyIntegrityRepair, runIntegrityCheck } from '../../lib/storage/integrityService';

export interface UseIntegrity {
  busy: boolean;
  findings: Finding[];
  status: IntegrityStatus | null;
  plan: RepairPlan | null;
  lastScan: string | null;
  message: string | null;
  verify(): Promise<void>;
  repair(dryRun: boolean): Promise<void>;
}

export function useIntegrity(): UseIntegrity {
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<IntegrityStatus | null>(null);
  const [plan, setPlan] = useState<RepairPlan | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const verify = useCallback(async () => {
    setBusy(true);
    try {
      const run = await runIntegrityCheck();
      setFindings(run.findings);
      setStatus(run.status);
      setPlan(run.plan);
      setLastScan(new Date().toISOString());
      setMessage(
        run.plan.ops.length > 0
          ? `находок ${run.findings.length}, безопасных к починке ${run.plan.ops.length}`
          : `находок ${run.findings.length}, безопасно чинить нечего`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const repair = useCallback(
    async (dryRun: boolean) => {
      if (dryRun) {
        setMessage(plan && plan.ops.length > 0 ? `это отчёт: ${plan.ops.length} операций` : 'чинить нечего');
        return;
      }
      setBusy(true);
      try {
        // A fresh plan: the vault may have changed since the last look on screen.
        const run = await runIntegrityCheck();
        const outcome = await applyIntegrityRepair(run.plan);
        setMessage(
          `перенесено ${outcome.moved}, записей убрано ${outcome.dropped}, пропущено ${outcome.skipped.length}`,
        );
        const after = await runIntegrityCheck();
        setFindings(after.findings);
        setStatus(after.status);
        setPlan(after.plan);
        setLastScan(new Date().toISOString());
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [plan],
  );

  return { busy, findings, status, plan, lastScan, message, verify, repair };
}
