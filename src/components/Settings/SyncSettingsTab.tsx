// The sync channel: status, server address, schedule; account and devices sit nearby.
import React, { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { DiffModal } from '../Modals/DiffModal';
import { noteDifferences } from '../../lib/sync/notes/merge';
import { isNoteItem } from '../../lib/sync/notes/wire';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { isAndroidApp } from '../../lib/platform/deviceAccess';
import { accountClient } from '../../lib/sync/account';
import { getAndroidBackgroundSyncEnabled, setAndroidBackgroundSyncEnabled, subscribeAndroidBackgroundSyncPreference } from '../../lib/sync/androidBackgroundPreference';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncConfig, SyncStatus } from '../../lib/sync/types';
import { IconButton } from '../UI/IconButton';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from './SettingsUI';

const propertyLabels: Record<string, string> = {
  title: 'Заголовок', type: 'Тип', folder: 'Папка', tags: 'Теги', attachments: 'Вложения', status: 'Статус',
  priority: 'Приоритет', dueDate: 'Срок', reminder: 'Напоминание', duration: 'Длительность', recurrence: 'Повтор',
  subtasks: 'Подзадачи', isPinned: 'Закрепление', isArchived: 'Архив', linkedItemIds: 'Связанные записи',
  content: 'Текст', customProps: 'Свойства Markdown', kanbanColumn: 'Колонка', summary: 'Краткое описание',
};

const conflictReasons: Record<string, string> = {
  base: 'Не удалось подтвердить исходную версию правки',
  lifecycle: 'Не удалось подтвердить непрерывную историю заметки',
  predecessor: 'Предыдущая локальная правка не принята',
};

function AndroidBackgroundSyncRow() {
  const enabled = useSyncExternalStore(subscribeAndroidBackgroundSyncPreference, getAndroidBackgroundSyncEnabled);
  const hintId = useId();
  const label = 'Фоновая синхронизация';

  return (
    <SettingsRow label={label} description={
      <span id={hintId} className="text-fg-secondary">
        Когда выключено, SLAG догоняет изменения при открытии. Android может отложить
        обмен в Doze даже при включённом режиме. После принудительной остановки откройте SLAG снова.
        Настройки батареи и автозапуска находятся в Android.
      </span>
    } right={
      <SettingsSwitch
        checked={enabled}
        onChange={setAndroidBackgroundSyncEnabled}
        label={label}
        descriptionId={hintId}
        testId="android-background-sync-switch"
        className="before:absolute before:-inset-x-1.5 before:-inset-y-3.5 before:rounded-md focus-visible:before:border focus-visible:before:border-fg-secondary active:opacity-80"
      />
    } />
  );
}

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
  const [review, setReview] = useState<{ key: string; revisions: Record<string, number> }>();
  const [decision, setDecision] = useState<'keep' | 'retry' | 'close'>();
  const [draft, setDraft] = useState<string>();
  const [reviewError, setReviewError] = useState('');
  const [resolving, setResolving] = useState(false);
  const reviewed = review ? sections.get(review.key) ?? [] : [];
  const revisions = (entries: typeof conflicts) => Object.fromEntries(entries.map(({ noteId, currentRevision }) => [noteId, currentRevision]));
  const changed = review && reviewed.some(({ noteId, currentRevision }) => review.revisions[noteId] !== currentRevision);
  const dismissReview = () => { setDraft(undefined); setReview(undefined); setDecision(undefined); setReviewError(''); };
  const closeReview = () => {
    if (resolving) return;
    if (draft !== undefined) setDecision('close');
    else dismissReview();
  };
  const resolveConflict = async () => {
    if (decision === 'close') { dismissReview(); return; }
    if (!review || !decision || resolving || changed || !reviewed.length) return;
    const [entry] = reviewed;
    setResolving(true);
    try {
      if (entry.folderGroup) await syncEngine.resolveFolderConflict(entry.folderGroup.id, decision, review.revisions);
      else await syncEngine.resolveNoteConflict(entry.intentId, decision, review.revisions[entry.noteId], decision === 'retry' ? draft : undefined);
      dismissReview();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
      setDecision(undefined);
    } finally {
      setResolving(false);
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
        <SettingsSelect label={isAndroidApp() ? 'Резервный опрос' : 'Частота синхронизации'} testId="sync-interval-select" value={String(config.bgSyncIntervalMinutes ?? 0)} onChange={(next) => { syncEngine.setBgSyncInterval(Number(next) as 0 | 10 | 30); setConfig(syncEngine.getConfig()); }} options={[
          { value: '0', label: 'Мгновенно', testId: 'sync-interval-0' },
          { value: '10', label: '10 мин', testId: 'sync-interval-10' },
          { value: '30', label: '30 мин (эко)', testId: 'sync-interval-30' },
        ]} />
        {isAndroidApp() && <AndroidBackgroundSyncRow />}
      </SettingsGroup>

      {conflicts.length > 0 && (
        <SettingsGroup title="Конфликты синхронизации">
          {[...sections].map(([key, entries]) => (
            <SettingsRow key={key}
              label={entries[0].folderGroup ? 'Папочная операция' : isNoteItem(entries[0].item) ? entries[0].item.title || 'Запись' : isNoteItem(entries[0].currentItem) ? entries[0].currentItem.title || 'Запись' : 'Запись'}
              description={entries[0].folderGroup ? `Записей и дерево: ${entries.length}` : `Локальная правка не принята · ревизия релея ${entries[0].currentRevision}`}
              right={<button type="button" className="px-3 py-2 text-xs hover:underline" onClick={() => {
                setDecision(undefined); setReviewError(''); setReview({ key, revisions: revisions(entries) });
              }}>Сравнить</button>}
            />
          ))}
        </SettingsGroup>
      )}

      <DiffModal isOpen={reviewed.length > 0} onClose={closeReview} title="Конфликт синхронизации" items={reviewed.map(({ item, currentItem, currentRevision, folderGroup, fields }) => {
        const before = isNoteItem(currentItem) ? currentItem : undefined;
        const after = isNoteItem(item) ? item : undefined;
        const show = (value: unknown) => typeof value === 'string' ? value || 'Пусто' : value === undefined ? 'Не задано' : JSON.stringify(value);
        const properties = before && after ? noteDifferences(before, after).filter((key) => key !== 'content').map((key) => ({
          label: propertyLabels[key] ?? key,
          oldValue: show((before as unknown as Record<string, unknown>)[key]),
          newValue: show((after as unknown as Record<string, unknown>)[key]),
        })) : [];
        const snapshot = (value: typeof item) => Array.isArray(value)
          ? value.map((folder) => JSON.stringify(folder)).join('\n')
          : value && 'shared' in value ? JSON.stringify(value.shared, null, 2) : '';
        const sample = item ?? currentItem;
        const mismatches = (fields ?? []).filter((key) => Object.hasOwn(propertyLabels, key)).map((key) => propertyLabels[key]);
        const issue = (fields ?? []).find((key) => Object.hasOwn(conflictReasons, key));
        const reason = issue ? conflictReasons[issue] : mismatches.length ? `Не удалось объединить: ${mismatches.join(', ')}` : undefined;
        return { title: (after ?? before)?.title || (Array.isArray(sample) ? 'Дерево папок' : sample && 'shared' in sample ? 'Общие данные' : 'Запись'), comparison: {
          before: before?.content ?? snapshot(currentItem), after: draft ?? after?.content ?? snapshot(item), properties,
          onEdit: after && !folderGroup && config.localSyncMode !== 'receive-only' && !reviewed[0]?.folderGroup && !resolving && !decision
            ? (value: string) => setDraft(value === after.content ? undefined : value) : undefined,
          message: !currentItem ? currentRevision ? 'Запись удалена на релее' : 'Версия релея недоступна' : !item ? 'Локальная операция: удалить запись' : reason,
        } };
      })} actions={(
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-2 text-xs">
          {changed && decision !== 'close' ? <>
            <span role="status">Версия изменилась. Сравнение обновлено.</span>
            <button type="button" className="min-h-9 rounded-md px-2 hover:bg-surface-hover" onClick={() => {
              if (review) setReview({ ...review, revisions: revisions(reviewed) });
              setDecision(undefined); setReviewError('');
            }}>Проверить новую версию</button>
          </> : decision ? <>
            <span>{decision === 'close' ? 'Закрыть без изменений? Несохранённый текст пропадёт.' : decision === 'keep' ? 'Удалить отклонённую правку из списка?' : 'Отправить правку поверх просмотренной версии?'}</span>
            <button type="button" className="min-h-9 rounded-md px-2 hover:bg-surface-hover" disabled={resolving} onClick={() => void resolveConflict()}>Подтвердить</button>
            <button type="button" className="min-h-9 rounded-md px-2 hover:bg-surface-hover" disabled={resolving} onClick={() => setDecision(undefined)}>Отмена</button>
          </> : <>
            <button type="button" className="min-h-9 rounded-md px-2 hover:bg-surface-hover" onClick={() => setDecision('keep')}>Оставить версию релея</button>
            <button type="button" className="min-h-9 rounded-md px-2 hover:bg-surface-hover disabled:opacity-40" disabled={config.localSyncMode === 'receive-only' || (!!reviewed[0]?.folderGroup && reviewed.some(({ currentItem }) => currentItem === null))}
              onClick={() => setDecision('retry')}>{reviewed[0]?.folderGroup ? 'Повторить всю операцию' : 'Отправить мою правку'}</button>
          </>}
          {reviewError && <span role="alert" className="text-danger">{reviewError}</span>}
        </div>
      )} />

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
