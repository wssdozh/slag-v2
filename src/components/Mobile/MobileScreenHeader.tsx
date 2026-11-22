// The phone screen's top bar: back, title slots, and the status-bar inset.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
export interface MobileScreenHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  backTitle?: string;
  iconOnlyBack?: boolean;
  leftSlot?: React.ReactNode;
  leadingAction?: React.ReactNode;
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
}

export const MobileScreenHeader: React.FC<MobileScreenHeaderProps> = ({
  title,
  subtitle,
  icon,
  onBack,
  backLabel = 'Назад',
  backTitle,
  iconOnlyBack = false,
  leftSlot,
  leadingAction,
  centerSlot,
  rightSlot,
  className = '',
}) => {
  return (
    /* Высота = 56px контента + системный inset: раньше inset вычитался из h-14,
       и двухстрочный центр (заголовок + подпись) вылезал на разделитель. */
    <header
      className={`border-b border-tint-6 bg-panel px-3 md:px-4 flex items-center justify-between shrink-0 z-10 ${className}`}
      style={{ height: 'calc(3.5rem + max(var(--sat), 0px))', paddingTop: 'max(var(--sat), 0px)' }}
    >
      {/* Left Slot: custom, back button, or icon + title */}
      <div className="flex items-center gap-2 min-w-0">
        {leftSlot ? (
          leftSlot
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            title={backTitle || backLabel}
            className={`flex items-center rounded-lg text-fg-secondary hover:text-white hover:bg-tint-6 motion-press cursor-pointer ${
              iconOnlyBack ? 'size-12 justify-center' : 'h-10 gap-1.5 px-2'
            }`}
          >
            <Icon name="nav.back" size="md" tone="inherit" />
            {!iconOnlyBack && <span className="text-xs font-medium">{backLabel}</span>}
          </button>
        ) : (
          <>
            {leadingAction}
            {icon && (
              <div className="w-6 h-6 rounded-md bg-tint-10 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0">
                {icon}
              </div>
            )}
            {title && !subtitle && (
              <h1 className="text-base font-bold text-white tracking-tight truncate">
                {title}
              </h1>
            )}
          </>
        )}
      </div>

      {/* Center Slot (optional centered titles with sub-labels) */}
      {centerSlot ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-1 min-w-0">
          {centerSlot}
        </div>
      ) : subtitle ? (
        <div className="flex flex-col items-center min-w-0 px-2">
          {title && <h1 className="text-sm font-bold text-white truncate max-w-[160px]">{title}</h1>}
          <span className="text-3xs font-mono text-fg-muted truncate">{subtitle}</span>
        </div>
      ) : null}

      {/* Right Slot */}
      <div className="flex items-center justify-end gap-1.5 shrink-0">
        {rightSlot}
      </div>
    </header>
  );
};
