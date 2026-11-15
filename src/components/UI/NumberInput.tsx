// Stepper input: minus/plus buttons and a typed value, clamped to min/max on blur.
import React from 'react';
import { Icon } from './icons/Icon';
export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const handleDecrement = () => {
    if (disabled || (min !== undefined && value <= min)) return;
    onChange(Math.max(min, value - step));
  };

  const handleIncrement = () => {
    if (disabled || (max !== undefined && value >= max)) return;
    onChange(Math.min(max, value + step));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') return;
    const num = Number(raw);
    if (!isNaN(num)) {
      onChange(num);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let num = Number(raw);
    if (isNaN(num)) num = min;
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;
    onChange(num);
  };

  const canDec = !disabled && (min === undefined || value > min);
  const canInc = !disabled && (max === undefined || value < max);

  return (
    <div
      className={`inline-flex items-center h-8 bg-scrim-50 border border-tint-8 focus-within:border-tint-20 rounded-lg overflow-hidden transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={!canDec}
        aria-label="Уменьшить"
        className="w-7 h-full flex items-center justify-center text-fg-secondary hover:text-white hover:bg-tint-6 motion-press disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
      >
        <Icon name="action.decrement" size="xs" tone="inherit" />
      </button>

      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={handleInputChange}
        onBlur={handleBlur}
        aria-label={ariaLabel}
        className="w-10 text-center font-mono text-xs text-white bg-transparent outline-none select-text border-none p-0"
      />

      <button
        type="button"
        onClick={handleIncrement}
        disabled={!canInc}
        aria-label="Увеличить"
        className="w-7 h-full flex items-center justify-center text-fg-secondary hover:text-white hover:bg-tint-6 motion-press disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
      >
        <Icon name="action.add" size="xs" tone="inherit" />
      </button>
    </div>
  );
};
