// Device row widgets: inline rename, revoke, and the local sync mode picker.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../UI/icons/Icon';
import type { AccountDevice } from '../../../lib/sync/accountTypes';
import type { DeviceProfile, DeviceSyncMode } from '../../../lib/sync/types';
import type { DevicePairingController } from './useDevicePairing';
import { SettingsGroup, SettingsRow, SettingsSelect } from '../SettingsUI';

interface DeviceNameProps {
  deviceId: string;
  name: string;
  onRename: (deviceId: string, name: string) => void | Promise<void>;
}

export const DeviceName: React.FC<DeviceNameProps> = ({ deviceId, name, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');

  const commit = () => {
    setIsEditing(false);
    void onRename(deviceId, draftName);
  };

  if (!isEditing) {
    return (
      <button type="button" onClick={() => { setDraftName(name); setIsEditing(true); }} className="flex items-center gap-1.5 text-xs text-fg-primary cursor-pointer"><span className="truncate">{name}</span><Icon name="action.rename" size="xs" tone="dim" /></button>
    );
  }

  return (
    <input autoFocus aria-label="Имя устройства" value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }} className="w-full px-1.5 py-0.5 text-xs text-fg-primary bg-transparent border border-border-subtle rounded-md outline-none" />
  );
};

interface DeviceRevokeButtonProps {
  device: AccountDevice | DeviceProfile;
  onRevoke: (device: AccountDevice | DeviceProfile) => void;
}

export const DeviceRevokeButton: React.FC<DeviceRevokeButtonProps> = ({ device, onRevoke }) => (
  <button type="button" onClick={() => onRevoke(device)} title="Отозвать устройство" aria-label={`Отозвать ${device.name}`} className="p-1 text-fg-dim hover:text-danger cursor-pointer"><Icon name="action.delete" size="sm" tone="inherit" /></button>
);

interface LocalSyncModeGroupProps {
  value: DeviceSyncMode;
  onChange: (value: DeviceSyncMode) => void;
}

export const LocalSyncModeGroup: React.FC<LocalSyncModeGroupProps> = ({ value, onChange }) => (
  <SettingsGroup title="Это устройство">
    <SettingsSelect label="Локальная синхронизация" value={value} onChange={(next) => onChange(next as DeviceSyncMode)} options={[
      { value: 'read-write', label: 'Чтение и запись' },
      { value: 'receive-only', label: 'Только чтение' },
    ]} />
  </SettingsGroup>
);

interface PairDeviceButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export const PairDeviceButton: React.FC<PairDeviceButtonProps> = ({ disabled, onClick }) => (
  <SettingsGroup>
    <SettingsRow label="Привязать устройство" testId="btn-open-pair-modal" disabled={disabled} onClick={onClick} />
  </SettingsGroup>
);

interface PairDeviceModalProps {
  pairing: DevicePairingController;
}

export const PairDeviceModal: React.FC<PairDeviceModalProps> = ({ pairing }) => {
  const {
    isModalOpen,
    pairMode,
    hostPin,
    hostPinTtl,
    pendingApproval,
    isGeneratingPin,
    isApproving,
    guestInputPin,
    guestSasCode,
    isClaimingPin,
    setModalOpen,
    selectHostTab,
    selectGuestTab,
    setGuestInputPin,
    approvePairing,
    rejectPairing,
    claimGuestPin,
    copyToClipboard,
    formatTtl,
  } = pairing;

  if (!isModalOpen) return null;

  return createPortal((
    // Same reason as the access dialog: a transformed settings card would clip this overlay.
    <div className="fixed inset-0 z-[70] bg-canvas/85 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
      <div data-testid="pair-device-modal" role="dialog" aria-modal="true" className="w-full max-w-sm bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-xs font-semibold text-fg-primary">Привязка устройства</span>
          <button type="button" aria-label="Закрыть привязку" onClick={() => setModalOpen(false)} className="p-1 text-fg-secondary cursor-pointer"><Icon name="action.close" size="md" tone="inherit" /></button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-1 border-b border-border-subtle pb-2">
            <button type="button" data-testid="pair-modal-tab-host" onClick={selectHostTab} className={`py-1.5 rounded-md text-xs cursor-pointer ${pairMode === 'host' ? 'bg-surface-hover text-fg-primary' : 'text-fg-secondary'}`}>Показать PIN</button>
            <button type="button" data-testid="pair-modal-tab-guest" onClick={selectGuestTab} className={`py-1.5 rounded-md text-xs cursor-pointer ${pairMode === 'guest' ? 'bg-surface-hover text-fg-primary' : 'text-fg-secondary'}`}>Ввести PIN</button>
          </div>
          {pairMode === 'host' ? (
            pendingApproval ? (
              <div className="flex flex-col gap-3 py-2">
                <div className="text-xs text-fg-primary">Запрос на подключение</div>
                <div className="font-mono text-lg text-success">Код проверки: <strong>{pendingApproval.sas}</strong></div>
                <p className="text-2xs text-fg-secondary">Сверьте код на втором устройстве. Будет открыт доступ только к текущему хранилищу.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => void rejectPairing()} className="px-3 py-1.5 text-xs text-fg-secondary cursor-pointer">Отклонить</button>
                  <button type="button" disabled={isApproving} onClick={() => void approvePairing()} className="px-3.5 py-1.5 bg-fg-primary text-canvas font-semibold text-xs rounded-md disabled:opacity-50 cursor-pointer">{isApproving ? 'Подтверждение…' : 'Разрешить доступ'}</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-3">
                <span className="text-2xs text-fg-muted font-mono">ОДНОРАЗОВЫЙ КОД</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold tracking-widest text-fg-primary">{isGeneratingPin ? '…' : hostPin || '000-000'}</span>
                  {hostPin && <button type="button" aria-label="Скопировать PIN" onClick={() => void copyToClipboard(hostPin)} className="p-1.5 text-fg-secondary cursor-pointer"><Icon name="action.copy" size="md" tone="inherit" /></button>}
                </div>
                <span className="font-mono text-2xs text-fg-muted">Действует: {formatTtl(hostPinTtl)}</span>
              </div>
            )
          ) : guestSasCode ? (
            <div className="flex flex-col items-center gap-3 py-6"><Icon name="status.loading" size="none" tone="inherit" className="w-6 h-6 text-success animate-spin" /><span className="text-xs">Код проверки: <strong className="font-mono text-success">{guestSasCode}</strong></span><span className="text-2xs text-fg-muted">Подтвердите подключение на первом устройстве</span></div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="text-2xs text-fg-secondary">PIN с первого устройства</label>
              <input autoFocus placeholder="123-456" value={guestInputPin} onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
                setGuestInputPin(digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits);
              }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void claimGuestPin(); } }} maxLength={7} className="w-full bg-transparent border border-border-subtle rounded-md px-3 py-2 text-center font-mono text-lg tracking-widest text-fg-primary outline-none" />
              <button type="button" disabled={isClaimingPin || guestInputPin.length !== 7} onClick={() => void claimGuestPin()} className="w-full py-2 bg-fg-primary text-canvas font-semibold text-xs rounded-md disabled:opacity-50 cursor-pointer">{isClaimingPin ? 'Связывание…' : 'Подключить устройство'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
};
