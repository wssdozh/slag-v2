// The modal shell that shows one device and the vaults it can reach.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { AccountDevice } from '../../../lib/sync/accountTypes';
import type { DeviceProfile } from '../../../lib/sync/types';

interface DeviceCardProps {
  device: AccountDevice | DeviceProfile;
  onClose: () => void;
  children: React.ReactNode;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onClose, children }) => (
  <div className="w-full max-w-sm bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
      <div className="flex items-center gap-2"><Icon name="system.security" size="md" tone="inherit" className="text-success" /><span className="text-xs font-semibold">Доступ к хранилищам</span></div>
      <button type="button" aria-label="Закрыть доступ" onClick={onClose} className="p-1 text-fg-secondary cursor-pointer"><Icon name="action.close" size="md" tone="inherit" /></button>
    </div>
    <div className="p-4 flex flex-col gap-3">
      <div><div className="text-xs text-fg-primary">{device.name}</div><div className="font-mono text-2xs text-fg-muted">{device.id}</div></div>
      {children}
    </div>
  </div>
);
