// The "Обновления" tab: what is installed, what is on GitHub, and the one button that applies it.
import React from 'react';
import { ArrowDownToLine, Check, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
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

const ERROR_TEXT: Record<string, string> = {
  network: 'нет связи с github — проверь сеть',
  network_client: 'не удалось поднять http-клиент',
  manifest_invalid: 'манифест релиза битый',
  verify_failed: 'хэш или подпись не сошлись — обновление отменено',
  signature_invalid: 'подпись не разобралась — обновление отменено',
  pubkey_invalid: 'вшитый публичный ключ повреждён',
  asset_url_not_allowed: 'манифест указывает на чужой хост — отказ',
  size_mismatch: 'скачался не тот объём — попробуй ещё раз',
  write_failed: 'нет прав писать в папку обновления',
  read_failed: 'файл обновления не читается',
  restart_failed: 'не удалось запустить установку',
  installer_failed: 'установщик не запустился',
  no_platform_asset: 'в релизе нет файла для этой платформы',
  up_to_date: 'уже последняя версия',
  unsupported: 'эта платформа не ставит обновления сама',
  missing_file: 'файл обновления потерялся — попробуй ещё раз',
  install_failed: 'системный установщик отказал',
  settings_failed: 'не открылись настройки установки',
};

function errorText(code: string | null): string {
  if (!code) return '';
  if (code.startsWith('http_')) return `github ответил ${code.slice(5)}`;
  return ERROR_TEXT[code] ?? code;
}

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
    error,
    canInstall,
    check,
    install,
    openReleasePage,
    openInstallPermissionSettings,
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
      </SettingsGroup>

      <SettingsGroup title="обновление">
        {platform === null ? (
          <SettingsRow
            icon={<ArrowDownToLine className="w-4 h-4" />}
            label="встроенное обновление"
            description="работает только в приложении, не в браузере"
            testId="update-web-hint"
          />
        ) : (
          <>
            <SettingsRow
              icon={<ArrowDownToLine className="w-4 h-4" />}
              label={offer ? `доступна ${offer.version}` : status === 'checking' ? 'проверяю…' : 'версия актуальна'}
              description={offer ? offerDescription : status === 'up-to-date' ? 'проверено только что' : undefined}
              testId="update-offer-row"
              right={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />}
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
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
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
                      <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden">
                        <div
                          className="h-full bg-fg-secondary transition-[width] duration-150"
                          style={{ width: `${percent ?? 8}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-fg-dim">
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

                  {status === 'permission-required' && (
                    <div className="flex flex-col gap-2" data-testid="update-permission">
                      <span className="text-xs text-fg-secondary">
                        android не разрешает установку из этого источника. дай разрешение и повтори.
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={openInstallPermissionSettings}
                          data-testid="update-permission-btn"
                        >
                          разрешить установку
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void install()} data-testid="update-retry-btn">
                          повторить
                        </Button>
                      </div>
                    </div>
                  )}

                  {status === 'error' && (
                    <span className="text-xs text-rose-400 flex items-center gap-1.5" data-testid="update-error">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {errorText(error)}
                    </span>
                  )}

                  {status !== 'downloading' && status !== 'installing' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {canInstall ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
                          onClick={() => void install()}
                          data-testid="update-install-btn"
                        >
                          {installLabel(offer.kind)}
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<ExternalLink className="w-3.5 h-3.5" />}
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
                    <span className="text-[11px] text-fg-dim">
                      приложение установлено в папку без прав записи, поэтому обновляет установщик — он
                      спросит uac и поставит поверх.
                    </span>
                  )}
                  {offer.kind === 'manual' && (
                    <span className="text-[11px] text-fg-dim">
                      linux: обнови из пакетного менеджера или скачай файл со страницы релиза.
                    </span>
                  )}
                </div>
              </>
            )}

          </>
        )}
      </SettingsGroup>

      <p className="text-[11px] text-fg-dim px-1 leading-relaxed">
        обновления берутся из публичного репозитория релизов и проверяются по sha256 и подписи до
        запуска. без подписи файл не запускается.
      </p>
    </div>
  );
};
