import React from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import type { AccountDevice } from '../../../lib/sync/accountTypes';
import type { DeviceProfile } from '../../../lib/sync/types';
import { DeviceName, DeviceRevokeButton } from './DeviceActions';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../SettingsUI';

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
}) => (
  <SettingsGroup title="Подключённые устройства" action={<span className="text-2xs font-mono text-fg-muted" title={limitsKnown ? undefined : 'Лимит устройств станет известен после входа'}>{limitsKnown ? `${activeDevices} / ${maxDevices}` : activeDevices}</span>}>
    <SettingsRow icon={isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />} label={currentDeviceName} description={<span className="font-mono">{currentDeviceId} · это устройство</span>} />
    {devices.map((device) => {
      const isAccountDevice = 'status' in device;
      return (
        <React.Fragment key={device.id}>
          <SettingsDivider />
          <SettingsRow
            icon={device.platform === 'mobile' ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
            label={<DeviceName deviceId={device.id} name={device.name} onRename={onRename} />}
            description={<span className="font-mono break-all">{device.id}{isAccountDevice && device.status === 'pending' ? ' · ожидает подтверждения' : ''}</span>}
            right={<span className="flex items-center gap-2">
              {isAccountDevice && device.status === 'pending' ? (
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
