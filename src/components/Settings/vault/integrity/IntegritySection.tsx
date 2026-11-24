// «состояние хранилища»: сверка по манифесту и уборка того, что можно убрать безопасно.
//
// The block owns no layout of its own: the panel draws, this wires it to the vault.
import React from 'react';
import { useIntegrity } from '../../../../hooks/ui/useIntegrity';
import { IntegrityPanel } from './IntegrityPanel';
import { VaultHealthReport } from './VaultHealthReport';

export const IntegritySection: React.FC = () => {
  const {
    busy, findings, status, lastScan, message, remote, registryMode,
    autoCheck, setAutoCheck, checkServer, verify, repair,
  } = useIntegrity();
  return (
    <div className="flex flex-col gap-2">
      <VaultHealthReport diskFindings={status ? findings.length : null} />
      <IntegrityPanel
        status={status}
        findings={findings}
        busy={busy}
        lastScan={lastScan}
        remote={remote}
        registryMode={registryMode}
        autoCheck={autoCheck}
        onToggleAutoCheck={setAutoCheck}
        onCheckServer={checkServer}
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
