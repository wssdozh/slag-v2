// Connected devices: this machine first, then each paired one with its status.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { AccountDevice } from '../../../lib/sync/accountTypes';
import type { DeviceProfile } from '../../../lib/sync/types';
import { devicePresence } from '../../../lib/sync/presence';
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
}) => {
  const onlineCount = 1 + devices.filter((device) => devicePresence(device.lastSeenAt).online).length;
  return (
  <SettingsGroup title="Подключённые устройства" action={<span className="text-2xs font-mono text-fg-muted" title={limitsKnown ? undefined : 'Лимит устройств станет известен после входа'}>{limitsKnown ? `${activeDevices} / ${maxDevices}` : activeDevices} · онлайн {onlineCount}</span>}>
    <SettingsRow icon={isMobile ? <Icon name="entity.phone" size="md" tone="inherit" /> : <Icon name="entity.desktop" size="md" tone="inherit" />} label={<span className="flex items-center gap-1.5"><Presence online />{currentDeviceName}</span>} description={<span className="font-mono">{currentDeviceId} · это устройство · онлайн</span>} />
    {devices.map((device) => {
      const isAccountDevice = 'status' in device;
      const pending = isAccountDevice && device.status === 'pending';
      const presence = pending ? { online: false, label: '' } : devicePresence(device.lastSeenAt);
      return (
        <React.Fragment key={device.id}>
          <SettingsDivider />
          <SettingsRow
            icon={device.platform === 'mobile' ? <Icon name="entity.phone" size="md" tone="inherit" /> : <Icon name="entity.desktop" size="md" tone="inherit" />}
            label={<span className="flex items-center gap-1.5"><Presence online={presence.online} /><DeviceName deviceId={device.id} name={device.name} onRename={onRename} /></span>}
            description={<span className="font-mono break-all">{device.id}{pending ? ' · ожидает подтверждения' : presence.label ? ` · ${presence.label}` : ''}</span>}
            right={<span className="flex items-center gap-2">
              {pending ? (
                <button type="button" onClick={() => void onApprove(device.id)} className="text-2xs text-fg-secondary cursor-pointer">Подтвердить</button>
              ) : (
                <button type="button" onClick={() => onManage(device)} title="Доступ к хранилищам" aria-label={`Доступ ${device.name} к хранилищам`} className="px-2 py-1 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover cursor-pointer">Доступ к базам</button>
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
