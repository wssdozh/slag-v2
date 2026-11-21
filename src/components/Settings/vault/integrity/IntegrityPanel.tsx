// Панель «состояние хранилища»: что знает сервер и что видит диск — двумя блоками, как соседние
// разделы хранилища. В каждом блоке одна строка «что это» и один вопросик: коротко на наведении,
// подробно в модалке. Строки остаются строками, а не абзацами под каждой подписью.
import React, { useState } from 'react';
import type { Finding, IntegrityStatus } from '../../../../lib/vault/integrity/types';
import { anonymousOnlyDrift } from '../../../../lib/sync/types';
import type { ManifestStatus, ManifestTrigger } from '../../../../lib/sync/types';
import { pluralRu } from '../../../../lib/time/dateUtils';
import { InfoHint } from '../../../UI/InfoHint';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSwitch } from '../../SettingsUI';
import { IntegrityFindingCard } from './IntegrityFindingCard';

export interface IntegrityPanelProps {
  status: IntegrityStatus | null;
  findings: Finding[];
  busy: boolean;
  lastScan: string | null;       // ISO или null
  /** Последняя сверка с комнатой: её ведёт движок синка, сканер её не трогает. */
  remote: ManifestStatus | null;
  /** Автосверка после запуска и после отправки. Выключена — остаётся только кнопка. */
  autoCheck: boolean;
  onToggleAutoCheck(next: boolean): void;
  onCheckServer(): void;
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

const TRIGGER_LABELS: Record<ManifestTrigger, string> = {
  start: 'при запуске',
  push: 'после отправки',
  manual: 'вручную',
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

/** Когда сверялись: «19 ноя, 11:23» или пусто, если ни разу. */
function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Состояние комнаты одним словом и его цвет. Значение без объяснений: они в вопросике. */
function serverState(remote: ManifestStatus | null): { value: string; tone: string } {
  if (!remote) return { value: 'нет данных', tone: 'text-fg-dim' };
  if (remote.remoteRoot === null) return { value: 'не ответил', tone: 'text-fg-secondary' };
  if (remote.inSync) return { value: `сходится · ${remote.remoteRoot.slice(0, 8)}…`, tone: 'text-success' };
  // Старая общая строка комнаты больше не обновляется: «разошлось с тем, кого нельзя спросить» —
  // это отсутствие данных, а не красная тревога. Реальный разошедшийся сосед важнее и покажется ниже.
  if (anonymousOnlyDrift(remote.peers)) return { value: 'нет данных о соседе', tone: 'text-fg-secondary' };
  // The peer sent its leaves, so the drift can be named instead of shrugged at.
  if (remote.extra.length > 0) {
    const n = remote.extra.length;
    return { value: `у соседа нет ${n} ${pluralRu(n, ['заметки', 'заметок', 'заметок'])}`, tone: 'text-danger' };
  }
  if (remote.missing.length > 0) {
    const n = remote.missing.length;
    return { value: `у меня нет ${n} ${pluralRu(n, ['заметки', 'заметок', 'заметок'])}`, tone: 'text-danger' };
  }
  return { value: 'разошлось — нужен разбор', tone: 'text-danger' };
}

export const IntegrityPanel: React.FC<IntegrityPanelProps> = ({
  status,
  findings,
  busy,
  lastScan,
  remote,
  autoCheck,
  onToggleAutoCheck,
  onCheckServer,
  onVerify,
  onRepair,
}) => {
  const [dryRun, setDryRun] = useState(true);
  const server = serverState(remote);

  /* ── диск: что нашлось ─────────────────────────────── */
  let findingsValue = 'ещё не сверяли';
  if (status) {
    if (findings.length === 0) {
      findingsValue = 'чисто';
    } else {
      const safe = findings.filter((finding) => finding.fix === 'safe').length;
      findingsValue = safe > 0 ? `${findings.length} · к починке ${safe}` : `${findings.length}`;
    }
  }

  const lastServer = remote
    ? `${formatTime(remote.at)} · ${TRIGGER_LABELS[remote.trigger]}`
    : 'ни разу';

  return (
    <div className="flex flex-col gap-3 select-none" data-testid="integrity-panel">
      {/* ── сервер ─────────────────────────────────────── */}
      <SettingsGroup
        title="Сверка с сервером"
        action={
          <InfoHint
            testId="integrity-server-info"
            hint="сравниваю корень хранилища с корнем комнаты: при запуске и после отправки"
            title="Сверка с сервером"
          >
            <p>Релей хранит последний отпечаток каждого устройства. Сверка показывает, где эти снимки различались, а не какая копия правильная.</p>
            <p>Сверка ничего не удаляет и не отправляет правки. При расхождении устройство может дочитать уже сохранённые пакеты.</p>
          </InfoHint>
        }
      >
        <SettingsRow
          label="Состояние"
          value={<span data-testid="integrity-server" className={server.tone}>{server.value}</span>}
        />
        <SettingsDivider />
        <SettingsRow
          label="Последняя сверка"
          value={lastServer}
          testId="integrity-server-last"
        />
        <SettingsDivider />
        <SettingsRow
          label="Автосверка"
          right={
            <SettingsSwitch
              checked={autoCheck}
              onChange={onToggleAutoCheck}
              disabled={busy}
              label="Автосверка"
              testId="integrity-autocheck"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="Сверить сейчас"
          onClick={onCheckServer}
          disabled={busy}
          chevron
          testId="integrity-server-check"
        />
      </SettingsGroup>

      {/* ── диск ───────────────────────────────────────── */}
      <SettingsGroup
        title="Это устройство"
        action={
          <InfoHint
            testId="integrity-disk-info"
            hint="читаю файлы на диске по кнопке и показываю, что не так"
            title="Это устройство"
          >
            <p>
              Читаю notes/, .attachments/ и .trash/. Восемь сканеров: дубли id, заметки не в своей
              папке, папки из frontmatter, которых нет, папки в state.json без каталога, пустые
              папки, сломанный frontmatter, вложения без ссылок, старая корзина.
            </p>
            <p>
              Чиню только обратимое: файл уезжает в .trash/.hygiene/&lt;дата&gt;/, state.json
              правится с копией. Заметку не удаляю.
            </p>
            <p>
              «Только отчёт» включён — чистка показывает, что перенесла бы. Диск сам не читаю:
              это секунды работы с файлами, поэтому по кнопке.
            </p>
          </InfoHint>
        }
      >
        <SettingsRow label="Находки" value={findingsValue} />
        <SettingsDivider />
        <SettingsRow
          label="Только отчёт"
          right={
            <SettingsSwitch
              checked={dryRun}
              onChange={setDryRun}
              disabled={busy}
              label="Только отчёт"
              testId="integrity-dryrun"
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          label={busy ? 'Читаю диск…' : 'Сверить диск'}
          onClick={onVerify}
          disabled={busy}
          chevron
          testId="integrity-verify"
        />
        <SettingsDivider />
        <SettingsRow
          label={busy ? 'Чищу…' : 'Почистить'}
          onClick={() => onRepair(dryRun)}
          disabled={busy}
          chevron
          testId="integrity-repair"
        />
      </SettingsGroup>

      {lastScan && (
        <span className="px-1 text-2xs font-mono text-fg-dim">
          диск прочитан {formatTime(lastScan)}
        </span>
      )}

      {/* ── находки ────────────────────────────────────── */}
      {findings.length === 0 ? (
        <div className="text-center py-4 text-xs text-fg-dim">
          {status && !status.inSync
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
