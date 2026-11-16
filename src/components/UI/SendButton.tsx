// The round accent arrow that confirms: send, attach or save, one plate for all forms.
import React from 'react';
import { Icon } from './icons/Icon';

export interface SendButtonProps {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  /** The plate is an arrow: nothing else says what it does, so the name has to. */
  label: string;
  disabled?: boolean;
  title?: string;
  /** `lg` is the gallery's confirm — thumb-sized, the same blue as the composer's. */
  size?: 'sm' | 'lg';
  className?: string;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
}

const BOX: Record<'sm' | 'lg', string> = { sm: 'h-9 w-9', lg: 'h-12 w-12' };

/**
 * The one confirm plate: the composer sends a note with it, the picker attaches, the editor
 * saves. Round, accent, an arrow — the shape is the meaning, so it is not redrawn per surface.
 */
export const SendButton: React.FC<SendButtonProps> = ({
  onClick,
  label,
  disabled = false,
  title,
  size = 'sm',
  className = '',
  onPointerDown,
}) => (
  <button
    type="button"
    onClick={onClick}
    onPointerDown={onPointerDown}
    disabled={disabled}
    aria-label={label}
    title={title ?? label}
    className={`flex shrink-0 items-center justify-center rounded-full shadow-sm motion-press ${BOX[size]} ${
      disabled
        ? 'cursor-not-allowed bg-surface-active text-fg-dim'
        : 'cursor-pointer bg-accent-strong text-white hover:bg-accent-strong/90'
    } ${className}`}
  >
    {/* weight is decided by Icon, not by the call site */}
    <Icon name="action.send" size={size === 'sm' ? 'md' : 'lg'} />
  </button>
);
