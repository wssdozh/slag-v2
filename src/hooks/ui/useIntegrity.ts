// The storage panel's state: run a check, hand the plan to the repair, keep the last report.
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { Finding, IntegrityStatus, RepairPlan } from '../../lib/vault/integrity/types';
import type { ManifestStatus } from '../../lib/sync/types';
import { syncEngine } from '../../lib/sync/syncEngine';
import { readManifestAutoCheck, readManifestAutoResolve, writeManifestAutoCheck, writeManifestAutoResolve } from '../../lib/sync/manifestPrefs';
import { applyIntegrityRepair, runIntegrityCheck } from '../../lib/storage/integrityService';

export interface UseIntegrity {
  busy: boolean;
  findings: Finding[];
  status: IntegrityStatus | null;
  plan: RepairPlan | null;
  lastScan: string | null;
  message: string | null;
  /** The last comparison with the room. `null` until the engine has run one. */
  remote: ManifestStatus | null;
  /** Whether the engine compares on its own. Off means only the button asks. */
  autoCheck: boolean;
  setAutoCheck(next: boolean): void;
  /** Whether a refused note goes to the trash by itself, or waits for the button. */
  autoResolve: boolean;
  setAutoResolve(next: boolean): void;
  /** «сверить с сервером сейчас»: one check, now, with the anti-loop latch aside. */
  checkServer(): void;
  verify(): Promise<void>;
  repair(dryRun: boolean): Promise<void>;
}

/** One subscription for the whole app: the engine notifies every listener on every status change. */
function subscribeToEngine(onChange: () => void): () => void {
  return syncEngine.subscribe(() => onChange());
}

export function useIntegrity(): UseIntegrity {
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<IntegrityStatus | null>(null);
  const [plan, setPlan] = useState<RepairPlan | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The engine keeps the same object between checks, so this reads the room's answer without
  // copying it per render and without the panel having to press «сверить» to see it.
  const remote = useSyncExternalStore(subscribeToEngine, () => syncEngine.getManifest(), () => null);
  // Lazy initial state, not an effect: the switch has to show the stored answer on the first frame.
  const [autoCheck, setAutoCheckState] = useState(readManifestAutoCheck);
  const [autoResolve, setAutoResolveState] = useState(readManifestAutoResolve);

  const setAutoCheck = useCallback((next: boolean) => {
    writeManifestAutoCheck(next);
    setAutoCheckState(next);
  }, []);

  const setAutoResolve = useCallback((next: boolean) => {
    writeManifestAutoResolve(next);
    setAutoResolveState(next);
  }, []);

  const checkServer = useCallback(() => {
    syncEngine.requestManifestCheck();
  }, []);

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

  return {
    busy,
    findings,
    status,
    plan,
    lastScan,
    message,
    remote,
    autoCheck,
    setAutoCheck,
    autoResolve,
    setAutoResolve,
    checkServer,
    verify,
    repair,
  };
}
