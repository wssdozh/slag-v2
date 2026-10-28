import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useHotkey } from '../../hooks/useHotkeys';
import { IconButton } from '../UI/IconButton';

export interface BaseModalProps {
  isOpen: boolean;
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
  closeOnEsc?: boolean;
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  footer?: React.ReactNode;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
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
  closeOnEsc = true,
  role = 'dialog',
  ariaLabel,
  footer,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useHotkey('escape', onClose, {
    enabled: isOpen && closeOnEsc,
    preventDefault: true,
    stopPropagation: true,
    allowInInput: true,
  });

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdropClick && e.target === overlayRef.current) {
      onClose();
    }
  };

  const ariaLabelString = typeof title === 'string' ? title : ariaLabel;

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      role={role}
      aria-modal="true"
      aria-label={ariaLabelString}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150 select-none ${className}`}
    >
      <div
        className={`w-full ${maxWidth} ${maxHeight || 'max-h-[calc(100dvh-2rem)]'} rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-100 ${containerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {!hideHeader && (
          <div className="rounded-t-[15px] overflow-hidden shrink-0">
            {customHeader || (
              <div
                className="px-4 md:px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0c0c0e] rounded-t-[15px]"
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
          <div className="px-4 md:px-5 py-3 border-t border-white/[0.06] bg-[#0c0c0e] shrink-0 rounded-b-[15px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
