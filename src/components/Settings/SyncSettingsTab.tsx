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
        <section className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-white">Синхронизация недоступна</h3>
            <p className="text-2xs text-zinc-400 mt-0.5">Требуется вход в аккаунт SLAG ID.</p>
          </div>
          <button
            type="button"
            data-testid="sync-open-account"
            onClick={() => { navigatePage('account'); }}
            className="px-3.5 py-1.5 rounded-lg bg-white text-black text-xs font-semibold whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
          >
            Войти
          </button>
        </section>
      )}

      {/* Sync Status Card */}
      <section className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${status.state === 'connected' ? 'bg-emerald-500' : status.state === 'syncing' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs font-semibold text-white truncate">{planLabel}</span>
            <span className="text-[10px] font-mono text-zinc-500 shrink-0">E2EE</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void syncEngine.pushLocalChanges()}
              disabled={locked || status.state === 'syncing'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-2xs text-zinc-300 bg-white/[0.04] border border-white/[0.06] rounded-md disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
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
      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-200">Подключённые устройства</div>
            <p className="text-2xs text-zinc-500 truncate">
              {activeDevices} {activeDevices === 1 ? 'устройство' : 'устройств'} · привязка и доступ к базам
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="sync-to-devices-btn"
          onClick={() => setSettingsTab('devices')}
          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-200 font-medium transition-colors cursor-pointer shrink-0 active:scale-95"
        >
          Устройства →
        </button>
      </section>

      {/* Relay Server */}
      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">Сервер ретрансляции</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Server className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full bg-[#0c0c0e] border border-white/[0.08] rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono text-white outline-none truncate" />
          </div>
          <button type="button" onClick={() => void handleTestServerConnection()} disabled={isTestingServer} className="px-3 py-1.5 bg-white/[0.06] text-xs text-zinc-300 rounded-lg disabled:opacity-50 shrink-0 cursor-pointer">{isTestingServer ? 'Тест…' : 'Проверить'}</button>
        </div>
        {serverStatusMessage && (
          <p
            role="status"
            className={`font-mono text-2xs leading-snug break-words ${serverStatusError ? 'text-rose-300' : 'text-zinc-400'}`}
          >
            {serverStatusError ? `не удалось: ${serverStatusMessage}` : serverStatusMessage}
          </p>
        )}
        <label className="flex items-center justify-between text-2xs text-zinc-400 cursor-pointer">
          Автоматическая синхронизация при сохранении
          <input type="checkbox" checked={config.autoSync} onChange={(event) => { syncEngine.saveConfig({ autoSync: event.target.checked }); setConfig(syncEngine.getConfig()); }} className="w-3.5 h-3.5 accent-white cursor-pointer" />
        </label>
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.04]">
          <div className="flex justify-between text-2xs text-zinc-400"><span>Фоновая синхронизация</span><span>{config.bgSyncIntervalMinutes ? `${config.bgSyncIntervalMinutes} мин` : 'в реальном времени'}</span></div>
          <div className="grid grid-cols-3 gap-1 bg-[#0c0c0e] p-0.5 rounded-lg border border-white/[0.08]">
            {([0, 10, 30] as const).map((minutes) => (
              <button key={minutes} type="button" data-testid={`sync-interval-${minutes}`} onClick={() => { syncEngine.setBgSyncInterval(minutes); setConfig(syncEngine.getConfig()); }} className={`py-1 text-2xs rounded-md cursor-pointer ${config.bgSyncIntervalMinutes === minutes ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>
                {minutes === 0 ? 'Мгновенно' : minutes === 10 ? '10 мин' : '30 мин (эко)'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Rotate Vault Key */}
      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
          <div><div className="text-xs font-semibold text-zinc-200">Смена ключа хранилища</div><p className="text-2xs text-zinc-500">Все устройства потребуют нового приглашения.</p></div>
        </div>
        <button type="button" disabled={locked} onClick={() => {
          if (!window.confirm('Сменить ключ хранилища? Доступ остальных устройств будет остановлен.')) return;
          void syncEngine.rotateVaultKey().then(() => addToast?.('Ключ хранилища изменён', 'success'));
        }} className="px-3 py-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs rounded-lg disabled:opacity-40 cursor-pointer">Сменить ключ</button>
      </section>
    </div>
  );
};
