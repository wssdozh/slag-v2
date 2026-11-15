// First settings tab: who you are, how much you have done, plan limits and where to go next.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { navigatePage } from '../../lib/navigation';
import { summarizeActivity } from '../../lib/activityStats';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncStatus } from '../../lib/sync/types';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ProfileCard } from './ProfileCard';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';

/**
 * Первый раздел настроек: кто я, сколько сделано и куда идти за остальным.
 * Профиль и график активности живут в самом хранилище, поэтому видны на всех
 * устройствах и не уходят на релей открытым текстом.
 */
export const AccountSettingsTab: React.FC = () => {
  const { setSettingsTab, items } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [accountState, setAccountState] = useState(accountClient.getState());

  useEffect(() => syncEngine.subscribe(setStatus), []);
  useEffect(() => accountClient.subscribe(setAccountState), []);

  const summary = useMemo(() => summarizeActivity(items), [items]);

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

  const profilePlan = planLabel ?? 'свой сервер';

  return (
    <div className="flex flex-col gap-3">
      {locked && (
        <SettingsGroup title="SLAG ID">
          <SettingsRow label="Синхронизация недоступна" description="Требуется вход в аккаунт SLAG ID." right={
            <button type="button" data-testid="sync-open-account" onClick={() => navigatePage('account')} className="px-3 py-1.5 text-xs text-fg-primary rounded-md hover:bg-surface-hover cursor-pointer">Войти</button>
          } />
        </SettingsGroup>
      )}

      <SettingsGroup title="Профиль" action={<span className="text-2xs font-mono text-fg-dim">в хранилище</span>}>
        <ProfileCard planLabel={profilePlan} />
      </SettingsGroup>

      <SettingsGroup
        title="Активность"
        action={<span className="text-2xs font-mono text-fg-dim">по записям хранилища</span>}
      >
        <ActivityHeatmap summary={summary} />
      </SettingsGroup>

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
            <SettingsRow icon={<Icon name="entity.user" size="md" tone="inherit" />} label="Личный кабинет" description="Подписка, устройства и доступ к хранилищам" onClick={() => navigatePage('account')} external />
            <SettingsDivider inset />
          </>
        )}
        <SettingsRow icon={<Icon name="entity.desktop" size="md" tone="inherit" />} label="Подключённые устройства" value={<span className="font-mono">{limitsKnown ? `${activeDevices} из ${maxDevices}` : activeDevices}</span>} testId="sync-to-devices-btn" onClick={() => setSettingsTab('devices')} chevron />
      </SettingsGroup>
    </div>
  );
};
