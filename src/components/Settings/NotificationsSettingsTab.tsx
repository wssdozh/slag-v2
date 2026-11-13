// Notifications: one telegram channel per person, what it carries, and when it stays quiet.
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { accountClient } from '../../lib/sync/account';
import type { NotifyInvite } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import {
  getNotifyPrefs,
  getNotifyRoutes,
  notifyErrorText,
  saveNotifyPrefs,
  saveNotifyRoutes,
  setAssistantForRoutes,
} from '../../lib/notify';
import type { NotifyPrefs, NotifyRoute } from '../../types';
import { NotifyInviteModal } from './NotifyInviteModal';
import { SettingsDivider, SettingsGroup, SettingsInput, SettingsRow, SettingsSwitch } from './SettingsUI';

function currentVaultId(): string {
  try {
    return syncEngine.getSyncVaultId();
  } catch {
    return '';
  }
}

/** Everything the bot is allowed to say, in one place. */
export const NotificationsSettingsTab: React.FC = () => {
  const { addToast } = useApp();
  const [routes, setRoutes] = useState<NotifyRoute[]>(() => getNotifyRoutes());
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs());
  const [invite, setInvite] = useState<NotifyInvite | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);

  const vaultId = currentVaultId();
  const locked = !vaultId || !accountClient.isAuthenticated();
  const activeRoutes = routes.filter((route) => route.state === 'active');
  const blockedRoutes = routes.filter((route) => route.state === 'blocked');
  const pendingRoutes = routes.filter((route) => route.state === 'pending');
  const channel = activeRoutes[0] ?? pendingRoutes[0] ?? blockedRoutes[0] ?? null;

  const patchPrefs = (next: Partial<NotifyPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveNotifyPrefs(merged);
  };

  const handleRequestInvite = async () => {
    setIsRequesting(true);
    try {
      const created = await accountClient.requestNotifyInvite(vaultId);
      // One live code: the relay revoked the previous one, so the list keeps a single pending row.
      const updated = [
        ...routes.filter((route) => route.state !== 'pending'),
        { token: created.routeToken, label: '', state: 'pending' as const },
      ];
      setRoutes(updated);
      saveNotifyRoutes(updated);
      setInvite(created);
      setIsModalOpen(true);
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleLinked = (routeToken: string) => {
    const updated = routes.map((route) =>
      route.token === routeToken ? { ...route, state: 'active' as const } : route
    );
    setRoutes(updated);
    saveNotifyRoutes(updated);
    setInvite(null);
    setIsModalOpen(false);
    addToast('telegram подключён', 'success');
  };

  const handleDisconnect = () => {
    setRoutes([]);
    saveNotifyRoutes([]);
    setInvite(null);
    setIsModalOpen(false);
  };

  const handleAssistant = async (enabled: boolean) => {
    setIsSavingAssistant(true);
    try {
      await setAssistantForRoutes(vaultId, routes, enabled);
      patchPrefs({ assistant: enabled });
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    } finally {
      setIsSavingAssistant(false);
    }
  };

  const channelAction = () => {
    if (channel?.state === 'active' || channel?.state === 'blocked') {
      return (
        <button
          type="button"
          onClick={handleDisconnect}
          className="px-2 py-1.5 text-2xs text-fg-muted rounded-md hover:bg-surface-hover hover:text-danger cursor-pointer"
        >
          отключить
        </button>
      );
    }
    if (channel?.state === 'pending') {
      return (
        <button
          type="button"
          disabled={isRequesting || locked}
          onClick={() => (invite ? setIsModalOpen(true) : void handleRequestInvite())}
          className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
        >
          {invite ? 'показать код' : 'новый код'}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={isRequesting || locked}
        onClick={() => void handleRequestInvite()}
        className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
      >
        {isRequesting ? 'Код…' : 'Получить код'}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup
        title="Канал в telegram"
        action={
          <span className="text-2xs font-mono text-fg-dim">
            {activeRoutes.length ? 'подключён' : channel?.state === 'pending' ? 'ждёт подтверждения' : 'не подключён'}
          </span>
        }
      >
        <SettingsRow
          label={
            channel?.state === 'active'
              ? 'Канал подключён'
              : channel?.state === 'blocked'
                ? 'Канал заблокирован'
                : channel?.state === 'pending'
                  ? 'Ждём подтверждения'
                  : 'Добавить получателя'
          }
          description={
            channel?.state === 'active'
              ? 'напоминания приходят в telegram'
              : channel?.state === 'blocked'
                ? 'человек отключил бота'
                : channel?.state === 'pending'
                  ? 'код живёт 10 минут'
                  : undefined
          }
          right={channelAction()}
        />
      </SettingsGroup>

      {invite && isModalOpen && (
        <NotifyInviteModal
          invite={invite}
          vaultId={vaultId}
          onClose={() => setIsModalOpen(false)}
          onLinked={handleLinked}
        />
      )}

      <SettingsGroup title="Что приходит">
        <SettingsRow
          label="Напоминания задач"
          right={<SettingsSwitch label="Напоминания задач" checked={prefs.tasks} onChange={(value) => patchPrefs({ tasks: value })} />}
        />
        <SettingsDivider />
        <SettingsRow
          label="Просроченные задачи"
          description="Раз в день в 10:00, пока не закрыта"
          right={<SettingsSwitch label="Просроченные задачи" checked={prefs.overdue} onChange={(value) => patchPrefs({ overdue: value })} />}
        />
        <SettingsDivider />
        <SettingsRow
          label="Скрывать текст под спойлером"
          description="Видно после нажатия"
          right={
            <SettingsSwitch
              label="Скрывать текст под спойлером"
              checked={prefs.spoiler}
              onChange={(value) => patchPrefs({ spoiler: value })}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="В сообщении"
          description="Заголовок и первые ~200 символов: релей видит их при отправке"
        />
      </SettingsGroup>

      <SettingsGroup title="Тихие часы">
        <SettingsInput
          label="Не беспокоить с"
          value={prefs.quietFrom}
          onChange={(value) => patchPrefs({ quietFrom: value })}
          placeholder="23:00"
          mono
        />
        <SettingsDivider />
        <SettingsInput
          label="Не беспокоить до"
          value={prefs.quietTo}
          onChange={(value) => patchPrefs({ quietTo: value })}
          placeholder="08:00"
          description="Если попадёт в окно — уедет на его конец"
          mono
        />
      </SettingsGroup>

      <SettingsGroup title="Ассистент в telegram" action={<span className="text-2xs font-mono text-fg-dim">опытное</span>}>
        <SettingsRow
          label="Отвечать на вопросы из бота"
          description="Вопрос уходит на устройство с открытым приложением"
          right={
            <SettingsSwitch
              label="Отвечать на вопросы из бота"
              checked={prefs.assistant}
              disabled={locked || isSavingAssistant || !activeRoutes.length}
              onChange={(value) => void handleAssistant(value)}
            />
          }
        />
      </SettingsGroup>
    </div>
  );
};
