import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  /** Stable hook for tests that drive a specific option. */
  testId?: string;
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
  title?: string;
  showLabel?: boolean;
  showArrow?: boolean;
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
  title,
  showLabel = true,
  showArrow = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { ref: listRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [calculatedDirection, setCalculatedDirection] = useState<'down' | 'up'>('down');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [lastCoords, setLastCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  if (coords && coords !== lastCoords) {
    setLastCoords(coords);
  }
  const effectiveCoords = coords || lastCoords;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on typeahead search query
  const filteredOptions = searchQuery.trim()
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

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
      setSearchQuery('');
      const idx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleSelect = useCallback((val: string, optDisabled?: boolean) => {
    if (optDisabled) return;
    onChange(val);
    setIsOpen(false);
  }, [onChange]);

  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, filteredOptions.length - 1));

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('[role="option"]');
    if (items[safeHighlightedIndex]) {
      items[safeHighlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, safeHighlightedIndex, listRef]);

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

  // Keyboard navigation, typeahead search, and click outside
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
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredOptions.length - 1)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const targetOpt = filteredOptions[safeHighlightedIndex];
        if (targetOpt && !targetOpt.disabled) {
          handleSelect(targetOpt.value, targetOpt.disabled);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setSearchQuery((prev) => prev.slice(0, -1));
        setHighlightedIndex(0);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typing characters filters options on the fly (typeahead search)
        e.preventDefault();
        setSearchQuery((prev) => prev + e.key);
        setHighlightedIndex(0);

        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
        searchTimeoutRef.current = setTimeout(() => {
          setSearchQuery('');
        }, 1500);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [isOpen, filteredOptions, safeHighlightedIndex, handleSelect, listRef]);

  const isSmall = size === 'sm';

  const portalContent = isPresent && effectiveCoords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={listRef}
          role="listbox"
          data-motion-state={phase}
          onTransitionEnd={onTransitionEnd}
          style={{
            position: 'fixed',
            left: `${effectiveCoords.left}px`,
            top: calculatedDirection === 'up' ? undefined : `${effectiveCoords.top}px`,
            bottom: calculatedDirection === 'up' ? `${window.innerHeight - effectiveCoords.top}px` : undefined,
            minWidth: `${effectiveCoords.width}px`,
          }}
          className={`z-[9999] max-w-[340px] max-h-60 overflow-y-auto rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl shadow-black/90 p-1 backdrop-blur-xl motion-popover flex flex-col gap-0.5 ${dropdownClassName}`}
        >
          {/* Subtle Search Query Badge when user types */}
          {searchQuery && (
            <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-mono text-zinc-400 bg-white/[0.04] rounded-lg border-b border-white/[0.06] mb-0.5">
              <span className="truncate">Поиск: <span className="text-white font-semibold">«{searchQuery}»</span></span>
              <span className="text-zinc-500 shrink-0">{filteredOptions.length}</span>
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-zinc-500 font-mono select-none">
              Ничего не найдено
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === safeHighlightedIndex;
              const showDivider = Boolean(opt.dividerBefore && idx > 0);

              return (
                <React.Fragment key={opt.value}>
                  {showDivider && (
                    <div className="h-px bg-white/[0.08] my-1 mx-1 shrink-0" />
                  )}
                  <button
                    type="button"
                    role="option"
                    data-testid={opt.testId}
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed text-zinc-600'
                        : isSelected
                        ? 'bg-white/10 text-white font-medium'
                        : isHighlighted
                        ? 'bg-white/[0.06] text-white'
                        : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <span className={`truncate ${opt.color || (isSelected ? 'text-white' : 'text-zinc-300')}`}>
                        {opt.label}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
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
        title={title || ariaLabel || selectedOption?.label || placeholder}
        className={`w-full flex items-center justify-between gap-1 motion-press cursor-pointer text-left ${
          variant === 'ghost'
            ? isSmall
              ? 'h-6 px-1.5 text-xs rounded-md bg-transparent hover:bg-white/[0.06] text-zinc-300 hover:text-white border-0'
              : 'h-ctrl-md px-1.5 text-xs rounded-md bg-transparent hover:bg-white/[0.06] text-zinc-300 hover:text-white border-0'
            : isSmall
              ? 'h-ctrl-sm px-2 text-xs rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300'
              : 'h-ctrl-md px-3 text-xs rounded-lg bg-black/50 hover:bg-black/70 border border-white/[0.08] focus:border-white/20 text-zinc-200'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span className="truncate flex items-center gap-1.5">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          {showLabel && (
            <span className={selectedOption?.color || (selectedOption ? 'text-zinc-200' : 'text-zinc-500')}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          )}
        </span>
        {showArrow && (
          <ChevronDown
            className={`shrink-0 transition-transform duration-150 text-zinc-500 ${
              isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'
            } ${isOpen ? 'rotate-180 text-zinc-300' : ''}`}
          />
        )}
      </button>

      {portalContent}
    </div>
  );
};
