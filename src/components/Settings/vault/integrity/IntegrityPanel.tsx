// Панель «Состояние хранилища» — сверка целостности и отчёт о находках.
import React, { useState } from 'react';
import type { Finding, IntegrityStatus } from '../../../../lib/vault/integrity/types';
import type { ManifestStatus } from '../../../../lib/sync/types';
import { Icon } from '../../../UI/icons/Icon';
import { IntegrityFindingCard } from './IntegrityFindingCard';

export interface IntegrityPanelProps {
  status: IntegrityStatus | null;
  findings: Finding[];
  busy: boolean;
  lastScan: string | null;       // ISO или null
  /** Последняя сверка с комнатой: её ведёт движок синка, сканер её не трогает. */
  remote: ManifestStatus | null;
  onVerify(): void;
  onRepair(dryRun: boolean): void;
}

/** Все сканеры в читаемом виде */
const SCANNER_LABELS: Record<string, string> = {
  'duplicate-id': 'Дубликаты ID',
  'path-mismatch': 'Несоответствие путей',
  'folder-missing': 'Отсутствующие папки',
  'ghost-folder': 'Папки-призраки',
  'empty-folder': 'Пустые папки',
  'broken-frontmatter': 'Сломанный frontmatter',
  'unreferenced-attachment': 'Висячие вложения',
  'trash-aging': 'Старый мусор',
};

/** Сгруппировать находки по сканеру. Пустые группы не попадают в результат. */
function groupByScanner(findings: Finding[]): [string, Finding[]][] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = map.get(f.scanner);
    if (list) list.push(f);
    else map.set(f.scanner, [f]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export const IntegrityPanel: React.FC<IntegrityPanelProps> = ({
  status,
  findings,
  busy,
  lastScan,
  remote,
  onVerify,
  onRepair,
}) => {
  const [dryRun, setDryRun] = useState(true);

  /* ── строка состояния ─────────────────────────────── */
  let statusText = '';
  let statusDetail = '';
  let isSynced = false;

  if (status) {
    const root = status.root;
    if (root) {
      statusText = `${root.slice(0, 8)}…`;
    } else {
      statusText = 'корень неизвестен';
    }

    if (status.inSync) {
      isSynced = true;
      statusDetail = 'в синхроне';
    } else if (status.drift) {
      const driftFolders = (status.drift.folders ?? []).length;
      const driftNotes = (status.drift.conflict ?? []).length + (status.drift.extra ?? []).length;
      isSynced = false;
      if (driftFolders > 0 && driftNotes > 0) {
        statusDetail = `разошлось: ${driftFolders} папок, ${driftNotes} зам.`;
      } else if (driftFolders > 0) {
        statusDetail = `разошлось: ${driftFolders} папок`;
      } else if (driftNotes > 0) {
        statusDetail = `разошлось: ${driftNotes} зам.`;
      }
    }
  }

  let scanTime = '';
  if (lastScan) {
    try {
      const d = new Date(lastScan);
      scanTime = d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      scanTime = lastScan;
    }
  }

  /* ── строка сервера ───────────────────────────────── */
  // Четыре состояния, и каждое честное: «нет данных» — сверку ещё не делали, «не ответил» — комната
  // молчит, «сходится» — корни равны, «разошлось» — корни разные. Последнее не приговор: движок
  // уже переотправил состояние, если это ещё может помочь.
  let remoteText = 'сервер: нет данных';
  let remoteTone = 'text-fg-dim';
  if (remote) {
    if (remote.remoteRoot === null) {
      remoteText = 'сервер: не ответил';
    } else if (remote.inSync) {
      remoteText = `сервер: сходится · ${remote.remoteRoot.slice(0, 8)}…`;
      remoteTone = 'text-success';
    } else if (remote.action === 'reconcile') {
      remoteText = 'сервер: разошлось — отправляю заново';
      remoteTone = 'text-fg-secondary';
    } else {
      remoteText = 'сервер: разошлось — нужен разбор';
      remoteTone = 'text-fg-secondary';
    }
  }
  const remoteTitle = remote ? `сверено ${remote.at}` : 'движок синка ещё не сверял корень с комнатой';

  /* ── рендер ────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-3 select-none" data-testid="integrity-panel">
      {/* строка статуса */}
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs text-fg-muted font-mono">
          {isSynced ? (
            <span className="text-success inline-flex items-center gap-1">
              <Icon name="action.check" size="xs" tone="success" />
              {statusDetail}
            </span>
          ) : status ? (
            <>
              {statusText} · <span className={isSynced ? 'text-success' : ''}>{statusDetail || 'есть расхождения'}</span>
            </>
          ) : (
            'ещё не сверяли'
          )}
        </span>
        {scanTime && (
          <span className="text-2xs font-mono text-fg-dim">{scanTime}</span>
        )}
      </div>

      {/* сверка с комнатой: свой счёт, потому что это не диск, а сосед */}
      <div className="-mt-1 flex items-center justify-between px-1" data-testid="integrity-remote">
        <span className={`text-2xs font-mono ${remoteTone}`} title={remoteTitle}>
          {remoteText}
        </span>
        {remote && remote.folders.length > 0 && (
          <span className="text-2xs font-mono text-fg-dim">
            {remote.folders.length} папок
          </span>
        )}
      </div>

      {/* кнопки действий */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          data-testid="integrity-verify"
          onClick={() => onVerify()}
          className="inline-flex items-center h-7 px-2.5 text-[13px] rounded-lg bg-tint-6 hover:bg-tint-10 text-fg-secondary border border-border-subtle disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap"
        >
          {busy ? (
            <>сверяю…</>
          ) : (
            <>
              <Icon name="action.refresh" size="xs" tone="inherit" className="mr-1 shrink-0" />
              Сверить
            </>
          )}
        </button>

        <button
          type="button"
          disabled={busy}
          data-testid="integrity-repair"
          onClick={() => onRepair(dryRun)}
          className="inline-flex items-center h-7 px-2.5 text-[13px] rounded-lg bg-tint-6 hover:bg-tint-10 text-fg-secondary border border-border-subtle disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap"
        >
          {busy ? (
            <>чищу…</>
          ) : (
            <>
              <Icon name="folder.sparkles" size="xs" tone="inherit" className="mr-1 shrink-0" />
              Почистить
            </>
          )}
        </button>

        <button
          type="button"
          aria-pressed={dryRun}
          disabled={busy}
          onClick={() => setDryRun((value) => !value)}
          title="С отчётом ничего не меняется: кнопка показывает, что починила бы"
          className={`ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-2xs transition-colors cursor-pointer disabled:opacity-40 ${
            dryRun ? 'border-border-subtle bg-tint-6 text-fg-secondary' : 'border-accent/40 bg-accent-subtle text-accent'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dryRun ? 'bg-fg-dim' : 'bg-accent'}`} />
          {dryRun ? 'только отчёт' : 'по-настоящему'}
        </button>
      </div>

      {/* список находок */}
      {findings.length === 0 ? (
        <div className="text-center py-6 text-xs text-fg-dim">
          {status && !isSynced
            ? 'Расхождения есть, но сканер ничего не нашёл — возможно, это первый запуск'
            : 'Находок нет. Запустите сверку, чтобы проверить хранилище'}
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-label="Список находок сканера">
          {groupByScanner(findings).map(([scannerId, items]) => (
            <div key={scannerId}>
              <div className="px-1 mb-1">
                <span className="text-2xs font-mono uppercase tracking-wider text-fg-muted">
                  {SCANNER_LABELS[scannerId] ?? scannerId}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((f) => (
                  <IntegrityFindingCard key={f.id} finding={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
