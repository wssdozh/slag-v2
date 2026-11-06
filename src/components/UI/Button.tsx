import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      icon,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'h-7 px-2.5 text-xs rounded-lg gap-1.5',
      md: 'h-8 px-3.5 text-xs rounded-xl gap-2',
      lg: 'h-10 px-4 text-sm rounded-xl gap-2',
    }[size];

    const variantClasses = {
      primary:
        'bg-white text-black hover:bg-zinc-200 font-semibold shadow-sm',
      secondary:
        'bg-white/[0.06] hover:bg-white/10 text-zinc-200 font-medium border border-white/[0.08]',
      ghost:
        'hover:bg-white/[0.06] text-zinc-400 hover:text-white font-medium',
      danger:
        'hover:bg-rose-500/10 text-rose-400 font-medium',
    }[variant];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`inline-flex items-center justify-center select-none cursor-pointer motion-press outline-none focus:ring-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none whitespace-nowrap ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
