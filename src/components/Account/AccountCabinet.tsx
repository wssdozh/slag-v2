import React, { useEffect, useState } from 'react';
import { Check, Copy, Database, KeyRound, Laptop, Loader2, LogOut, Shield, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { accountClient, generateMnemonic } from '../../lib/sync/account';
import { getOrCreateDeviceIdentity } from '../../lib/sync/accountCrypto';
import { syncEngine } from '../../lib/sync/syncEngine';
import { acceptSharedVault, shareVaultWithDevice } from '../../lib/sync/vaultSharing';
import { getVaultDisplayName } from '../../lib/vaultDisplay';
import { navigatePage } from '../../lib/navigation';

export const AccountCabinet: React.FC = () => {
  const { vaults, createVault, switchVault } = useApp();
  const [state, setState] = useState(accountClient.getState());
  const [syncStatus, setSyncStatus] = useState(syncEngine.getStatus());
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [seed, setSeed] = useState('');
  const [savedSeed, setSavedSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loginDeviceName, setLoginDeviceName] = useState(() => syncEngine.getConfig().deviceName);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [sharingVault, setSharingVault] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const config = syncEngine.getConfig();

  useEffect(() => accountClient.subscribe(setState), []);
  useEffect(() => syncEngine.subscribe(setSyncStatus), []);
  // Account polling belongs to AppContext; leaving this page must not stop it.

  const perform = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try { await action(); if (success) setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let inFlight = false;
    const check = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      setCheckingApproval(true);
      try {
        const result = await accountClient.completePendingLogin();
        if (stopped) return;
        if (result === 'authenticated') {
          setPending(false);
          setMessage('Вход подтверждён. Устройство подключено к аккаунту.');
          await syncEngine.init();
          accountClient.startPolling(config.serverUrl);
        } else if (result !== 'pending') {
          setPending(false);
          setMessage(result === 'expired' ? 'Время ожидания истекло. Войдите ещё раз, чтобы отправить новый запрос.' : 'Запрос отклонён. Подключение устройства не разрешено.');
        }
      } catch (error) {
        if (!stopped) setMessage(`Не удалось проверить подтверждение: ${error instanceof Error ? error.message : String(error)}. Проверим снова автоматически.`);
      } finally {
        inFlight = false;
        if (!stopped) setCheckingApproval(false);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 3000);
    return () => { stopped = true; clearInterval(timer); accountClient.cancelPendingLogin(); };
  }, [pending, config.serverUrl]);

  const authenticate = () => perform(async () => {
    const name = loginDeviceName.trim();
    if (!name || name.length > 64) throw new Error('Введите имя устройства от 1 до 64 символов');
    const device = await getOrCreateDeviceIdentity(config.deviceId, name, 'desktop');
    device.name = name;
    syncEngine.renameDevice(config.deviceId, name);
    const result = mode === 'register'
      ? await accountClient.register(seed, config.serverUrl, device)
      : await accountClient.login(seed, config.serverUrl, device);
    if (result === 'pending_device') {
      setPending(true);
      setSeed('');
      setMessage('Запрос отправлен. Откройте личный кабинет на уже подключённом устройстве и разрешите вход. Здесь всё продолжится автоматически.');
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
    await acceptSharedVault({ vaultId, vaultName: invitation.vaultName, encryptedKey: invitation.encryptedKey }, config.deviceId, { createVault, switchVault });
    setMessage('Приглашение принято. Хранилище загружается в приложении.');
  }, 'Приглашение принято. Синхронизация запущена, но загрузка всех файлов ещё не подтверждена.');

  // Возврат в приложение: назад по истории, иначе — на корень без лишней записи.
  const openApp = () => {
    if (window.history.length > 1) window.history.back();
    else navigatePage(null, 'replace');
  };
  const account = state.account;
  const currentId = state.session ? state.session.deviceId : null;
  const activeDevices = state.devices.filter((device) => device.status === 'active')
    .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
  const pendingDevices = state.devices.filter((device) => device.status === 'pending');
  const recipients = activeDevices.filter((device) => device.id !== currentId);
  const shortId = (id: string) => id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-8)}` : id;
  const rights = (mode: string) => mode === 'receive-only' ? 'только чтение' : 'чтение и изменение';
  const saveDeviceName = (id: string) => perform(async () => {
    const name = deviceName.trim();
    if (!name || name.length > 64) throw new Error('Название должно содержать от 1 до 64 символов');
    await accountClient.renameDevice(id, name);
    if (id === currentId) syncEngine.renameDevice(config.deviceId, name);
    setEditingDevice(null);
  }, 'Название устройства сохранено');

  return (
    <div className="min-h-screen bg-canvas-subtle text-fg-primary">
      <header
        className="border-b border-white/[0.06] px-5 pb-4 flex items-center justify-between gap-4"
        style={{ paddingTop: 'max(var(--sat), 1rem)' }}
      >
        <span className="text-sm font-semibold">Личный кабинет</span>
        <button
          type="button"
          onClick={openApp}
          className="text-xs text-zinc-300 hover:text-white px-3 py-2 -mr-3 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0"
        >
          Открыть приложение
        </button>
      </header>
      <main
        className="max-w-3xl mx-auto px-5 pt-10 flex flex-col gap-8"
        style={{ paddingBottom: 'calc(max(var(--sab), 0px) + 2.5rem)' }}
      >
        <div>
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /><h1 className="text-xl font-semibold">SLAG ID</h1></div>
          <p className="text-sm text-zinc-500 mt-2">Подписка, устройства и доступ к хранилищам — в одном месте.</p>
        </div>
        {(message || state.error) && <p role="status" className="text-sm text-amber-300 border-l border-amber-400/30 pl-3">{message || state.error}</p>}

        {/^http:\/\/152\.53\.199\.71:8320(?:[/?#]|$)/.test(config.serverUrl) && <p role="note" className="text-xs text-amber-300">Тестовый сервер использует HTTP без шифрования транспорта. Токен сессии может быть перехвачен. Используйте только тестовый аккаунт; seed-фраза на сервер не отправляется.</p>}

        {!state.session && pending ? (
          <section aria-label="Ожидание подтверждения" className="flex flex-col gap-4 max-w-lg">
            <h2 className="text-base font-medium">Подтвердите вход на другом устройстве</h2>
            <p className="text-sm text-zinc-300">Подключаем «{loginDeviceName}»</p>
            <p className="text-sm text-zinc-400">Откройте личный кабинет на устройстве, где вы уже вошли, и нажмите «Разрешить». После подтверждения вход завершится автоматически.</p>
            <p className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 aria-hidden="true" className={`w-4 h-4 ${checkingApproval ? 'animate-spin' : ''}`} />Ожидаем подтверждения · запрос действует 10 минут</p>
            <button type="button" onClick={() => { accountClient.cancelPendingLogin(); setPending(false); setMessage(null); }} className="text-sm text-zinc-400 self-start">Отменить вход</button>
          </section>
        ) : !state.session ? (
          <section className="flex flex-col gap-5 max-w-lg">
            <div className="flex gap-5 border-b border-white/[0.06]">
              <button type="button" onClick={() => { setMode('login'); setSeed(''); setSavedSeed(false); setPending(false); }} className={`pb-3 text-sm ${mode === 'login' ? 'text-white border-b border-white' : 'text-zinc-500'}`}>Войти по seed</button>
              <button type="button" onClick={() => { setMode('register'); setSeed(generateMnemonic()); setSavedSeed(false); setPending(false); }} className={`pb-3 text-sm ${mode === 'register' ? 'text-white border-b border-white' : 'text-zinc-500'}`}>Создать аккаунт</button>
            </div>
            <label htmlFor="login-device-name" className="text-sm text-zinc-300">Имя этого устройства</label>
            <input id="login-device-name" value={loginDeviceName} onChange={(event) => setLoginDeviceName(event.target.value)} maxLength={64} className="rounded-lg border border-white/[0.08] bg-panel p-3 text-sm outline-none ring-0" />
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
                <textarea id="account-seed" data-testid="account-seed-input" value={seed} onChange={(event) => setSeed(event.target.value)} rows={4} spellCheck={false} autoCorrect="off" autoCapitalize="none" autoComplete="off" className="w-full resize-none rounded-lg border border-white/[0.08] bg-panel p-3 text-sm font-mono outline-none focus:border-white/25" placeholder="12 или 24 слова" />
                <p className="text-xs text-zinc-500">Фраза проверяется на вашем устройстве и не отправляется на сервер. На новом устройстве потребуется подтверждение с уже подключённого.</p>
              </>
            )}
            <button type="button" disabled={busy || !seed.trim() || (mode === 'register' && !savedSeed)} onClick={() => void authenticate()} className="self-start px-5 py-2 rounded-lg bg-white text-black text-sm font-medium disabled:opacity-40 flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{mode === 'register' ? 'Создать аккаунт' : pending ? 'Повторить вход после подтверждения' : 'Войти'}</button>

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

            {pendingDevices.length > 0 && <section aria-label="Запросы новых устройств" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-amber-300">Ожидают разрешения · {pendingDevices.length}</h2>
              <p className="text-xs text-zinc-400">Разрешайте только знакомые устройства. Доступ к хранилищам выдаётся отдельно.</p>
              {pendingDevices.map((device) => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] py-3">
                <div>{editingDevice === device.id ? <form className="flex flex-wrap gap-3 items-center" onSubmit={(event) => { event.preventDefault(); if (!busy) void saveDeviceName(device.id); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditingDevice(null); } }}><input autoFocus aria-label="Название устройства, от 1 до 64 символов" required maxLength={64} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} className="w-48 bg-panel border border-white/[0.12] px-2 py-1 text-sm outline-none ring-0" /><button type="submit" disabled={busy || !deviceName.trim()} className="text-xs disabled:opacity-40">Сохранить</button><button type="button" disabled={busy} onClick={() => setEditingDevice(null)} className="text-xs text-zinc-400">Отмена</button></form> : <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{device.name}</p><button type="button" disabled={busy} onClick={() => { setEditingDevice(device.id); setDeviceName(device.name); }} className="text-xs text-zinc-400">Переименовать</button></div>}<p className="text-xs font-mono text-zinc-500" title={device.id}>{shortId(device.id)} · запрос на вход</p></div>
                <div className="flex gap-4"><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.approveDevice(device.id), 'Устройство разрешено. Доступ к хранилищам выдаётся отдельно.')} className="text-xs text-zinc-100">Разрешить</button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Отклонить запрос устройства «${device.name}»?`)) void perform(() => accountClient.revokeDevice(device.id), 'Запрос отклонён'); }} className="text-xs text-rose-400">Отклонить</button></div>
              </div>)}
            </section>}

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Устройства</h2><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.refresh())} className="text-xs text-zinc-400">Обновить</button></div>
              <p className="text-xs text-zinc-500">Для подключения нового устройства войдите на нём по seed, затем разрешите запрос здесь.</p>
              <div className="divide-y divide-white/[0.05]">
                {activeDevices.map((device) => (
                  <div key={device.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">{device.platform === 'mobile' ? <Smartphone className="w-4 h-4 text-zinc-500 shrink-0" /> : <Laptop className="w-4 h-4 text-zinc-500 shrink-0" />}<div className="min-w-0">
                      {editingDevice === device.id ? <form className="flex flex-wrap items-center gap-3" onSubmit={(event) => { event.preventDefault(); if (!busy) void saveDeviceName(device.id); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditingDevice(null); } }}>
                        <label className="sr-only" htmlFor={`device-name-${device.id}`}>Название устройства, от 1 до 64 символов</label>
                        <input id={`device-name-${device.id}`} autoFocus required maxLength={64} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} className="min-w-0 w-48 bg-panel border border-white/[0.12] px-2 py-1 text-sm outline-none ring-0" />
                        <button type="submit" disabled={busy || !deviceName.trim() || deviceName.trim().length > 64} className="text-xs disabled:opacity-40">Сохранить</button><button type="button" disabled={busy} onClick={() => setEditingDevice(null)} className="text-xs text-zinc-400">Отмена</button>
                      </form> : <div className="text-sm break-words">{device.name}{device.id === currentId && <span className="text-zinc-100 text-xs ml-2 font-medium">вы сейчас здесь</span>}</div>}
                      <div className="font-mono text-[11px] text-zinc-500" title={device.id}>{shortId(device.id)} · вход разрешён</div>
                      <p className="text-xs text-zinc-500 mt-1">{device.id === currentId ? `Синхронизация текущего хранилища: ${syncStatus.error || (syncStatus.state === 'connected' ? 'соединение установлено' : syncStatus.state === 'syncing' ? 'обмен данными' : syncStatus.state === 'offline' ? 'нет соединения' : 'не подключена')}` : device.lastSeenAt ? `Последняя активность: ${new Date(device.lastSeenAt).toLocaleString('ru-RU')}` : 'Время последней активности неизвестно'}</p>
                    </div></div>
                    <div className="flex gap-4 shrink-0">
                      <button type="button" disabled={busy} aria-label={`Переименовать устройство ${device.name}`} onClick={() => { setEditingDevice(device.id); setDeviceName(device.name); }} className="text-xs text-zinc-400">Переименовать</button>
                      {device.id !== currentId && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Отозвать доступ устройства «${device.name}»? Локальные файлы на нём не удалятся.`)) void perform(() => accountClient.revokeDevice(device.id), 'Устройство отозвано. Локальные файлы сохранены.'); }} className="text-xs text-rose-400">Отозвать</button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {state.invitations.length > 0 && <section className="flex flex-col gap-3"><h2 className="text-sm font-semibold">Приглашения в хранилища</h2>{state.invitations.map((invitation) => {
              const localVault = vaults.find((vault) => (vault.syncId || vault.id) === invitation.vaultId);
              const inviter = invitation.invitedBy ? state.devices.find((device) => device.id === invitation.invitedBy) : null;
              return <div key={invitation.vaultId} className="py-3 border-t border-white/[0.05] flex flex-col gap-3">
                <div><div className="text-sm">{invitation.vaultName}</div><div className="text-xs font-mono text-zinc-500" title={invitation.vaultId}>{shortId(invitation.vaultId)} · {rights(invitation.mode)}</div></div>
                <p className="text-xs text-zinc-400">Отправитель: {inviter ? `${inviter.name} · ${shortId(inviter.id)}` : invitation.invitedBy ? `идентификатор ${invitation.invitedBy}` : 'не указан сервером'}</p>
                <p className="text-xs text-zinc-400">{localVault ? `Совпадает syncId: подключим существующее локальное хранилище «${getVaultDisplayName(localVault, vaults)}». Его данные будут синхронизироваться с этим хранилищем, отдельная копия не создаётся.` : 'Локального хранилища с таким syncId нет: создадим отдельное. Совпадение названий не объединяет хранилища; остальные локальные заметки останутся отдельно.'}</p>
                <div className="flex gap-4"><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.declineVault(invitation.vaultId), 'Приглашение отклонено')} className="text-xs text-zinc-400">Отклонить</button><button type="button" disabled={busy} onClick={() => void acceptInvitation(invitation.vaultId)} className="text-xs text-zinc-100">Подключить</button></div>
              </div>;
            })}</section>}

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Хранилища и доступ</h2>
              <p className="text-xs text-zinc-500">Доступ выдаётся каждому устройству отдельно. Принятое приглашение не означает, что все файлы уже синхронизированы.</p>
              {vaults.map((vault) => {
                const serverVault = state.vaults.find((item) => item.id === (vault.syncId || vault.id));
                const grants = serverVault ? serverVault.grants : [];
                return <div key={vault.id} className="py-4 border-t border-white/[0.05] flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0"><Database className="w-4 h-4 text-zinc-500 shrink-0" /><div><div className="text-sm">{getVaultDisplayName(vault, vaults)}</div><div className="text-xs font-mono text-zinc-500">{shortId(vault.syncId || vault.id)}</div></div></div>
                    <button type="button" disabled={busy} onClick={() => { setSharingVault(sharingVault === vault.id ? null : vault.id); setSelectedDevice(''); setReadOnly(false); }} aria-expanded={sharingVault === vault.id} className="text-xs text-zinc-300">Подключить на другое устройство</button>
                  </div>
                  {grants.map((grant) => {
                    const device = state.devices.find((item) => item.id === grant.deviceId);
                    return <div key={grant.deviceId} className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="text-zinc-400">{device ? device.name : 'Устройство'} · <span className="font-mono" title={grant.deviceId}>{shortId(grant.deviceId)}</span>{grant.deviceId === currentId && ' · вы сейчас здесь'}<span className="block mt-1 text-zinc-500">{rights(grant.mode)} · {grant.status === 'pending' ? 'ожидает принятия приглашения' : grant.status === 'accepted' ? 'приглашение принято · загрузка файлов не подтверждена' : 'доступ отозван'}</span></div>
                      {grant.status !== 'revoked' && grant.deviceId !== currentId && <button type="button" disabled={busy} aria-label={`Отозвать доступ ${device ? device.name : shortId(grant.deviceId)} к ${getVaultDisplayName(vault, vaults)}`} onClick={() => { if (window.confirm(`Отозвать доступ к хранилищу «${getVaultDisplayName(vault, vaults)}» у устройства «${device ? device.name : grant.deviceId}»? Локальные файлы на устройстве сохранятся.`)) void perform(() => accountClient.revokeVaultGrant(serverVault!.id, grant.deviceId), 'Доступ отозван. Локальные файлы на устройстве сохранены.'); }} className="text-xs text-rose-400">Отозвать</button>}
                    </div>;
                  })}
                  {grants.length === 0 && <p className="text-xs text-zinc-500">Другим устройствам доступ ещё не выдан.</p>}
                  {sharingVault === vault.id && <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (busy) return; void perform(async () => {
                    const device = recipients.find((item) => item.id === selectedDevice);
                    if (!device) throw new Error('Выберите разрешённое устройство');
                    if (grants.some((grant) => grant.deviceId === device.id && grant.status !== 'revoked')) throw new Error('Устройство уже имеет доступ или ожидает приглашения');
                    await shareVaultWithDevice(vault, device, readOnly ? 'receive-only' : 'read-write');
                    setSharingVault(null);
                  }, 'Приглашение отправлено. Подключите хранилище на выбранном устройстве.'); }}>
                    <label className="flex flex-col gap-2 text-xs text-zinc-400">Устройство<select aria-label={`Устройство для хранилища ${getVaultDisplayName(vault, vaults)}`} value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)} required className="bg-panel border border-white/[0.08] px-2 py-2 outline-none ring-0"><option value="">Выберите устройство</option>{recipients.filter((device) => !grants.some((grant) => grant.deviceId === device.id && grant.status !== 'revoked')).map((device) => <option key={device.id} value={device.id}>{device.name} · {shortId(device.id)}</option>)}</select></label>
                    <label className="flex flex-col gap-2 text-xs text-zinc-400">Права<select aria-label="Права" value={readOnly ? 'receive-only' : 'read-write'} onChange={(event) => setReadOnly(event.target.value === 'receive-only')} className="bg-panel border border-white/[0.08] px-2 py-2 outline-none ring-0"><option value="read-write">Чтение и изменение</option><option value="receive-only">Только чтение</option></select></label>
                    <button type="submit" disabled={busy || !selectedDevice} className="text-xs py-2 text-zinc-100 disabled:opacity-40">Отправить приглашение</button><button type="button" disabled={busy} onClick={() => setSharingVault(null)} className="text-xs py-2 text-zinc-400">Отмена</button>
                    {recipients.length === 0 && <p className="w-full text-xs text-zinc-500">Сначала разрешите другое устройство в разделе устройств.</p>}
                  </form>}
                </div>;
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
