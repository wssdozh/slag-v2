// The sync channel: status, server address, schedule; account and devices sit nearby.
import React, { useEffect, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncConfig, SyncStatus } from '../../lib/sync/types';
import { IconButton } from '../UI/IconButton';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from './SettingsUI';

/** Канал: состояние, адрес сервера и когда гнать. Аккаунт и устройства — соседние разделы. */
export const SyncSettingsTab: React.FC = () => {
  const { addToast, confirmAction } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isTestingServer, setIsTestingServer] = useState(false);

  const locked = status.authRequired && !accountClient.isAuthenticated();

  useEffect(() => syncEngine.subscribe((next) => {
    setStatus(next);
    setConfig(syncEngine.getConfig());
  }), []);

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

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup title="Синхронизация" action={<span className="text-2xs font-mono text-fg-dim">E2EE</span>}>
        <SettingsRow label="Статус" description={
          <span role="status" className="flex flex-col gap-0.5 break-words">
            <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`w-2 h-2 shrink-0 rounded-full ${status.state === 'connected' ? 'bg-success' : status.state === 'syncing' ? 'bg-warning motion-safe:animate-pulse' : status.state === 'error' ? 'bg-danger' : 'bg-fg-dim'}`} />
            {locked ? 'Требуется вход' : { idle: 'Ожидание', syncing: 'Синхронизация…', connected: 'Подключено', error: 'Ошибка', offline: 'Нет подключения' }[status.state]}
            </span>
            {status.error && <span className="text-danger">{status.error}</span>}
          </span>
        } right={<IconButton size="lg" aria-label="Синхронизировать" title="Синхронизировать" onClick={() => void syncEngine.pushLocalChanges()} disabled={locked || status.state === 'syncing'}><Icon name="action.refresh" size="md" tone="inherit" className={`${status.state === 'syncing' ? 'motion-safe:animate-spin' : ''}`} /></IconButton>} />
        <SettingsDivider />
        <SettingsRow label={<input aria-label="Адрес сервера синхронизации" value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full py-1 text-xs font-mono text-fg-primary bg-transparent outline-none truncate" />} right={
          <IconButton size="lg" aria-label="Проверить" title="Проверить соединение с сервером" aria-busy={isTestingServer} onClick={() => void handleTestServerConnection()} disabled={isTestingServer}>{isTestingServer ? <Icon name="action.refresh" size="md" tone="inherit" className="motion-safe:animate-spin" /> : <Icon name="system.connectionTest" size="md" tone="inherit" />}</IconButton>
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

      <SettingsGroup title="Безопасность">
        <SettingsRow label="Смена ключа хранилища" description="Все устройства потребуют нового приглашения." danger right={
          <button type="button" disabled={locked} onClick={async () => {
            if (!await confirmAction({ title: 'Сменить ключ хранилища?', description: 'Остальные устройства потеряют доступ и потребуют нового приглашения. Ключ нельзя вернуть назад.', confirmLabel: 'Сменить ключ', isDestructive: true })) return;
            void syncEngine.rotateVaultKey().then(() => addToast('Ключ хранилища изменён', 'success')).catch((error: unknown) => addToast(`Не удалось сменить ключ: ${error instanceof Error ? error.message : String(error)}`, 'error'));
          }} className="px-2 py-1.5 text-2xs text-danger rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer">Сменить ключ</button>
        } />
      </SettingsGroup>
    </div>
  );
};
