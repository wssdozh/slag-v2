import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'ghost';
  direction?: 'down' | 'up' | 'auto';
  className?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Выберите...',
  size = 'md',
  variant = 'default',
  direction = 'auto',
  className = '',
  dropdownClassName = '',
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [calculatedDirection, setCalculatedDirection] = useState<'down' | 'up'>('down');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Calculate fixed viewport coordinates for portal
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let dir: 'down' | 'up' = 'down';
    if (direction === 'up') {
      dir = 'up';
    } else if (direction === 'down') {
      dir = 'down';
    } else {
      dir = spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down';
    }

    setCalculatedDirection(dir);

    // Keep dropdown within viewport horizontal bounds
    const width = Math.max(rect.width, 160);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }

    setCoords({
      top: dir === 'up' ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
    });
  }, [direction]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  // Re-align on scroll or resize while open
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string, optDisabled?: boolean) => {
    if (optDisabled) return;
    onChange(val);
    setIsOpen(false);
  };

  const isSmall = size === 'sm';

  const portalContent = isOpen && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            top: calculatedDirection === 'up' ? undefined : `${coords.top}px`,
            bottom: calculatedDirection === 'up' ? `${window.innerHeight - coords.top}px` : undefined,
            minWidth: `${coords.width}px`,
          }}
          className={`z-[9999] max-w-[340px] max-h-60 overflow-y-auto rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl shadow-black/90 p-1 backdrop-blur-xl animate-in fade-in duration-100 ${
            calculatedDirection === 'up' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'
          } ${dropdownClassName}`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => handleSelect(opt.value, opt.disabled)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed text-zinc-600'
                    : isSelected
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.icon && <span className="shrink-0 text-zinc-400">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.5]" />
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${className}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        className={`w-full flex items-center justify-between gap-1 transition-all cursor-pointer text-left ${
          variant === 'ghost'
            ? isSmall
              ? 'h-6 px-1.5 text-xs rounded-md bg-transparent hover:bg-white/[0.06] text-zinc-300 hover:text-white border-0'
              : 'h-ctrl-md px-1.5 text-xs rounded-md bg-transparent hover:bg-white/[0.06] text-zinc-300 hover:text-white border-0'
            : isSmall
              ? 'h-ctrl-sm px-2 text-xs rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300'
              : 'h-ctrl-md px-3 text-xs rounded-lg bg-black/50 hover:bg-black/70 border border-white/[0.08] focus:border-white/20 text-zinc-200'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-[0.99]'}`}
      >
        <span className="truncate flex items-center gap-1.5">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className={selectedOption ? 'text-zinc-200' : 'text-zinc-500'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`shrink-0 transition-transform duration-150 text-zinc-500 ${
            isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'
          } ${isOpen ? 'rotate-180 text-zinc-300' : ''}`}
        />
      </button>

      {portalContent}
    </div>
  );
};
