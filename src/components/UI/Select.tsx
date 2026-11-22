// The app's own select: grouped options, icons, colours, a portal list and placement.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { Icon } from './icons/Icon';
import { usePresence } from '../../hooks/ui/usePresence';

export interface SelectOption {
  value: string;
  label: string;
  /** Shown on the closed trigger when the list label is a tree branch, e.g. "… / Род / доч". */
  triggerLabel?: string;
  /** Monospace the label: tree branch glyphs only line up in a fixed-width font. */
  mono?: boolean;
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
  triggerClassName?: string;
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
  triggerClassName = '',
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const getAnchor = useCallback(() => containerRef.current, []);

  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on typeahead search query
  const filteredOptions = searchQuery.trim()
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  // Open on the current choice: highlight is set in handleToggle, scroll is here.
  useEffect(() => {
    if (!isOpen || !isPresent) return;
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, [isOpen, isPresent, listRef]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setSearchQuery('');
      const idx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
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

  const portalContent = isPresent && (
        <AnchoredPopover
          surfaceRef={listRef}
          getAnchor={getAnchor}
          isOpen={isOpen}
          direction={direction}
          minWidth={160}
          maxWidth={340}
          maxHeight={240}
          matchAnchorWidth
          role="listbox"
          data-motion-state={phase}
          onTransitionEnd={onTransitionEnd}
          className={`z-[9999] rounded-xl bg-surface-elevated border border-tint-10 shadow-2xl shadow-scrim-90 p-1 backdrop-blur-xl motion-popover flex flex-col gap-0.5 ${dropdownClassName}`}
        >
          {/* Subtle Search Query Badge when user types */}
          {searchQuery && (
            <div className="flex items-center justify-between px-2.5 py-1 text-3xs font-mono text-fg-secondary bg-tint-4 rounded-lg border-b border-tint-6 mb-0.5">
              <span className="truncate">Поиск: <span className="text-white font-semibold">«{searchQuery}»</span></span>
              <span className="text-fg-muted shrink-0">{filteredOptions.length}</span>
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-fg-muted font-mono select-none">
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
                    <div className="h-px bg-tint-8 my-1 mx-1 shrink-0" />
                  )}
                  <button
                    type="button"
                    role="option"
                    data-testid={opt.testId}
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    className={`w-full flex shrink-0 items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed text-fg-dim'
                        : isSelected
                        ? 'bg-tint-10 text-white font-medium'
                        : isHighlighted
                        ? 'bg-tint-6 text-white'
                        : 'text-fg-tertiary hover:text-white hover:bg-tint-6'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <span className={`truncate ${opt.mono ? 'font-mono whitespace-pre' : ''} ${opt.color || (isSelected ? 'text-white' : 'text-fg-tertiary')}`}>
                        {opt.label}
                      </span>
                    </div>
                    {isSelected && (
                      <Icon name="action.check" size="sm" tone="primary" className="shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </AnchoredPopover>
  );

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
              ? 'h-6 px-1.5 text-xs rounded-md bg-transparent hover:bg-tint-6 text-fg-tertiary hover:text-white border-0'
              : 'h-ctrl-md px-1.5 text-xs rounded-md bg-transparent hover:bg-tint-6 text-fg-tertiary hover:text-white border-0'
            : isSmall
              ? 'h-ctrl-sm px-2 text-xs rounded-md bg-tint-4 hover:bg-tint-8 border border-tint-8 text-fg-tertiary'
              : 'h-ctrl-md px-3 text-xs rounded-lg bg-scrim-50 hover:bg-scrim-70 border border-tint-8 focus:border-tint-20 text-fg-soft'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${triggerClassName}`}
      >
        <span className="truncate flex items-center gap-1.5">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          {showLabel && (
            <span className={selectedOption?.color || (selectedOption ? 'text-fg-soft' : 'text-fg-muted')}>
              {selectedOption ? (selectedOption.triggerLabel ?? selectedOption.label) : placeholder}
            </span>
          )}
        </span>
        {showArrow && (
          <Icon name="nav.down" size="md" tone="muted" className={`shrink-0 transition-transform duration-150 ${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isOpen ? 'rotate-180 text-fg-tertiary' : ''}`} />
        )}
      </button>

      {portalContent}
    </div>
  );
};
