// First settings tab: who you are, how much you have done, plan limits and where to go next.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Laptop, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { navigatePage } from '../../lib/navigation';
import { storage } from '../../lib/storage';
import { summarizeActivity } from '../../lib/activityStats';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import type { SyncStatus } from '../../lib/sync/types';
import type { ProfileInfo } from '../../types';
import { ActivityHeatmap } from './ActivityHeatmap';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';

const AVATAR_SIZE = 128;
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

/** Square-crops and shrinks a picture, because the avatar rides every bundle with the vault. */
async function readAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    const scale = Math.max(AVATAR_SIZE / bitmap.width, AVATAR_SIZE / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (AVATAR_SIZE - width) / 2, (AVATAR_SIZE - height) / 2, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bitmap.close();
  }
}

function initialsFor(profile: ProfileInfo, fallback: string): string {
  const source = profile.name.trim() || fallback;
  const letters = source
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('');
  return letters.toUpperCase() || 'SLAG';
}

/**
 * Первый раздел настроек: кто я, сколько сделано и куда идти за остальным.
 * Профиль и график активности живут в самом хранилище, поэтому видны на всех
 * устройствах и не уходят на релей открытым текстом.
 */
export const AccountSettingsTab: React.FC = () => {
  const { setSettingsTab, items, addToast } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [accountState, setAccountState] = useState(accountClient.getState());
  const [profile, setProfile] = useState<ProfileInfo>(() => storage.getWorkspaceState().profile ?? { name: '' });
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => syncEngine.subscribe(setStatus), []);
  useEffect(() => accountClient.subscribe(setAccountState), []);

  const summary = useMemo(() => summarizeActivity(items), [items]);

  const hosted = status.authRequired || accountClient.isAuthenticated();
  const locked = status.authRequired && !accountClient.isAuthenticated();
  const account = accountState.account;
  const sub = status.subscription;
  const planLabel = account?.planLabel || sub.planLabel;
  const maxDevices = account?.maxDevices ?? sub.maxDevices;
  const usedCacheMb = account?.usedCacheMb ?? sub.usedCacheMb;
  const maxCacheMb = account?.maxCacheMb ?? sub.maxCacheMb;
  const limitsKnown = Boolean(account) || maxDevices > 0;
  const activeDevices = account
    ? accountState.devices.filter((device) => device.status === 'active').length
    : 1 + syncEngine.getConfig().trustedDevices.length;

  const saveProfile = (next: ProfileInfo) => {
    setProfile(next);
    storage.saveWorkspaceState({ profile: next });
  };

  const handleAvatarPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      addToast('Картинка больше 8 МБ — возьми поменьше', 'error');
      return;
    }
    try {
      saveProfile({ ...profile, avatar: await readAvatar(file) });
    } catch {
      addToast('Не удалось прочитать картинку', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {locked && (
        <SettingsGroup title="SLAG ID">
          <SettingsRow label="Синхронизация недоступна" description="Требуется вход в аккаунт SLAG ID." right={
            <button type="button" data-testid="sync-open-account" onClick={() => navigatePage('account')} className="px-3 py-1.5 text-xs text-fg-primary rounded-md hover:bg-surface-hover cursor-pointer">Войти</button>
          } />
        </SettingsGroup>
      )}

      <SettingsGroup title="Профиль" action={<span className="text-2xs font-mono text-fg-dim">в хранилище</span>}>
        <div className="flex items-center gap-3 p-3.5">
          <button
            type="button"
            aria-label="Сменить фото профиля"
            title="Сменить фото профиля"
            onClick={() => avatarInputRef.current?.click()}
            className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-white/[0.06] border border-white/[0.08] hover:border-hover transition-colors cursor-pointer"
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center font-mono text-sm text-fg-muted">
                {initialsFor(profile, account?.id ?? '')}
              </span>
            )}
          </button>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <input
              aria-label="Имя профиля"
              placeholder="Как тебя зовут"
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              onBlur={() => saveProfile(profile)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              spellCheck={false}
              className="w-full bg-transparent text-sm font-medium text-fg-primary placeholder:text-fg-dim outline-none truncate border-b border-transparent focus:border-hover transition-colors"
            />
            <span className="text-xs text-fg-muted">
              {planLabel ?? 'свой сервер'} · нажми на аватар, чтобы сменить фото
            </span>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleAvatarPick(event)}
          />
        </div>
        {profile.avatar && (
          <>
            <SettingsDivider />
            <SettingsRow
              label="Фото профиля"
              description="Картинка сжимается до 128 px и синхронизируется вместе с хранилищем."
              right={
                <button
                  type="button"
                  onClick={() => saveProfile({ ...profile, avatar: undefined })}
                  className="px-2 py-1.5 text-2xs text-fg-muted rounded-md hover:bg-surface-hover hover:text-danger cursor-pointer"
                >
                  убрать
                </button>
              }
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Активность"
        action={<span className="text-2xs font-mono text-fg-dim">по записям хранилища</span>}
      >
        <ActivityHeatmap summary={summary} />
      </SettingsGroup>

      <SettingsGroup title="Аккаунт">
        <SettingsRow label="Тариф" value={planLabel} />
        <SettingsDivider />
        <SettingsRow label="Срок действия" value={hosted ? (account ? (account.expiresAt ? <span className="font-mono">{new Date(account.expiresAt).toLocaleDateString('ru-RU')}</span> : 'Бессрочно') : 'Требуется вход') : 'Свой сервер'} />
        <SettingsDivider />
        <SettingsRow label="Кеш" value={limitsKnown ? <span className="font-mono">{usedCacheMb} МБ / {maxCacheMb >= 1024 ? `${Math.round(maxCacheMb / 1024)} ГБ` : `${maxCacheMb} МБ`}</span> : 'Не синхронизирован'} />
      </SettingsGroup>

      <SettingsGroup>
        {hosted && !locked && (
          <>
            <SettingsRow icon={<UserRound className="w-4 h-4" />} label="Личный кабинет" description="Подписка, устройства и доступ к хранилищам" onClick={() => navigatePage('account')} external />
            <SettingsDivider inset />
          </>
        )}
        <SettingsRow icon={<Laptop className="w-4 h-4" />} label="Подключённые устройства" value={<span className="font-mono">{limitsKnown ? `${activeDevices} из ${maxDevices}` : activeDevices}</span>} testId="sync-to-devices-btn" onClick={() => setSettingsTab('devices')} chevron />
      </SettingsGroup>
    </div>
  );
};
