// Anchored popover menu that flips and clamps itself inside the viewport, portal-rendered.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { usePresence } from '../../hooks/ui/usePresence';

export interface MenuDropdownProps {
  /** Trigger element */
  trigger: React.ReactNode;
  /** Dropdown menu content */
  children: React.ReactNode;
  /** Direction preference */
  direction?: 'down' | 'up' | 'auto';
  /** Align preference */
  align?: 'start' | 'end';
  /** Min width of the dropdown popover in px */
  minWidth?: number;
  ariaLabel?: string;
  /** Controlled open state */
  isOpen?: boolean;
  /** Controlled open state callback */
  onOpenChange?: (open: boolean) => void;
  /** Custom wrapper class */
  className?: string;
  /** Custom dropdown popover class */
  dropdownClassName?: string;
}

export const MenuDropdown: React.FC<MenuDropdownProps> = ({
  trigger,
  children,
  direction = 'auto',
  align = 'start',
  minWidth = 150,
  ariaLabel,
  isOpen: controlledIsOpen,
  onOpenChange,
  className = '',
  dropdownClassName = '',
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const { ref: dropdownRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledIsOpen === undefined) {
        setInternalIsOpen(next);
      }
      onOpenChange?.(next);
    },
    [controlledIsOpen, onOpenChange]
  );

  const triggerContainerRef = useRef<HTMLDivElement | null>(null);
  const getAnchor = useCallback(() => triggerContainerRef.current, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerContainerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      // The popover is the top layer: the click that dismisses it is spent on the menu.
      // Letting it through would also close the dialog underneath (LIFO violation) —
      // capture runs before React's root, so the target never sees this click.
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // The popover is the top layer: the dialog it sits in must stay open. The
        // shared hotkeys listen on window, downstream of this document-level handler.
        e.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener('click', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpen, dropdownRef]);

  return (
    <div ref={triggerContainerRef} aria-label={ariaLabel} className={`relative inline-flex items-center shrink-0 ${className}`}>
      <div onClick={() => setOpen(!isOpen)} className="inline-flex items-center">
        {trigger}
      </div>
      {isPresent && (
        <AnchoredPopover
          surfaceRef={dropdownRef}
          getAnchor={getAnchor}
          isOpen={isOpen}
          direction={direction}
          align={align}
          minWidth={minWidth}
          data-motion-state={phase}
          onTransitionEnd={onTransitionEnd}
          className={`z-[9999] rounded-xl bg-surface-elevated border border-tint-10 shadow-2xl shadow-scrim-90 p-1 backdrop-blur-xl motion-popover ${dropdownClassName}`}
        >
          {children}
        </AnchoredPopover>
      )}
    </div>
  );
};
