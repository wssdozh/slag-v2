import React, { useEffect, useState } from 'react';
import { Check, Copy, Database, KeyRound, Laptop, Loader2, LogOut, Shield, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { accountClient, generateMnemonic } from '../../lib/sync/account';
import type { AccountDevice } from '../../lib/sync/accountTypes';
import { getOrCreateDeviceIdentity } from '../../lib/sync/accountCrypto';
import { syncEngine } from '../../lib/sync/syncEngine';
import { acceptSharedVault, shareVaultWithDevice } from '../../lib/sync/vaultSharing';
import { getVaultDisplayName } from '../../lib/vaultDisplay';
import { navigatePage } from '../../lib/navigation';
import { SettingsDivider, SettingsGroup, SettingsRow } from '../Settings/SettingsUI';

export const AccountCabinet: React.FC = () => {
  const { vaults, createVault, switchVault, confirmAction } = useApp();
  const [state, setState] = useState(accountClient.getState());
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
  const activeDevices = state.devices.filter((device) => device.status === 'active');
  const recipients = activeDevices.filter((device) => device.id !== currentId);
  // One list for every status: current device, then active, then requests, then revoked.
  const deviceRank = (device: AccountDevice) => device.id === currentId ? 0
    : device.status === 'active' ? 1
    : device.status === 'pending' ? 2
    : 3;
  const orderedDevices = [...state.devices].sort((a, b) => deviceRank(a) - deviceRank(b)
    || (b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0) - (a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0));
  const shortId = (id: string) => id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-8)}` : id;
  const rights = (mode: string) => mode === 'receive-only' ? 'только чтение' : 'чтение и изменение';
  const moment = (iso: string | null | undefined) => iso
    ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
  const deviceWord = (device: AccountDevice) => device.id === currentId ? 'это устройство'
    : device.status === 'active' ? 'активно'
    : device.status === 'pending' ? 'ожидает'
    : 'отозвано';
  const deviceMoment = (device: AccountDevice) => device.id === currentId ? 'сейчас' : moment(device.lastSeenAt);
  const grantWord = (status: string) => status === 'accepted' ? 'принято' : status === 'pending' ? 'ждёт принятия' : 'отозвано';
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
            <SettingsGroup
              title="Аккаунт"
              action={<span className="text-2xs font-mono text-zinc-500" title={account.id}>{shortId(account.id)}</span>}
            >
              <SettingsRow label="Тариф" value={`${account.planLabel} · ${account.expiresAt ? `до ${new Date(account.expiresAt).toLocaleDateString('ru-RU')}` : 'бессрочно'}`} />
              <SettingsDivider />
              <SettingsRow label="Кеш" value={`${account.usedCacheMb} / ${account.maxCacheMb} мб`} />
            </SettingsGroup>

            <SettingsGroup
              title="Устройства"
              action={<span className="flex items-center gap-2">
                <span className="text-2xs font-mono text-zinc-500">{activeDevices.length} / {account.maxDevices}</span>
                <button type="button" disabled={busy} onClick={() => void perform(() => accountClient.refresh())} className="px-2 py-0.5 text-2xs text-fg-muted rounded-md hover:bg-surface-hover disabled:opacity-40">Обновить</button>
              </span>}
            >
              {orderedDevices.map((device, index) => (
                <React.Fragment key={device.id}>
                  {index > 0 && <SettingsDivider inset />}
                  <SettingsRow
                    testId={`device-row-${device.id}`}
                    icon={device.platform === 'mobile' ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                    label={editingDevice === device.id ? (
                      <input
                        autoFocus
                        aria-label="Название устройства, от 1 до 64 символов"
                        required
                        maxLength={64}
                        value={deviceName}
                        onChange={(event) => setDeviceName(event.target.value)}
                        onBlur={() => { if (deviceName.trim()) void saveDeviceName(device.id); else setEditingDevice(null); }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); void saveDeviceName(device.id); }
                          if (event.key === 'Escape') { event.stopPropagation(); setEditingDevice(null); }
                        }}
                        className="w-48 bg-transparent border border-white/[0.12] px-1.5 py-0.5 text-sm outline-none ring-0 rounded-md text-fg-primary"
                      />
                    ) : (
                      <span className="flex items-baseline gap-2 min-w-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setEditingDevice(device.id); setDeviceName(device.name); }}
                          className="text-left text-sm text-fg-primary hover:text-white disabled:opacity-40 truncate"
                        >
                          {device.name}
                        </button>
                        <span className="font-mono text-[11px] text-zinc-500 shrink-0" title={device.id}>{shortId(device.id)}</span>
                      </span>
                    )}
                    description={`${deviceWord(device)} · ${deviceMoment(device)}`}
                    right={<span className="flex items-center gap-1">
                      {device.id === currentId ? <span className="text-2xs text-zinc-400">вы сейчас здесь</span>
                        : device.status === 'pending' ? <>
                          <button type="button" disabled={busy} onClick={() => void perform(() => accountClient.approveDevice(device.id), 'Устройство разрешено. Доступ к хранилищам выдаётся отдельно.')} className="px-2 py-1 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-40">Разрешить</button>
                          <button type="button" disabled={busy} onClick={async () => { if (await confirmAction({ title: `Отклонить запрос устройства «${device.name}»?`, description: 'Устройство не получит доступ к аккаунту. Запросить снова можно с самого устройства.', confirmLabel: 'Отклонить', isDestructive: true })) void perform(() => accountClient.revokeDevice(device.id), 'Запрос отклонён'); }} className="px-2 py-1 text-2xs text-rose-400 rounded-md hover:bg-surface-hover disabled:opacity-40">Отклонить</button>
                        </>
                        : device.status === 'revoked' ? <>
                          <button type="button" disabled={busy} onClick={() => void perform(() => accountClient.restoreDevice(device.id), 'Устройство снова активно. Верните ему доступ к хранилищам ниже.')} className="px-2 py-1 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-40">Вернуть</button>
                          <button type="button" disabled={busy} onClick={async () => { if (await confirmAction({ title: `Удалить запись устройства «${device.name}»?`, description: 'Устройство исчезнет из аккаунта навсегда. Локальные файлы на нём и в хранилищах не тронем.', confirmLabel: 'Удалить навсегда', isDestructive: true })) void perform(() => accountClient.forgetDevice(device.id), 'Устройство удалено из аккаунта'); }} className="px-2 py-1 text-2xs text-rose-400 rounded-md hover:bg-surface-hover disabled:opacity-40">Удалить</button>
                        </>
                        : <button type="button" disabled={busy} onClick={async () => { if (await confirmAction({ title: `Отозвать доступ устройства «${device.name}»?`, description: 'Синхронизация с ним остановится. Локальные файлы на устройстве не удалятся, вернуть доступ можно кнопкой «Вернуть».', confirmLabel: 'Отозвать', isDestructive: true })) void perform(() => accountClient.revokeDevice(device.id), 'Устройство отозвано. Локальные файлы сохранены.'); }} className="px-2 py-1 text-2xs text-rose-400 rounded-md hover:bg-surface-hover disabled:opacity-40">Отозвать</button>}
                    </span>}
                  />
                </React.Fragment>
              ))}
            </SettingsGroup>

            {state.invitations.length > 0 && <SettingsGroup title="Приглашения">
              {state.invitations.map((invitation, index) => {
                const localVault = vaults.find((vault) => (vault.syncId || vault.id) === invitation.vaultId);
                const inviter = invitation.invitedBy ? state.devices.find((device) => device.id === invitation.invitedBy) : null;
                return <React.Fragment key={invitation.vaultId}>
                  {index > 0 && <SettingsDivider inset />}
                  <SettingsRow
                    icon={<Database className="w-4 h-4" />}
                    label={invitation.vaultName}
                    description={`${rights(invitation.mode)} · ${inviter ? `от ${inviter.name}` : 'отправитель неизвестен'} · ${localVault ? 'заменит локальное' : 'новое хранилище'}`}
                    right={<span className="flex items-center gap-1">
                      <button type="button" disabled={busy} onClick={() => void acceptInvitation(invitation.vaultId)} className="px-2 py-1 text-2xs text-fg-primary rounded-md hover:bg-surface-hover disabled:opacity-40">Подключить</button>
                      <button type="button" disabled={busy} onClick={() => void perform(() => accountClient.declineVault(invitation.vaultId), 'Приглашение отклонено')} className="px-2 py-1 text-2xs text-fg-muted rounded-md hover:bg-surface-hover disabled:opacity-40">Отклонить</button>
                    </span>}
                  />
                </React.Fragment>;
              })}
            </SettingsGroup>}

            <SettingsGroup title="Хранилища">
              {vaults.map((vault, vaultIndex) => {
                const serverVault = state.vaults.find((item) => item.id === (vault.syncId || vault.id));
                const grants = serverVault ? serverVault.grants : [];
                // Отозванное устройство живёт в списке выше; здесь показываем только тех, у кого доступ ещё может быть.
                const visibleGrants = grants.filter((grant) => state.devices.find((item) => item.id === grant.deviceId)?.status !== 'revoked');
                const vaultName = getVaultDisplayName(vault, vaults);
                return <React.Fragment key={vault.id}>
                  {vaultIndex > 0 && <SettingsDivider />}
                  <SettingsRow
                    icon={<Database className="w-4 h-4" />}
                    label={<span className="flex items-baseline gap-2 min-w-0">
                      <span className="truncate">{vaultName}</span>
                      <span className="font-mono text-[11px] text-zinc-500 shrink-0" title={vault.syncId || vault.id}>{shortId(vault.syncId || vault.id)}</span>
                    </span>}
                    description={visibleGrants.length > 0 ? `${visibleGrants.length} с доступом` : 'доступ только у этого устройства'}
                    right={<button type="button" disabled={busy} onClick={() => { setSharingVault(sharingVault === vault.id ? null : vault.id); setSelectedDevice(''); setReadOnly(false); }} aria-expanded={sharingVault === vault.id} className="px-2 py-1 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40">Выдать доступ</button>}
                  />
                  {visibleGrants.map((grant) => {
                    const device = state.devices.find((item) => item.id === grant.deviceId);
                    const deviceName = device ? device.name : shortId(grant.deviceId);
                    return <SettingsRow
                      key={grant.deviceId}
                      className="pl-12 py-2"
                      label={deviceName}
                      description={`${rights(grant.mode)} · ${grantWord(grant.status)}`}
                      right={grant.status === 'revoked'
                        ? <button type="button" disabled={busy || !device} aria-label={`Вернуть доступ ${deviceName} к ${vaultName}`} onClick={() => void perform(async () => {
                          if (!device) throw new Error('Устройство не найдено в аккаунте');
                          await shareVaultWithDevice(vault, device, grant.mode);
                        }, 'Доступ снова предложен. Примите приглашение на устройстве.')} className="px-2 py-1 text-2xs text-fg-secondary rounded-md hover:bg-surface-hover disabled:opacity-40">Вернуть</button>
                        : grant.deviceId !== currentId && <button type="button" disabled={busy} aria-label={`Отозвать доступ ${deviceName} к ${vaultName}`} onClick={async () => { if (await confirmAction({ title: `Отозвать доступ к «${vaultName}»?`, description: `Устройство «${deviceName}» перестанет получать это хранилище. Локальные файлы на нём сохранятся.`, confirmLabel: 'Отозвать', isDestructive: true })) void perform(() => accountClient.revokeVaultGrant(serverVault!.id, grant.deviceId), 'Доступ отозван. Локальные файлы на устройстве сохранены.'); }} className="px-2 py-1 text-2xs text-rose-400 rounded-md hover:bg-surface-hover disabled:opacity-40">Отозвать</button>}
                    />;
                  })}
                  {sharingVault === vault.id && <form className="flex flex-wrap items-end gap-3 px-3.5 pb-3.5" onSubmit={(event) => { event.preventDefault(); if (busy) return; void perform(async () => {
                    const device = recipients.find((item) => item.id === selectedDevice);
                    if (!device) throw new Error('Выберите разрешённое устройство');
                    if (grants.some((grant) => grant.deviceId === device.id && grant.status !== 'revoked')) throw new Error('Устройство уже имеет доступ или ожидает приглашения');
                    await shareVaultWithDevice(vault, device, readOnly ? 'receive-only' : 'read-write');
                    setSharingVault(null);
                  }, 'Приглашение отправлено. Подключите хранилище на выбранном устройстве.'); }}>
                    <label className="flex flex-col gap-2 text-xs text-zinc-400">Устройство<select aria-label={`Устройство для хранилища ${vaultName}`} value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)} required className="bg-panel border border-white/[0.08] px-2 py-2 outline-none ring-0 rounded-md"><option value="">Выберите устройство</option>{recipients.filter((device) => !grants.some((grant) => grant.deviceId === device.id && grant.status !== 'revoked')).map((device) => <option key={device.id} value={device.id}>{device.name} · {shortId(device.id)}</option>)}</select></label>
                    <label className="flex flex-col gap-2 text-xs text-zinc-400">Права<select aria-label="Права" value={readOnly ? 'receive-only' : 'read-write'} onChange={(event) => setReadOnly(event.target.value === 'receive-only')} className="bg-panel border border-white/[0.08] px-2 py-2 outline-none ring-0 rounded-md"><option value="read-write">Чтение и изменение</option><option value="receive-only">Только чтение</option></select></label>
                    <button type="submit" disabled={busy || !selectedDevice} className="px-2 py-2 text-2xs text-fg-primary disabled:opacity-40">Отправить приглашение</button><button type="button" disabled={busy} onClick={() => setSharingVault(null)} className="px-2 py-2 text-2xs text-fg-muted">Отмена</button>
                    {recipients.length === 0 && <p className="w-full text-xs text-zinc-500">Сначала разрешите другое устройство.</p>}
                  </form>}
                </React.Fragment>;
              })}
              {vaults.length === 0 && <SettingsRow label="Хранилищ пока нет" description="Создайте локальное хранилище в приложении" />}
            </SettingsGroup>
            <section className="border-t border-white/[0.06] pt-5 flex items-center justify-between gap-4"><div className="flex gap-2 text-xs text-zinc-500"><KeyRound className="w-4 h-4 shrink-0" />Seed аккаунта не хранится в сессии. Выход не удаляет локальные заметки.</div><button type="button" disabled={busy} onClick={() => void perform(() => accountClient.logout(), 'Вы вышли из аккаунта')} className="flex items-center gap-2 text-xs text-zinc-400"><LogOut className="w-4 h-4" />Выйти</button></section>
          </>
        )}
      </main>
    </div>
  );
};
