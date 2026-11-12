// Priority as four Linear-style signal bars, plus the matching badge for task rows.
import React from 'react';

export type TaskPriority = 'none' | 'low' | 'medium' | 'high';

export interface LinearSignalBarsProps {
  priority?: TaskPriority;
  className?: string;
  size?: 'sm' | 'md';
}

export const LinearSignalBars: React.FC<LinearSignalBarsProps> = ({
  priority = 'none',
  className = '',
  size = 'sm',
}) => {
  const p = priority || 'none';
  const sizeClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <svg
      className={`${sizeClasses} shrink-0 ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-label={`Приоритет: ${p}`}
    >
      {/* Bar 1 (Short) */}
      <rect
        x="2"
        y="10"
        width="2.5"
        height="4"
        rx="0.75"
        className={
          p === 'high'
            ? 'fill-rose-500'
            : p === 'medium'
            ? 'fill-amber-400'
            : p === 'low'
            ? 'fill-zinc-400'
            : 'fill-zinc-700'
        }
      />
      {/* Bar 2 (Medium) */}
      <rect
        x="6.75"
        y="6"
        width="2.5"
        height="8"
        rx="0.75"
        className={
          p === 'high'
            ? 'fill-rose-500'
            : p === 'medium'
            ? 'fill-amber-400'
            : 'fill-zinc-700'
        }
      />
      {/* Bar 3 (Tall) */}
      <rect
        x="11.5"
        y="2"
        width="2.5"
        height="12"
        rx="0.75"
        className={
          p === 'high'
            ? 'fill-rose-500'
            : 'fill-zinc-700'
        }
      />
    </svg>
  );
};

