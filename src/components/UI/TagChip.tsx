import React from 'react';
import { X } from 'lucide-react';

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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] text-xs font-mono text-zinc-300 transition-colors ${className}`}
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
            className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5 text-zinc-500"
            aria-label={`Удалить тег ${cleanTag}`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-2xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors select-none ${className}`}
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
          className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer p-0.5 leading-none"
          aria-label={`Удалить тег ${cleanTag}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
};
