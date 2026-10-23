import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className = '',
  id,
}) => {
  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div
      id={id}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={`inline-flex items-center justify-between gap-3 cursor-pointer select-none group transition-opacity ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex flex-col text-left">
          {label && (
            <span className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-zinc-500 leading-relaxed">
              {description}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out shrink-0 relative ${
          checked ? 'bg-white' : 'bg-white/10 group-hover:bg-white/15'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out shadow-sm ${
            checked
              ? 'translate-x-4 bg-black'
              : 'translate-x-0 bg-zinc-400'
          }`}
        />
      </div>
    </div>
  );
};
