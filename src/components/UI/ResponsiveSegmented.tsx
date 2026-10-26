import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownWidth = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let dir: 'down' | 'up' = 'down';
    if (direction === 'up') {
      dir = 'up';
    } else if (direction === 'down') {
      dir = 'down';
    } else {
      dir = spaceBelow < 180 && spaceAbove > spaceBelow ? 'up' : 'down';
    }

    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - dropdownWidth - 8);
    }

    if (dir === 'up') {
      setCoords({
        bottom: window.innerHeight - rect.top + 6,
        left,
      });
    } else {
      setCoords({
        top: rect.bottom + 6,
        left,
      });
    }
  }, [direction]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  const heightClass = size === 'sm' ? 'h-ctrl-sm' : 'h-ctrl-md';

  // Compact Mode: Single dropdown trigger button displaying current active option
  if (compact) {
    const showTriggerLabel = selectedOption?.showLabelInTrigger ?? !selectedOption?.icon;

    const portalContent =
      isOpen && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                ...(coords.top !== undefined ? { top: `${coords.top}px` } : {}),
                ...(coords.bottom !== undefined ? { bottom: `${coords.bottom}px` } : {}),
                left: `${coords.left}px`,
              }}
              className="z-[9999] min-w-[150px] rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl shadow-black/90 p-1 backdrop-blur-xl animate-in fade-in duration-100"
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
            </div>,
            document.body
          )
        : null;

    return (
      <div aria-label={ariaLabel} className={`relative inline-flex items-center shrink-0 ${className}`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={handleToggle}
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
        {portalContent}
      </div>
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
