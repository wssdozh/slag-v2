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
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from './SettingsUI';

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
    <div className="flex flex-col gap-3">
      {locked && (
        <SettingsGroup title="SLAG ID">
          <SettingsRow label="Синхронизация недоступна" description="Требуется вход в аккаунт SLAG ID." right={
            <button type="button" data-testid="sync-open-account" onClick={() => navigatePage('account')} className="px-3 py-1.5 text-xs text-fg-primary rounded-md hover:bg-surface-hover cursor-pointer">Войти</button>
          } />
        </SettingsGroup>
      )}

      <SettingsGroup title="Состояние синхронизации" action={<span className="text-2xs font-mono text-fg-dim">E2EE</span>}>
        <SettingsRow
          icon={<span className={`w-2 h-2 rounded-full ${status.state === 'connected' ? 'bg-success' : status.state === 'syncing' ? 'bg-warning animate-pulse' : 'bg-fg-dim'}`} />}
          label={planLabel}
          description={hosted ? (account ? `Тариф до ${account.expiresAt ? new Date(account.expiresAt).toLocaleDateString('ru-RU') : 'бессрочно'}` : 'Требуется вход') : 'Свой сервер'}
          right={<button type="button" onClick={() => void syncEngine.pushLocalChanges()} disabled={locked || status.state === 'syncing'} className="flex items-center gap-1.5 px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer"><RefreshCw className={`w-3.5 h-3.5 ${status.state === 'syncing' ? 'animate-spin' : ''}`} />Синхронизировать</button>}
        />
        <SettingsDivider />
        <SettingsRow label="Кеш" value={limitsKnown ? `${usedCacheMb} / ${maxCacheMb >= 1024 ? `${Math.round(maxCacheMb / 1024)} ГБ` : `${maxCacheMb} МБ`}` : 'Не синхронизирован'} />
        {hosted && !locked && <><SettingsDivider /><SettingsRow label="Личный кабинет" onClick={() => navigatePage('account')} external /></>}
        <SettingsDivider />
        <SettingsRow icon={<Laptop className="w-4 h-4" />} label="Подключённые устройства" right={
          <button type="button" data-testid="sync-to-devices-btn" onClick={() => setSettingsTab('devices')} className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover cursor-pointer">{limitsKnown ? `${activeDevices} из ${maxDevices}` : activeDevices} →</button>
        } />
      </SettingsGroup>

      <SettingsGroup title="Сервер и синхронизация">
        <SettingsRow icon={<Server className="w-4 h-4" />} label={<input aria-label="Адрес сервера синхронизации" value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full py-1 text-xs font-mono text-fg-primary bg-transparent outline-none truncate" />} right={
          <button type="button" onClick={() => void handleTestServerConnection()} disabled={isTestingServer} className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-50 cursor-pointer">{isTestingServer ? 'Тест…' : 'Проверить'}</button>
        } />
        {serverStatusMessage && <p role="status" className={`px-3 pb-3 sm:px-4 font-mono text-2xs leading-snug break-words ${serverStatusError ? 'text-danger' : 'text-fg-muted'}`}>{serverStatusError ? `не удалось: ${serverStatusMessage}` : serverStatusMessage}</p>}
        <SettingsDivider />
        <SettingsRow label="Синхронизировать при сохранении" right={<SettingsSwitch checked={config.autoSync} onChange={(checked) => { syncEngine.saveConfig({ autoSync: checked }); setConfig(syncEngine.getConfig()); }} label="Синхронизировать при сохранении" />} />
        <SettingsDivider />
        <SettingsSelect label="Частота синхронизации" testId="sync-interval-select" value={String(config.bgSyncIntervalMinutes ?? 0)} onChange={(next) => { syncEngine.setBgSyncInterval(Number(next) as 0 | 10 | 30); setConfig(syncEngine.getConfig()); }} options={[
          { value: '0', label: 'Мгновенно', testId: 'sync-interval-0' },
          { value: '10', label: '10 мин', testId: 'sync-interval-10' },
          { value: '30', label: '30 мин (эко)', testId: 'sync-interval-30' },
        ]} />
      </SettingsGroup>

      <SettingsGroup title="Безопасность">
        <SettingsRow icon={<KeyRound className="w-4 h-4" />} label="Смена ключа хранилища" description="Все устройства потребуют нового приглашения." danger right={
          <button type="button" disabled={locked} onClick={() => {
            if (!window.confirm('Сменить ключ хранилища? Доступ остальных устройств будет остановлен.')) return;
            void syncEngine.rotateVaultKey().then(() => addToast?.('Ключ хранилища изменён', 'success'));
          }} className="px-2 py-1.5 text-2xs text-danger rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer">Сменить ключ</button>
        } />
      </SettingsGroup>
    </div>
  );
};
