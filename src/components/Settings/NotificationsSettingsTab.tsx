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
import { SettingsDivider, SettingsGroup, SettingsInput, SettingsRow, SettingsSwitch } from './SettingsUI';

const ROUTE_STATE_LABEL: Record<NotifyRoute['state'], string> = {
  pending: 'ждёт подтверждения в боте',
  active: 'канал активен',
  blocked: 'человек отключил бота',
};

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
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);

  const vaultId = currentVaultId();
  const locked = !vaultId || !accountClient.isAuthenticated();
  const activeRoutes = routes.filter((route) => route.state === 'active');

  const patchPrefs = (next: Partial<NotifyPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveNotifyPrefs(merged);
  };

  const handleRequestInvite = async () => {
    setIsRequesting(true);
    try {
      const created = await accountClient.requestNotifyInvite(vaultId);
      setInvite(created);
      const updated = [
        ...routes.filter((route) => route.token !== created.routeToken),
        { token: created.routeToken, label: '', state: 'pending' as const },
      ];
      setRoutes(updated);
      saveNotifyRoutes(updated);
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRemoveRoute = (token: string) => {
    const updated = routes.filter((route) => route.token !== token);
    setRoutes(updated);
    saveNotifyRoutes(updated);
    if (invite?.routeToken === token) setInvite(null);
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

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup
        title="Канал в telegram"
        action={
          <span className="text-2xs font-mono text-fg-dim">
            {activeRoutes.length ? `${activeRoutes.length} активн.` : 'не подключён'}
          </span>
        }
      >
        <SettingsRow
          label="Добавить получателя"
          description="Человек сам подтверждает канал в боте: пока код не отправлен боту, напоминания никуда не уходят."
          right={
            <button
              type="button"
              disabled={isRequesting || locked}
              onClick={() => void handleRequestInvite()}
              className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            >
              {isRequesting ? 'Код…' : 'Получить код'}
            </button>
          }
        />
        {invite && (
          <>
            <SettingsDivider />
            <SettingsRow
              label={<span className="font-mono text-xs text-fg-primary select-all break-all">{invite.code}</span>}
              description="Код одноразовый и живёт 10 минут. Отправь его боту командой /start или открой ссылку."
              right={
                invite.link ? (
                  <a href={invite.link} target="_blank" rel="noreferrer" className="text-2xs text-accent hover:underline">
                    открыть
                  </a>
                ) : undefined
              }
            />
          </>
        )}
        {routes.map((route) => (
          <React.Fragment key={route.token}>
            <SettingsDivider />
            <SettingsRow
              label={<span className="font-mono text-2xs text-fg-secondary break-all">{route.label || route.token.slice(0, 8)}</span>}
              description={ROUTE_STATE_LABEL[route.state]}
              right={
                <button
                  type="button"
                  aria-label="Удалить получателя"
                  onClick={() => handleRemoveRoute(route.token)}
                  className="px-2 py-1.5 text-2xs text-fg-muted rounded-md hover:bg-surface-hover hover:text-danger cursor-pointer"
                >
                  удалить
                </button>
              }
            />
          </React.Fragment>
        ))}
      </SettingsGroup>

      <SettingsGroup title="Что приходит">
        <SettingsRow
          label="Напоминания задач"
          description="Точно ко времени из задачи. Если оно попадает в тихие часы — придёт к их концу."
          right={<SettingsSwitch label="Напоминания задач" checked={prefs.tasks} onChange={(value) => patchPrefs({ tasks: value })} />}
        />
        <SettingsDivider />
        <SettingsRow
          label="Просроченные задачи"
          description="Одно сообщение в 10:00 по каждой задаче с прошедшим сроком, пока её не закроют."
          right={<SettingsSwitch label="Просроченные задачи" checked={prefs.overdue} onChange={(value) => patchPrefs({ overdue: value })} />}
        />
        <SettingsDivider />
        <SettingsRow
          label="Что уходит в сообщении"
          description="Заголовок и первые ~200 символов. Текст видит релей в момент отправки — шифровать его там некому; полный текст остаётся в хранилище."
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
          mono
        />
        <SettingsDivider />
        <SettingsRow
          label="Окно переносится, а не теряется"
          description="Напоминание из тихих часов уедет на их конец, а не пропадёт. Одинаковое время в обоих полях выключает окно."
        />
      </SettingsGroup>

      <SettingsGroup title="Ассистент в telegram" action={<span className="text-2xs font-mono text-fg-dim">опытное</span>}>
        <SettingsRow
          label="Отвечать на вопросы из бота"
          description="Пишешь боту обычным сообщением — вопрос уходит на устройство, где открыто приложение, и ответ возвращается в чат. Релей сам не отвечает: модели у него нет."
          right={
            <SettingsSwitch
              label="Отвечать на вопросы из бота"
              checked={prefs.assistant}
              disabled={locked || isSavingAssistant || !activeRoutes.length}
              onChange={(value) => void handleAssistant(value)}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="Нужно живое устройство"
          description={activeRoutes.length
            ? 'Если ни одного устройства нет в сети, бот честно скажет об этом через две минуты.'
            : 'Сначала подключи канал: без подтверждённого чата спрашивать некого.'}
          value={activeRoutes.length ? undefined : 'нет канала'}
        />
      </SettingsGroup>
    </div>
  );
};
