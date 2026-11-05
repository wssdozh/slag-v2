import React, { useState } from 'react';
import { MenuDropdown } from './MenuDropdown';
import { ChevronDown, Check } from 'lucide-react';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  showLabelInExpanded?: boolean;
  showLabelInTrigger?: boolean;
  title?: string;
  ariaLabel?: string;
}

export interface ResponsiveSegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  compact?: boolean;
  size?: 'sm' | 'md';
  direction?: 'down' | 'up' | 'auto';
  className?: string;
  ariaLabel?: string;
}

export function ResponsiveSegmented<T extends string = string>({
  value,
  onChange,
  options,
  compact = false,
  size = 'sm',
  direction = 'auto',
  className = '',
  ariaLabel,
}: ResponsiveSegmentedProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const heightClass = size === 'sm' ? 'h-ctrl-sm' : 'h-ctrl-md';

  // Compact Mode: Single dropdown trigger button displaying current active option
  if (compact) {
    const showTriggerLabel = selectedOption?.showLabelInTrigger ?? !selectedOption?.icon;

    return (
      <MenuDropdown
        ariaLabel={ariaLabel}
        className={className}
        direction={direction}
        minWidth={150}
        positioningWidth={160}
        clampLeft={false}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        trigger={
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel || selectedOption?.ariaLabel || selectedOption?.label}
          title={selectedOption?.title || selectedOption?.label}
          className={`${heightClass} px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 ${
            isOpen ? 'bg-white/[0.06] text-white' : ''
          } flex items-center gap-1.5 text-xs transition-colors cursor-pointer shrink-0`}
        >
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          {showTriggerLabel && selectedOption?.label && (
            <span className="truncate text-xs font-medium max-w-[70px]">
              {selectedOption.label}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-150 shrink-0 ${
              isOpen ? 'rotate-180 text-zinc-300' : ''
            }`}
          />
        </button>
        }
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                isSelected
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                <span className="truncate">{opt.label}</span>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.5]" />}
            </button>
          );
        })}
      </MenuDropdown>
    );
  }

  // Expanded Mode: Segmented strip of buttons
  return (
    <div
      aria-label={ariaLabel}
      className={`flex items-center ${heightClass} gap-0.5 shrink-0 ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const showExpandedLabel = opt.showLabelInExpanded ?? !opt.icon;

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.title || opt.label}
            aria-label={opt.ariaLabel || opt.label}
            className={`h-full ${
              opt.icon && !showExpandedLabel ? 'px-1.5' : 'px-2'
            } rounded-md text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              isSelected
                ? 'bg-white/10 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {showExpandedLabel && opt.label && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
