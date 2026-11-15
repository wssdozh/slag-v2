// The day separator between feed groups: today, yesterday, or a plain date.
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
    <span className="px-3 py-0.5 rounded-full bg-surface-elevated border border-tint-6 text-2xs text-fg-secondary shadow-sm">
      {label}
    </span>
  </div>
);

export const FeedDateBubble = memo(FeedDateBubbleComponent);
