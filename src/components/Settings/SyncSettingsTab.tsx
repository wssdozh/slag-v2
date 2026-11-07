import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Laptop,
  RefreshCw,
  Server,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { navigatePage } from '../../lib/navigation';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncConfig, SyncStatus } from '../../lib/sync/types';
import { SettingsDivider, SettingsRow, SettingsSelect, SettingsSwitch } from './SettingsUI';

interface SyncSettingsTabProps {
  addToast?: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const SyncSettingsTab: React.FC<SyncSettingsTabProps> = ({ addToast }) => {
  const { setSettingsTab } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);
  const [serverStatusError, setServerStatusError] = useState(false);

  const hosted = status.authRequired || accountClient.isAuthenticated();
  const locked = status.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;
  const sub = status.subscription;

  useEffect(() => syncEngine.subscribe((next) => {
    setStatus(next);
    setConfig(syncEngine.getConfig());
  }), []);

  useEffect(() => accountClient.subscribe(setAccountState), []);

  useEffect(() => {
    void accountClient.detectServer(config.serverUrl);
  }, [config.serverUrl]);

  const handleTestServerConnection = async () => {
    setIsTestingServer(true);
    setServerStatusMessage(null);
    setServerStatusError(false);
    try {
      const cleanUrl = serverUrlInput.replace(/\/+$/, '');
      const started = Date.now();
      const response = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json();
      await accountClient.detectServer(cleanUrl);
      await syncEngine.updateServerUrl(cleanUrl);
      accountClient.startPolling(cleanUrl);
      setServerStatusMessage(`${health.service} · ${Date.now() - started} мс · ${health.authRequired ? 'SLAG ID' : 'без ЛК'}`);
      addToast?.('Сервер синхронизации сохранён', 'success');
    } catch (error) {
      setServerStatusMessage(error instanceof Error ? error.message : String(error));
      setServerStatusError(true);
    } finally {
      setIsTestingServer(false);
    }
  };

  const activeDevices = account
    ? accountState.devices.filter((device) => device.status === 'active').length
    : 1 + config.trustedDevices.length;
  const planLabel = account?.planLabel || sub.planLabel;
  const maxDevices = account?.maxDevices ?? sub.maxDevices;
  const usedCacheMb = account?.usedCacheMb ?? sub.usedCacheMb;
  const maxCacheMb = account?.maxCacheMb ?? sub.maxCacheMb;
  const limitsKnown = Boolean(account) || maxDevices > 0;

  return (
    <div className="flex flex-col gap-3 text-zinc-100">
      {locked && (
        <section className="settings-card p-3.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-fg-primary">Синхронизация недоступна</h3>
            <p className="text-2xs text-zinc-400 mt-0.5">Требуется вход в аккаунт SLAG ID.</p>
          </div>
          <button
            type="button"
            data-testid="sync-open-account"
            onClick={() => { navigatePage('account'); }}
            className="px-3.5 py-1.5 rounded-lg bg-white text-black text-xs font-semibold whitespace-nowrap shrink-0 motion-press cursor-pointer"
          >
            Войти
          </button>
        </section>
      )}

      {/* Sync Status Card */}
      <section className="settings-card p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${status.state === 'connected' ? 'bg-emerald-500' : status.state === 'syncing' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs font-semibold text-fg-primary truncate">{planLabel}</span>
            <span className="text-[10px] font-mono text-zinc-500 shrink-0">E2EE</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void syncEngine.pushLocalChanges()}
              disabled={locked || status.state === 'syncing'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-2xs text-zinc-300 bg-white/[0.04] border border-white/[0.06] rounded-md disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer motion-press"
            >
              <RefreshCw className={`w-3 h-3 ${status.state === 'syncing' ? 'animate-spin' : ''}`} />
              Синхронизировать
            </button>
            {hosted && !locked && (
              <button
                type="button"
                onClick={() => { navigatePage('account'); }}
                className="px-2 py-1 text-2xs text-zinc-400 bg-white/[0.03] border border-white/[0.06] rounded-md cursor-pointer hover:text-white"
              >
                Личный кабинет
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-2.5 text-2xs text-zinc-500 border-t border-white/[0.04] pt-2">
          <span>{hosted ? (account ? `тариф до ${account.expiresAt ? new Date(account.expiresAt).toLocaleDateString('ru-RU') : 'бессрочно'}` : 'требуется вход') : 'свой сервер'}</span>
          <span>·</span>
          <span>{limitsKnown ? `${activeDevices} из ${maxDevices} устройств` : 'лимиты устройств — после входа'}</span>
          <span>·</span>
          <span className="font-mono">
            {limitsKnown
              ? `кеш ${usedCacheMb} / ${maxCacheMb >= 1024 ? `${Math.round(maxCacheMb / 1024)} ГБ` : `${maxCacheMb} МБ`}`
              : 'кеш не синхронизирован'}
          </span>
        </div>
      </section>

      {/* Devices Link Banner */}
      <section className="settings-card p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-fg-primary">Подключённые устройства</div>
            <p className="text-2xs text-zinc-500 truncate">
              {activeDevices} {activeDevices === 1 ? 'устройство' : 'устройств'} · привязка и доступ к базам
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="sync-to-devices-btn"
          onClick={() => setSettingsTab('devices')}
          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-200 font-medium cursor-pointer shrink-0 motion-press"
        >
          Устройства →
        </button>
      </section>

      {/* Relay Server */}
      <section className="settings-card flex flex-col">
        <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
          <div className="relative flex-1 min-w-0">
            <Server className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full bg-panel border border-white/[0.08] rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono text-white outline-none truncate" />
          </div>
          <button type="button" onClick={() => void handleTestServerConnection()} disabled={isTestingServer} className="px-3 py-1.5 bg-white/[0.06] text-xs text-zinc-300 rounded-lg disabled:opacity-50 shrink-0 cursor-pointer">{isTestingServer ? 'Тест…' : 'Проверить'}</button>
        </div>
        {serverStatusMessage && (
          <p
            role="status"
            className={`px-3 pb-3 sm:px-4 font-mono text-2xs leading-snug break-words ${serverStatusError ? 'text-rose-300' : 'text-fg-muted'}`}
          >
            {serverStatusError ? `не удалось: ${serverStatusMessage}` : serverStatusMessage}
          </p>
        )}
        <SettingsDivider />
        <SettingsRow
          label="Синхронизировать при сохранении"
          right={
            <SettingsSwitch
              checked={config.autoSync}
              onChange={(checked) => { syncEngine.saveConfig({ autoSync: checked }); setConfig(syncEngine.getConfig()); }}
              label="Синхронизировать при сохранении"
            />
          }
        />
        <SettingsDivider />
        <SettingsSelect
          label="Частота синхронизации"
          testId="sync-interval-select"
          value={String(config.bgSyncIntervalMinutes ?? 0)}
          onChange={(next) => { syncEngine.setBgSyncInterval(Number(next) as 0 | 10 | 30); setConfig(syncEngine.getConfig()); }}
          options={[
            { value: '0', label: 'Мгновенно', testId: 'sync-interval-0' },
            { value: '10', label: '10 мин', testId: 'sync-interval-10' },
            { value: '30', label: '30 мин (эко)', testId: 'sync-interval-30' },
          ]}
        />
      </section>

      {/* Rotate Vault Key */}
      <section className="settings-card p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
          <div><div className="text-xs font-semibold text-fg-primary">Смена ключа хранилища</div><p className="text-2xs text-zinc-500">Все устройства потребуют нового приглашения.</p></div>
        </div>
        <button type="button" disabled={locked} onClick={() => {
          if (!window.confirm('Сменить ключ хранилища? Доступ остальных устройств будет остановлен.')) return;
          void syncEngine.rotateVaultKey().then(() => addToast?.('Ключ хранилища изменён', 'success'));
        }} className="px-3 py-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs rounded-lg disabled:opacity-40 cursor-pointer">Сменить ключ</button>
      </section>
    </div>
  );
};
