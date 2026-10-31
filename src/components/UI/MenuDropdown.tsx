import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  isOpen: controlledIsOpen,
  onOpenChange,
  className = '',
  dropdownClassName = '',
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

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
  const triggerContainerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerContainerRef.current) return;
    const rect = triggerContainerRef.current.getBoundingClientRect();
    const dropdownW = minWidth;
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
    if (left < 8) {
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
  }, [direction, align, minWidth]);

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
  }, [isOpen, updatePosition, setOpen]);

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
              minWidth: `${minWidth}px`,
            }}
            className={`z-[9999] rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl shadow-black/90 p-1 backdrop-blur-xl animate-in fade-in duration-100 ${dropdownClassName}`}
          >
            {children}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={triggerContainerRef} className={`relative inline-flex items-center shrink-0 ${className}`}>
      <div onClick={toggle} className="inline-flex items-center">
        {trigger}
      </div>
      {portalContent}
    </div>
  );
};
