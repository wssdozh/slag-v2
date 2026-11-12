import React from 'react';
import { Database } from 'lucide-react';
import type { AccountDevice, AccountVault } from '../../../lib/sync/accountTypes';
import type { DeviceProfile, DeviceSyncMode } from '../../../lib/sync/types';
import type { VaultMeta } from '../../../types';
import { getVaultDisplayName } from '../../../lib/vaultDisplay';
import { DeviceCard } from './DeviceCard';
import { SettingsDivider, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from '../SettingsUI';

interface DevicePermissionsProps {
  device: AccountDevice | DeviceProfile;
  vaults: VaultMeta[];
  accountVaults: AccountVault[];
  grantMode: DeviceSyncMode;
  onGrantModeChange: (mode: DeviceSyncMode) => void;
  onToggleVaultAccess: (vaultId: string) => void;
  onClose: () => void;
}

export const DevicePermissions: React.FC<DevicePermissionsProps> = ({
  device,
  vaults,
  accountVaults,
  grantMode,
  onGrantModeChange,
  onToggleVaultAccess,
  onClose,
}) => (
  <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-canvas/60 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <DeviceCard device={device} onClose={onClose}>
      {'status' in device && (
        <SettingsGroup title="Приглашение">
          <SettingsSelect label="Режим доступа" value={grantMode} onChange={(mode) => onGrantModeChange(mode as DeviceSyncMode)} options={[
            { value: 'read-write', label: 'Чтение и изменение' },
            { value: 'receive-only', label: 'Только чтение' },
          ]} />
        </SettingsGroup>
      )}
      <SettingsGroup title="Хранилища" className="max-h-56 overflow-y-auto">
        {vaults.map((vault, index) => {
          const grant = 'status' in device
            ? accountVaults.find((item) => item.id === (vault.syncId || vault.id))?.grants.find((item) => item.deviceId === device.id)
            : undefined;
          const allowed = 'status' in device
            ? Boolean(grant && grant.status !== 'revoked')
            : Boolean(device.allowedVaults?.includes(vault.id));
          return (
            <React.Fragment key={vault.id}>
              {index > 0 && <SettingsDivider />}
              <SettingsRow icon={<Database className="w-3.5 h-3.5" />} label={getVaultDisplayName(vault, vaults)} description={grant?.status === 'pending' ? 'Ожидает' : grant?.status === 'accepted' ? (grant.mode === 'receive-only' ? 'Только чтение' : 'Подключено') : undefined} right={<SettingsSwitch checked={allowed} onChange={() => onToggleVaultAccess(vault.id)} label={`Доступ к ${getVaultDisplayName(vault, vaults)}`} />} />
            </React.Fragment>
          );
        })}
      </SettingsGroup>
    </DeviceCard>
  </div>
);
