import { useEffect, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { syncEngine } from '../../../../lib/sync/syncEngine';
import { formatVaultSyncReport, vaultSyncReportRows } from '../../../../lib/sync/diagnostics';
import { SettingsGroup, SettingsRow } from '../../SettingsUI';

export function VaultHealthReport({ diskFindings }: { diskFindings: number | null }) {
  const { vault, appUpdate, addToast, confirmAction, switchVault } = useApp();
  const [status, setStatus] = useState(() => syncEngine.getStatus());
  const [recovering, setRecovering] = useState(false);
  useEffect(() => syncEngine.subscribe(setStatus), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatVaultSyncReport({ vaultName: vault.name,
        appVersion: appUpdate.platform?.currentVersion, status, diskFindings }));
      addToast('Отчёт скопирован', 'success');
    } catch {
      addToast('Не удалось скопировать отчёт', 'error');
    }
  };
  const recover = async () => {
    if (recovering || !await confirmAction({ title: 'Подключить новую копию?', confirmLabel: 'Подключить',
      description: 'Исходное хранилище останется на устройстве. Новая копия загрузит заметки, папки и вложения из той же комнаты. Старый канал не возобновится.' })) return;
    setRecovering(true);
    try {
      const { createRecoveredVault } = await import('../../../../lib/sync/recoveredVault');
      switchVault(await createRecoveredVault(vault));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Не удалось подключить копию', 'error');
    } finally {
      setRecovering(false);
    }
  };

  return <SettingsGroup title="Состояние синхронизации" action={
    <button type="button" onClick={() => void copy()} className="min-h-8 rounded px-2 text-xs text-fg-secondary hover:bg-tint-6 focus-visible:bg-tint-8">
      Скопировать отчёт
    </button>
  }>
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 py-2 text-xs" data-testid="vault-health-report">
      {vaultSyncReportRows(status, diskFindings).map(([label, value]) => (
        <div key={label} className="contents"><dt className="text-fg-secondary">{label}</dt>
          <dd className="break-words text-right tabular-nums text-fg-primary">{value}</dd></div>
      ))}
    </dl>
    {status.diagnostics?.recovery === 'state' && status.diagnostics.registryPending !== null && <SettingsRow
      label={recovering ? 'Проверяю привязку и журнал…' : 'Подключить новую копию хранилища'}
      description="Исходные файлы и очередь останутся в старом хранилище"
      onClick={() => void recover()} disabled={recovering} chevron />}
  </SettingsGroup>;
}
