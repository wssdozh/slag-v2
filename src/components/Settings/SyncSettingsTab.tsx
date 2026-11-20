// The sync channel: status, server address, schedule; account and devices sit nearby.
import React, { useEffect, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncConfig, SyncStatus } from '../../lib/sync/types';
import { keepRelayOnConflict, setKeepRelayOnConflict } from '../../lib/sync/notes/conflicts';
import { IconButton } from '../UI/IconButton';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from './SettingsUI';

/** Канал: состояние, адрес сервера и когда гнать. Аккаунт и устройства — соседние разделы. */
export const SyncSettingsTab: React.FC = () => {
  const { addToast, confirmAction } = useApp();
  const [, renderConflictSetting] = useState(0);
  const vaultId = syncEngine.currentVaultId;
  const keepRelay = keepRelayOnConflict(vaultId);

  const changeConflictSetting = async (enabled: boolean) => {
    if (enabled && !await confirmAction({
      title: 'Не сохранять отклонённые правки?',
      description: 'Совместимые правки по-прежнему объединятся. При настоящем конфликте останется версия релея, а отвергнутая правка не попадёт в локальную историю. Уже сохранённая история не удалится.',
      confirmLabel: 'Оставлять версию релея', isDestructive: true,
    })) return;
    setKeepRelayOnConflict(vaultId, enabled);
    renderConflictSetting((revision) => revision + 1);
  };
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const locked = status.authRequired && !accountClient.isAuthenticated();

  useEffect(() => syncEngine.subscribe((next) => {
    setStatus(next);
    setConfig(syncEngine.getConfig());
  }), []);

  useEffect(() => {
    void accountClient.detectServer(config.serverUrl);
  }, [config.serverUrl]);

  /**
   * Прощупывает релей по введённому адресу и запоминает его, если он сменился.
   * Бросает на первом отказе — вызывающий сводит всю проверку к одному тосту.
   */
  const checkServerConnection = async (cleanUrl: string): Promise<void> => {
    const response = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await accountClient.detectServer(cleanUrl);
    // updateServerUrl рвёт сокет и чистит bookkeeping, так что только на реальной смене
    // адреса, а не на каждой проверке.
    if (cleanUrl !== config.serverUrl) await syncEngine.updateServerUrl(cleanUrl);
    accountClient.startPolling(cleanUrl);
  };

  /** Одна кнопка на всю карточку: адрес и статус обновляются вместе, ошибка — одним тостом. */
  const handleRefresh = async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await checkServerConnection(serverUrlInput.replace(/\/+$/, ''));
      // Проверка сервера отвечает «жив», но это не значит, что синхронизация прошла: старую
      // ошибку снимает и настоящий проход, а не успешный /health.
      await syncEngine.retrySync();
      const error = syncEngine.getStatus().error;
      if (error) addToast(`Сервер проверен, но синхронизация не прошла: ${error}`, 'error');
      else addToast('Сервер проверен', 'success');
    } catch (error) {
      addToast(`Не удалось проверить сервер: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsRefreshing(false);
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
        } right={
          <IconButton
            size="lg"
            aria-label="Обновить"
            title="Проверить сервер и отправить изменения"
            data-testid="sync-refresh-btn"
            aria-busy={isRefreshing}
            disabled={isRefreshing}
            onClick={() => void handleRefresh()}
          >
            <Icon name="action.refresh" size="md" tone="inherit" className={isRefreshing ? 'motion-safe:animate-spin' : ''} />
          </IconButton>
        } />
        <SettingsDivider />
        <SettingsRow label={<input aria-label="Адрес сервера синхронизации" value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full py-1 text-xs font-mono text-fg-primary bg-transparent outline-none truncate" />} />
        <SettingsDivider />
        <SettingsRow label="Синхронизировать при сохранении" right={<SettingsSwitch checked={config.autoSync} onChange={(checked) => { syncEngine.saveConfig({ autoSync: checked }); setConfig(syncEngine.getConfig()); }} label="Синхронизировать при сохранении" />} />
        <SettingsDivider />
        <SettingsSelect label="Частота синхронизации" testId="sync-interval-select" value={String(config.bgSyncIntervalMinutes ?? 0)} onChange={(next) => { syncEngine.setBgSyncInterval(Number(next) as 0 | 10 | 30); setConfig(syncEngine.getConfig()); }} options={[
          { value: '0', label: 'Мгновенно', testId: 'sync-interval-0' },
          { value: '10', label: '10 мин', testId: 'sync-interval-10' },
          { value: '30', label: '30 мин (эко)', testId: 'sync-interval-30' },
        ]} />
      </SettingsGroup>

      <SettingsGroup title="Конфликты заметок">
        <SettingsRow label="В конфликте оставлять версию релея"
          description={keepRelay ? 'Отклонённые правки не сохраняются. Совместимые правки объединяются.' : 'Отклонённые правки сохраняются в локальной истории, а не в ленте.'}
          right={<SettingsSwitch checked={keepRelay} onChange={(enabled) => void changeConflictSetting(enabled)} label="В конфликте оставлять версию релея" />}
        />
      </SettingsGroup>

      <SettingsGroup title="Безопасность">
        <SettingsRow label="Смена ключа хранилища" danger right={
          <button type="button" disabled={locked} onClick={async () => {
            if (!await confirmAction({ title: 'Сменить ключ хранилища?', description: 'Остальные устройства потеряют доступ и потребуют нового приглашения. Ключ нельзя вернуть назад.', confirmLabel: 'Сменить ключ', isDestructive: true })) return;
            void syncEngine.rotateVaultKey().then(() => addToast('Ключ хранилища изменён', 'success')).catch((error: unknown) => addToast(`Не удалось сменить ключ: ${error instanceof Error ? error.message : String(error)}`, 'error'));
          }} className="px-2 py-1.5 text-2xs text-danger rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer">Сменить ключ</button>
        } />
      </SettingsGroup>
    </div>
  );
};
