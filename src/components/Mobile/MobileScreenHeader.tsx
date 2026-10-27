import React from 'react';
import { ArrowLeft } from 'lucide-react';

export interface MobileScreenHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  backTitle?: string;
  leftSlot?: React.ReactNode;
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
  leftSlot,
  centerSlot,
  rightSlot,
  className = '',
}) => {
  return (
    <header
      className={`h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-3 md:px-4 flex items-center justify-between shrink-0 z-10 ${className}`}
      style={{ paddingTop: 'max(var(--sat), 0px)' }}
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
            className="h-10 px-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-medium">{backLabel}</span>
          </button>
        ) : (
          <>
            {icon && (
              <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0">
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
          <span className="text-[10px] font-mono text-zinc-500 truncate">{subtitle}</span>
        </div>
      ) : null}

      {/* Right Slot */}
      <div className="flex items-center justify-end gap-1.5 shrink-0">
        {rightSlot}
      </div>
    </header>
  );
};
