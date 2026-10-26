import React from 'react';

export interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  active?: boolean;
  glow?: 'blue' | 'amber' | 'rose' | 'none';
  icon?: React.ReactNode;
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  (
    {
      children,
      icon,
      size = 'md',
      active = false,
      glow = 'none',
      className = '',
      type = 'button',
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClass = size === 'sm' ? 'h-ctrl-sm px-1.5 rounded-md' : 'h-ctrl-md px-1.5 rounded-md';

    let activeGlowClass = '';
    if (active) {
      if (glow === 'blue') {
        activeGlowClass = 'text-blue-400 hover:text-blue-300 hover:bg-white/[0.06]';
      } else if (glow === 'amber') {
        activeGlowClass = 'text-amber-400 hover:text-amber-300 hover:bg-white/[0.06]';
      } else if (glow === 'rose') {
        activeGlowClass = 'text-rose-400 hover:text-rose-300 hover:bg-white/[0.06]';
      } else {
        activeGlowClass = 'bg-white/10 text-white';
      }
    } else {
      activeGlowClass = 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]';
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`transition-all cursor-pointer flex items-center justify-center shrink-0 outline-none select-none disabled:opacity-40 disabled:cursor-not-allowed ${sizeClass} ${activeGlowClass} ${className}`}
        {...props}
      >
        {icon || children}
      </button>
    );
  }
);

ToolbarButton.displayName = 'ToolbarButton';
