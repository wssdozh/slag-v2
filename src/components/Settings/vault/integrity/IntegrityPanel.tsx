// Панель «состояние хранилища»: что знает сервер и что видит диск — двумя блоками, как соседние
// разделы хранилища. Настройки и объяснения живут здесь же: «сходится» без «когда и почему» —
// это строка, которую нельзя ни проверить, ни выключить.
import React from 'react';
import type { Finding, IntegrityStatus } from '../../../../lib/vault/integrity/types';
import type { ManifestStatus, ManifestTrigger } from '../../../../lib/sync/types';
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

/** Что показать про комнату и что это значит словами, а не только цветом. */
function serverText(remote: ManifestStatus | null): { value: string; tone: string; hint: string } {
  if (!remote) {
    return {
      value: 'нет данных',
      tone: 'text-fg-dim',
      hint: 'сверку ещё не запускали: движок синка делает её при запуске и после отправки',
    };
  }
  if (remote.remoteRoot === null) {
    return {
      value: 'не ответил',
      tone: 'text-fg-secondary',
      hint: 'в комнате нет корня или сервер не пустил: смотри «Логи и диагностика»',
    };
  }
  if (remote.inSync) {
    return {
      value: `сходится · ${remote.remoteRoot.slice(0, 8)}…`,
      tone: 'text-success',
      hint: 'корень этой копии совпал с тем, что прислало другое устройство',
    };
  }
  if (remote.action === 'reconcile') {
    return {
      value: 'разошлось — отправляю заново',
      tone: 'text-fg-secondary',
      hint: 'корни разные: отправляю всё состояние целиком, это уже в работе',
    };
  }
  return {
    value: 'разошлось — нужен разбор',
    tone: 'text-danger',
    hint: 'переотправка не помогла: где-то лежит файл не там или иное содержимое, смотри находки ниже',
  };
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
  const [dryRun, setDryRun] = React.useState(true);
  const server = serverText(remote);

  /* ── диск: что нашлось и что можно сделать ─────────── */
  let findingsValue = 'ещё не сверяли';
  let findingsHint = 'сверка читает файлы с диска — она по кнопке, а не сама';
  if (status) {
    if (findings.length === 0) {
      findingsValue = 'чисто';
      findingsHint = 'ни одной находки: дублей, кривых путей и висячих файлов нет';
    } else {
      const safe = findings.filter((finding) => finding.fix === 'safe').length;
      findingsValue = `${findings.length}${safe > 0 ? ` · к починке ${safe}` : ''}`;
      findingsHint =
        safe > 0
          ? 'остальное требует человека: такое я не трогаю сама'
          : 'безопасно чинить нечего — остальное нужно смотреть глазами';
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
          <span className="flex items-center gap-2">
            <span className="text-2xs font-mono text-fg-dim">авто</span>
            <SettingsSwitch
              checked={autoCheck}
              onChange={onToggleAutoCheck}
              disabled={busy}
              label="Автосверка"
              testId="integrity-autocheck"
            />
          </span>
        }
      >
        <SettingsRow
          label="Состояние"
          description={server.hint}
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
          label="Когда сверяю"
          value="запуск и отправка"
          description="на старте и после каждой отправки к серверу; не чаще раза в 5 секунд — в комнате один корень на хранилище"
        />
        <SettingsDivider />
        <SettingsRow
          label="Если разошлось"
          value="одна переотправка"
          description="потом только показываю расхождение — молча перезаписать чужое однажды стоило 84 заметок"
        />
        <SettingsDivider />
        <SettingsRow
          label="Сверить с сервером сейчас"
          description="прочитает корень комнаты и, если он другой, отправит состояние заново"
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
          <span className="flex items-center gap-2">
            <span className="text-2xs font-mono text-fg-dim">только отчёт</span>
            <SettingsSwitch
              checked={dryRun}
              onChange={setDryRun}
              disabled={busy}
              label="Только отчёт"
              testId="integrity-dryrun"
            />
          </span>
        }
      >
        <SettingsRow
          label="Находки"
          value={findingsValue}
          description={findingsHint}
        />
        <SettingsDivider />
        <SettingsRow
          label="Что читаю"
          value="8 сканеров"
          description="notes/, .attachments/ и .trash/: дубли id, пути, папки в state.json, вложения без ссылок, старая корзина"
        />
        <SettingsDivider />
        <SettingsRow
          label="Что чиню сама"
          value="переносы и записи"
          description="файл уезжает в .trash/.hygiene/<дата>/, state.json — с копией. заметку не удаляю никогда"
        />
        <SettingsDivider />
        <SettingsRow
          label={busy ? 'Читаю диск…' : 'Сверить диск'}
          description="собрать находки и манифест, ничего не трогая"
          onClick={onVerify}
          disabled={busy}
          chevron
          testId="integrity-verify"
        />
        <SettingsDivider />
        <SettingsRow
          label={
            busy
              ? 'Чищу…'
              : dryRun
                ? 'Почистить (с отчётом)'
                : 'Почистить по-настоящему'
          }
          description={
            dryRun
              ? 'покажет, что перенесла бы; переключатель «только отчёт» выше выключает запись'
              : 'перенесёт безопасное: тумблер «только отчёт» выше выключен'
          }
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
