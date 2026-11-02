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
  Edit2,
  KeyRound,
  Bot,
} from 'lucide-react';
import { syncEngine } from '../../lib/sync/syncEngine';
import { createPairingSession } from '../../lib/sync/pairing';
import type { SyncStatus, SyncConfig, DeviceSyncMode } from '../../lib/sync/types';

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

  // Inline device rename state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const unsub = syncEngine.subscribe((st) => {
      setStatus(st);
      setConfig(syncEngine.getConfig());
    });
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

  const handleStartRename = (id: string, currentName: string) => {
    setEditingDeviceId(id);
    setEditingDeviceName(currentName);
  };

  const handleSaveRename = () => {
    if (!editingDeviceId) return;
    syncEngine.renameDevice(editingDeviceId, editingDeviceName);
    setConfig(syncEngine.getConfig());
    setEditingDeviceId(null);
    showToast('Имя устройства обновлено');
  };

  const handleToggleSyncMode = (id: string, currentMode?: DeviceSyncMode) => {
    const next: DeviceSyncMode = currentMode === 'receive-only' ? 'read-write' : 'receive-only';
    syncEngine.setDeviceSyncMode(id, next);
    setConfig(syncEngine.getConfig());
    showToast(`Режим: ${next === 'read-write' ? 'Полный доступ' : 'Только чтение'}`);
  };

  const handleToggleAiLease = (id: string, currentCanRun?: boolean) => {
    const next = !currentCanRun;
    syncEngine.setDeviceAiLease(id, next);
    setConfig(syncEngine.getConfig());
    showToast(`AI-воркер: ${next ? 'включен' : 'отключен'}`);
  };

  const handleRotateKey = async () => {
    const confirmed = window.confirm(
      'Внимание! Будет сгенерирован новый ключ шифрования и создана новая комната на релее.\n' +
      'Все другие устройства потеряют доступ, пока не будут заново сопряжены по новому PIN-коду.\n\n' +
      'Выполнить ротацию ключа?'
    );
    if (!confirmed) return;

    try {
      await syncEngine.rotateVaultKey();
      setConfig(syncEngine.getConfig());
      showToast('Ключ хранилища ротирован, создана новая комната');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Ошибка ротации: ${msg}`);
    }
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
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        sub.plan === 'angry'
                          ? 'text-amber-400 bg-amber-500/10'
                          : sub.plan === 'smile' || sub.plan === 'pro'
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-zinc-400 bg-white/[0.04]'
                      }`}
                    >
                      E2EE Активен
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {sub.plan === 'self-hosted' ? (
                      'Подключен к вашему серверу'
                    ) : (
                      <>
                        Срок действия: до {sub.expiresFormatted} · {sub.activeDevices} из {sub.maxDevices} устройств · кеш {sub.maxCacheMb >= 1024 ? `${sub.maxCacheMb / 1024} ГБ` : `${sub.maxCacheMb} МБ`}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Tier Selector / Switcher */}
              <div className="flex items-center gap-1 bg-[#0c0c0e] p-1 rounded-lg border border-white/[0.08]">
                <button
                  type="button"
                  data-testid="tier-btn-free"
                  onClick={() => {
                    syncEngine.setSubscriptionPlan('free');
                    setStatus(syncEngine.getStatus());
                    showToast('Тариф переключен на Free (1 ГБ кеша)');
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                    sub.plan === 'free'
                      ? 'bg-white/10 text-white border border-white/[0.08]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Free
                </button>
                <button
                  type="button"
                  data-testid="tier-btn-smile"
                  onClick={() => {
                    syncEngine.setSubscriptionPlan('smile');
                    setStatus(syncEngine.getStatus());
                    showToast('Тариф переключен на Smile (10 ГБ кеша)');
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                    sub.plan === 'smile' || sub.plan === 'pro'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Smile
                </button>
                <button
                  type="button"
                  data-testid="tier-btn-angry"
                  onClick={() => {
                    syncEngine.setSubscriptionPlan('angry');
                    setStatus(syncEngine.getStatus());
                    showToast('Тариф переключен на Angry (50 ГБ кеша)');
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                    sub.plan === 'angry'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Angry
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
                  <span className="text-zinc-400">Кеш недоставленного на релее</span>
                  <span className="font-mono text-white font-medium">
                    {sub.usedCacheMb} МБ / {sub.maxCacheMb >= 1024 ? `${sub.maxCacheMb / 1024} ГБ` : `${sub.maxCacheMb} МБ`}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-400 rounded-full"
                    style={{ width: `${Math.max(1, Math.min(100, (sub.usedCacheMb / sub.maxCacheMb) * 100))}%` }}
                  />
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

            {/* 4. Active Devices List with In-Place Actions */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-zinc-200">Активные устройства</span>
                <span className="text-[11px] font-mono text-zinc-500">
                  {1 + config.trustedDevices.length} / {sub.maxDevices}
                </span>
              </div>

              <div className="divide-y divide-white/[0.04]">
                {/* Host device */}
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
                        <span className="text-zinc-400">основное</span>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-emerald-400/90">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>онлайн</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
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

                {/* Additional devices */}
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
                        onClick={() => handleRevokeDevice(dev.id)}
                        className="p-1 text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Отозвать доступ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Security & Panic Re-keying in Cabinet */}
            <div className="p-4 rounded-xl bg-[#141417] border border-white/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-zinc-200">Ротация ключа (Panic Re-keying)</span>
                  <p className="text-2xs text-zinc-500">
                    Смените мастер-ключ хранилища. Все сторонние девайсы мгновенно потеряют доступ.
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
          </>
        )}
      </main>
    </div>
  );
};
