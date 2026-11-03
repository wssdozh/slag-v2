import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Edit2,
  KeyRound,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Server,
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
import { getLocalVaultId, installSharedVault, shareVaultWithDevice } from '../../lib/sync/vaultSharing';
import { getVaultDisplayName } from '../../lib/vaultDisplay';

interface SyncSettingsTabProps {
  addToast?: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const SyncSettingsTab: React.FC<SyncSettingsTabProps> = ({ addToast }) => {
  const { switchVault, createVault, vaults } = useApp();
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
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);
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
    void accountClient.detectServer(config.serverUrl);
  }, [config.serverUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (managingDevice) setManagingDevice(null);
      else if (isPairModalOpen) setIsPairModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
      const result = await installSharedVault({
        vaultId,
        vaultName: invitation.vaultName || vaultId,
        encryptedKey: invitation.encryptedKey,
      }, config.deviceId, { createVault, switchVault }, false);
      await accountClient.acceptVault(vaultId);
      switchVault(getLocalVaultId(vaultId));
      await syncEngine.switchVault(getLocalVaultId(vaultId));
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

  const handleTestServerConnection = async () => {
    setIsTestingServer(true);
    setServerStatusMessage(null);
    try {
      const cleanUrl = serverUrlInput.replace(/\/+$/, '');
      const started = Date.now();
      const response = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json();
      await accountClient.detectServer(cleanUrl);
      await syncEngine.updateServerUrl(cleanUrl);
      accountClient.startPolling(cleanUrl);
      setServerStatusMessage(`${health.service} · ${Date.now() - started} мс · ${health.authRequired ? 'SLAG ID' : 'без ЛК'}`);
      addToast?.('Сервер синхронизации сохранён', 'success');
    } catch (error) {
      setServerStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTestingServer(false);
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
  const planLabel = account?.planLabel || sub.planLabel;
  const maxDevices = account?.maxDevices ?? sub.maxDevices;
  const usedCacheMb = account?.usedCacheMb ?? sub.usedCacheMb;
  const maxCacheMb = account?.maxCacheMb ?? sub.maxCacheMb;

  return (
    <div className="flex flex-col gap-3 text-zinc-100">
      {locked && (
        <section className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-semibold text-white">Для синхронизации нужен SLAG ID</h3>
            <p className="text-2xs text-zinc-400 mt-1">Войдите по seed-фразе или создайте аккаунт. Локальные заметки останутся доступны.</p>
          </div>
          <button
            type="button"
            data-testid="sync-open-account"
            onClick={() => { window.location.search = '?page=account'; }}
            className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold whitespace-nowrap"
          >
            Войти в ЛК
          </button>
        </section>
      )}

      <section className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full ${status.state === 'connected' ? 'bg-emerald-500' : status.state === 'syncing' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs font-semibold text-white">{planLabel}</span>
            <span className="text-[10px] font-mono text-zinc-500">E2EE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void syncEngine.pushLocalChanges()}
              disabled={locked || status.state === 'syncing'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-2xs text-zinc-300 bg-white/[0.04] border border-white/[0.06] rounded-md disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${status.state === 'syncing' ? 'animate-spin' : ''}`} />
              Синхронизировать
            </button>
            {hosted && (
              <button
                type="button"
                onClick={() => { window.location.search = '?page=account'; }}
                className="px-2 py-1 text-2xs text-zinc-400 bg-white/[0.03] border border-white/[0.06] rounded-md"
              >
                Личный кабинет
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-2.5 text-2xs text-zinc-500 border-t border-white/[0.04] pt-2">
          <span>{hosted ? (account ? `тариф до ${account.expiresAt ? new Date(account.expiresAt).toLocaleDateString('ru-RU') : 'бессрочно'}` : 'требуется вход') : 'свой сервер'}</span>
          <span>·</span>
          <span>{activeDevices} из {maxDevices} устройств</span>
          <span>·</span>
          <span className="font-mono">кеш {usedCacheMb} / {maxCacheMb >= 1024 ? `${Math.round(maxCacheMb / 1024)} ГБ` : `${maxCacheMb} МБ`}</span>
        </div>
      </section>

      {hosted && accountState.invitations.length > 0 && (
        <section className="p-3.5 rounded-xl bg-white/[0.02] border border-emerald-500/20 flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-zinc-200">Приглашения в хранилища</h3>
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

      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">Устройства</span>
            <span className="text-[11px] font-mono text-zinc-500">{activeDevices} / {maxDevices}</span>
          </div>
          <button type="button" data-testid="btn-open-pair-modal" disabled={locked} onClick={handleOpenPairModal} className="flex items-center gap-1.5 px-2.5 py-1 text-2xs text-zinc-300 bg-white/[0.04] border border-white/[0.06] rounded-md disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" /> Привязать устройство
          </button>
        </div>

        <div className="divide-y divide-white/[0.04]">
          <div className="py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-zinc-200">{config.deviceName}</div>
                <div className="text-[11px] font-mono text-zinc-500 truncate">{config.deviceId} · это устройство</div>
              </div>
            </div>
            <button type="button" onClick={() => {
              const next = config.localSyncMode === 'receive-only' ? 'read-write' : 'receive-only';
              syncEngine.setDeviceSyncMode(config.deviceId, next);
              setConfig(syncEngine.getConfig());
            }} className="text-[11px] font-mono text-zinc-400">
              {config.localSyncMode === 'receive-only' ? 'Только чтение' : 'Полный доступ'}
            </button>
          </div>

          {(hosted ? accountState.devices.filter((device) => device.id !== config.deviceId && device.status !== 'revoked') : config.trustedDevices).map((device) => {
            const isAccountDevice = 'status' in device;
            return (
              <div key={device.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {device.platform === 'mobile' ? <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" /> : <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />}
                  <div className="min-w-0">
                    {editingDeviceId === device.id ? (
                      <input autoFocus value={editingDeviceName} onChange={(event) => setEditingDeviceName(event.target.value)} onBlur={() => void handleSaveRename()} onKeyDown={(event) => { if (event.key === 'Enter') void handleSaveRename(); }} className="bg-[#0c0c0e] border border-white/20 rounded px-1.5 py-0.5 text-xs text-white outline-none" />
                    ) : (
                      <button type="button" onClick={() => { setEditingDeviceId(device.id); setEditingDeviceName(device.name); }} className="text-xs text-zinc-200 flex items-center gap-1.5">
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
                    <button type="button" onClick={() => void accountClient.approveDevice(device.id)} className="text-[11px] text-emerald-400">Подтвердить</button>
                  ) : (
                    <button type="button" onClick={() => setManagingDevice(device)} title="Доступ к хранилищам" aria-label={`Доступ ${device.name} к хранилищам`} className="p-1 text-zinc-400 hover:text-white">
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => {
                    if (isAccountDevice) void accountClient.revokeDevice(device.id);
                    else {
                      syncEngine.removeTrustedDevice(device.id);
                      setConfig(syncEngine.getConfig());
                    }
                  }} title="Отозвать устройство" aria-label={`Отозвать ${device.name}`} className="p-1 text-zinc-600 hover:text-rose-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">Сервер ретрансляции</span>
          {serverStatusMessage && <span className="font-mono text-2xs text-zinc-400">{serverStatusMessage}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Server className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={serverUrlInput} onChange={(event) => setServerUrlInput(event.target.value)} className="w-full bg-[#0c0c0e] border border-white/[0.08] rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono text-white outline-none" />
          </div>
          <button type="button" onClick={() => void handleTestServerConnection()} disabled={isTestingServer} className="px-3 py-1.5 bg-white/[0.06] text-xs text-zinc-300 rounded-lg disabled:opacity-50">{isTestingServer ? 'Тест…' : 'Проверить'}</button>
        </div>
        <label className="flex items-center justify-between text-2xs text-zinc-400">
          Автоматическая синхронизация при сохранении
          <input type="checkbox" checked={config.autoSync} onChange={(event) => { syncEngine.saveConfig({ autoSync: event.target.checked }); setConfig(syncEngine.getConfig()); }} className="w-3.5 h-3.5 accent-white" />
        </label>
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.04]">
          <div className="flex justify-between text-2xs text-zinc-400"><span>Фоновая синхронизация</span><span>{config.bgSyncIntervalMinutes ? `${config.bgSyncIntervalMinutes} мин` : 'в реальном времени'}</span></div>
          <div className="grid grid-cols-3 gap-1 bg-[#0c0c0e] p-0.5 rounded-lg border border-white/[0.08]">
            {([0, 10, 30] as const).map((minutes) => (
              <button key={minutes} type="button" data-testid={`sync-interval-${minutes}`} onClick={() => { syncEngine.setBgSyncInterval(minutes); setConfig(syncEngine.getConfig()); }} className={`py-1 text-2xs rounded-md ${config.bgSyncIntervalMinutes === minutes ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>
                {minutes === 0 ? 'Мгновенно' : minutes === 10 ? '10 минут' : '30 минут (батарея)'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
          <div><div className="text-xs font-semibold text-zinc-200">Смена ключа хранилища</div><p className="text-2xs text-zinc-500">Все устройства потребуют нового приглашения.</p></div>
        </div>
        <button type="button" disabled={locked} onClick={() => {
          if (!window.confirm('Сменить ключ хранилища? Доступ остальных устройств будет остановлен.')) return;
          void syncEngine.rotateVaultKey().then(() => addToast?.('Ключ хранилища изменён', 'success'));
        }} className="px-3 py-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs rounded-lg disabled:opacity-40">Сменить ключ</button>
      </section>

      {isPairModalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setIsPairModalOpen(false); }}>
          <div data-testid="pair-device-modal" role="dialog" aria-modal="true" className="w-full max-w-sm bg-[#121215] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-semibold text-white">Привязка устройства</span>
              <button type="button" aria-label="Закрыть привязку" onClick={() => setIsPairModalOpen(false)} className="p-1 text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-1 bg-[#0c0c0e] p-1 rounded-xl border border-white/[0.06]">
                <button type="button" data-testid="pair-modal-tab-host" onClick={() => { setPairMode('host'); if (!hostPin) void handleGeneratePin(); }} className={`py-1.5 rounded-lg text-xs ${pairMode === 'host' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>Показать PIN</button>
                <button type="button" data-testid="pair-modal-tab-guest" onClick={() => { setPairMode('guest'); setPendingApproval(null); }} className={`py-1.5 rounded-lg text-xs ${pairMode === 'guest' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>Ввести PIN</button>
              </div>
              {pairError && <p className="text-2xs text-rose-400">{pairError}</p>}
              {pairMode === 'host' ? (
                pendingApproval ? (
                  <div className="flex flex-col gap-3 py-2">
                    <div className="text-xs text-white">Запрос на подключение</div>
                    <div className="font-mono text-lg text-emerald-400">Код проверки: <strong>{pendingApproval.sas}</strong></div>
                    <p className="text-2xs text-zinc-400">Сверьте код на втором устройстве. Будет открыт доступ только к текущему хранилищу.</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => void handleRejectPairing()} className="px-3 py-1.5 text-xs text-zinc-400">Отклонить</button>
                      <button type="button" disabled={isApproving} onClick={() => void handleApprovePairing()} className="px-3.5 py-1.5 bg-white text-black font-semibold text-xs rounded-lg disabled:opacity-50">{isApproving ? 'Подтверждение…' : 'Разрешить доступ'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-3">
                    <span className="text-2xs text-zinc-500 font-mono">ОДНОРАЗОВЫЙ КОД</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-bold tracking-widest text-white">{isGeneratingPin ? '…' : hostPin || '000-000'}</span>
                      {hostPin && <button type="button" aria-label="Скопировать PIN" onClick={() => void copyToClipboard(hostPin, 'pin')} className="p-1.5 text-zinc-400">{copiedKey === 'pin' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}</button>}
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
                  }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleClaimGuestPin(); } }} maxLength={7} className="w-full bg-[#0c0c0e] border border-white/[0.08] rounded-xl px-3 py-2 text-center font-mono text-lg tracking-widest text-white outline-none" />
                  <button type="button" disabled={isClaimingPin || guestInputPin.length !== 7} onClick={() => void handleClaimGuestPin()} className="w-full py-2 bg-white text-black font-semibold text-xs rounded-xl disabled:opacity-50">{isClaimingPin ? 'Связывание…' : 'Подключить устройство'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {managingDevice && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) setManagingDevice(null); }}>
          <div className="w-full max-w-sm bg-[#121215] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /><span className="text-xs font-semibold">Доступ к хранилищам</span></div>
              <button type="button" aria-label="Закрыть доступ" onClick={() => setManagingDevice(null)} className="p-1 text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div><div className="text-xs text-white">{managingDevice.name}</div><div className="font-mono text-2xs text-zinc-500">{managingDevice.id}</div></div>
              {'status' in managingDevice && (
                <div className="flex gap-1 bg-[#0c0c0e] p-0.5 rounded-lg border border-white/[0.06]">
                  {(['read-write', 'receive-only'] as const).map((mode) => <button key={mode} type="button" onClick={() => setGrantMode(mode)} className={`flex-1 py-1 text-2xs rounded ${grantMode === mode ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>{mode === 'read-write' ? 'Чтение и изменение' : 'Только чтение'}</button>)}
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
                    <button key={vault.id} type="button" onClick={() => void handleToggleVaultAccess(vault.id)} className="flex items-center justify-between py-2 border-t border-white/[0.04] text-left">
                      <div className="flex items-center gap-2 min-w-0"><Database className="w-3.5 h-3.5 text-zinc-500" /><span className="text-xs text-white truncate">{getVaultDisplayName(vault, vaults)}</span></div>
                      <span className={`text-[10px] font-mono ${allowed ? 'text-emerald-400' : 'text-zinc-500'}`}>{grant?.status === 'pending' ? 'Ожидает' : grant?.status === 'accepted' ? (grant.mode === 'receive-only' ? 'Только чтение' : 'Подключено') : allowed ? 'Разрешено' : 'Запрещено'}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-2xs text-zinc-500 text-center">Новый доступ появится на другом устройстве как приглашение. Отзыв не удаляет локальную копию.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
