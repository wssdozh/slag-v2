import React, { useEffect, useState } from 'react';
import { Check, Copy, Database, KeyRound, Laptop, Loader2, LogOut, Shield, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { accountClient, generateMnemonic } from '../../lib/sync/account';
import { getOrCreateDeviceIdentity } from '../../lib/sync/accountCrypto';
import { syncEngine } from '../../lib/sync/syncEngine';
import { getLocalVaultId, installSharedVault, shareVaultWithDevice } from '../../lib/sync/vaultSharing';
import { getVaultDisplayName } from '../../lib/vaultDisplay';

export const AccountCabinet: React.FC = () => {
  const { vaults, createVault, switchVault } = useApp();
  const [state, setState] = useState(accountClient.getState());
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [seed, setSeed] = useState('');
  const [savedSeed, setSavedSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const config = syncEngine.getConfig();

  useEffect(() => accountClient.subscribe(setState), []);
  useEffect(() => {
    accountClient.startPolling(config.serverUrl);
    return () => accountClient.stopPolling();
  }, [config.serverUrl]);

  const perform = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try { await action(); if (success) setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const authenticate = () => perform(async () => {
    const device = await getOrCreateDeviceIdentity(config.deviceId, config.deviceName, 'desktop');
    const result = mode === 'register'
      ? await accountClient.register(seed, config.serverUrl, device)
      : await accountClient.login(seed, config.serverUrl, device);
    if (result === 'pending_device') {
      setPending(true);
      setMessage('Запрос отправлен. Подтвердите это устройство в личном кабинете на уже подключённом устройстве, затем повторите вход.');
      return;
    }
    setSeed('');
    setPending(false);
    await syncEngine.init();
    accountClient.startPolling(config.serverUrl);
  });

  const acceptInvitation = (vaultId: string) => perform(async () => {
    const invitation = state.invitations.find((item) => item.vaultId === vaultId);
    if (!invitation) throw new Error('Приглашение больше недоступно');
    // Decrypt and persist locally before accepting so a failed install remains retryable.
    await installSharedVault({ vaultId, vaultName: invitation.vaultName, encryptedKey: invitation.encryptedKey }, config.deviceId, { createVault, switchVault }, false);
    await accountClient.acceptVault(vaultId);
    switchVault(getLocalVaultId(vaultId));
    await syncEngine.switchVault(getLocalVaultId(vaultId));
  }, 'Хранилище подключено');

  const openApp = () => { window.location.search = ''; };
  const account = state.account;
  const currentId = state.session?.deviceId;
  const activeDevices = state.devices.filter((device) => device.status === 'active');

  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100">
      <header className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold">Личный кабинет</span>
        <button type="button" onClick={openApp} className="text-xs text-zinc-300 hover:text-white">Открыть приложение</button>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-10 flex flex-col gap-8">
        <div>
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /><h1 className="text-xl font-semibold">SLAG ID</h1></div>
          <p className="text-sm text-zinc-500 mt-2">Подписка, устройства и доступ к хранилищам — в одном месте.</p>
        </div>
        {(message || state.error) && <p role="status" className="text-sm text-amber-300 border-l border-amber-400/30 pl-3">{message || state.error}</p>}

        {!state.session ? (
          <section className="flex flex-col gap-5 max-w-lg">
            <div className="flex gap-5 border-b border-white/[0.06]">
              <button type="button" onClick={() => { setMode('login'); setSeed(''); setSavedSeed(false); setPending(false); }} className={`pb-3 text-sm ${mode === 'login' ? 'text-white border-b border-white' : 'text-zinc-500'}`}>Войти по seed</button>
              <button type="button" onClick={() => { setMode('register'); setSeed(generateMnemonic()); setSavedSeed(false); setPending(false); }} className={`pb-3 text-sm ${mode === 'register' ? 'text-white border-b border-white' : 'text-zinc-500'}`}>Создать аккаунт</button>
            </div>
            {mode === 'register' ? (
              <>
                <h2 className="text-base font-medium">Сохраните фразу восстановления</h2>
                <p className="text-sm text-zinc-400">Эти слова дают полный доступ к вашему аккаунту. Мы не получаем seed и не сможем восстановить его вместо вас.</p>
                <div data-testid="account-generated-seed" className="grid grid-cols-3 gap-x-5 gap-y-3 py-4 font-mono text-sm">
                  {seed.split(' ').map((word, index) => <span key={index}><span className="text-zinc-600 mr-2 text-xs">{index + 1}.</span>{word}</span>)}
                </div>
                <button type="button" onClick={() => void perform(async () => { await navigator.clipboard.writeText(seed); setCopied(true); })} className="flex items-center gap-2 text-xs text-zinc-400 self-start">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}Скопировать фразу</button>
                <label className="flex items-start gap-3 text-sm text-zinc-300"><input type="checkbox" checked={savedSeed} onChange={(event) => setSavedSeed(event.target.checked)} className="mt-1 accent-white" />Я сохранил seed-фразу в безопасном месте и понимаю, что её нельзя передавать другим.</label>
              </>
            ) : (
              <>
                <label htmlFor="account-seed" className="text-sm text-zinc-300">Seed-фраза аккаунта</label>
                <textarea id="account-seed" data-testid="account-seed-input" value={seed} onChange={(event) => setSeed(event.target.value)} rows={4} spellCheck={false} autoComplete="off" className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#0c0c0e] p-3 text-sm font-mono outline-none focus:border-white/25" placeholder="12 или 24 слова" />
                <p className="text-xs text-zinc-500">Фраза проверяется на вашем устройстве и не отправляется на сервер. На новом устройстве потребуется подтверждение с уже подключённого.</p>
              </>
            )}
            <button type="button" disabled={busy || !seed.trim() || (mode === 'register' && !savedSeed)} onClick={() => void authenticate()} className="self-start px-5 py-2 rounded-lg bg-white text-black text-sm font-medium disabled:opacity-40 flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{mode === 'register' ? 'Создать аккаунт' : pending ? 'Повторить вход после подтверждения' : 'Войти'}</button>
            {import.meta.env.DEV && config.serverUrl === 'http://152.53.199.71:8320' && <label className="flex items-start gap-2 text-xs text-amber-400/80"><input type="checkbox" defaultChecked={localStorage.getItem('slag_allow_insecure_account_test') === 'true'} onChange={(event) => localStorage.setItem('slag_allow_insecure_account_test', String(event.target.checked))} className="mt-0.5 accent-amber-400" />Тестовый HTTP: разрешить вход без HTTPS. Токен сессии может быть перехвачен. Только для тестового аккаунта.</label>}
            <p className="text-xs text-zinc-600">Не нужен наш сервис? Локальные заметки и синхронизация через собственный сервер работают без SLAG ID.</p>
          </section>
        ) : account && (
          <>
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Подписка</h2><span className="text-xs font-mono text-zinc-500">{account.id}</span></div>
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 py-3 border-y border-white/[0.06]">
                <span className="text-lg font-medium">{account.planLabel}</span>
                <span className="text-xs text-zinc-500">{account.expiresAt ? `до ${new Date(account.expiresAt).toLocaleDateString('ru-RU')}` : 'бессрочно'}</span>
                <span className="text-xs text-zinc-400">{activeDevices.length} / {account.maxDevices} устройств</span>
                <span className="text-xs text-zinc-400">кеш {account.usedCacheMb} / {account.maxCacheMb} мб</span>
              </div>
              <p className="text-xs text-zinc-500">Тариф и лимиты подтверждены сервером. Изменение подписки через оплату пока недоступно.</p>
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Устройства</h2><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.refresh())} className="text-xs text-zinc-400">Обновить</button></div>
              <p className="text-xs text-zinc-500">Для подключения нового устройства войдите на нём по seed, затем подтвердите запрос здесь.</p>
              <div className="divide-y divide-white/[0.05]">
                {state.devices.filter((device) => device.status !== 'revoked').map((device) => (
                  <div key={device.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">{device.platform === 'mobile' ? <Smartphone className="w-4 h-4 text-zinc-500 shrink-0" /> : <Laptop className="w-4 h-4 text-zinc-500 shrink-0" />}<div className="min-w-0"><div className="text-sm truncate">{device.name}{device.id === currentId && <span className="text-zinc-500 text-xs ml-2">это устройство</span>}</div><div className="font-mono text-[11px] text-zinc-600">{device.id} · {device.status === 'pending' ? 'ожидает подтверждения' : 'подключено'}</div></div></div>
                    <div className="flex gap-3 shrink-0">
                      {device.status === 'pending' && <button type="button" disabled={busy} onClick={() => void perform(() => accountClient.approveDevice(device.id), 'Устройство подтверждено')} className="text-xs text-emerald-400">Подтвердить</button>}
                      {device.id !== currentId && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Отозвать доступ устройства «${device.name}»? Локальные файлы на нём не удалятся.`)) void perform(() => accountClient.revokeDevice(device.id), 'Устройство отозвано'); }} className="text-xs text-rose-400">Отозвать</button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {state.invitations.length > 0 && <section className="flex flex-col gap-3"><h2 className="text-sm font-semibold">Приглашения</h2>{state.invitations.map((invitation) => <div key={invitation.vaultId} className="py-3 border-t border-white/[0.05] flex items-center justify-between gap-4"><div><div className="text-sm">{invitation.vaultName}</div><div className="text-xs text-zinc-500">{invitation.mode === 'receive-only' ? 'только чтение' : 'чтение и изменение'}</div></div><div className="flex gap-3"><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.declineVault(invitation.vaultId))} className="text-xs text-zinc-500">Скрыть</button><button type="button" disabled={busy} onClick={() => void acceptInvitation(invitation.vaultId)} className="text-xs text-emerald-400">Подключить</button></div></div>)}</section>}

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Хранилища и доступ</h2>
              <div className="flex flex-wrap items-center gap-3 text-xs"><label className="text-zinc-500" htmlFor="grant-device">Устройство</label><select id="grant-device" value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)} className="bg-[#0c0c0e] border border-white/[0.08] rounded-md px-2 py-1.5 outline-none"><option value="">Выберите устройство</option>{activeDevices.filter((device) => device.id !== currentId).map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><label className="flex gap-2 items-center text-zinc-400"><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} className="accent-white" />Только чтение</label></div>
              {vaults.map((vault) => {
                const serverVault = state.vaults.find((item) => item.id === (vault.syncId || vault.id));
                const grant = serverVault?.grants.find((item) => item.deviceId === selectedDevice);
                const allowed = grant && grant.status !== 'revoked';
                return <div key={vault.id} className="flex items-center justify-between py-3 border-t border-white/[0.05] gap-4"><div className="flex items-center gap-3 min-w-0"><Database className="w-4 h-4 text-zinc-500 shrink-0" /><div><div className="text-sm">{getVaultDisplayName(vault, vaults)}</div><div className="text-xs text-zinc-600">{grant?.status === 'pending' ? 'приглашение отправлено' : grant?.status === 'accepted' ? (grant.mode === 'receive-only' ? 'подключено · только чтение' : 'подключено') : 'доступ не выдан'}</div></div></div><button type="button" disabled={busy || !selectedDevice} onClick={() => void perform(async () => { const device = activeDevices.find((item) => item.id === selectedDevice); if (!device) throw new Error('Выберите устройство'); if (allowed) await accountClient.revokeVaultGrant(serverVault!.id, device.id); else await shareVaultWithDevice(vault, device, readOnly ? 'receive-only' : 'read-write'); }, allowed ? 'Доступ отозван. Локальная копия сохранена' : 'Приглашение отправлено')} className={`text-xs shrink-0 disabled:opacity-30 ${allowed ? 'text-rose-400' : 'text-emerald-400'}`}>{allowed ? 'Отозвать' : 'Предоставить доступ'}</button></div>;
              })}
              {vaults.length === 0 && <p className="text-xs text-zinc-500">Создайте локальное хранилище в приложении, затем откройте к нему доступ.</p>}
            </section>
            <section className="border-t border-white/[0.06] pt-5 flex items-center justify-between gap-4"><div className="flex gap-2 text-xs text-zinc-500"><KeyRound className="w-4 h-4 shrink-0" />Seed аккаунта не хранится в сессии. Выход не удаляет локальные заметки.</div><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.logout(), 'Вы вышли из аккаунта')} className="flex items-center gap-2 text-xs text-zinc-400"><LogOut className="w-4 h-4" />Выйти</button></section>
          </>
        )}
      </main>
    </div>
  );
};
