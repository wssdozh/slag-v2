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
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer leading-none p-0 bg-transparent border-0 select-none ${className}`}
    >
      {prefix}{cleanTag}
    </button>
  );
};
