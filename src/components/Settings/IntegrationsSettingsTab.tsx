// Integrations: a list of outbound connections, one open at a time, and the master switch over all of them.
import React, { useState } from 'react';
import { ArrowLeft, Cog, Send } from 'lucide-react';
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
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSwitch } from './SettingsUI';

function currentVaultId(): string {
  try {
    return syncEngine.getSyncVaultId();
  } catch {
    return '';
  }
}

/** The one row the channel is described by: active first, then pending, then blocked. */
function channelOf(routes: NotifyRoute[]): NotifyRoute | null {
  return (
    routes.find((route) => route.state === 'active') ??
    routes.find((route) => route.state === 'pending') ??
    routes.find((route) => route.state === 'blocked') ??
    null
  );
}

function channelText(channel: NotifyRoute | null): string {
  if (channel?.state === 'active') return 'подключён';
  if (channel?.state === 'pending') return 'ждёт подтверждения';
  return 'не подключён';
}

/**
 * A list, not a settings dump: the master switch, the integrations it governs, and one detail
 * screen behind a gear. Another integration is one entry plus its own block, nothing else.
 */
export const IntegrationsSettingsTab: React.FC = () => {
  const { addToast, confirmAction } = useApp();
  const [routes, setRoutes] = useState<NotifyRoute[]>(() => getNotifyRoutes());
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs());
  const [invite, setInvite] = useState<NotifyInvite | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);

  const vaultId = currentVaultId();
  const locked = !vaultId || !accountClient.isAuthenticated();
  const channel = channelOf(routes);
  const enabled = prefs.integrationsEnabled;

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

  // The switch is the promise that nothing leaves the device: it stops new arms here and tells
  // the relay to stop routing questions. Whatever an earlier session queued still fires.
  const handleMasterChange = async (next: boolean) => {
    patchPrefs({ integrationsEnabled: next });
    if (!vaultId || !accountClient.isAuthenticated() || routes.length === 0) return;
    setIsSavingMaster(true);
    try {
      const mode = prefs.assistantMode;
      await setAssistantForRoutes(vaultId, routes, next && mode !== 'off', mode === 'off' ? 'minimal' : mode);
      addToast(next ? 'интеграции включены' : 'интеграции выключены: бот молчит', 'info');
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    } finally {
      setIsSavingMaster(false);
    }
  };

  if (isTelegramOpen) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setIsTelegramOpen(false)}
          className="self-start flex items-center gap-1.5 px-1 py-0.5 text-2xs text-fg-muted hover:text-fg-primary cursor-pointer motion-press"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> все интеграции
        </button>

        <div className="px-1 flex flex-col gap-1">
          <span className="text-sm font-semibold text-fg-primary">telegram</span>
          <p className="text-xs leading-relaxed text-zinc-500">
            канал доставки: напоминания приходят в чат, а вопросы уходят на это устройство.
            вход защищён только телеграм-аккаунтом — кто войдёт в него, тот прочитает то, что
            бот видит в хранилище.
          </p>
        </div>

        {!enabled && (
          <p className="px-1 text-2xs text-fg-muted">
            все интеграции выключены — включи их в списке, настройки подождут
          </p>
        )}

        <ChannelGroup
          channel={channel}
          hasInvite={invite !== null}
          openInvite={invite && isModalOpen ? invite : null}
          vaultId={vaultId}
          isRequesting={isRequesting}
          isLocked={locked || !enabled}
          onRequestOrShow={handleRequestOrShow}
          onDisconnect={handleDisconnect}
          onCloseModal={() => setIsModalOpen(false)}
          onLinked={handleLinked}
        />

        <SettingsGroup title="Сообщение в telegram">
          <SettingsRow
            label="Скрывать текст под спойлером"
            description="видно после нажатия"
            right={
              <SettingsSwitch
                label="Скрывать текст под спойлером"
                checked={prefs.spoiler}
                disabled={!enabled}
                onChange={(value) => patchPrefs({ spoiler: value })}
              />
            }
          />
          <SettingsDivider />
          <SettingsRow
            label="В сообщении"
            description="заголовок и первые ~200 символов: релей видит их при отправке"
          />
        </SettingsGroup>

        <AssistantGroup
          mode={prefs.assistantMode}
          disabled={locked || isSavingAssistant || channel?.state !== 'active' || !enabled}
          onModeChange={(mode) => void handleModeChange(mode)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup
        title="Интеграции"
        action={<span className="text-2xs font-mono text-fg-dim">каналы наружу</span>}
      >
        <SettingsRow
          label="Включить интеграции"
          description="разом: напоминания в каналы и ответы бота. выключено — остаются системные уведомления"
          right={
            <SettingsSwitch
              label="Включить интеграции"
              checked={enabled}
              disabled={isSavingMaster}
              onChange={(value) => void handleMasterChange(value)}
            />
          }
        />
        <SettingsDivider />
        <SettingsRow
          icon={<Send className="w-4 h-4" />}
          label="telegram"
          description={
            enabled
              ? `${channelText(channel)} · напоминания и вопросы боту`
              : 'выключено вместе с остальными'
          }
          right={
            <span className="text-fg-dim">
              <Cog className="w-4 h-4" />
            </span>
          }
          onClick={() => setIsTelegramOpen(true)}
          testId="integration-telegram"
        />
      </SettingsGroup>
    </div>
  );
};
