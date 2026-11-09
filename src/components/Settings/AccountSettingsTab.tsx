import React, { useEffect, useState } from 'react';
import { Laptop, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { navigatePage } from '../../lib/navigation';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncStatus } from '../../lib/sync/types';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';

/**
 * Первый раздел настроек: кто я, сколько места и куда идти за остальным.
 * Раньше это лежало внизу вкладки синхронизации — то есть после всего, что
 * человек искал, хотя вопрос «что с аккаунтом» задают первым.
 */
export const AccountSettingsTab: React.FC = () => {
  const { setSettingsTab } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [accountState, setAccountState] = useState(accountClient.getState());

  useEffect(() => syncEngine.subscribe(setStatus), []);
  useEffect(() => accountClient.subscribe(setAccountState), []);

  const hosted = status.authRequired || accountClient.isAuthenticated();
  const locked = status.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;
  const sub = status.subscription;
  const planLabel = account?.planLabel || sub.planLabel;
  const maxDevices = account?.maxDevices ?? sub.maxDevices;
  const usedCacheMb = account?.usedCacheMb ?? sub.usedCacheMb;
  const maxCacheMb = account?.maxCacheMb ?? sub.maxCacheMb;
  const limitsKnown = Boolean(account) || maxDevices > 0;
  const activeDevices = account
    ? accountState.devices.filter((device) => device.status === 'active').length
    : 1 + syncEngine.getConfig().trustedDevices.length;

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

      <SettingsGroup>
        {hosted && !locked && (
          <>
            <SettingsRow icon={<UserRound className="w-4 h-4" />} label="Личный кабинет" description="Подписка, устройства и доступ к хранилищам" onClick={() => navigatePage('account')} external />
            <SettingsDivider inset />
          </>
        )}
        <SettingsRow icon={<Laptop className="w-4 h-4" />} label="Подключённые устройства" value={<span className="font-mono">{limitsKnown ? `${activeDevices} из ${maxDevices}` : activeDevices}</span>} testId="sync-to-devices-btn" onClick={() => setSettingsTab('devices')} chevron />
      </SettingsGroup>
    </div>
  );
};
