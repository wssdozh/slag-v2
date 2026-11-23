// The app's own yes/no for destructive actions, instead of the platform's confirm.
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { BaseModal } from './BaseModal';
import { useApp } from '../../context/AppContext';
import { usePresence } from '../../hooks/ui/usePresence';
import type { ConfirmOptions } from '../../types';

interface ConfirmSnapshot {
  open: boolean;
  request: ConfirmOptions | null;
}

/**
 * The app's own question for irreversible actions. It replaces `window.confirm`, which on
 * desktop is an OS window and on Android a grey WebView alert, neither of which belongs to
 * this interface.
 *
 * The question outlives its answer by one exit: the owner stays mounted and keeps the last
 * request only while `usePresence` fades the surface, so the dialog leaves like every other
 * overlay instead of popping out in the commit that answered it. The request itself is
 * already resolved by then — the surface is inert and `aria-hidden`, and Escape belongs to
 * the layer below. A question asked inside that window reuses the same surface and reverses
 * the fade; nothing remounts.
 */
export const ConfirmDialog: React.FC = () => {
  const { confirmRequest, resolveConfirm } = useApp();
  const isOpen = confirmRequest !== null;
  const presence = usePresence(isOpen);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState<ConfirmSnapshot>({ open: isOpen, request: confirmRequest });
  // The close keeps the previous request: the surface still has to draw the question it is
  // fading, while `confirmRequest` is already null and the promise is resolved.
  if (snapshot.open !== isOpen || (confirmRequest !== null && confirmRequest !== snapshot.request)) {
    setSnapshot({ open: isOpen, request: confirmRequest ?? snapshot.request });
  }

  // Same first focus `autoFocus` gave the safe action, one frame later: BaseModal records the
  // element that owns focus as the dialog mounts, and a Cancel button focused in that same commit
  // would be recorded as its own trigger — the exit would then hand focus back to the button it is
  // removing. The frame also lets React's development-only remount of the fresh subtree finish,
  // since its cleanup restores that trigger.
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen, confirmRequest]);

  if (!presence.isPresent) return null;

  const request = confirmRequest ?? snapshot.request;
  if (!request) return null;

  return (
    <BaseModal
      presence={presence}
      isOpen={isOpen}
      onClose={() => resolveConfirm(false)}
      title={request.title}
      icon={request.isDestructive ? <Icon name="status.warning" size="md" tone="danger" /> : undefined}
      showCloseButton={false}
      role="alertdialog"
      maxWidth="max-w-sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => resolveConfirm(false)}
            className="px-3 py-1.5 rounded-md text-xs text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors cursor-pointer"
          >
            {request.cancelLabel ?? 'Отмена'}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              request.isDestructive
                ? 'bg-rose-500/90 text-white hover:bg-rose-500'
                : 'bg-accent-strong text-white hover:bg-accent-strong/90'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      }
    >
      <p className="px-4 md:px-5 py-4 text-xs leading-relaxed text-fg-secondary">
        {request.description ?? 'Действие нельзя отменить.'}
      </p>
    </BaseModal>
  );
};
