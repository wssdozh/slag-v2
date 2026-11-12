// Anchored popover menu that flips and clamps itself inside the viewport, portal-rendered.
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
  /** Width used for viewport collision calculations (defaults to minWidth). */
  positioningWidth?: number;
  /** Keep the left edge inside the viewport. */
  clampLeft?: boolean;
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
  positioningWidth = minWidth,
  clampLeft = true,
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

  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [lastCoords, setLastCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  if (coords && coords !== lastCoords) {
    setLastCoords(coords);
  }
  const effectiveCoords = coords || lastCoords;

  const triggerContainerRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerContainerRef.current) return;
    const rect = triggerContainerRef.current.getBoundingClientRect();
    const dropdownW = positioningWidth;
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

    let left = align === 'end' ? rect.right - dropdownW : rect.left;
    if (left + dropdownW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - dropdownW - 8);
    }
    if (clampLeft && left < 8) {
      left = 8;
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
  }, [direction, align, positioningWidth, clampLeft]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  const toggle = useCallback(() => {
    if (!isOpen) {
      updatePosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [isOpen, updatePosition, setOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerContainerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
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
  }, [isOpen, updatePosition, setOpen, dropdownRef]);

  const portalContent =
    isPresent && effectiveCoords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={dropdownRef}
            data-motion-state={phase}
            onTransitionEnd={onTransitionEnd}
            style={{
              position: 'fixed',
              ...(effectiveCoords.top !== undefined ? { top: `${effectiveCoords.top}px` } : {}),
              ...(effectiveCoords.bottom !== undefined ? { bottom: `${effectiveCoords.bottom}px` } : {}),
              left: `${effectiveCoords.left}px`,
              minWidth: `${minWidth}px`,
            }}
            className={`z-[9999] rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl shadow-black/90 p-1 backdrop-blur-xl motion-popover ${dropdownClassName}`}
          >
            {children}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={triggerContainerRef} aria-label={ariaLabel} className={`relative inline-flex items-center shrink-0 ${className}`}>
      <div onClick={toggle} className="inline-flex items-center">
        {trigger}
      </div>
      {portalContent}
    </div>
  );
};
