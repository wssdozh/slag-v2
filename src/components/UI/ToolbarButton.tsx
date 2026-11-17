// Square toolbar button with an active glow, for editor, calendar and view chrome.
import React from 'react';

export interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  active?: boolean;
  glow?: 'blue' | 'none';
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
      activeGlowClass = glow === 'blue'
        ? 'text-blue-400 hover:text-blue-300 hover:bg-tint-6'
        : 'bg-tint-10 text-white';
    } else {
      activeGlowClass = 'text-fg-secondary hover:text-fg-primary hover:bg-tint-6';
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`motion-press cursor-pointer flex items-center justify-center shrink-0 outline-none select-none disabled:opacity-40 disabled:cursor-not-allowed ${sizeClass} ${activeGlowClass} ${className}`}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }
);

ToolbarButton.displayName = 'ToolbarButton';
