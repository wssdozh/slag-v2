import React, { useState, useEffect } from 'react';
import {
  Shield,
  Laptop,
  Smartphone,
  Copy,
  Check,
  Trash2,
  Download,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { syncEngine } from '../../lib/sync/syncEngine';
import { createPairingSession } from '../../lib/sync/pairing';
import type { SyncStatus, SyncConfig } from '../../lib/sync/types';

interface AccountCabinetProps {
  onBackToLanding?: () => void;
}

export const AccountCabinet: React.FC<AccountCabinetProps> = ({ onBackToLanding }) => {
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [config, setConfig] = useState<SyncConfig>(syncEngine.getConfig());

  // Input for license login
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(true); // default authenticated based on local sync config

  // PIN generation inside cabinet
  const [cabinetPin, setCabinetPin] = useState<string | null>(null);
  const [cabinetPinTtl, setCabinetPinTtl] = useState(300);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const unsub = syncEngine.subscribe((st) => setStatus(st));
    return unsub;
  }, []);

  // Countdown timer for cabinet PIN
  useEffect(() => {
    if (!cabinetPin || cabinetPinTtl <= 0) return;
    const interval = setInterval(() => {
      setCabinetPinTtl((prev) => {
        if (prev <= 1) {
          setCabinetPin(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cabinetPin, cabinetPinTtl]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Скопировано в буфер обмена');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGeneratePin = async () => {
    setIsGeneratingPin(true);
    try {
      const session = await createPairingSession(config.serverUrl, config.deviceId);
      setCabinetPin(session.pin);
      setCabinetPinTtl(session.expiresIn);
    } catch (err: unknown) {
      console.error('CABINET_GENERATE_PIN_ERROR:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Ошибка генерации: ${msg}`);
    } finally {
      setIsGeneratingPin(false);
    }
  };

  const handleLoginWithKey = () => {
    if (!licenseKeyInput.trim()) return;
    showToast('Ключ успешно привязан');
    setIsLoggedIn(true);
  };

  const handleRevokeDevice = (deviceId: string) => {
    syncEngine.removeTrustedDevice(deviceId);
    setConfig(syncEngine.getConfig());
    showToast('Устройство удалено из списка');
  };

  const sub = status.subscription;
  const formatTtl = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const backToLanding = () => {
    if (onBackToLanding) {
      onBackToLanding();
    } else {
      window.location.search = '?page=landing';
    }
  };

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 selection:bg-white/20 selection:text-white font-sans antialiased">
      {/* Toast popup */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-lg bg-[#141417] border border-white/20 text-xs text-white shadow-xl animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#08090a]/80 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={backToLanding}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer mr-2 active:scale-[0.96]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>На главную</span>
            </button>
            <span className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-white">Личный кабинет</span>
              <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
                SLAG ID
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const link = document.createElement('a');
                link.href = '#';
                link.download = 'SLAG_Setup_x64.exe';
                showToast('Началось скачивание инсталлятора');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black font-semibold text-xs rounded-lg hover:bg-zinc-200 active:scale-[0.96] transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать .exe</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Cabinet Content */}
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        {!isLoggedIn ? (
          /* Login Card */
          <div className="max-w-md mx-auto p-6 rounded-2xl bg-[#141417] border border-white/[0.06] space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white">Вход по ключу лицензии</h2>
              <p className="text-xs text-zinc-400">
                Мы не запрашиваем email и пароль. Введите ваш ключ подписки или 12 слов для доступа.
              </p>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="slag-pro-xxxx-xxxx"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                className="w-full bg-[#0c0c0e] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 outline-none focus:border-white/20"
              />
              <button
                type="button"
                onClick={handleLoginWithKey}
                className="w-full py-2 bg-white text-black font-semibold text-xs rounded-lg hover:bg-zinc-200 active:scale-[0.96] transition-all cursor-pointer"
              >
                Войти в кабинет
              </button>
            </div>
          </div>
        ) : (
          /* Authenticated Dashboard */
          <>
            {/* 1. Subscription Status Banner */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-200">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{sub.planLabel}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                      E2EE Активен
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {sub.plan === 'self-hosted' ? (
                      'Подключен к вашему серверу'
                    ) : (
                      <>Срок действия: до {sub.expiresFormatted} · {sub.activeDevices} из {sub.maxDevices} устройств</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => showToast('Продление подписки будет доступно через платежный шлюз')}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.96] border border-white/[0.08] rounded-lg transition-all cursor-pointer"
                >
                  Продлить тариф
                </button>
              </div>
            </div>

            {/* 2. Quotas & Usage Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Слоты устройств</span>
                  <span className="font-mono text-white font-medium">{sub.activeDevices} / {sub.maxDevices}</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (sub.activeDevices / sub.maxDevices) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Буфер вложений на релее</span>
                  <span className="font-mono text-white font-medium">14.2 МБ / 10 ГБ</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-400 rounded-full" style={{ width: '1.4%' }} />
                </div>
              </div>
            </div>

            {/* 3. New Device Pairing Generation */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white">Подключение нового ПК или телефона</h3>
                  <p className="text-2xs text-zinc-400 mt-0.5">
                    Сгенерируйте код для мгновенной привязки скачанной апки к вашей лицензии.
                  </p>
                </div>
                {!cabinetPin && (
                  <button
                    type="button"
                    onClick={handleGeneratePin}
                    disabled={isGeneratingPin}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 active:scale-[0.96] text-xs font-medium text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isGeneratingPin ? 'Генерация...' : 'Сгенерировать PIN'}</span>
                  </button>
                )}
              </div>

              {cabinetPin && (
                <div className="flex items-center justify-between gap-3 py-2 px-3 bg-[#0c0c0e] border border-white/[0.06] rounded-lg animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">PIN для приложения:</span>
                    <span className="font-mono text-base font-semibold tracking-wider text-white">
                      {cabinetPin}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xs text-zinc-500">
                      {formatTtl(cabinetPinTtl)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(cabinetPin, 'cabinetPin')}
                      className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="Скопировать"
                    >
                      {copiedKey === 'cabinetPin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Active Devices List */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] space-y-3">
              <span className="text-xs font-semibold text-zinc-200">Активные устройства</span>

              <div className="divide-y divide-white/[0.04]">
                {/* Host device */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-200 font-medium">{config.deviceName}</span>
                        <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.2 rounded">
                          основное
                        </span>
                      </div>
                      <span className="font-mono text-2xs text-zinc-500">{config.deviceId}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-2xs text-zinc-400">Онлайн</span>
                  </div>
                </div>

                {/* Additional devices */}
                {config.trustedDevices.map((dev) => (
                  <div key={dev.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {dev.platform === 'mobile' ? (
                        <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : (
                        <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <div>
                        <span className="text-xs text-zinc-200 font-medium">{dev.name}</span>
                        <p className="font-mono text-2xs text-zinc-500">{dev.id}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-2xs text-zinc-500">{dev.lastSeenAt || 'Синхронизировано'}</span>
                      <button
                        type="button"
                        onClick={() => handleRevokeDevice(dev.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        title="Отозвать доступ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
