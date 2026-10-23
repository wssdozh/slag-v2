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

export interface PriorityBadgeProps {
  priority?: TaskPriority;
  variant?: 'bars' | 'badge' | 'ghost';
  showLabel?: boolean;
  labelFormat?: 'en' | 'ru' | 'uppercase';
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority = 'none',
  variant = 'badge',
  showLabel = true,
  labelFormat = 'en',
  className = '',
}) => {
  if (priority === 'none' && variant === 'badge') return null;

  if (variant === 'bars') {
    return <LinearSignalBars priority={priority} className={className} />;
  }

  const label =
    labelFormat === 'ru'
      ? priority === 'high'
        ? 'Высокий'
        : priority === 'medium'
        ? 'Средний'
        : priority === 'low'
        ? 'Низкий'
        : 'Без приоритета'
      : labelFormat === 'uppercase'
      ? priority.toUpperCase()
      : priority;

  const colorClasses =
    priority === 'high'
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      : priority === 'medium'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : priority === 'low'
      ? 'text-zinc-400 bg-white/5 border-white/10'
      : 'text-zinc-500 bg-white/[0.02] border-white/5';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${colorClasses} ${className}`}
    >
      <LinearSignalBars priority={priority} className="w-3 h-3" />
      {showLabel && <span>{label}</span>}
    </span>
  );
};
