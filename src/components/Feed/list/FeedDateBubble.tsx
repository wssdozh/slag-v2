import React, { memo } from 'react';

export interface FeedDateBubbleProps {
  /** Готовая метка дня: «Сегодня», «Вчера» или дата. */
  label: string;
}

/**
 * Пузырь дня между группами: единственный разделитель ленты по календарю.
 * Считается снаружи, потому что метка — функция от «сейчас», а не от компонента.
 */
const FeedDateBubbleComponent: React.FC<FeedDateBubbleProps> = ({ label }) => (
  <div className="flex justify-center py-1 select-none">
    <span className="px-3 py-0.5 rounded-full bg-surface-elevated border border-white/[0.06] text-[11px] text-zinc-400 shadow-sm">
      {label}
    </span>
  </div>
);

export const FeedDateBubble = memo(FeedDateBubbleComponent);
