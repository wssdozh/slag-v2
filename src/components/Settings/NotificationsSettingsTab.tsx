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
} from '../../lib/notify/prefs';
import { setAssistantForRoutes } from '../../lib/notify/assistant';
import type { AssistantSetting, NotifyPrefs, NotifyRoute } from '../../types';
import { AssistantGroup } from './notifications/AssistantGroup';
import { ChannelGroup } from './notifications/ChannelGroup';
import { ContentGroup } from './notifications/ContentGroup';
import { QuietHoursGroup } from './notifications/QuietHoursGroup';

function currentVaultId(): string {
  try {
    return syncEngine.getSyncVaultId();
  } catch {
    return '';
  }
}

/** Everything the bot is allowed to say, in one place. */
export const NotificationsSettingsTab: React.FC = () => {
  const { addToast, confirmAction } = useApp();
  const [routes, setRoutes] = useState<NotifyRoute[]>(() => getNotifyRoutes());
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs());
  const [invite, setInvite] = useState<NotifyInvite | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);

  const vaultId = currentVaultId();
  const locked = !vaultId || !accountClient.isAuthenticated();
  const channel =
    routes.find((route) => route.state === 'active') ??
    routes.find((route) => route.state === 'pending') ??
    routes.find((route) => route.state === 'blocked') ??
    null;

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

  const handleRequestOrShow = () => {
    if (invite) setIsModalOpen(true);
    else void handleRequestInvite();
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

  // `read` and `risky` both let vault content reach the model, so both ask first; the wording
  // says which of the two the person is agreeing to.
  const handleModeChange = async (mode: AssistantSetting) => {
    const asksFirst = mode === 'read' || mode === 'risky';
    if (asksFirst) {
      const confirmed = await confirmAction({
        title: mode === 'read' ? 'Разрешить боту читать заметки?' : 'Разрешить боту править хранилище?',
        description:
          mode === 'read'
            ? 'бот сможет найти и прочитать любую заметку, до которой доберётся ассистент, и её текст уйдёт в модель. доступ защищён только твоим телеграм-аккаунтом.'
            : 'бот сможет прочитать любую заметку и предложить её изменить. доступ защищён только твоим телеграм-аккаунтом: кто войдёт в него, тот прочитает хранилище перепиской.',
        confirmLabel: 'Разрешить',
        cancelLabel: 'Не надо',
        isDestructive: mode === 'risky',
      });
      if (!confirmed) return;
    }
    setIsSavingAssistant(true);
    try {
      await setAssistantForRoutes(vaultId, routes, mode !== 'off', mode === 'off' ? 'minimal' : mode);
      patchPrefs({ assistantMode: mode });
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    } finally {
      setIsSavingAssistant(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ChannelGroup
        channel={channel}
        hasInvite={invite !== null}
        openInvite={invite && isModalOpen ? invite : null}
        vaultId={vaultId}
        isRequesting={isRequesting}
        isLocked={locked}
        onRequestOrShow={handleRequestOrShow}
        onDisconnect={handleDisconnect}
        onCloseModal={() => setIsModalOpen(false)}
        onLinked={handleLinked}
      />

      <ContentGroup
        tasks={prefs.tasks}
        overdue={prefs.overdue}
        spoiler={prefs.spoiler}
        onTasksChange={(value) => patchPrefs({ tasks: value })}
        onOverdueChange={(value) => patchPrefs({ overdue: value })}
        onSpoilerChange={(value) => patchPrefs({ spoiler: value })}
      />

      <QuietHoursGroup
        quietFrom={prefs.quietFrom}
        quietTo={prefs.quietTo}
        onQuietFromChange={(value) => patchPrefs({ quietFrom: value })}
        onQuietToChange={(value) => patchPrefs({ quietTo: value })}
      />

      <AssistantGroup
        mode={prefs.assistantMode}
        disabled={locked || isSavingAssistant || channel?.state !== 'active'}
        onModeChange={(mode) => void handleModeChange(mode)}
      />
    </div>
  );
};
