// Square icon-only button in three sizes and three tones, for dense toolbars.
import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'danger' | 'secondary';
  icon?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      icon,
      size = 'md',
      variant = 'ghost',
      className = '',
      type = 'button',
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'w-6 h-6 rounded-md',
      md: 'w-7 h-7 rounded-lg',
      lg: 'w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-md',
    }[size];

    const variantClasses = {
      ghost: 'text-fg-muted hover:text-fg-primary',
      danger: 'text-fg-muted hover:text-rose-400 hover:bg-tint-6',
      secondary: 'text-fg-tertiary bg-tint-6 hover:bg-tint-10',
    }[variant];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`flex items-center justify-center shrink-0 select-none cursor-pointer motion-press outline-none focus:ring-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {icon || children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
