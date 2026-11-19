// «состояние хранилища»: сверка по манифесту и уборка того, что можно убрать безопасно.
//
// The block owns no layout of its own: the panel draws, this wires it to the vault.
import React, { useCallback } from 'react';
import { useApp } from '../../../../context/AppContext';
import { useIntegrity } from '../../../../hooks/ui/useIntegrity';
import { IntegrityPanel } from './IntegrityPanel';

export const IntegritySection: React.FC = () => {
  const {
    busy, findings, status, lastScan, message, remote,
    autoCheck, setAutoCheck, autoResolve, setAutoResolve, checkServer, verify, repair,
  } = useIntegrity();
  const { deleteItem } = useApp();

  // The neighbour rejected these notes: one left on this device and nowhere else. The trash is
  // the only place sync may put them, and only after a person says so — that is `deleteItem`.
  const dropExtra = useCallback(
    (ids: string[]) => {
      for (const id of ids) deleteItem(id);
    },
    [deleteItem],
  );

  return (
    <div className="flex flex-col gap-2">
      <IntegrityPanel
        status={status}
        findings={findings}
        busy={busy}
        lastScan={lastScan}
        remote={remote}
        autoCheck={autoCheck}
        onToggleAutoCheck={setAutoCheck}
        autoResolve={autoResolve}
        onToggleAutoResolve={setAutoResolve}
        onCheckServer={checkServer}
        onDropExtra={dropExtra}
        onVerify={verify}
        onRepair={repair}
      />
      {message && (
        <p className="px-1 text-[11px] font-mono text-fg-muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
};
