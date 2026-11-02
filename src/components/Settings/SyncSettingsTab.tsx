import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  Laptop,
  Smartphone,
  Copy,
  Check,
  Trash2,
  Server,
  Loader2,
  X,
  Edit2,
  KeyRound,
  Bot,
  Plus,
} from 'lucide-react';
import { syncEngine } from '../../lib/sync/syncEngine';
import {
  createPairingSession,
  claimPairingSession,
  approvePairingSession,
  rejectPairingSession,
  pollPairingSession,
  pollPairingPayload,
} from '../../lib/sync/pairing';
import { validateMnemonic } from '../../lib/sync/crypto';
import type { SyncStatus, SyncConfig, DeviceSyncMode, PairingExchangePayload } from '../../lib/sync/types';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';

interface SyncSettingsTabProps {
  addToast?: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const SyncSettingsTab: React.FC<SyncSettingsTabProps> = ({ addToast }) => {
  const { switchVault, createVault } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());

  // Pair modal dialog state
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);

  // Pair mode: 'host' (get PIN) vs 'guest' (enter PIN)
  const [pairMode, setPairMode] = useState<'host' | 'guest'>('host');

  // PIN host state
  const [hostPin, setHostPin] = useState<string | null>(null);
  const [hostSessionId, setHostSessionId] = useState<string | null>(null);
  const [hostPinTtl, setHostPinTtl] = useState<number>(300);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);

  // Host approval request state (when a guest enters PIN)
  const [pendingApprovalSas, setPendingApprovalSas] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // PIN guest state
  const [guestInputPin, setGuestInputPin] = useState('');
  const [guestSasCode, setGuestSasCode] = useState<string | null>(null);
  const [isClaimingPin, setIsClaimingPin] = useState(false);
  const [isGuestWaitingApproval, setIsGuestWaitingApproval] = useState(false);

  // Inline device rename state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');

  // Server state
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);

  // Clipboard copy tracker
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isPollingRef = useRef(false);

  useEffect(() => {
    if (!isPairModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPairModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPairModalOpen]);

  useEffect(() => {
    const unsub = syncEngine.subscribe((st) => {
      setStatus(st);
      setConfig(syncEngine.getConfig());
    });
    return unsub;
  }, []);

  // Countdown timer for host PIN
  useEffect(() => {
    if (!hostPin || hostPinTtl <= 0) return;
    const interval = setInterval(() => {
      setHostPinTtl((prev) => {
        if (prev <= 1) {
          setHostPin(null);
          setHostSessionId(null);
          setPendingApprovalSas(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hostPin, hostPinTtl]);

  // Host background polling for guest claim -> triggers approval card
  useEffect(() => {
    if (!hostSessionId || pendingApprovalSas) return;

    let active = true;
    const pollInterval = setInterval(async () => {
      if (!active || isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        const res = await pollPairingSession(config.serverUrl, hostSessionId);
        if (active && res.status === 'pending_approval' && res.sasCode) {
          setPendingApprovalSas(res.sasCode);
          setIsPairModalOpen(true);
          setPairMode('host');
        }
      } catch {
        // silent transient poll error
      } finally {
        isPollingRef.current = false;
      }
    }, 1500);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [hostSessionId, pendingApprovalSas, config.serverUrl]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    addToast?.('Скопировано в буфер обмена', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleManualSync = async () => {
    addToast?.('Запуск синхронизации...', 'info');
    await syncEngine.pushLocalChanges();
  };

  const handleGeneratePin = async () => {
    setIsGeneratingPin(true);
    setPendingApprovalSas(null);
    try {
      const session = await createPairingSession(config.serverUrl, config.deviceId);
      setHostPin(session.pin);
      setHostSessionId(session.sessionId);
      setHostPinTtl(session.expiresIn);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast?.(`Ошибка генерации: ${msg}`, 'error');
    } finally {
      setIsGeneratingPin(false);
    }
  };

  const handleOpenPairModal = () => {
    setIsPairModalOpen(true);
    setPairMode('host');
    setPendingApprovalSas(null);
    if (!hostPin) {
      void handleGeneratePin();
    }
  };

  const handleApprovePairing = async () => {
    if (!hostSessionId || !pendingApprovalSas) {
      return;
    }
    setIsApproving(true);
    try {
      const currentVault = storage.getCurrentVault();
      const payload: PairingExchangePayload = {
        seedPhrase: config.seedPhrase,
        vaultId: currentVault.id,
        vaultName: currentVault.name,
      };
      const ok = await approvePairingSession(
        config.serverUrl,
        hostSessionId,
        JSON.stringify(payload)
      );
      if (ok) {
        syncEngine.addTrustedDevice({
          id: `slag-guest-${pendingApprovalSas}`,
          name: `Устройство ${pendingApprovalSas}`,
          platform: 'mobile',
          isCurrent: false,
          syncMode: 'read-write',
          canRunAiLease: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: 'Только что',
        });
        setConfig(syncEngine.getConfig());
        addToast?.('Устройство успешно подтверждено и добавлено', 'success');
        setHostPin(null);
        setHostSessionId(null);
        setPendingApprovalSas(null);
        setIsPairModalOpen(false);
      } else {
        throw new Error('Сервер отклонил подтверждение');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast?.(`Ошибка подтверждения: ${msg}`, 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectPairing = async () => {
    if (!hostSessionId) return;
    setIsRejecting(true);
    try {
      await rejectPairingSession(config.serverUrl, hostSessionId);
      addToast?.('Запрос на сопряжение отклонен', 'info');
      setHostPin(null);
      setHostSessionId(null);
      setPendingApprovalSas(null);
      setIsPairModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast?.(`Ошибка: ${msg}`, 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleClaimGuestPin = async () => {
    if (!guestInputPin.trim()) return;
    setIsClaimingPin(true);
    setGuestSasCode(null);
    try {
      const ephemeralPk = `pk_eph_${Math.random().toString(36).slice(2, 10)}`;
      const claimed = await claimPairingSession(config.serverUrl, guestInputPin.trim(), ephemeralPk);
      setGuestSasCode(claimed.sasCode);
      setIsGuestWaitingApproval(true);
      addToast?.(`Код проверки: ${claimed.sasCode}. Подтвердите на основном устройстве.`, 'info');

      // Poll until host approves or rejects
      const rawPayload = await pollPairingPayload(
        config.serverUrl,
        claimed.sessionId,
        config.deviceId,
        60_000,
        1500
      );

      let receivedSeed = '';
      let targetVaultId = 'default_vault';
      let targetVaultName = 'main';

      try {
        const parsed = JSON.parse(rawPayload);
        if (parsed && typeof parsed === 'object' && parsed.seedPhrase) {
          receivedSeed = parsed.seedPhrase;
          targetVaultId = parsed.vaultId || 'default_vault';
          targetVaultName = parsed.vaultName || 'main';
        } else {
          receivedSeed = rawPayload;
        }
      } catch {
        receivedSeed = rawPayload;
      }

      if (!receivedSeed || !validateMnemonic(receivedSeed)) {
        throw new Error('Получен некорректный ключ');
      }

      const allVaults = storage.getVaults();
      const existingVault = allVaults.find((v) => v.id === targetVaultId);

      if (existingVault) {
        // Merge with existing matching vault
        switchVault(existingVault.id);
        await syncEngine.updateSeedPhrase(receivedSeed);
        addToast?.(`Слияние с хранилищем «${existingVault.name}»`, 'success');
      } else {
        // Create an isolated separate vault with this exact vault ID
        createVault(targetVaultName, 'indexeddb', undefined, targetVaultId);
        await syncEngine.updateSeedPhrase(receivedSeed);
        addToast?.(`Создано отдельное хранилище «${targetVaultName}»`, 'success');
      }

      setConfig(syncEngine.getConfig());
      setGuestInputPin('');
      setGuestSasCode(null);
      setIsGuestWaitingApproval(false);
      setIsPairModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast?.(`${msg}`, 'error');
      setIsGuestWaitingApproval(false);
      setGuestSasCode(null);
    } finally {
      setIsClaimingPin(false);
    }
  };

  const handleTestServerConnection = async () => {
    setIsTestingServer(true);
    setServerStatusMessage(null);
    try {
      const cleanUrl = serverUrlInput.replace(/\/+$/, '');
      const start = Date.now();
      const res = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(4000) });
      const elapsed = Date.now() - start;
      if (res.ok) {
        const data = await res.json();
        setServerStatusMessage(`${data.service} v${data.version || '0.1.0'} (${elapsed} ms)`);
        await syncEngine.updateServerUrl(cleanUrl);
        setConfig(syncEngine.getConfig());
        addToast?.('Сервер синхронизации сохранен', 'success');
      } else {
        setServerStatusMessage(`HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setServerStatusMessage(`Ошибка: ${msg}`);
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingDeviceId(id);
    setEditingDeviceName(currentName);
  };

  const handleSaveRename = () => {
    if (!editingDeviceId) return;
    syncEngine.renameDevice(editingDeviceId, editingDeviceName);
    setConfig(syncEngine.getConfig());
    setEditingDeviceId(null);
    addToast?.('Имя устройства обновлено', 'info');
  };

  const handleToggleSyncMode = (id: string, currentMode?: DeviceSyncMode) => {
    const next: DeviceSyncMode = currentMode === 'receive-only' ? 'read-write' : 'receive-only';
    syncEngine.setDeviceSyncMode(id, next);
    setConfig(syncEngine.getConfig());
    addToast?.(`Режим синхронизации: ${next === 'read-write' ? 'Полный доступ' : 'Только чтение'}`, 'info');
  };

  const handleToggleAiLease = (id: string, currentCanRun?: boolean) => {
    const next = !currentCanRun;
    syncEngine.setDeviceAiLease(id, next);
    setConfig(syncEngine.getConfig());
    addToast?.(`AI-воркер: ${next ? 'включен' : 'отключен'}`, 'info');
  };

  const handleRotateKey = async () => {
    const confirmed = window.confirm(
      'Внимание! Будет сгенерирован новый ключ шифрования и создана новая комната на релее.\n' +
      'Все другие устройства потеряют доступ к синхронизации, пока не будут заново сопряжены по новому PIN-коду.\n\n' +
      'Выполнить ротацию ключа?'
    );
    if (!confirmed) return;

    try {
      await syncEngine.rotateVaultKey();
      setConfig(syncEngine.getConfig());
      addToast?.('Ключ хранилища ротирован, создана новая чистая комната', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast?.(`Ошибка ротации: ${msg}`, 'error');
    }
  };

  const formatTtl = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const sub = status.subscription;

  return (
    <div className="flex flex-col gap-3 text-zinc-100">
      {/* 1. Unified Subscription & Relay Connection Card */}
      <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        {/* Top: Plan Badge + Status Indicator + Quick Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  status.state === 'connected'
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : status.state === 'syncing'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-zinc-600'
                }`}
              />
              <span className="text-xs font-semibold text-white tracking-wide">
                {sub.planLabel}
              </span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                sub.plan === 'angry'
                  ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                  : sub.plan === 'smile' || sub.plan === 'pro'
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                  : 'text-zinc-400 bg-white/[0.04] border border-white/[0.06]'
              }`}
            >
              E2EE · {sub.plan === 'angry' ? '50 ГБ' : sub.plan === 'smile' || sub.plan === 'pro' ? '10 ГБ' : '1 ГБ'}
            </span>
            {status.pingMs !== null && status.state === 'connected' && (
              <span className="font-mono text-2xs text-zinc-500 hidden sm:inline">
                {status.pingMs} ms
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={status.state === 'syncing'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.96] border border-white/[0.06] rounded-md transition-all cursor-pointer disabled:opacity-50"
              title="Синхронизировать сейчас"
            >
              <RefreshCw className={`w-3 h-3 ${status.state === 'syncing' ? 'animate-spin text-amber-400' : 'text-zinc-400'}`} />
              <span>{status.state === 'syncing' ? 'Синхронизация...' : 'Синхронизировать'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (sub.plan === 'self-hosted') {
                  addToast?.('Self-hosted релей работает без ограничений', 'info');
                } else {
                  addToast?.(`Тариф ${sub.planLabel}: кеш до ${sub.maxCacheMb >= 1024 ? `${sub.maxCacheMb / 1024} ГБ` : `${sub.maxCacheMb} МБ`}, очищается сразу после синхронизации.`, 'info');
                }
              }}
              className="px-2 py-1 text-2xs text-zinc-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors cursor-pointer active:scale-[0.96]"
            >
              {sub.plan === 'self-hosted' ? 'Инфо' : 'Управление'}
            </button>
          </div>
        </div>

        {/* Bottom Details: Devices, Cache, Last Sync */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-zinc-400 border-t border-white/[0.04] pt-2">
          <span>
            {sub.plan === 'self-hosted'
              ? 'Свой сервер'
              : `активен до ${sub.expiresFormatted}`}
          </span>
          <span className="text-zinc-600">·</span>
          <span>{sub.activeDevices} из {sub.maxDevices} устройств</span>
          <span className="text-zinc-600">·</span>
          <span className="font-mono text-zinc-300">
            кеш {sub.usedCacheMb} МБ / {sub.maxCacheMb >= 1024 ? `${sub.maxCacheMb / 1024} ГБ` : `${sub.maxCacheMb} МБ`}
          </span>
          {status.lastSyncTime && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500">сверка: {status.lastSyncTime}</span>
            </>
          )}
        </div>
      </div>

      {/* 2. Trusted Devices List (Linear Dark: flat rows, 2-line typography, with '+ Привязать устройство' action) */}
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">Доверенные устройства</span>
            <span className="text-[11px] font-mono text-zinc-500">
              {1 + config.trustedDevices.length} / {sub.maxDevices}
            </span>
          </div>

          <button
            type="button"
            data-testid="btn-open-pair-modal"
            onClick={handleOpenPairModal}
            className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.96] border border-white/[0.06] rounded-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Привязать устройство</span>
          </button>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {/* Current Device Row */}
          <div className="py-2.5 flex items-center justify-between gap-3 group/dev">
            <div className="flex items-center gap-3 min-w-0">
              <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {editingDeviceId === config.deviceId ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingDeviceName}
                      onChange={(e) => setEditingDeviceName(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') setEditingDeviceId(null);
                      }}
                      className="bg-[#0c0c0e] border border-white/20 rounded px-1.5 py-0.5 text-xs text-white outline-none font-medium"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartRename(config.deviceId, config.deviceName)}
                      className="text-xs text-zinc-200 font-medium hover:text-white text-left cursor-pointer flex items-center gap-1.5 truncate group"
                      title="Кликните для переименования"
                    >
                      <span className="truncate">{config.deviceName}</span>
                      <Edit2 className="w-3 h-3 text-zinc-600 opacity-0 group-hover/dev:opacity-100 group-hover:text-zinc-300 transition-all shrink-0" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 mt-0.5">
                  <span>{config.deviceId}</span>
                  <span>·</span>
                  <span className="text-zinc-400">это устройство</span>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-emerald-400/90">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>онлайн</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {/* Sync Mode Toggle - Clean text link, no bulky chip */}
              <button
                type="button"
                onClick={() => handleToggleSyncMode(config.deviceId, config.localSyncMode)}
                className={`text-[11px] font-mono transition-colors cursor-pointer ${
                  config.localSyncMode === 'receive-only'
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Переключить режим синхронизации"
              >
                {config.localSyncMode === 'receive-only' ? 'Только чтение' : 'Полный доступ'}
              </button>

              {/* AI Worker Toggle - Minimal monochrome icon */}
              <button
                type="button"
                onClick={() => handleToggleAiLease(config.deviceId, config.canRunAiLease)}
                className={`p-1 transition-colors cursor-pointer ${
                  config.canRunAiLease !== false
                    ? 'text-zinc-300 hover:text-white'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title={config.canRunAiLease !== false ? 'AI-воркер активен' : 'AI-воркер отключен'}
              >
                <Bot className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Trusted Devices from Config */}
          {config.trustedDevices.map((dev) => (
            <div key={dev.id} className="py-2.5 flex items-center justify-between gap-3 group/dev">
              <div className="flex items-center gap-3 min-w-0">
                {dev.platform === 'mobile' ? (
                  <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />
                ) : (
                  <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {editingDeviceId === dev.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingDeviceName}
                        onChange={(e) => setEditingDeviceName(e.target.value)}
                        onBlur={handleSaveRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename();
                          if (e.key === 'Escape') setEditingDeviceId(null);
                        }}
                        className="bg-[#0c0c0e] border border-white/20 rounded px-1.5 py-0.5 text-xs text-white outline-none font-medium"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartRename(dev.id, dev.name)}
                        className="text-xs text-zinc-200 font-medium hover:text-white text-left cursor-pointer flex items-center gap-1.5 truncate group"
                        title="Кликните для переименования"
                      >
                        <span className="truncate">{dev.name}</span>
                        <Edit2 className="w-3 h-3 text-zinc-600 opacity-0 group-hover/dev:opacity-100 group-hover:text-zinc-300 transition-all shrink-0" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 mt-0.5">
                    <span>{dev.id}</span>
                    <span>·</span>
                    <span className="text-zinc-500">{dev.lastSeenAt ? `активность ${dev.lastSeenAt.split('T')[0]}` : 'сопряжено'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {/* Sync Mode Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleSyncMode(dev.id, dev.syncMode)}
                  className={`text-[11px] font-mono transition-colors cursor-pointer ${
                    dev.syncMode === 'receive-only'
                      ? 'text-amber-400 hover:text-amber-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Переключить режим синхронизации"
                >
                  {dev.syncMode === 'receive-only' ? 'Только чтение' : 'Полный доступ'}
                </button>

                {/* AI Lease Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleAiLease(dev.id, dev.canRunAiLease)}
                  className={`p-1 transition-colors cursor-pointer ${
                    dev.canRunAiLease
                      ? 'text-zinc-300 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                  title={dev.canRunAiLease ? 'AI-воркер разрешен' : 'AI-воркер запрещен'}
                >
                  <Bot className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    syncEngine.removeTrustedDevice(dev.id);
                    setConfig(syncEngine.getConfig());
                    addToast?.('Устройство удалено', 'info');
                  }}
                  className="p-1 text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Flat Relay Server Settings */}
      <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">Сервер ретрансляции</span>
          {serverStatusMessage && (
            <span className="font-mono text-2xs text-zinc-400">{serverStatusMessage}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Server className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="http://152.53.199.71:8320"
              className="w-full bg-[#0c0c0e] border border-white/[0.08] rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono text-white placeholder-zinc-600 outline-none focus:border-white/20"
            />
          </div>
          <button
            type="button"
            onClick={handleTestServerConnection}
            disabled={isTestingServer}
            className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] active:scale-95 text-xs text-zinc-300 hover:text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {isTestingServer ? 'Тест...' : 'Проверить'}
          </button>
        </div>

        <label className="flex items-center justify-between cursor-pointer pt-1">
          <span className="text-2xs text-zinc-400">Автоматическая синхронизация при сохранении</span>
          <input
            type="checkbox"
            checked={config.autoSync}
            onChange={(e) => {
              syncEngine.saveConfig({ autoSync: e.target.checked });
              setConfig(syncEngine.getConfig());
            }}
            className="w-3.5 h-3.5 accent-white cursor-pointer"
          />
        </label>

        {/* Battery Saver & Background Interval */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.04]">
          <div className="flex items-center justify-between">
            <span className="text-2xs text-zinc-400">Фоновая синхронизация</span>
            <span className="text-2xs text-zinc-500 font-mono">
              {config.bgSyncIntervalMinutes ? `${config.bgSyncIntervalMinutes} мин` : 'в реальном времени'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-[#0c0c0e] p-0.5 rounded-lg border border-white/[0.08]">
            <button
              type="button"
              data-testid="sync-interval-0"
              onClick={() => {
                syncEngine.setBgSyncInterval(0);
                setConfig(syncEngine.getConfig());
              }}
              className={`py-1 text-2xs font-medium rounded-md transition-all cursor-pointer ${
                !config.bgSyncIntervalMinutes
                  ? 'bg-white/10 text-white border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Мгновенно
            </button>
            <button
              type="button"
              data-testid="sync-interval-10"
              onClick={() => {
                syncEngine.setBgSyncInterval(10);
                setConfig(syncEngine.getConfig());
              }}
              className={`py-1 text-2xs font-medium rounded-md transition-all cursor-pointer ${
                config.bgSyncIntervalMinutes === 10
                  ? 'bg-white/10 text-white border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              10 минут
            </button>
            <button
              type="button"
              data-testid="sync-interval-30"
              onClick={() => {
                syncEngine.setBgSyncInterval(30);
                setConfig(syncEngine.getConfig());
              }}
              className={`py-1 text-2xs font-medium rounded-md transition-all cursor-pointer ${
                config.bgSyncIntervalMinutes === 30
                  ? 'bg-white/10 text-white border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              30 минут (батарея)
            </button>
          </div>
        </div>
      </div>

      {/* 6. Security & Panic Re-keying (Key Rotation) */}
      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
          <div>
            <span className="text-xs font-semibold text-zinc-200">Смена ключа (Panic Re-keying)</span>
            <p className="text-2xs text-zinc-500">
              Генерирует новую сид-фразу и пересоздаёт комнату. Все остальные девайсы потеряют доступ.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRotateKey}
          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap active:scale-[0.96]"
        >
          Сменить ключ
        </button>
      </div>

      {/* Pair Device Modal Dialog */}
      {isPairModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPairModalOpen(false);
          }}
        >
          <div
            data-testid="pair-device-modal"
            className="w-full max-w-sm bg-[#121215] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 select-none"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Привязка устройства</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.2 rounded">
                  E2EE
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPairModalOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex flex-col gap-4">
              {/* Segmented Mode Selector */}
              <div className="grid grid-cols-2 gap-1 bg-[#0c0c0e] p-1 rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  data-testid="pair-modal-tab-host"
                  onClick={() => {
                    setPairMode('host');
                    setPendingApprovalSas(null);
                    if (!hostPin) void handleGeneratePin();
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    pairMode === 'host'
                      ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Показать PIN
                </button>
                <button
                  type="button"
                  data-testid="pair-modal-tab-guest"
                  onClick={() => {
                    setPairMode('guest');
                    setPendingApprovalSas(null);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    pairMode === 'guest'
                      ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Ввести PIN
                </button>
              </div>

              {pairMode === 'host' ? (
                /* Host View */
                pendingApprovalSas ? (
                  /* Case A: Host sees Approval Request */
                  <div className="flex flex-col gap-3 p-4 bg-white/[0.02] border border-white/20 rounded-xl animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">Запрос на подключение</span>
                      <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        <span>Код проверки:</span>
                        <strong className="tracking-wider">{pendingApprovalSas}</strong>
                      </div>
                    </div>
                    <p className="text-2xs text-zinc-400">
                      Сверьте 4 цифры на втором экране. Разрешить доступ к заметкам?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleRejectPairing}
                        disabled={isRejecting || isApproving}
                        className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs text-zinc-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                      >
                        Отклонить
                      </button>
                      <button
                        type="button"
                        onClick={handleApprovePairing}
                        disabled={isApproving || isRejecting}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-black font-semibold text-xs hover:bg-zinc-200 active:scale-95 rounded-lg transition-colors cursor-pointer"
                      >
                        {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Разрешить доступ</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Case B: Ready PIN */
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-full flex flex-col items-center justify-center gap-2.5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="text-2xs text-zinc-500 font-mono uppercase tracking-wider">
                        Одноразовый код
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-2xl font-bold tracking-widest text-white">
                          {isGeneratingPin ? '...' : hostPin || '000-000'}
                        </span>
                        {hostPin && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(hostPin, 'hostPin')}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer"
                            title="Скопировать"
                          >
                            {copiedKey === 'hostPin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                      <span className="font-mono text-2xs text-zinc-500">
                        {isGeneratingPin ? 'генерация...' : `Действует: ${formatTtl(hostPinTtl)}`}
                      </span>
                    </div>

                    <p className="text-2xs text-zinc-500 text-center leading-relaxed">
                      Введите этот 6-значный код на втором устройстве для мгновенной привязки.
                    </p>
                  </div>
                )
              ) : (
                /* Guest View */
                isGuestWaitingApproval && guestSasCode ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-6 px-4 bg-white/[0.02] border border-white/[0.08] rounded-xl animate-in fade-in">
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs text-zinc-200">
                        Код проверки: <strong className="font-mono text-emerald-400">{guestSasCode}</strong>
                      </span>
                      <span className="text-2xs text-zinc-500">
                        Подтвердите подключение на первом устройстве...
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 py-1">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-2xs text-zinc-400">PIN с первого устройства</label>
                      <input
                        type="text"
                        autoFocus
                        placeholder="123-456"
                        value={guestInputPin}
                        onChange={(e) => setGuestInputPin(e.target.value)}
                        maxLength={8}
                        className="w-full bg-[#0c0c0e] border border-white/[0.08] rounded-xl px-3 py-2 text-center font-mono text-lg tracking-widest text-white placeholder-zinc-700 outline-none focus:border-white/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleClaimGuestPin}
                      disabled={isClaimingPin || !guestInputPin.trim()}
                      className="w-full py-2 bg-white text-black font-semibold text-xs hover:bg-zinc-200 active:scale-95 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isClaimingPin ? 'Связывание...' : 'Подключить устройство'}
                    </button>
                    <p className="text-2xs text-zinc-500 text-center">
                      Нажмите «Показать PIN» на основном устройстве и перепишите 6 цифр сюда.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
