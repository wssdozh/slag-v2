import React, { useEffect, useRef } from 'react';

interface SuggestionMenuShellProps {
  selectedIndex: number;
  placement: 'top' | 'bottom';
  isModal: boolean;
  isEmpty: boolean;
  emptyContent: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}

export const SuggestionMenuShell: React.FC<SuggestionMenuShellProps> = ({
  selectedIndex, placement, isModal, isEmpty, emptyContent, header, children,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const isBottom = placement === 'bottom';
  const positionClasses = isBottom ? 'top-full mt-2'
    : isModal ? 'bottom-[calc(100%+55px)]' : 'bottom-[calc(100%+14px)]';
  const animationClasses = isBottom ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2';

  return (
    <div className={`absolute left-0 right-0 ${positionClasses} w-full rounded-2xl bg-surface-elevated border border-white/[0.12] shadow-2xl shadow-black/90 ${isEmpty ? 'p-3' : 'p-1.5 flex flex-col gap-0.5 overflow-hidden'} z-50 animate-in ${animationClasses} fade-in duration-150 ease-out select-none`}>
      {isEmpty ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">{emptyContent}</div>
      ) : (
        <>
          {header}
          <div ref={listRef} className="flex flex-col gap-0.5 pt-1 max-h-44 overflow-y-auto pr-0.5">
            {children}
          </div>
        </>
      )}
    </div>
  );
};
