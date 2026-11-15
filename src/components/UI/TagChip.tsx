// A tag as a chip: clickable to filter, removable while editing, flat or pill.
import React from 'react';
import { Icon } from './icons/Icon';
export interface TagChipProps {
  tag: string;
  variant?: 'pill' | 'flat';
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  prefix?: string;
}

export const TagChip: React.FC<TagChipProps> = ({
  tag,
  variant = 'flat',
  onClick,
  onRemove,
  className = '',
  prefix = '#',
}) => {
  const cleanTag = tag.replace(/^#/, '');

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-tint-6 text-xs font-mono text-fg-tertiary transition-colors ${className}`}
      >
        <span
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onClick={onClick}
          className={onClick ? 'cursor-pointer hover:text-white' : undefined}
        >
          {prefix}{cleanTag}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5 text-fg-muted"
            aria-label={`Удалить тег ${cleanTag}`}
          >
            <Icon name="action.close" size="xs" tone="inherit" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-2xs font-mono text-fg-muted hover:text-fg-soft transition-colors select-none ${className}`}
    >
      <span
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        className={onClick ? 'cursor-pointer hover:underline underline-offset-2' : undefined}
      >
        {prefix}{cleanTag}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-fg-muted hover:text-rose-400 transition-colors cursor-pointer p-0.5 leading-none"
          aria-label={`Удалить тег ${cleanTag}`}
        >
          <Icon name="action.close" size="none" tone="inherit" className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
};
