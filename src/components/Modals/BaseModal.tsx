import React, { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../UI/IconButton';
import { usePresence } from '../../hooks/ui/usePresence';

export interface BaseModalProps {
  isOpen: boolean;
  presence?: ReturnType<typeof usePresence>;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  maxHeight?: string;
  className?: string;
  containerClassName?: string;
  contentClassName?: string;
  hideHeader?: boolean;
  customHeader?: React.ReactNode;
  showCloseButton?: boolean;
  headerRightSlot?: React.ReactNode;
  closeOnBackdropClick?: boolean;
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  footer?: React.ReactNode;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  presence: providedPresence,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = 'max-w-md',
  maxHeight,
  className = '',
  containerClassName = '',
  contentClassName = '',
  hideHeader = false,
  customHeader,
  showCloseButton = true,
  headerRightSlot,
  closeOnBackdropClick = true,
  role = 'dialog',
  ariaLabel,
  footer,
}) => {
  const internalPresence = usePresence(isOpen && !providedPresence);
  const { ref: overlayRef, phase, isPresent, onTransitionEnd } = providedPresence || internalPresence;
  const triggerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = overlayRef.current;
    return () => {
      const focused = document.activeElement;
      const focusStillOwned = focused === document.body || (focused !== null && overlay !== null && overlay.contains(focused));
      if (triggerRef.current?.isConnected && focusStillOwned) triggerRef.current.focus();
    };
  }, [isOpen, overlayRef]);

  if (!isPresent) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isOpen && closeOnBackdropClick && e.target === overlayRef.current) {
      onClose();
    }
  };

  const ariaLabelString = typeof title === 'string' ? title : ariaLabel;

  return (
    <div
      ref={overlayRef}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      aria-hidden={!isOpen || undefined}
      onClick={handleBackdropClick}
      role={role}
      aria-modal="true"
      aria-label={ariaLabelString}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 motion-fade select-none ${className}`}
    >
      <div
        data-motion-state={phase}
        className={`w-full ${maxWidth} ${maxHeight || 'max-h-[calc(100dvh-2rem)]'} rounded-2xl bg-surface border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden motion-dialog ${containerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {!hideHeader && (
          <div className="rounded-t-[15px] overflow-hidden shrink-0">
            {customHeader || (
              <div
                className="px-4 md:px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-panel rounded-t-[15px]"
                style={{ paddingTop: 'max(var(--sat), 0.875rem)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {icon && (
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
                      {icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    {title && (
                      <h3 className="text-sm font-semibold text-white tracking-tight truncate">
                        {title}
                      </h3>
                    )}
                    {subtitle && (
                      <p className="text-[11px] text-zinc-400 truncate">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {headerRightSlot}
                  {showCloseButton && (
                    <IconButton
                      size="md"
                      variant="ghost"
                      onClick={onClose}
                      title="Закрыть (Esc)"
                      aria-label="Закрыть"
                    >
                      <X className="w-4 h-4" />
                    </IconButton>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Content Body */}
        <div className={`flex-1 overflow-y-auto min-h-0 ${contentClassName}`}>
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-4 md:px-5 py-3 border-t border-white/[0.06] bg-panel shrink-0 rounded-b-[15px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
