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
  const conflicts = syncEngine.getNoteConflicts();
  const sections = new Map<string, typeof conflicts>();
  for (const entry of conflicts) {
    const key = entry.folderGroup?.id ?? entry.intentId;
    const entries = sections.get(key);
    if (entries) entries.push(entry);
    else sections.set(key, [entry]);
  }
  const resolveConflict = async (entries: typeof conflicts, resolution: 'keep' | 'retry') => {
    const [entry] = entries;
    const groupId = entry.folderGroup?.id;
    const keep = resolution === 'keep';
    const retryLabel = groupId ? 'Повторить всю операцию' : 'Применить локальную';
    if (!await confirmAction({
      title: keep ? 'Оставить версию релея?' : groupId ? 'Повторить всю папочную операцию?' : 'Применить локальную правку?',
      description: groupId ? (keep ? 'Весь перенос будет отклонён. Папки и заметки останутся как на релее.'
        : 'Локальные версии дерева и всех записей будут отправлены вместе. Если хотя бы одна ревизия сменилась, пакет не применится.')
        : keep ? 'Отклонённая правка будет удалена из списка конфликтов.'
        : `Локальная правка будет отправлена поверх подтверждённой ревизии ${entry.currentRevision}. Если версия сменилась, синхронизация не перезапишет её.`,
      confirmLabel: keep ? 'Оставить версию релея' : retryLabel, isDestructive: true,
    })) return;
    try {
      if (groupId) await syncEngine.resolveFolderConflict(groupId, resolution, Object.fromEntries(entries.map(({ noteId, currentRevision }) => [noteId, currentRevision])));
      else await syncEngine.resolveNoteConflict(entry.intentId, resolution, entry.currentRevision);
    } catch (error) {
      addToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };
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

      {conflicts.length > 0 && (
        <SettingsGroup title="Конфликты синхронизации">
          {[...sections].map(([key, entries]) => (
            <React.Fragment key={key}>
              {entries[0].folderGroup && <SettingsRow label="Папочная операция" description="Дерево и записи можно принять или отклонить только вместе." />}
              {entries.map((entry) => <React.Fragment key={entry.intentId}>
              <SettingsRow
                label={Array.isArray(entry.item) ? 'Дерево папок' : entry.item && 'title' in entry.item ? entry.item.title || entry.noteId : entry.noteId}
                description={`Локальная правка не принята · ревизия релея ${entry.currentRevision}`}
              />
              <SettingsRow label={(
                <details className="text-xs text-fg-secondary">
                  <summary className="cursor-pointer">Сравнить версии</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[['Релей', entry.currentItem], ['Локально', entry.item]].map(([label, item]) => (
                      <div key={String(label)} className="min-w-0">
                        <p className="text-fg-primary">{String(label)}</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all">{
                          item === null ? 'Нет записи' : JSON.stringify(item, null, 2)
                        }</pre>
                      </div>
                    ))}
                  </div>
                </details>
              )} />
              </React.Fragment>)}
              <SettingsRow label="Решение" right={(
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                  <button type="button" className="text-xs text-fg-primary hover:underline" onClick={() => void resolveConflict(entries, 'keep')}>Оставить версию релея</button>
                  <button type="button" disabled={config.localSyncMode === 'receive-only' || (!!entries[0].folderGroup && entries.some(({ currentItem }) => currentItem === null))} className="text-xs text-fg-primary hover:underline disabled:opacity-40" onClick={() => void resolveConflict(entries, 'retry')}>
                    {entries[0].folderGroup ? 'Повторить всю операцию' : 'Применить локальную'}
                  </button>
                </div>
              )} />
              <SettingsDivider />
            </React.Fragment>
          ))}
        </SettingsGroup>
      )}

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
