// «Канал в telegram»: whether a recipient is linked, and the one code that links it.
import React from 'react';
import type { NotifyInvite } from '../../../lib/sync/account';
import type { NotifyRoute } from '../../../types';
import { NotifyInviteModal } from '../NotifyInviteModal';
import { SettingsGroup, SettingsRow } from '../SettingsUI';

interface ChannelGroupProps {
  /** The one row the channel is described by: active first, then pending, then blocked. */
  channel: NotifyRoute | null;
  /** A code was already fetched, so the pending button shows it instead of asking again. */
  hasInvite: boolean;
  /** The invite modal, or null when it is closed. */
  openInvite: NotifyInvite | null;
  vaultId: string;
  isRequesting: boolean;
  isLocked: boolean;
  onRequestOrShow: () => void;
  onDisconnect: () => void;
  onCloseModal: () => void;
  onLinked: (routeToken: string) => void;
}

function statusText(channel: NotifyRoute | null): string {
  if (channel?.state === 'active') return 'подключён';
  if (channel?.state === 'pending') return 'ждёт подтверждения';
  return 'не подключён';
}

/** A channel is one recipient: either it is linked, waiting for a code, or blocked by the human. */
export const ChannelGroup: React.FC<ChannelGroupProps> = ({
  channel,
  hasInvite,
  openInvite,
  vaultId,
  isRequesting,
  isLocked,
  onRequestOrShow,
  onDisconnect,
  onCloseModal,
  onLinked,
}) => {
  const action = () => {
    if (channel?.state === 'active' || channel?.state === 'blocked') {
      return (
        <button
          type="button"
          onClick={onDisconnect}
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
          disabled={isRequesting || isLocked}
          onClick={onRequestOrShow}
          className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
        >
          {hasInvite ? 'показать код' : 'новый код'}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={isRequesting || isLocked}
        onClick={onRequestOrShow}
        className="px-2 py-1.5 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
      >
        {isRequesting ? 'Код…' : 'Получить код'}
      </button>
    );
  };

  return (
    <>
      <SettingsGroup title="Канал в telegram" action={<span className="text-2xs font-mono text-fg-dim">{statusText(channel)}</span>}>
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
          right={action()}
        />
      </SettingsGroup>

      {openInvite && (
        <NotifyInviteModal
          invite={openInvite}
          vaultId={vaultId}
          onClose={onCloseModal}
          onLinked={onLinked}
        />
      )}
    </>
  );
};
