// The identity block: round photo with its edit menu, name and plan, the same on both screens.
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import { accountClient } from '../../lib/sync/account';
import type { ProfileInfo } from '../../types';
import { IconButton } from '../UI/IconButton';
import { MenuDropdown } from '../UI/MenuDropdown';
import { useIsMobile } from '../../hooks/layout/useIsMobile';
import { ProfileAvatar } from './ProfileAvatar';

/** The stored crop is square and a bit larger than the biggest on-screen circle. */
const AVATAR_SIZE = 192;
const AVATAR_DESKTOP = 132;
const AVATAR_MOBILE = 92;
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

const PHOTO_MENU_ITEM =
  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-fg-secondary ' +
  'hover:bg-tint-6 hover:text-fg-primary transition-colors outline-none ring-0 cursor-pointer';
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
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState<ProfileInfo>(() => storage.getWorkspaceState().profile ?? { name: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // The name and the photo arrive from another device inside the workspace state, and the block
  // is already on screen when they do: the card used to keep showing the initials it mounted with.
  useEffect(() => {
    const applySyncedProfile = () => {
      // Never yank the field out from under someone who is mid-word.
      if (document.activeElement === nameInputRef.current) return;
      const stored = storage.getWorkspaceState().profile ?? { name: '' };
      setProfile((prev) => (
        prev.name === stored.name && (prev.avatar ?? '') === (stored.avatar ?? '') ? prev : stored
      ));
    };
    window.addEventListener('slag-sync-updated', applySyncedProfile);
    return () => window.removeEventListener('slag-sync-updated', applySyncedProfile);
  }, []);

  const save = async (next: ProfileInfo) => {
    try {
      await storage.saveWorkspaceState({ profile: next });
    } catch {
      return; // The workspace writer reports the failure; don't publish it to the account.
    }
    setProfile(next);
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
        <Icon name="media.camera" size="sm" tone="inherit" className="shrink-0" />
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
            <Icon name="action.delete" size="sm" tone="inherit" className="shrink-0" />
            <span>Убрать фото</span>
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-5">
      <div className="relative mb-4">
        <button
          type="button"
          aria-label="Сменить фото профиля"
          title="Сменить фото профиля"
          onClick={() => avatarInputRef.current?.click()}
          style={{ width: isMobile ? AVATAR_MOBILE : AVATAR_DESKTOP, height: isMobile ? AVATAR_MOBILE : AVATAR_DESKTOP }}
          className="block rounded-full overflow-hidden border border-subtle bg-tint-6 hover:border-hover transition-colors cursor-pointer outline-none ring-0 focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ProfileAvatar
            profile={profile}
            className={`w-full h-full ${isMobile ? 'text-2xl' : 'text-3xl'}`}
          />
        </button>
        <div className="absolute -bottom-1 -right-1">
          <MenuDropdown
            ariaLabel="Действия с фото профиля"
            minWidth={168}
            align="end"
            isOpen={isMenuOpen}
            onOpenChange={setIsMenuOpen}
            trigger={
              <IconButton
                size="md"
                title="Изменить фото"
                aria-label="Изменить фото"
                className="max-sm:w-9 max-sm:h-9 rounded-full border border-subtle bg-surface-elevated shadow-sm hover:border-hover hover:bg-surface-hover"
              >
                <Icon name="action.edit" size="sm" tone="inherit" />
              </IconButton>
            }
          >
            {menuItems}
          </MenuDropdown>
        </div>
      </div>
      <input
        ref={nameInputRef}
        aria-label="Имя профиля"
        placeholder="Как тебя зовут"
        value={profile.name}
        onChange={(event) => setProfile({ ...profile, name: event.target.value })}
        onBlur={() => save(profile)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        spellCheck={false}
        className={`w-full max-w-[240px] bg-transparent text-center font-semibold text-fg-primary placeholder:text-fg-dim outline-none truncate border-b border-transparent focus:border-hover transition-colors ${isMobile ? 'text-base' : 'text-lg'}`}
      />
      <span className="mt-1 max-w-[320px] text-center text-sm leading-relaxed text-fg-muted text-pretty">
        {planLabel}
      </span>
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
