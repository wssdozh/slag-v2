// Integrations: the master switch, the list of channels, and one detail screen behind a gear.
import React, { useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { IconButton } from '../UI/IconButton';
import { useApp } from '../../context/AppContext';
import { accountClient } from '../../lib/sync/account';
import type { NotifyInvite } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import {
  getNotifyPrefs,
  getNotifyRoutes,
  integrationsLive,
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

/**
 * A list, not a settings dump: the master switch first, then one line per channel, then the
 * channel's own screen behind a gear. Another integration is one row plus its own block.
 */
export const IntegrationsSettingsTab: React.FC = () => {
  const { addToast, confirmAction } = useApp();
  const [routes, setRoutes] = useState<NotifyRoute[]>(() => getNotifyRoutes());
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs());
  const [invite, setInvite] = useState<NotifyInvite | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);

  const vaultId = currentVaultId();
  const locked = !vaultId || !accountClient.isAuthenticated();
  const channel = channelOf(routes);
  const live = integrationsLive(prefs);

  /** Saves the switch and hands the relay the new verdict on the whole delivery path. */
  const applyPrefs = (next: Partial<NotifyPrefs>): NotifyPrefs => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveNotifyPrefs(merged);
    return merged;
  };

  // The switch is a promise that nothing leaves the device: it stops new arms here and tells
  // the relay to stop routing questions. Whatever an earlier session queued still fires.
  const syncRelay = async (next: NotifyPrefs) => {
    if (!vaultId || !accountClient.isAuthenticated() || routes.length === 0) return;
    const mode = next.assistantMode;
    try {
      await setAssistantForRoutes(vaultId, routes, integrationsLive(next) && mode !== 'off', mode === 'off' ? 'minimal' : mode);
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    }
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
      applyPrefs({ assistantMode: mode });
    } catch (error) {
      addToast(notifyErrorText(error), 'error');
    } finally {
      setIsSavingAssistant(false);
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
          <Icon name="nav.back" size="sm" tone="inherit" /> все интеграции
        </button>

        <div className="px-1 flex flex-col gap-1">
          <span className="text-sm font-semibold text-fg-primary">telegram</span>
          <p className="text-xs leading-relaxed text-fg-muted">
            канал доставки: напоминания приходят в чат, а вопросы уходят на это устройство.
            вход защищён только телеграм-аккаунтом — кто войдёт в него, тот прочитает то, что
            бот видит в хранилище.
          </p>
        </div>

        {!live && (
          <p className="px-1 text-2xs text-fg-muted">
            {prefs.integrationsEnabled
              ? 'канал выключен — включи telegram в списке'
              : 'все интеграции выключены — включи их в списке'}
          </p>
        )}

        <ChannelGroup
          channel={channel}
          hasInvite={invite !== null}
          openInvite={invite && isModalOpen ? invite : null}
          vaultId={vaultId}
          isRequesting={isRequesting}
          isLocked={locked || !live}
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
                disabled={!live}
                onChange={(value) => applyPrefs({ spoiler: value })}
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
          disabled={locked || isSavingAssistant || channel?.state !== 'active' || !live}
          onModeChange={(mode) => void handleModeChange(mode)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup
        action={<span className="text-2xs font-mono text-fg-dim">каналы наружу</span>}
      >
        <SettingsRow
          label="Включить интеграции"
          right={
            <SettingsSwitch
              label="Включить интеграции"
              checked={prefs.integrationsEnabled}
              onChange={(value) => void syncRelay(applyPrefs({ integrationsEnabled: value }))}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Интеграции">
        <SettingsRow
          icon={<Icon name="entity.telegram" size="md" />}
          label="telegram"
          right={
            <span className="flex items-center gap-1">
              <IconButton
                size="md"
                aria-label="настройки telegram"
                title="настройки telegram"
                data-testid="integration-telegram-settings"
                onClick={() => setIsTelegramOpen(true)}
                icon={<Icon name="system.integrationConfig" size="md" tone="inherit" />}
                className="text-fg-muted hover:bg-surface-hover"
              />
              <SettingsSwitch
                label="канал telegram"
                checked={live}
                disabled={!prefs.integrationsEnabled}
                onChange={(value) => void syncRelay(applyPrefs({ telegramEnabled: value }))}
              />
            </span>
          }
        />
      </SettingsGroup>
    </div>
  );
};
