// Панель «Состояние хранилища» — сверка целостности и отчёт о находках.
import React, { useState } from 'react';
import type { Finding, IntegrityStatus } from '../../../../lib/vault/integrity/types';
import { Icon } from '../../../UI/icons/Icon';
import { IntegrityFindingCard } from './IntegrityFindingCard';

export interface IntegrityPanelProps {
  status: IntegrityStatus | null;
  findings: Finding[];
  busy: boolean;
  lastScan: string | null;       // ISO или null
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

  /* ── рендер ────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-3 select-none">
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

      {/* кнопки действий */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
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

        <label className="inline-flex items-center gap-1.5 text-2xs text-fg-muted ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.currentTarget.checked)}
            disabled={busy}
            className="w-3 h-3 accent-accent rounded cursor-pointer"
          />
          только отчёт
        </label>
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
