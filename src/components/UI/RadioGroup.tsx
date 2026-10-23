import React, { createContext, useContext } from 'react';

interface RadioContextType {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

const RadioContext = createContext<RadioContextType | null>(null);

export interface RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onChange,
  name,
  disabled = false,
  children,
  className = '',
}) => {
  return (
    <RadioContext.Provider value={{ value, onChange, name, disabled }}>
      <div role="radiogroup" className={`flex flex-col gap-2 ${className}`}>
        {children}
      </div>
    </RadioContext.Provider>
  );
};

export interface RadioProps {
  value: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const Radio: React.FC<RadioProps> = ({
  value,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  const context = useContext(RadioContext);
  if (!context) {
    throw new Error('Radio must be used within a RadioGroup');
  }

  const isChecked = context.value === value;
  const isDisabled = disabled || context.disabled;

  const handleSelect = () => {
    if (isDisabled) return;
    context.onChange(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isDisabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      context.onChange(value);
    }
  };

  return (
    <div
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      role="radio"
      aria-checked={isChecked}
      aria-disabled={isDisabled}
      tabIndex={isDisabled ? -1 : 0}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none group transition-opacity ${
        isDisabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div
        className={`w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
          isChecked
            ? 'border-white bg-white text-black'
            : 'border-white/20 bg-black/40 group-hover:border-white/40'
        }`}
      >
        {isChecked && <div className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />}
      </div>
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
    </div>
  );
};
