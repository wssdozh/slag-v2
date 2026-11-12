// Pairing controller: host PIN, guest claim, SAS approval and the polling loop.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useApp } from '../../../context/AppContext';
import { storage } from '../../../lib/storage';
import { accountClient } from '../../../lib/sync/account';
import type { AccountDevice } from '../../../lib/sync/accountTypes';
import { encryptVaultKeyForDevice } from '../../../lib/sync/accountCrypto';
import { validateMnemonic } from '../../../lib/sync/crypto';
import {
  approveAccountPairingSession,
  approvePairingSession,
  claimPairingSession,
  createPairingSession,
  pollPairingPayload,
  pollPairingSession,
  rejectPairingSession,
} from '../../../lib/sync/pairing';
import { syncEngine } from '../../../lib/sync/syncEngine';
import type { PairingExchangePayload, SyncConfig } from '../../../lib/sync/types';
import { installSharedVault } from '../../../lib/sync/vaultSharing';

export interface DevicePairingController {
  isModalOpen: boolean;
  pairMode: 'host' | 'guest';
  hostPin: string | null;
  hostPinTtl: number;
  pendingApproval: { sas: string; guestDeviceId?: string } | null;
  isGeneratingPin: boolean;
  isApproving: boolean;
  guestInputPin: string;
  guestSasCode: string | null;
  isClaimingPin: boolean;
  openModal: () => void;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
  selectHostTab: () => void;
  selectGuestTab: () => void;
  setGuestInputPin: (value: string) => void;
  approvePairing: () => Promise<void>;
  rejectPairing: () => Promise<void>;
  claimGuestPin: () => Promise<void>;
  copyToClipboard: (text: string) => Promise<void>;
  formatTtl: (seconds: number) => string;
}

interface UseDevicePairingOptions {
  config: SyncConfig;
  hosted: boolean;
  locked: boolean;
  accountDevices: AccountDevice[];
}

export function useDevicePairing({ config, hosted, locked, accountDevices }: UseDevicePairingOptions): DevicePairingController {
  const { switchVault, createVault, addToast } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pairMode, setPairMode] = useState<'host' | 'guest'>('host');
  const [hostPin, setHostPin] = useState<string | null>(null);
  const [hostSessionId, setHostSessionId] = useState<string | null>(null);
  const [hostPinTtl, setHostPinTtl] = useState(300);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ sas: string; guestDeviceId?: string } | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [guestInputPin, setGuestInputPin] = useState('');
  const [guestSasCode, setGuestSasCode] = useState<string | null>(null);
  const [isClaimingPin, setIsClaimingPin] = useState(false);
  const isPollingRef = useRef(false);

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
          setIsModalOpen(true);
          setPairMode('host');
        }
      } catch (error) {
        if (active) {
          addToast(`Не удалось проверить привязку: ${error instanceof Error ? error.message : String(error)}`, 'error');
          setHostSessionId(null);
          setHostPin(null);
        }
      } finally {
        isPollingRef.current = false;
      }
    }, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [config.serverUrl, hostSessionId, pendingApproval, addToast]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast('Скопировано в буфер обмена', 'success');
    } catch (error) {
      addToast(`Не удалось скопировать PIN: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const generatePin = async () => {
    if (locked) return;
    setIsGeneratingPin(true);
    setPendingApproval(null);
    try {
      const session = await createPairingSession(config.serverUrl, config.deviceId);
      setHostPin(session.pin);
      setHostSessionId(session.sessionId);
      setHostPinTtl(session.expiresIn);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast(`Ошибка генерации: ${message}`, 'error');
    } finally {
      setIsGeneratingPin(false);
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
    setPairMode('host');
    if (!hostPin) void generatePin();
  };

  const selectHostTab = () => {
    setPairMode('host');
    if (!hostPin) void generatePin();
  };

  const selectGuestTab = () => {
    setPairMode('guest');
    setPendingApproval(null);
  };

  const approvePairing = async () => {
    if (!hostSessionId || !pendingApproval) return;
    setIsApproving(true);
    try {
      const currentVault = storage.getCurrentVault();
      let ok: boolean;
      if (hosted) {
        const guest = accountDevices.find((device) => device.id === pendingApproval.guestDeviceId);
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
      addToast(`Устройство подключено к «${currentVault.name}»`, 'success');
      setHostPin(null);
      setHostSessionId(null);
      setPendingApproval(null);
      setIsModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast(`Ошибка подтверждения: ${message}`, 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const rejectPairing = async () => {
    if (!hostSessionId) return;
    try {
      await rejectPairingSession(config.serverUrl, hostSessionId);
      setHostPin(null);
      setHostSessionId(null);
      setPendingApproval(null);
      setIsModalOpen(false);
    } catch (error) {
      addToast(`Не удалось отклонить привязку: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const claimGuestPin = async () => {
    if (!guestInputPin.trim() || locked) return;
    setIsClaimingPin(true);
    setGuestSasCode(null);
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
        addToast(
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
        addToast(`Хранилище «${parsed.vaultName}» подключено`, 'success');
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
      setIsModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast(message, 'error');
      setGuestSasCode(null);
    } finally {
      setIsClaimingPin(false);
    }
  };

  const formatTtl = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return {
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
    openModal,
    setModalOpen: setIsModalOpen,
    selectHostTab,
    selectGuestTab,
    setGuestInputPin,
    approvePairing,
    rejectPairing,
    claimGuestPin,
    copyToClipboard,
    formatTtl,
  };
}
