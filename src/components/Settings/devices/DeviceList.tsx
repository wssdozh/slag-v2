// Connected devices: this machine first, then each paired one with its status.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import { IconButton } from '../../UI/IconButton';
import type { AccountDevice } from '../../../lib/sync/accountTypes';
import type { DeviceProfile } from '../../../lib/sync/types';
import { devicePresence } from '../../../lib/sync/presence';
import { DeviceIcon } from './DeviceIcon';
import { DeviceName, DeviceRevokeButton } from './DeviceActions';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';

/** A dot plus the word: one glance answers "is anyone else with me right now". */
const Presence: React.FC<{ online: boolean }> = ({ online }) => (
  <span className={`inline-block h-1.5 w-1.5 rounded-full ${online ? 'bg-success' : 'bg-fg-dim'}`} aria-hidden />
);

interface DeviceListProps {
  isMobile: boolean;
  currentDeviceName: string;
  currentDeviceId: string;
  devices: Array<AccountDevice | DeviceProfile>;
  activeDevices: number;
  maxDevices: number;
  limitsKnown: boolean;
  onRename: (deviceId: string, name: string) => void | Promise<void>;
  onManage: (device: AccountDevice | DeviceProfile) => void;
  onRevoke: (device: AccountDevice | DeviceProfile) => void;
  onApprove: (deviceId: string) => void | Promise<void>;
  onPair: () => void;
  pairDisabled: boolean;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  isMobile,
  currentDeviceName,
  currentDeviceId,
  devices,
  activeDevices,
  maxDevices,
  limitsKnown,
  onRename,
  onManage,
  onRevoke,
  onApprove,
  onPair,
  pairDisabled,
}) => {
  const onlineCount = 1 + devices.filter((device) => devicePresence(device.lastSeenAt).online).length;
  return (
  <SettingsGroup title="Подключённые устройства" action={<span className="flex items-center gap-2">
    <span className="text-2xs font-mono text-fg-muted" title={limitsKnown ? undefined : 'Лимит устройств станет известен после входа'}>{limitsKnown ? `${activeDevices} / ${maxDevices}` : activeDevices} · онлайн {onlineCount}</span>
    <IconButton
      size="sm"
      aria-label="Привязать устройство"
      title="Привязать устройство"
      data-testid="btn-pair-device-header"
      disabled={pairDisabled}
      onClick={onPair}
      icon={<Icon name="action.add" size="md" tone="inherit" />}
      className="text-fg-secondary hover:bg-surface-hover"
    />
  </span>}>
    <SettingsRow testId="device-row-current" icon={<DeviceIcon platform={isMobile ? 'mobile' : 'desktop'} />} label={<span className="flex items-center gap-1.5"><Presence online />{currentDeviceName}</span>} description={<span className="font-mono">{currentDeviceId} · это устройство · онлайн</span>} />
    {devices.map((device) => {
      const isAccountDevice = 'status' in device;
      const pending = isAccountDevice && device.status === 'pending';
      const presence = pending ? { online: false, label: '' } : devicePresence(device.lastSeenAt);
      return (
        <React.Fragment key={device.id}>
          <SettingsDivider />
          <SettingsRow
            testId={`device-row-${device.id}`}
            icon={<DeviceIcon platform={device.platform} />}
            label={<span className="flex items-center gap-1.5"><Presence online={presence.online} /><DeviceName deviceId={device.id} name={device.name} onRename={onRename} /></span>}
            description={<span className="font-mono break-all">{device.id}{pending ? ' · ожидает подтверждения' : presence.label ? ` · ${presence.label}` : ''}</span>}
            right={<span className="flex items-center gap-2">
              {pending ? (
                <button type="button" onClick={() => void onApprove(device.id)} className="text-2xs text-fg-secondary cursor-pointer">Подтвердить</button>
              ) : (
                <IconButton
                  size="sm"
                  aria-label={`Доступ ${device.name} к хранилищам`}
                  title="Доступ к хранилищам"
                  onClick={() => onManage(device)}
                  icon={<Icon name="system.settings" size="md" tone="inherit" />}
                  className="text-fg-secondary hover:bg-surface-hover"
                />
              )}
              <DeviceRevokeButton device={device} onRevoke={onRevoke} />
            </span>}
          />
        </React.Fragment>
      );
    })}
  </SettingsGroup>
  );
};
