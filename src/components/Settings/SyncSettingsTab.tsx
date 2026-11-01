import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  Laptop,
  Smartphone,
  Copy,
  Check,
  Trash2,
  Server,
  Shield,
  Loader2,
  X,
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
import type { SyncStatus, SyncConfig } from '../../lib/sync/types';

interface SyncSettingsTabProps {
  addToast?: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const SyncSettingsTab: React.FC<SyncSettingsTabProps> = ({ addToast }) => {
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());

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

  // Server state
  const [serverUrlInput, setServerUrlInput] = useState(config.serverUrl);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);

  // Clipboard copy tracker
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isPollingRef = useRef(false);

  useEffect(() => {
    const unsub = syncEngine.subscribe((st) => setStatus(st));
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

  const handleApprovePairing = async () => {
    if (!hostSessionId || !pendingApprovalSas) {
      console.log('APPROVE_ABORT_MISSING_IDS:', { hostSessionId, pendingApprovalSas });
      return;
    }
    setIsApproving(true);
    try {
      const ok = await approvePairingSession(config.serverUrl, hostSessionId, config.seedPhrase);
      console.log('APPROVE_PAIRING_RESULT:', { ok });
      if (ok) {
        syncEngine.addTrustedDevice({
          id: `slag-guest-${pendingApprovalSas}`,
          name: `Устройство ${pendingApprovalSas}`,
          platform: 'mobile',
          isCurrent: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: 'Только что',
        });
        setConfig(syncEngine.getConfig());
        addToast?.('Устройство успешно подтверждено и добавлено', 'success');
        setHostPin(null);
        setHostSessionId(null);
        setPendingApprovalSas(null);
      } else {
        throw new Error('Сервер отклонил подтверждение');
      }
    } catch (err: unknown) {
      console.error('APPROVE_PAIRING_ERROR:', err);
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
      const receivedSeed = await pollPairingPayload(config.serverUrl, claimed.sessionId, config.deviceId, 60_000, 1500);
      if (receivedSeed && validateMnemonic(receivedSeed)) {
        await syncEngine.updateSeedPhrase(receivedSeed);
        setConfig(syncEngine.getConfig());
        addToast?.('Устройство синхронизировано с хранилищем', 'success');
        setGuestInputPin('');
        setGuestSasCode(null);
        setIsGuestWaitingApproval(false);
      } else {
        throw new Error('Получен некорректный ключ');
      }
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

  const formatTtl = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const sub = status.subscription;

  return (
    <div className="flex flex-col gap-3 text-zinc-100">
      {/* 1. Subscription & Account Status Card (Variant A) */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-wide">
                {sub.planLabel}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.2 rounded">
                E2EE
              </span>
            </div>
            <span className="text-2xs text-zinc-400 mt-0.5">
              {sub.plan === 'self-hosted' ? (
                'без ограничений по сроку и устройствам'
              ) : (
                <>
                  активен до {sub.expiresFormatted} · {sub.activeDevices} из {sub.maxDevices} устройств
                </>
              )}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (sub.plan === 'self-hosted') {
              addToast?.('Self-hosted релей работает без ограничений', 'info');
            } else {
              addToast?.(`Подписка активна до ${sub.expiresFormatted}. Продление доступно на сайте.`, 'info');
            }
          }}
          className="px-2.5 py-1 text-2xs text-zinc-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors cursor-pointer"
        >
          {sub.plan === 'self-hosted' ? 'Инфо' : 'Управление'}
        </button>
      </div>

      {/* 2. Flat Relay Connection Bar */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              status.state === 'connected'
                ? 'bg-emerald-500'
                : status.state === 'syncing'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-zinc-600'
            }`}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-200">
                {status.state === 'connected'
                  ? 'Синхронизация активна'
                  : status.state === 'syncing'
                  ? 'Синхронизация дельт...'
                  : 'Офлайн (локальный режим)'}
              </span>
              {status.pingMs !== null && (
                <span className="font-mono text-2xs text-zinc-500">
                  {status.pingMs} ms
                </span>
              )}
            </div>
            <span className="text-2xs text-zinc-500">
              {status.lastSyncTime ? `Сверка: ${status.lastSyncTime}` : 'Готов к подключению'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualSync}
          disabled={status.state === 'syncing'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs text-zinc-300 hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status.state === 'syncing' ? 'animate-spin' : ''}`} />
          <span>Синхронизировать</span>
        </button>
      </div>

      {/* 3. Flat Device Pairing Section with Human-in-the-Loop Consent */}
      <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">Связывание устройств</span>
          <div className="flex items-center h-7 bg-canvas p-0.5 rounded-lg border border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                setPairMode('host');
                setPendingApprovalSas(null);
              }}
              className={`h-full px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                pairMode === 'host'
                  ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              Получить PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setPairMode('guest');
                setHostPin(null);
                setPendingApprovalSas(null);
              }}
              className={`h-full px-2.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                pairMode === 'guest'
                  ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              Ввести PIN
            </button>
          </div>
        </div>

        {pairMode === 'host' ? (
          <div className="flex flex-col gap-2 pt-1">
            {/* Case A: Guest entered PIN -> Host sees Approval Request Card */}
            {pendingApprovalSas ? (
              <div className="flex flex-col gap-2.5 p-3 bg-[#0c0c0e] border border-white/20 rounded-lg animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white">
                    Запрос на подключение устройства
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    <span>Код проверки:</span>
                    <strong className="tracking-wider">{pendingApprovalSas}</strong>
                  </div>
                </div>

                <p className="text-2xs text-zinc-400">
                  Убедитесь, что 4 цифры совпадают на подключаемом устройстве. Разрешить доступ к хранилищу?
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRejectPairing}
                    disabled={isRejecting || isApproving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs text-zinc-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Отклонить</span>
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
            ) : hostPin ? (
              /* Case B: PIN generated, waiting for guest */
              <div className="flex items-center justify-between gap-3 py-2 px-3 bg-[#0c0c0e] border border-white/[0.06] rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">PIN:</span>
                  <span className="font-mono text-base font-semibold tracking-wider text-white">
                    {hostPin}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xs text-zinc-500">
                    {formatTtl(hostPinTtl)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(hostPin, 'hostPin')}
                    className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Скопировать"
                  >
                    {copiedKey === 'hostPin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ) : (
              /* Case C: Idle host, button to generate */
              <div className="flex items-center justify-between">
                <span className="text-2xs text-zinc-500">
                  Одноразовый 6-значный код для безопасного сопряжения без передачи метаданных.
                </span>
                <button
                  type="button"
                  onClick={handleGeneratePin}
                  disabled={isGeneratingPin}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-medium text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {isGeneratingPin ? 'Генерация...' : 'Сгенерировать PIN'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Guest mode: enter PIN or show waiting status */
          <div className="flex flex-col gap-2 pt-1">
            {isGuestWaitingApproval && guestSasCode ? (
              <div className="flex items-center justify-between p-2.5 bg-[#0c0c0e] border border-white/[0.08] rounded-lg animate-in fade-in">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
                  <span className="text-xs text-zinc-300">
                    Код проверки: <strong className="font-mono text-emerald-400">{guestSasCode}</strong>
                  </span>
                </div>
                <span className="text-2xs text-zinc-500">Ожидание подтверждения на хосте...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="123-456"
                  value={guestInputPin}
                  onChange={(e) => setGuestInputPin(e.target.value)}
                  maxLength={8}
                  className="flex-1 bg-[#0c0c0e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-zinc-600 outline-none focus:border-white/20"
                />
                <button
                  type="button"
                  onClick={handleClaimGuestPin}
                  disabled={isClaimingPin || !guestInputPin.trim()}
                  className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-medium text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isClaimingPin ? 'Связывание...' : 'Подключить'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Flat Trusted Devices List */}
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <span className="text-xs font-semibold text-zinc-200">Доверенные устройства</span>

        <div className="divide-y divide-white/[0.04]">
          {/* Current Device */}
          <div className="py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-200">{config.deviceName}</span>
                <span className="font-mono text-2xs text-zinc-500">({config.deviceId})</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.2 rounded">
                  текущее
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-2xs text-zinc-400">Онлайн</span>
            </div>
          </div>

          {/* Trusted Devices from Config */}
          {config.trustedDevices.map((dev) => (
            <div key={dev.id} className="py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {dev.platform === 'mobile' ? (
                  <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />
                ) : (
                  <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-200">{dev.name}</span>
                  <span className="font-mono text-2xs text-zinc-500">({dev.id})</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-2xs text-zinc-500">{dev.lastSeenAt || 'Синхронизировано'}</span>
                <button
                  type="button"
                  onClick={() => {
                    syncEngine.removeTrustedDevice(dev.id);
                    setConfig(syncEngine.getConfig());
                    addToast?.('Устройство удалено', 'info');
                  }}
                  className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
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
      </div>
    </div>
  );
};
