import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Edit2,
  Laptop,
  Loader2,
  Shield,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import { accountClient } from '../../lib/sync/account';
import { encryptVaultKeyForDevice } from '../../lib/sync/accountCrypto';
import type { AccountDevice } from '../../lib/sync/accountTypes';
import { validateMnemonic } from '../../lib/sync/crypto';
import {
  approveAccountPairingSession,
  approvePairingSession,
  claimPairingSession,
  createPairingSession,
  pollPairingPayload,
  pollPairingSession,
  rejectPairingSession,
} from '../../lib/sync/pairing';
import { syncEngine } from '../../lib/sync/syncEngine';
import type {
  DeviceProfile,
  DeviceSyncMode,
  PairingExchangePayload,
  SyncConfig,
  SyncStatus,
} from '../../lib/sync/types';
import { acceptSharedVault, installSharedVault, shareVaultWithDevice } from '../../lib/sync/vaultSharing';
import { getVaultDisplayName } from '../../lib/vaultDisplay';
import { SettingsGroup, SettingsRow, SettingsDivider, SettingsSelect, SettingsSwitch } from './SettingsUI';

interface DevicesSettingsTabProps {
  addToast?: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const DevicesSettingsTab: React.FC<DevicesSettingsTabProps> = ({ addToast }) => {
  const { switchVault, createVault, vaults, isMobile } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [pairMode, setPairMode] = useState<'host' | 'guest'>('host');
  const [pairError, setPairError] = useState<string | null>(null);
  const [hostPin, setHostPin] = useState<string | null>(null);
  const [hostSessionId, setHostSessionId] = useState<string | null>(null);
  const [hostPinTtl, setHostPinTtl] = useState(300);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ sas: string; guestDeviceId?: string } | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [guestInputPin, setGuestInputPin] = useState('');
  const [guestSasCode, setGuestSasCode] = useState<string | null>(null);
  const [isClaimingPin, setIsClaimingPin] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');
  const [managingDevice, setManagingDevice] = useState<AccountDevice | DeviceProfile | null>(null);
  const [grantMode, setGrantMode] = useState<DeviceSyncMode>('read-write');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busyVaultId, setBusyVaultId] = useState<string | null>(null);
  const isPollingRef = useRef(false);

  const hosted = status.authRequired || accountClient.isAuthenticated();
  const locked = status.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;
  const sub = status.subscription;

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
      if (isPairModalOpen) setIsPairModalOpen(false);
      else setManagingDevice(null);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isPairModalOpen, managingDevice]);

  useEffect(() => {
    if (!hostPin || hostPinTtl <= 0) return;
    const interval = setInterval(() => {
      setHostPinTtl((current) => {
        if (current <= 1) {
          setHostPin(null);
          setHostSessionId(null);
          setPendingApproval(null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hostPin, hostPinTtl]);

  useEffect(() => {
    if (!hostSessionId || pendingApproval) return;
    let active = true;
    const interval = setInterval(async () => {
      if (!active || isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        const result = await pollPairingSession(config.serverUrl, hostSessionId);
        if (active && result.status === 'pending_approval' && result.sasCode) {
          setPendingApproval({ sas: result.sasCode, guestDeviceId: result.guestDeviceId });
          setIsPairModalOpen(true);
          setPairMode('host');
        }
      } catch (error) {
        if (active) setPairError(error instanceof Error ? error.message : String(error));
      } finally {
        isPollingRef.current = false;
      }
    }, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [config.serverUrl, hostSessionId, pendingApproval]);

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    addToast?.('Скопировано в буфер обмена', 'success');
  };

  const handleGeneratePin = async () => {
    if (locked) return;
    setIsGeneratingPin(true);
    setPendingApproval(null);
    setPairError(null);
    try {
      const session = await createPairingSession(config.serverUrl, config.deviceId);
      setHostPin(session.pin);
      setHostSessionId(session.sessionId);
      setHostPinTtl(session.expiresIn);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPairError(message);
      addToast?.(`Ошибка генерации: ${message}`, 'error');
    } finally {
      setIsGeneratingPin(false);
    }
  };

  const handleOpenPairModal = () => {
    setIsPairModalOpen(true);
    setPairMode('host');
    setPairError(null);
    if (!hostPin) void handleGeneratePin();
  };

  const handleApprovePairing = async () => {
    if (!hostSessionId || !pendingApproval) return;
    setIsApproving(true);
    setPairError(null);
    try {
      const currentVault = storage.getCurrentVault();
      let ok: boolean;
      if (hosted) {
        const guest = accountState.devices.find((device) => device.id === pendingApproval.guestDeviceId);
        if (!guest) throw new Error('Гостевое устройство не найдено в аккаунте');
        const seedPhrase = syncEngine.getVaultSeedPhrase(currentVault.id);
        if (!seedPhrase) throw new Error('Ключ текущего хранилища недоступен');
        const encryptedKey = await encryptVaultKeyForDevice(seedPhrase, guest.publicKey);
        const syncId = storage.ensureVaultSyncId(currentVault.id);
        await accountClient.registerVault(syncId, currentVault.name);
        ok = await approveAccountPairingSession(config.serverUrl, hostSessionId, {
          vaultId: syncId,
          vaultName: currentVault.name,
          mode: 'read-write',
          encryptedKey,
        });
      } else {
        const payload: PairingExchangePayload = {
          seedPhrase: config.seedPhrase,
          vaultId: currentVault.id,
          vaultName: currentVault.name,
          hostDeviceId: config.deviceId,
          hostDeviceName: config.deviceName,
          hostPlatform: 'desktop',
          allowedVaults: [currentVault.id],
        };
        ok = await approvePairingSession(config.serverUrl, hostSessionId, JSON.stringify(payload));
      }
      if (!ok) throw new Error('Сервер отклонил подтверждение');

      if (!hosted) {
        syncEngine.addTrustedDevice({
          id: `slag-guest-${pendingApproval.sas}`,
          name: `Устройство ${pendingApproval.sas}`,
          platform: 'desktop',
          isCurrent: false,
          syncMode: 'read-write',
          canRunAiLease: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: 'Только что',
          allowedVaults: [currentVault.id],
        });
      } else {
        await accountClient.refresh();
      }
      addToast?.(`Устройство подключено к «${currentVault.name}»`, 'success');
      setHostPin(null);
      setHostSessionId(null);
      setPendingApproval(null);
      setIsPairModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPairError(message);
      addToast?.(`Ошибка подтверждения: ${message}`, 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectPairing = async () => {
    if (!hostSessionId) return;
    try {
      await rejectPairingSession(config.serverUrl, hostSessionId);
      setHostPin(null);
      setHostSessionId(null);
      setPendingApproval(null);
      setIsPairModalOpen(false);
    } catch (error) {
      setPairError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleClaimGuestPin = async () => {
    if (!guestInputPin.trim() || locked) return;
    setIsClaimingPin(true);
    setGuestSasCode(null);
    setPairError(null);
    try {
      const ephemeralPk = `pk_eph_${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
      const claimed = await claimPairingSession(config.serverUrl, guestInputPin.trim(), ephemeralPk, config.deviceId);
      setGuestSasCode(claimed.sasCode);
      const rawPayload = await pollPairingPayload(
        config.serverUrl,
        claimed.sessionId,
        config.deviceId,
        60_000,
        1500,
      );
      const parsed = JSON.parse(rawPayload) as PairingExchangePayload;

      if (parsed.encryptedKey) {
        const result = await installSharedVault({
          vaultId: parsed.vaultId,
          vaultName: parsed.vaultName,
          encryptedKey: parsed.encryptedKey,
        }, config.deviceId, { createVault, switchVault });
        addToast?.(
          `${result === 'merged' ? 'Хранилище объединено' : 'Хранилище добавлено'}: «${parsed.vaultName}»`,
          'success',
        );
      } else {
        const receivedSeed = parsed.seedPhrase || rawPayload;
        if (!validateMnemonic(receivedSeed)) throw new Error('Получен некорректный ключ хранилища');
        syncEngine.setVaultSeedPhrase(parsed.vaultId, receivedSeed);
        const existing = storage.getVaults().find((vault) => vault.id === parsed.vaultId);
        if (existing) switchVault(existing.id);
        else {
          createVault(parsed.vaultName, 'indexeddb', undefined, parsed.vaultId);
          await syncEngine.switchVault(parsed.vaultId);
        }
        addToast?.(`Хранилище «${parsed.vaultName}» подключено`, 'success');
      }

      if (!hosted && parsed.hostDeviceId) {
        syncEngine.addTrustedDevice({
          id: parsed.hostDeviceId,
          name: parsed.hostDeviceName || 'Основное устройство',
          platform: parsed.hostPlatform || 'desktop',
          isCurrent: false,
          syncMode: 'read-write',
          canRunAiLease: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: 'Только что',
          allowedVaults: [parsed.vaultId],
        });
      }
      await accountClient.refresh();
      setGuestInputPin('');
      setGuestSasCode(null);
      setIsPairModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPairError(message);
      addToast?.(message, 'error');
      setGuestSasCode(null);
    } finally {
      setIsClaimingPin(false);
    }
  };

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
      addToast?.(
        `${result === 'merged' ? 'Хранилище объединено' : 'Хранилище добавлено'}: «${invitation.vaultName || vaultId}»`,
        'success',
      );
    } catch (error) {
      addToast?.(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusyVaultId(null);
    }
  };

  const handleDeclineInvitation = async (vaultId: string) => {
    setBusyVaultId(vaultId);
    try {
      await accountClient.declineVault(vaultId);
      addToast?.('Приглашение скрыто', 'info');
    } catch (error) {
      addToast?.(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusyVaultId(null);
    }
  };

  const handleSaveRename = async () => {
    if (!editingDeviceId) return;
    const name = editingDeviceName.trim();
    if (hosted) await accountClient.renameDevice(editingDeviceId, name);
    else syncEngine.renameDevice(editingDeviceId, name);
    setEditingDeviceId(null);
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
          addToast?.('Доступ отозван. Локальная копия на другом устройстве не удалена', 'info');
        } else {
          await shareVaultWithDevice(vault, managingDevice, grantMode);
          addToast?.('Приглашение отправлено. На другом устройстве нужно принять доступ', 'success');
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
      addToast?.(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const formatTtl = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const activeDevices = account
    ? accountState.devices.filter((device) => device.status === 'active').length
    : 1 + config.trustedDevices.length;
  const maxDevices = account?.maxDevices ?? sub.maxDevices;
  const limitsKnown = Boolean(account) || maxDevices > 0;

  return (
    <div className="flex flex-col gap-3 text-fg-primary">
      {hosted && accountState.invitations.length > 0 && (
        <SettingsGroup title="Приглашения в хранилища">
          {accountState.invitations.map((invitation, index) => (
            <React.Fragment key={invitation.vaultId}>
              {index > 0 && <SettingsDivider />}
              <SettingsRow icon={<Database className="w-4 h-4" />} label={invitation.vaultName || invitation.vaultId} description={invitation.mode === 'receive-only' ? 'Только чтение' : 'Чтение и изменение'} right={
                <span className="flex gap-1.5">
                  <button type="button" disabled={busyVaultId === invitation.vaultId} onClick={() => void handleDeclineInvitation(invitation.vaultId)} className="px-2 py-1 text-2xs text-fg-muted disabled:opacity-50 cursor-pointer">Скрыть</button>
                  <button type="button" disabled={busyVaultId === invitation.vaultId} onClick={() => void handleAcceptInvitation(invitation.vaultId)} className="px-2 py-1 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-50 cursor-pointer">{busyVaultId === invitation.vaultId ? 'Подключение…' : 'Подключить'}</button>
                </span>
              } />
            </React.Fragment>
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup title="Подключённые устройства" action={<span className="text-2xs font-mono text-fg-muted" title={limitsKnown ? undefined : 'Лимит устройств станет известен после входа'}>{limitsKnown ? `${activeDevices} / ${maxDevices}` : activeDevices}</span>}>
        <SettingsRow icon={isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />} label={config.deviceName} description={<span className="font-mono">{config.deviceId} · это устройство</span>} />
        {(hosted ? accountState.devices.filter((device) => device.id !== config.deviceId && device.status !== 'revoked') : config.trustedDevices).map((device) => {
          const isAccountDevice = 'status' in device;
          return (
            <React.Fragment key={device.id}>
              <SettingsDivider />
              <SettingsRow
                icon={device.platform === 'mobile' ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                label={editingDeviceId === device.id ? (
                  <input autoFocus aria-label="Имя устройства" value={editingDeviceName} onChange={(event) => setEditingDeviceName(event.target.value)} onBlur={() => void handleSaveRename()} onKeyDown={(event) => { if (event.key === 'Enter') void handleSaveRename(); }} className="w-full px-1.5 py-0.5 text-xs text-fg-primary bg-transparent border border-border-subtle rounded-md outline-none" />
                ) : (
                  <button type="button" onClick={() => { setEditingDeviceId(device.id); setEditingDeviceName(device.name); }} className="flex items-center gap-1.5 text-xs text-fg-primary cursor-pointer"><span className="truncate">{device.name}</span><Edit2 className="w-3 h-3 text-fg-dim" /></button>
                )}
                description={<span className="font-mono break-all">{device.id}{isAccountDevice && device.status === 'pending' ? ' · ожидает подтверждения' : ''}</span>}
                right={<span className="flex items-center gap-2">
                  {isAccountDevice && device.status === 'pending' ? (
                    <button type="button" onClick={() => void accountClient.approveDevice(device.id)} className="text-2xs text-fg-secondary cursor-pointer">Подтвердить</button>
                  ) : (
                    <button type="button" onClick={() => setManagingDevice(device)} title="Доступ к хранилищам" aria-label={`Доступ ${device.name} к хранилищам`} className="px-2 py-1 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover cursor-pointer">Доступ к базам</button>
                  )}
                  <button type="button" onClick={() => {
                    if (isAccountDevice) void accountClient.revokeDevice(device.id);
                    else { syncEngine.removeTrustedDevice(device.id); setConfig(syncEngine.getConfig()); }
                  }} title="Отозвать устройство" aria-label={`Отозвать ${device.name}`} className="p-1 text-fg-dim hover:text-danger cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </span>}
              />
            </React.Fragment>
          );
        })}
      </SettingsGroup>

      <SettingsGroup title="Это устройство">
        <SettingsSelect label="Локальная синхронизация" value={config.localSyncMode ?? 'read-write'} onChange={(next) => { syncEngine.setDeviceSyncMode(config.deviceId, next as DeviceSyncMode); setConfig(syncEngine.getConfig()); }} options={[
          { value: 'read-write', label: 'Чтение и запись' },
          { value: 'receive-only', label: 'Только чтение' },
        ]} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow label="Привязать устройство" testId="btn-open-pair-modal" disabled={locked} onClick={handleOpenPairModal} />
      </SettingsGroup>

      {/* Pairing Modal */}
      {isPairModalOpen && (
        <div className="fixed inset-0 z-[70] bg-canvas/85 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setIsPairModalOpen(false); }}>
          <div data-testid="pair-device-modal" role="dialog" aria-modal="true" className="w-full max-w-sm bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <span className="text-xs font-semibold text-fg-primary">Привязка устройства</span>
              <button type="button" aria-label="Закрыть привязку" onClick={() => setIsPairModalOpen(false)} className="p-1 text-fg-secondary cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-1 border-b border-border-subtle pb-2">
                <button type="button" data-testid="pair-modal-tab-host" onClick={() => { setPairMode('host'); if (!hostPin) void handleGeneratePin(); }} className={`py-1.5 rounded-md text-xs cursor-pointer ${pairMode === 'host' ? 'bg-surface-hover text-fg-primary' : 'text-fg-secondary'}`}>Показать PIN</button>
                <button type="button" data-testid="pair-modal-tab-guest" onClick={() => { setPairMode('guest'); setPendingApproval(null); }} className={`py-1.5 rounded-md text-xs cursor-pointer ${pairMode === 'guest' ? 'bg-surface-hover text-fg-primary' : 'text-fg-secondary'}`}>Ввести PIN</button>
              </div>
              {pairError && <p className="text-2xs text-danger">{pairError}</p>}
              {pairMode === 'host' ? (
                pendingApproval ? (
                  <div className="flex flex-col gap-3 py-2">
                    <div className="text-xs text-fg-primary">Запрос на подключение</div>
                    <div className="font-mono text-lg text-success">Код проверки: <strong>{pendingApproval.sas}</strong></div>
                    <p className="text-2xs text-fg-secondary">Сверьте код на втором устройстве. Будет открыт доступ только к текущему хранилищу.</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => void handleRejectPairing()} className="px-3 py-1.5 text-xs text-fg-secondary cursor-pointer">Отклонить</button>
                      <button type="button" disabled={isApproving} onClick={() => void handleApprovePairing()} className="px-3.5 py-1.5 bg-fg-primary text-canvas font-semibold text-xs rounded-md disabled:opacity-50 cursor-pointer">{isApproving ? 'Подтверждение…' : 'Разрешить доступ'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-3">
                    <span className="text-2xs text-fg-muted font-mono">ОДНОРАЗОВЫЙ КОД</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-bold tracking-widest text-fg-primary">{isGeneratingPin ? '…' : hostPin || '000-000'}</span>
                      {hostPin && <button type="button" aria-label="Скопировать PIN" onClick={() => void copyToClipboard(hostPin, 'pin')} className="p-1.5 text-fg-secondary cursor-pointer">{copiedKey === 'pin' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</button>}
                    </div>
                    <span className="font-mono text-2xs text-fg-muted">Действует: {formatTtl(hostPinTtl)}</span>
                  </div>
                )
              ) : guestSasCode ? (
                <div className="flex flex-col items-center gap-3 py-6"><Loader2 className="w-6 h-6 text-success animate-spin" /><span className="text-xs">Код проверки: <strong className="font-mono text-success">{guestSasCode}</strong></span><span className="text-2xs text-fg-muted">Подтвердите подключение на первом устройстве</span></div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="text-2xs text-fg-secondary">PIN с первого устройства</label>
                  <input autoFocus placeholder="123-456" value={guestInputPin} onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
                    setGuestInputPin(digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits);
                  }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleClaimGuestPin(); } }} maxLength={7} className="w-full bg-transparent border border-border-subtle rounded-md px-3 py-2 text-center font-mono text-lg tracking-widest text-fg-primary outline-none" />
                  <button type="button" disabled={isClaimingPin || guestInputPin.length !== 7} onClick={() => void handleClaimGuestPin()} className="w-full py-2 bg-fg-primary text-canvas font-semibold text-xs rounded-md disabled:opacity-50 cursor-pointer">{isClaimingPin ? 'Связывание…' : 'Подключить устройство'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Managing Vault Access Modal */}
      {managingDevice && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-canvas/60 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setManagingDevice(null); }}>
          <div className="w-full max-w-sm bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-success" /><span className="text-xs font-semibold">Доступ к хранилищам</span></div>
              <button type="button" aria-label="Закрыть доступ" onClick={() => setManagingDevice(null)} className="p-1 text-fg-secondary cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div><div className="text-xs text-fg-primary">{managingDevice.name}</div><div className="font-mono text-2xs text-fg-muted">{managingDevice.id}</div></div>
              {'status' in managingDevice && (
                <SettingsGroup title="Приглашение">
                  <SettingsSelect label="Режим доступа" value={grantMode} onChange={(mode) => setGrantMode(mode as DeviceSyncMode)} options={[
                    { value: 'read-write', label: 'Чтение и изменение' },
                    { value: 'receive-only', label: 'Только чтение' },
                  ]} />
                </SettingsGroup>
              )}
              <SettingsGroup title="Хранилища" className="max-h-56 overflow-y-auto">
                {vaults.map((vault, index) => {
                  const grant = 'status' in managingDevice
                    ? accountState.vaults.find((item) => item.id === (vault.syncId || vault.id))?.grants.find((item) => item.deviceId === managingDevice.id)
                    : undefined;
                  const allowed = 'status' in managingDevice
                    ? Boolean(grant && grant.status !== 'revoked')
                    : Boolean(managingDevice.allowedVaults?.includes(vault.id));
                  return (
                    <React.Fragment key={vault.id}>
                      {index > 0 && <SettingsDivider />}
                      <SettingsRow icon={<Database className="w-3.5 h-3.5" />} label={getVaultDisplayName(vault, vaults)} description={grant?.status === 'pending' ? 'Ожидает' : grant?.status === 'accepted' ? (grant.mode === 'receive-only' ? 'Только чтение' : 'Подключено') : undefined} right={<SettingsSwitch checked={allowed} onChange={() => void handleToggleVaultAccess(vault.id)} label={`Доступ к ${getVaultDisplayName(vault, vaults)}`} />} />
                    </React.Fragment>
                  );
                })}
              </SettingsGroup>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
