import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Edit2,
  Laptop,
  Loader2,
  Plus,
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
    <div className="flex flex-col gap-3 text-zinc-100">
      {/* Pending Vault Invitations */}
      {hosted && accountState.invitations.length > 0 && (
        <section className="p-3.5 rounded-xl bg-white/[0.02] border border-emerald-500/20 flex flex-col gap-2">
          <span className="text-xs font-semibold text-zinc-200">Приглашения в хранилища</span>
          {accountState.invitations.map((invitation) => (
            <div key={invitation.vaultId} className="flex items-center justify-between gap-3 py-1.5 border-t border-white/[0.04]">
              <div className="min-w-0">
                <div className="text-xs text-white truncate">{invitation.vaultName || invitation.vaultId}</div>
                <div className="text-2xs text-zinc-500">{invitation.mode === 'receive-only' ? 'только чтение' : 'чтение и изменение'}</div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" disabled={busyVaultId === invitation.vaultId} onClick={() => void handleDeclineInvitation(invitation.vaultId)} className="px-2 py-1 text-2xs text-zinc-400">Скрыть</button>
                <button type="button" disabled={busyVaultId === invitation.vaultId} onClick={() => void handleAcceptInvitation(invitation.vaultId)} className="px-2.5 py-1 text-2xs bg-white text-black rounded-md font-medium disabled:opacity-50">
                  {busyVaultId === invitation.vaultId ? 'Подключение…' : 'Подключить'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Devices List */}
      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">Подключённые устройства</span>
            <span
              className="text-[11px] font-mono text-zinc-500"
              title={limitsKnown ? undefined : 'Лимит устройств станет известен после входа'}
            >
              {limitsKnown ? `${activeDevices} / ${maxDevices}` : activeDevices}
            </span>
          </div>
          <button
            type="button"
            data-testid="btn-open-pair-modal"
            disabled={locked}
            onClick={handleOpenPairModal}
            className="flex items-center gap-1.5 px-2.5 py-1 text-2xs text-zinc-300 bg-white/[0.04] border border-white/[0.06] rounded-md disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer motion-press"
          >
            <Plus className="w-3.5 h-3.5" /> Привязать устройство
          </button>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {/* This device */}
          <div className="py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isMobile ? <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" /> : <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />}
              <div className="min-w-0">
                <div className="text-xs text-zinc-200">{config.deviceName}</div>
                <div className="text-[11px] font-mono text-zinc-500 truncate">{config.deviceId} · это устройство</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = config.localSyncMode === 'receive-only' ? 'read-write' : 'receive-only';
                syncEngine.setDeviceSyncMode(config.deviceId, next);
                setConfig(syncEngine.getConfig());
              }}
              title="Локальный режим синхронизации этого устройства"
              className="text-[11px] font-mono text-zinc-400 whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer"
            >
              {config.localSyncMode === 'receive-only' ? 'Только чтение' : 'Чтение и запись'}
            </button>
          </div>

          {/* Other devices */}
          {(hosted ? accountState.devices.filter((device) => device.id !== config.deviceId && device.status !== 'revoked') : config.trustedDevices).map((device) => {
            const isAccountDevice = 'status' in device;
            return (
              <div key={device.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {device.platform === 'mobile' ? <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" /> : <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />}
                  <div className="min-w-0">
                    {editingDeviceId === device.id ? (
                      <input autoFocus value={editingDeviceName} onChange={(event) => setEditingDeviceName(event.target.value)} onBlur={() => void handleSaveRename()} onKeyDown={(event) => { if (event.key === 'Enter') void handleSaveRename(); }} className="bg-panel border border-white/20 rounded px-1.5 py-0.5 text-xs text-white outline-none" />
                    ) : (
                      <button type="button" onClick={() => { setEditingDeviceId(device.id); setEditingDeviceName(device.name); }} className="text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer hover:text-white">
                        <span className="truncate">{device.name}</span><Edit2 className="w-3 h-3 text-zinc-600" />
                      </button>
                    )}
                    <div className="text-[11px] font-mono text-zinc-500 truncate">
                      {device.id}{isAccountDevice && device.status === 'pending' ? ' · ожидает подтверждения' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAccountDevice && device.status === 'pending' ? (
                    <button type="button" onClick={() => void accountClient.approveDevice(device.id)} className="text-[11px] text-emerald-400 cursor-pointer">Подтвердить</button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setManagingDevice(device)}
                      title="Доступ к хранилищам"
                      aria-label={`Доступ ${device.name} к хранилищам`}
                      className="px-2 py-1 text-2xs text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors cursor-pointer"
                    >
                      Доступ к базам
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isAccountDevice) void accountClient.revokeDevice(device.id);
                      else {
                        syncEngine.removeTrustedDevice(device.id);
                        setConfig(syncEngine.getConfig());
                      }
                    }}
                    title="Отозвать устройство"
                    aria-label={`Отозвать ${device.name}`}
                    className="p-1 text-zinc-600 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pairing Modal */}
      {isPairModalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setIsPairModalOpen(false); }}>
          <div data-testid="pair-device-modal" role="dialog" aria-modal="true" className="w-full max-w-sm bg-surface-elevated border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-semibold text-white">Привязка устройства</span>
              <button type="button" aria-label="Закрыть привязку" onClick={() => setIsPairModalOpen(false)} className="p-1 text-zinc-400 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-1 bg-canvas-subtle p-1 rounded-xl border border-white/[0.06]">
                <button type="button" data-testid="pair-modal-tab-host" onClick={() => { setPairMode('host'); if (!hostPin) void handleGeneratePin(); }} className={`py-1.5 rounded-lg text-xs cursor-pointer ${pairMode === 'host' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>Показать PIN</button>
                <button type="button" data-testid="pair-modal-tab-guest" onClick={() => { setPairMode('guest'); setPendingApproval(null); }} className={`py-1.5 rounded-lg text-xs cursor-pointer ${pairMode === 'guest' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>Ввести PIN</button>
              </div>
              {pairError && <p className="text-2xs text-rose-400">{pairError}</p>}
              {pairMode === 'host' ? (
                pendingApproval ? (
                  <div className="flex flex-col gap-3 py-2">
                    <div className="text-xs text-white">Запрос на подключение</div>
                    <div className="font-mono text-lg text-emerald-400">Код проверки: <strong>{pendingApproval.sas}</strong></div>
                    <p className="text-2xs text-zinc-400">Сверьте код на втором устройстве. Будет открыт доступ только к текущему хранилищу.</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => void handleRejectPairing()} className="px-3 py-1.5 text-xs text-zinc-400 cursor-pointer">Отклонить</button>
                      <button type="button" disabled={isApproving} onClick={() => void handleApprovePairing()} className="px-3.5 py-1.5 bg-white text-black font-semibold text-xs rounded-lg disabled:opacity-50 cursor-pointer">{isApproving ? 'Подтверждение…' : 'Разрешить доступ'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-3">
                    <span className="text-2xs text-zinc-500 font-mono">ОДНОРАЗОВЫЙ КОД</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-bold tracking-widest text-white">{isGeneratingPin ? '…' : hostPin || '000-000'}</span>
                      {hostPin && <button type="button" aria-label="Скопировать PIN" onClick={() => void copyToClipboard(hostPin, 'pin')} className="p-1.5 text-zinc-400 cursor-pointer">{copiedKey === 'pin' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}</button>}
                    </div>
                    <span className="font-mono text-2xs text-zinc-500">Действует: {formatTtl(hostPinTtl)}</span>
                  </div>
                )
              ) : guestSasCode ? (
                <div className="flex flex-col items-center gap-3 py-6"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /><span className="text-xs">Код проверки: <strong className="font-mono text-emerald-400">{guestSasCode}</strong></span><span className="text-2xs text-zinc-500">Подтвердите подключение на первом устройстве</span></div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="text-2xs text-zinc-400">PIN с первого устройства</label>
                  <input autoFocus placeholder="123-456" value={guestInputPin} onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
                    setGuestInputPin(digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits);
                  }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleClaimGuestPin(); } }} maxLength={7} className="w-full bg-panel border border-white/[0.08] rounded-xl px-3 py-2 text-center font-mono text-lg tracking-widest text-white outline-none" />
                  <button type="button" disabled={isClaimingPin || guestInputPin.length !== 7} onClick={() => void handleClaimGuestPin()} className="w-full py-2 bg-white text-black font-semibold text-xs rounded-xl disabled:opacity-50 cursor-pointer">{isClaimingPin ? 'Связывание…' : 'Подключить устройство'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Managing Vault Access Modal */}
      {managingDevice && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setManagingDevice(null); }}>
          <div className="w-full max-w-sm bg-surface-elevated border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /><span className="text-xs font-semibold">Доступ к хранилищам</span></div>
              <button type="button" aria-label="Закрыть доступ" onClick={() => setManagingDevice(null)} className="p-1 text-zinc-400 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div><div className="text-xs text-white">{managingDevice.name}</div><div className="font-mono text-2xs text-zinc-500">{managingDevice.id}</div></div>
              {'status' in managingDevice && (
                <div className="flex gap-1 bg-canvas-subtle p-0.5 rounded-lg border border-white/[0.06]">
                  {(['read-write', 'receive-only'] as const).map((mode) => <button key={mode} type="button" onClick={() => setGrantMode(mode)} className={`flex-1 py-1 text-2xs rounded cursor-pointer ${grantMode === mode ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>{mode === 'read-write' ? 'Чтение и изменение' : 'Только чтение'}</button>)}
                </div>
              )}
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                {vaults.map((vault) => {
                  const grant = 'status' in managingDevice
                    ? accountState.vaults.find((item) => item.id === (vault.syncId || vault.id))?.grants.find((item) => item.deviceId === managingDevice.id)
                    : undefined;
                  const allowed = 'status' in managingDevice
                    ? Boolean(grant && grant.status !== 'revoked')
                    : Boolean(managingDevice.allowedVaults?.includes(vault.id));
                  return (
                    <button key={vault.id} type="button" onClick={() => void handleToggleVaultAccess(vault.id)} className="flex items-center justify-between py-2 border-t border-white/[0.04] text-left cursor-pointer hover:bg-white/[0.02] px-1 rounded">
                      <div className="flex items-center gap-2 min-w-0"><Database className="w-3.5 h-3.5 text-zinc-500" /><span className="text-xs text-white truncate">{getVaultDisplayName(vault, vaults)}</span></div>
                      <span className={`text-[10px] font-mono ${allowed ? 'text-emerald-400' : 'text-zinc-500'}`}>{grant?.status === 'pending' ? 'Ожидает' : grant?.status === 'accepted' ? (grant.mode === 'receive-only' ? 'Только чтение' : 'Подключено') : allowed ? 'Разрешено' : 'Запрещено'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
