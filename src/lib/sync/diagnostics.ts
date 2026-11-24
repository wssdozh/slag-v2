import type { SyncStatus } from './types';
import type { RecoveryReason } from '../storage/vaultRecovery';

export type RecoveryKind = RecoveryReason | 'ready' | 'unavailable';
export interface SyncDiagnostics {
  lastRelayResponseAt: string | null;
  legacyPending: number | null;
  registryPending: number | null;
  reviews: number | null;
  legacyReviews: number | null;
  conflicts: number | null;
  recovery: RecoveryKind | null;
  relayHead: number | null;
  appliedThrough: number | null;
  registryOnly?: boolean;
}

const connection = {
  idle: 'ожидание', syncing: 'идёт обмен', connected: 'есть связь с релеем', error: 'сбой', offline: 'не в сети',
};
const recovery: Record<RecoveryKind, string> = {
  ready: 'локальное состояние проверено', state: 'старый журнал не подтверждён; обмен остановлен',
  registry: 'журнал реестра не подтверждён; обмен остановлен', 'note-move': 'не завершён перенос заметки; обмен остановлен',
  unavailable: 'не удалось прочитать хранилище', archive: 'защитная пауза сохранена; причина не подтверждена',
};
const show = (value: string | number | null | undefined) => value ?? 'неизвестно';

/** The report copies only these fields, not exceptions, logs, paths or note data. */
export function vaultSyncReportRows(status: Pick<SyncStatus, 'state' | 'authRequired' | 'isAuthenticated' | 'diagnostics'>, diskFindings: number | null) {
  const d = status.diagnostics;
  const state = status.authRequired && !status.isAuthenticated ? 'требуется вход' : connection[status.state];
  return [
    ['Связь', status.state === 'offline' ? `${state}; сведения могут быть устаревшими` : state],
    ['Локальное состояние', show(d?.recovery && recovery[d.recovery])],
    ['Проверка файлов', diskFindings === null ? 'не запускалась' : `находок: ${diskFindings}`],
    ['Последний ответ релея', show(d?.lastRelayResponseAt)],
    ['Ревизия релея', show(d?.relayHead)],
    ['Применённая ревизия', show(d?.appliedThrough)],
    ['Очередь пакетов', d?.registryOnly ? 'старый канал изолирован; прежняя очередь неизвестна' : show(d?.legacyPending)],
    ['Очередь реестра', show(d?.registryPending)],
    ['Старые правки на проверку', show(d?.legacyReviews)],
    ['Другие правки на проверку', show(d?.reviews)],
    ['Конфликты', show(d?.conflicts)],
  ] as const;
}

export function formatVaultSyncReport(input: {
  vaultName: string;
  appVersion?: string;
  status: Pick<SyncStatus, 'state' | 'authRequired' | 'isAuthenticated' | 'diagnostics'>;
  diskFindings: number | null;
}): string {
  const label = input.vaultName.replace(/[\r\n\t]/g, ' ').trim();
  return [`SLAG ${show(input.appVersion)} · ${label}`, ...vaultSyncReportRows(input.status, input.diskFindings)
    .map(([name, value]) => `${name}: ${value}`)].join('\n');
}
