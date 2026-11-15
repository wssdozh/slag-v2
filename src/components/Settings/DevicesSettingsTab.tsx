// Devices tab: paired machines, per-device vault access, and the pairing flow.
import React, { useEffect, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { accountClient } from '../../lib/sync/account';
import type { AccountDevice } from '../../lib/sync/accountTypes';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { DeviceProfile, DeviceSyncMode, SyncConfig, SyncStatus } from '../../lib/sync/types';
import { acceptSharedVault, shareVaultWithDevice } from '../../lib/sync/vaultSharing';
import { LocalSyncModeGroup, PairDeviceButton, PairDeviceModal } from './devices/DeviceActions';
import { DeviceList } from './devices/DeviceList';
import { DevicePermissions } from './devices/DevicePermissions';
import { useDevicePairing } from './devices/useDevicePairing';
import { SettingsGroup, SettingsDivider, SettingsRow } from './SettingsUI';

export const DevicesSettingsTab: React.FC = () => {
  const { switchVault, createVault, vaults, isMobile, addToast } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [managingDevice, setManagingDevice] = useState<AccountDevice | DeviceProfile | null>(null);
  const [grantMode, setGrantMode] = useState<DeviceSyncMode>('read-write');
  const [busyVaultId, setBusyVaultId] = useState<string | null>(null);

  const hosted = status.authRequired || accountClient.isAuthenticated();
  const locked = status.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;
  const sub = status.subscription;
  const pairing = useDevicePairing({ config, hosted, locked, accountDevices: accountState.devices });
  const { isModalOpen: isPairModalOpen, setModalOpen } = pairing;

  useEffect(() => syncEngine.subscribe((next) => {
    setStatus(next);
    setConfig(syncEngine.getConfig());
  }), []);

  useEffect(() => accountClient.subscribe(setAccountState), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!managingDevice && !isPairModalOpen)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (isPairModalOpen) setModalOpen(false);
      else setManagingDevice(null);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isPairModalOpen, managingDevice, setModalOpen]);

  const handleAcceptInvitation = async (vaultId: string) => {
    const invitation = accountState.invitations.find((item) => item.vaultId === vaultId);
    if (!invitation) return;
    setBusyVaultId(vaultId);
    try {
      const result = await acceptSharedVault({
        vaultId,
        vaultName: invitation.vaultName || vaultId,
        encryptedKey: invitation.encryptedKey,
      }, config.deviceId, { createVault, switchVault });
      addToast(
        `${result === 'merged' ? 'Хранилище объединено' : 'Хранилище добавлено'}: «${invitation.vaultName || vaultId}»`,
        'success',
      );
    } catch (error) {
      addToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusyVaultId(null);
    }
  };

  const handleDeclineInvitation = async (vaultId: string) => {
    setBusyVaultId(vaultId);
    try {
      await accountClient.declineVault(vaultId);
      addToast('Приглашение скрыто', 'info');
    } catch (error) {
      addToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusyVaultId(null);
    }
  };

  const handleRenameDevice = async (deviceId: string, name: string) => {
    if (hosted) await accountClient.renameDevice(deviceId, name.trim());
    else syncEngine.renameDevice(deviceId, name.trim());
    setConfig(syncEngine.getConfig());
  };

  const handleRevokeDevice = (device: AccountDevice | DeviceProfile) => {
    if ('status' in device) void accountClient.revokeDevice(device.id);
    else {
      syncEngine.removeTrustedDevice(device.id);
      setConfig(syncEngine.getConfig());
    }
  };

  const handleApproveDevice = async (deviceId: string) => {
    await accountClient.approveDevice(deviceId);
  };

  const handleLocalSyncModeChange = (mode: DeviceSyncMode) => {
    syncEngine.setDeviceSyncMode(config.deviceId, mode);
    setConfig(syncEngine.getConfig());
  };

  const handleToggleVaultAccess = async (vaultId: string) => {
    if (!managingDevice) return;
    try {
      if ('status' in managingDevice) {
        const vault = vaults.find((item) => item.id === vaultId);
        if (!vault) throw new Error('Хранилище не найдено на этом устройстве');
        const grant = accountState.vaults.find((item) => item.id === (vault.syncId || vault.id))?.grants
          .find((item) => item.deviceId === managingDevice.id);
        if (grant && grant.status !== 'revoked') {
          await accountClient.revokeVaultGrant(vault.syncId || vault.id, managingDevice.id);
          addToast('Доступ отозван. Локальная копия на другом устройстве не удалена', 'info');
        } else {
          await shareVaultWithDevice(vault, managingDevice, grantMode);
          addToast('Приглашение отправлено. На другом устройстве нужно принять доступ', 'success');
        }
      } else {
        const current = managingDevice.allowedVaults ?? [];
        const next = current.includes(vaultId)
          ? current.filter((id) => id !== vaultId)
          : [...current, vaultId];
        syncEngine.setDeviceAllowedVaults(managingDevice.id, next);
        setManagingDevice({ ...managingDevice, allowedVaults: next });
        setConfig(syncEngine.getConfig());
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const activeDevices = account
    ? accountState.devices.filter((device) => device.status === 'active').length
    : 1 + config.trustedDevices.length;
  const maxDevices = account?.maxDevices ?? sub.maxDevices;
  const limitsKnown = Boolean(account) || maxDevices > 0;
  const devices = hosted
    ? accountState.devices.filter((device) => device.id !== config.deviceId && device.status !== 'revoked')
    : config.trustedDevices;

  return (
    <div className="flex flex-col gap-3 text-fg-primary">
      {hosted && accountState.invitations.length > 0 && (
        <SettingsGroup title="Приглашения в хранилища">
          {accountState.invitations.map((invitation, index) => (
            <React.Fragment key={invitation.vaultId}>
              {index > 0 && <SettingsDivider />}
              <SettingsRow icon={<Icon name="entity.vault" size="md" tone="inherit" />} label={invitation.vaultName || invitation.vaultId} description={invitation.mode === 'receive-only' ? 'Только чтение' : 'Чтение и изменение'} right={
                <span className="flex gap-1.5">
                  <button type="button" disabled={busyVaultId === invitation.vaultId} onClick={() => void handleDeclineInvitation(invitation.vaultId)} className="px-2 py-1 text-2xs text-fg-muted disabled:opacity-50 cursor-pointer">Скрыть</button>
                  <button type="button" disabled={busyVaultId === invitation.vaultId} onClick={() => void handleAcceptInvitation(invitation.vaultId)} className="px-2 py-1 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-50 cursor-pointer">{busyVaultId === invitation.vaultId ? 'Подключение…' : 'Подключить'}</button>
                </span>
              } />
            </React.Fragment>
          ))}
        </SettingsGroup>
      )}

      <DeviceList
        isMobile={isMobile}
        currentDeviceName={config.deviceName}
        currentDeviceId={config.deviceId}
        devices={devices}
        activeDevices={activeDevices}
        maxDevices={maxDevices}
        limitsKnown={limitsKnown}
        onRename={handleRenameDevice}
        onManage={setManagingDevice}
        onRevoke={handleRevokeDevice}
        onApprove={handleApproveDevice}
      />

      <LocalSyncModeGroup value={config.localSyncMode ?? 'read-write'} onChange={handleLocalSyncModeChange} />

      <PairDeviceButton disabled={locked} onClick={pairing.openModal} />

      <PairDeviceModal pairing={pairing} />

      {managingDevice && (
        <DevicePermissions
          device={managingDevice}
          vaults={vaults}
          accountVaults={accountState.vaults}
          grantMode={grantMode}
          onGrantModeChange={setGrantMode}
          onToggleVaultAccess={handleToggleVaultAccess}
          onClose={() => setManagingDevice(null)}
        />
      )}
    </div>
  );
};
