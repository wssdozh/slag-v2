import React, { useEffect, useState } from 'react';
import {
  Laptop,
  UserRound,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { navigatePage } from '../../lib/navigation';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncConfig, SyncStatus } from '../../lib/sync/types';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from './SettingsUI';

export const SyncSettingsTab: React.FC = () => {
  const { setSettingsTab, addToast } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isTestingServer, setIsTestingServer] = useState(false);

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
    try {
      const cleanUrl = serverUrlInput.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await accountClient.detectServer(cleanUrl);
      await syncEngine.updateServerUrl(cleanUrl);
      accountClient.startPolling(cleanUrl);
      addToast('Сервер синхронизации сохранён', 'success');
    } catch (error) {
      addToast(`Не удалось проверить сервер: ${error instanceof Error ? error.message : String(error)}`, 'error');
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

      <SettingsGroup title="Аккаунт">
        <SettingsRow label="Тариф" value={planLabel} />
        <SettingsDivider />
        <SettingsRow label="Срок действия" value={hosted ? (account ? (account.expiresAt ? <span className="font-mono">{new Date(account.expiresAt).toLocaleDateString('ru-RU')}</span> : 'Бессрочно') : 'Требуется вход') : 'Свой сервер'} />
        <SettingsDivider />
        <SettingsRow label="Кеш" value={limitsKnown ? <span className="font-mono">{usedCacheMb} МБ / {maxCacheMb >= 1024 ? `${Math.round(maxCacheMb / 1024)} ГБ` : `${maxCacheMb} МБ`}</span> : 'Не синхронизирован'} />
      </SettingsGroup>

      <SettingsGroup title="Синхронизация" action={<span className="text-2xs font-mono text-fg-dim">E2EE</span>}>
        <SettingsRow label="Статус" description={
          <span role="status" className="flex flex-col gap-0.5 break-words">
            <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`w-2 h-2 shrink-0 rounded-full ${status.state === 'connected' ? 'bg-success' : status.state === 'syncing' ? 'bg-warning motion-safe:animate-pulse' : status.state === 'error' ? 'bg-danger' : 'bg-fg-dim'}`} />
            {locked ? 'Требуется вход' : { idle: 'Ожидание', syncing: 'Синхронизация…', connected: 'Подключено', error: 'Ошибка', offline: 'Нет подключения' }[status.state]}
            </span>
            {status.error && <span className="text-danger">{status.error}</span>}
          </span>
        } right={<button type="button" onClick={() => void syncEngine.pushLocalChanges()} disabled={locked || status.state === 'syncing'} className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer">Синхронизировать</button>} />
        <SettingsDivider />
        <SettingsRow label={<input aria-label="Адрес сервера синхронизации" value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full py-1 text-xs font-mono text-fg-primary bg-transparent outline-none truncate" />} right={
          <button type="button" onClick={() => void handleTestServerConnection()} disabled={isTestingServer} className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-50 cursor-pointer">{isTestingServer ? 'Тест…' : 'Проверить'}</button>
        } />
        <SettingsDivider />
        <SettingsRow label="Синхронизировать при сохранении" right={<SettingsSwitch checked={config.autoSync} onChange={(checked) => { syncEngine.saveConfig({ autoSync: checked }); setConfig(syncEngine.getConfig()); }} label="Синхронизировать при сохранении" />} />
        <SettingsDivider />
        <SettingsSelect label="Частота синхронизации" testId="sync-interval-select" value={String(config.bgSyncIntervalMinutes ?? 0)} onChange={(next) => { syncEngine.setBgSyncInterval(Number(next) as 0 | 10 | 30); setConfig(syncEngine.getConfig()); }} options={[
          { value: '0', label: 'Мгновенно', testId: 'sync-interval-0' },
          { value: '10', label: '10 мин', testId: 'sync-interval-10' },
          { value: '30', label: '30 мин (эко)', testId: 'sync-interval-30' },
        ]} />
      </SettingsGroup>

      <SettingsGroup>
        {hosted && !locked && <><SettingsRow icon={<UserRound className="w-4 h-4" />} label="Личный кабинет" onClick={() => navigatePage('account')} external /><SettingsDivider inset /></>}
        <SettingsRow icon={<Laptop className="w-4 h-4" />} label="Подключённые устройства" value={<span className="font-mono">{limitsKnown ? `${activeDevices} из ${maxDevices}` : activeDevices}</span>} testId="sync-to-devices-btn" onClick={() => setSettingsTab('devices')} chevron />
      </SettingsGroup>

      <SettingsGroup title="Безопасность">
        <SettingsRow label="Смена ключа хранилища" description="Все устройства потребуют нового приглашения." danger right={
          <button type="button" disabled={locked} onClick={() => {
            if (!window.confirm('Сменить ключ хранилища? Доступ остальных устройств будет остановлен.')) return;
            void syncEngine.rotateVaultKey().then(() => addToast('Ключ хранилища изменён', 'success')).catch((error: unknown) => addToast(`Не удалось сменить ключ: ${error instanceof Error ? error.message : String(error)}`, 'error'));
          }} className="px-2 py-1.5 text-2xs text-danger rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer">Сменить ключ</button>
        } />
      </SettingsGroup>
    </div>
  );
};
