// The "Обновления" tab: what is installed, what is on GitHub, and the one button that applies it.
// Errors and permission questions are toasts/modals (see useAppUpdates), not rows inside the card:
// a state that needs a decision belongs in a question, not in a paragraph under a button.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';
import { Button } from '../UI/Button';
import { formatBytes } from '../../lib/text/formatBytes';

const OS_LABEL: Record<string, string> = {
  windows: 'windows',
  linux: 'linux',
  android: 'android',
  macos: 'macos',
};

function installLabel(kind: string | undefined): string {
  if (kind === 'installer') return 'скачать установщик';
  if (kind === 'apk') return 'скачать apk';
  return 'скачать и установить';
}

export const UpdatesSettingsTab: React.FC = () => {
  const { appUpdate } = useApp();
  const {
    platform,
    offer,
    status,
    progress,
    canInstall,
    check,
    install,
    openReleasePage,
  } = appUpdate;

  const isBusy = status === 'checking' || status === 'downloading';
  const percent =
    progress && progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const offerDescription = offer
    ? [
        `сейчас ${offer.currentVersion}`,
        offer.size ? formatBytes(offer.size) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <div className="flex flex-col gap-5" data-testid="updates-settings">
      <SettingsGroup title="приложение">
        <SettingsRow
          label="версия"
          testId="update-version-row"
          value={
            <span className="text-xs font-mono text-fg-secondary" data-testid="update-current-version">
              {platform?.currentVersion ?? '—'}
            </span>
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="платформа"
          value={
            <span className="text-xs font-mono text-fg-muted">
              {platform ? `${OS_LABEL[platform.os] ?? platform.os} · ${platform.arch}` : 'браузер'}
            </span>
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="манифест"
          testId="update-channel-row"
          description="адрес манифеста, который опрашивается"
          value={
            <span className="text-2xs font-mono text-fg-dim max-w-[15rem] truncate" data-testid="update-endpoint">
              {platform?.endpoint ?? '—'}
            </span>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="обновление">
        {platform === null ? (
          <SettingsRow
            icon={<Icon name="system.update" size="md" tone="inherit" />}
            label="встроенное обновление"
            description="работает только в приложении, не в браузере"
            testId="update-web-hint"
          />
        ) : (
          <>
            <SettingsRow
              icon={<Icon name="system.update" size="md" tone="inherit" />}
              label={
                offer
                  ? `доступна ${offer.version}`
                  : status === 'checking'
                    ? 'проверяю…'
                    : status === 'error'
                      ? 'не удалось проверить'
                      : 'версия актуальна'
              }
              description={
                offer
                  ? offerDescription
                  : status === 'up-to-date'
                    ? 'проверено только что'
                    : status === 'error'
                      ? 'причина — в тосте и в логе UPDATE'
                      : undefined
              }
              testId="update-offer-row"
              right={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icon name="action.refresh" size="sm" tone="inherit" className={`${status === 'checking' ? 'animate-spin' : ''}`} />}
                  onClick={() => void check()}
                  disabled={isBusy}
                  data-testid="update-check-btn"
                >
                  проверить
                </Button>
              }
            />

            {offer && (
              <>
                <SettingsDivider />
                <div className="px-3.5 py-3 flex flex-col gap-3" data-testid="update-offer">
                  <div className="flex items-center gap-2 text-xs text-fg-secondary">
                    <Icon name="action.check" size="sm" tone="success" />
                    <span className="font-mono" data-testid="update-offer-version">
                      {offer.currentVersion} → {offer.version}
                    </span>
                  </div>

                  {offer.notes && (
                    <p className="text-xs text-fg-muted whitespace-pre-wrap leading-relaxed">
                      {offer.notes}
                    </p>
                  )}

                  {status === 'downloading' && (
                    <div className="flex flex-col gap-1.5" data-testid="update-progress">
                      <div className="h-1 rounded-full bg-tint-8 overflow-hidden">
                        <div
                          className="h-full bg-fg-secondary transition-[width] duration-150"
                          style={{ width: `${percent ?? 8}%` }}
                        />
                      </div>
                      <span className="text-2xs font-mono text-fg-dim">
                        {percent === null
                          ? 'качаю…'
                          : `${percent}% · ${formatBytes(progress?.downloaded)} из ${formatBytes(progress?.total ?? undefined)}`}
                      </span>
                    </div>
                  )}

                  {status === 'installing' && (
                    <span className="text-xs text-fg-secondary">
                      установлено — приложение перезапускается…
                    </span>
                  )}

                  {status !== 'downloading' && status !== 'installing' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {canInstall ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Icon name="system.update" size="sm" tone="inherit" />}
                          onClick={() => void install()}
                          data-testid="update-install-btn"
                        >
                          {installLabel(offer.kind)}
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Icon name="nav.externalLink" size="sm" tone="inherit" />}
                          onClick={openReleasePage}
                          data-testid="update-release-btn"
                        >
                          скачать со страницы релиза
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={openReleasePage} data-testid="update-release-link">
                        что нового
                      </Button>
                    </div>
                  )}

                  {offer.kind === 'installer' && (
                    <span className="text-2xs text-fg-dim">
                      приложение установлено в папку без прав записи, поэтому обновляет установщик — он
                      спросит uac и поставит поверх.
                    </span>
                  )}
                  {offer.kind === 'manual' && (
                    <span className="text-2xs text-fg-dim">
                      linux: обнови из пакетного менеджера или скачай файл со страницы релиза.
                    </span>
                  )}
                </div>
              </>
            )}

          </>
        )}
      </SettingsGroup>

      <p className="text-2xs text-fg-dim px-1 leading-relaxed">
        обновления берутся из публичного репозитория релизов и проверяются по sha256 и подписи до
        запуска. без подписи файл не запускается.
      </p>
    </div>
  );
};
