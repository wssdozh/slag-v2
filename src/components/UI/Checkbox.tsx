// A checkbox with a label and hint, toggled by click or keyboard for settings rows.
import React from 'react';
import { Icon } from './icons/Icon';
export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className = '',
  id,
}) => {
  const handleClick = () => {
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
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none group transition-opacity ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div
        className={`w-4 h-4 mt-0.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-[color,background-color,border-color,box-shadow] ${
          checked
            ? 'bg-white border-white text-black shadow-xs'
            : 'border-tint-20 bg-tint-3 group-hover:border-tint-40'
        }`}
      >
        {checked && <Icon name="action.check" size="xs" tone="inherit" className="stroke-[3]" />}
      </div>
      {(label || description) && (
        <div className="flex flex-col text-left">
          {label && (
            <span className="text-xs font-medium text-fg-soft group-hover:text-white transition-colors">
              {label}
            </span>
          )}
          {description && (
            <span className="text-2xs text-fg-muted leading-relaxed">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
