// The search icon that surfaces while a list is pulled past either end.
import React, { memo } from 'react';
import { Icon } from './icons/Icon';
import { UI_GESTURES } from '../../config';

export interface PullSearchHintProps {
  /** Damped pull travel in px; the icon fades and scales with it and hides at 0. */
  pull: number;
  /** Which edge is open. `null` hides the hint. */
  side: 'top' | 'bottom' | null;
  /**
   * Positioning layer. Passed as-is, replacing the default inset: the caller owns placement
   * (a fixed header, a safe area, a composer). Keep `absolute`, centering and pointer-events in it.
   */
  className?: string;
  /** Test hook for the surface that renders it; the feed keeps its historical id. */
  testId?: string;
}

const DEFAULT_LAYER = 'absolute inset-x-0 z-30 flex justify-center pointer-events-none';
const DEFAULT_TOP = 'top-2';
const DEFAULT_BOTTOM = 'bottom-[calc(var(--composer-inset,104px)+8px)]';

/**
 * A decorative caret for the pull-to-search gesture: it lives above the surface, so as the
 * surface slides away the icon is progressively uncovered instead of popping in at the end.
 * The gesture itself is on the list; this is a hint, not a control.
 */
const PullSearchHintComponent: React.FC<PullSearchHintProps> = ({
  pull,
  side,
  className,
  testId = 'feed-pull-search',
}) => {
  if (!side || pull <= 0) return null;
  const progress = Math.min(1, pull / UI_GESTURES.SEARCH_PULL_PX);
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      data-pull-side={side}
      data-pull-px={Math.round(pull)}
      className={className ?? `${DEFAULT_LAYER} ${side === 'top' ? DEFAULT_TOP : DEFAULT_BOTTOM}`}
    >
      <span
        data-testid="feed-pull-search-badge"
        className="flex size-9 items-center justify-center rounded-full border border-subtle bg-surface-elevated text-fg-secondary shadow-xl"
        style={{ opacity: progress, transform: `scale(${0.6 + 0.4 * progress})` }}
      >
        <Icon name="action.search" size="md" tone="inherit" />
      </span>
    </div>
  );
};

export const PullSearchHint = memo(PullSearchHintComponent);
