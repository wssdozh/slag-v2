// The identity block: round photo with its edit menu, name and plan, the same on both screens.
import React, { useRef, useState } from 'react';
import { Camera, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import { accountClient } from '../../lib/sync/account';
import type { ProfileInfo } from '../../types';
import { IconButton } from '../UI/IconButton';
import { MenuDropdown } from '../UI/MenuDropdown';
import { ProfileAvatar } from './ProfileAvatar';

const AVATAR_SIZE = 128;
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

const PHOTO_MENU_ITEM =
  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-fg-secondary ' +
  'hover:bg-white/[0.06] hover:text-fg-primary transition-colors outline-none ring-0 cursor-pointer';
const PHOTO_MENU_ITEM_DANGER =
  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-rose-400 ' +
  'hover:bg-rose-500/10 hover:text-rose-300 transition-colors outline-none ring-0 cursor-pointer';

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

interface ProfileCardProps {
  /** The line under the name: plan, cache, or the login hint. */
  planLabel: string;
}

/**
 * One profile header for the desktop settings tab and the phone settings root. It owns the
 * photo, the name and the vault write, because that is the whole job of the block.
 */
export const ProfileCard: React.FC<ProfileCardProps> = ({ planLabel }) => {
  const { addToast } = useApp();
  const [profile, setProfile] = useState<ProfileInfo>(() => storage.getWorkspaceState().profile ?? { name: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const save = (next: ProfileInfo) => {
    setProfile(next);
    storage.saveWorkspaceState({ profile: next });
    // The name lives in the vault; the copy on the account exists so the telegram bot can greet
    // a person in `/start`, where it has no way to decrypt anything.
    if (!accountClient.isAuthenticated()) return;
    void accountClient.setProfileName(next.name).catch(() => {
      addToast('Имя сохранено здесь, но не на аккаунте — бот его не увидит', 'error');
    });
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
      save({ ...profile, avatar: await readAvatar(file) });
    } catch {
      addToast('Не удалось прочитать картинку', 'error');
    }
  };

  const menuItems = (
    <>
      <button
        type="button"
        className={PHOTO_MENU_ITEM}
        onClick={() => {
          setIsMenuOpen(false);
          avatarInputRef.current?.click();
        }}
      >
        <Camera className="w-3.5 h-3.5 shrink-0" />
        <span>Сменить фото</span>
      </button>
      {profile.avatar && (
        <>
          <div className="my-0.5 border-t border-subtle" />
          <button
            type="button"
            className={PHOTO_MENU_ITEM_DANGER}
            onClick={() => {
              setIsMenuOpen(false);
              save({ ...profile, avatar: undefined });
            }}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Убрать фото</span>
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="relative flex flex-col items-center gap-1 px-4 pt-5 pb-5">
      <div className="absolute right-2 top-2">
        <MenuDropdown
          ariaLabel="Действия с фото профиля"
          minWidth={168}
          align="end"
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          trigger={
            <IconButton size="sm" title="Изменить фото" aria-label="Изменить фото">
              <Pencil className="w-3.5 h-3.5" />
            </IconButton>
          }
        >
          {menuItems}
        </MenuDropdown>
      </div>
      <button
        type="button"
        aria-label="Сменить фото профиля"
        title="Сменить фото профиля"
        onClick={() => avatarInputRef.current?.click()}
        className="w-[72px] h-[72px] mb-1 rounded-full overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
      >
        <ProfileAvatar profile={profile} className="w-full h-full text-base" />
      </button>
      <input
        aria-label="Имя профиля"
        placeholder="Как тебя зовут"
        value={profile.name}
        onChange={(event) => setProfile({ ...profile, name: event.target.value })}
        onBlur={() => save(profile)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        spellCheck={false}
        className="w-full max-w-[220px] bg-transparent text-center text-sm font-medium text-fg-primary placeholder:text-fg-dim outline-none truncate border-b border-transparent focus:border-hover transition-colors"
      />
      <span className="text-xs text-fg-muted text-center">{planLabel}</span>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleAvatarPick(event)}
      />
    </div>
  );
};
