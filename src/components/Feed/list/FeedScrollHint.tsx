// Two floating tips at the feed edges: pull-to-search, and a jump to the newest note.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
import { UI_GESTURES } from '../../../config';

export interface FeedScrollHintProps {
  /** Насколько лента вытянута за край; 0 — жеста нет. */
  pull: number;
  /** За какой край тянут: от этого зависит, где висит подсказка. */
  pullSide: 'top' | 'bottom' | null;
  /** Кнопка «вниз» гасится, а не размонтируется: иначе она мигает на пути назад. */
  isBottomButtonVisible: boolean;
  onScrollToBottom: () => void;
}

/**
 * Два плавающих наконечника ленты: подсказка «поиск», которая едет за пальцем, когда
 * прокручивать уже нечего, и кнопка возврата к последним заметкам. Обе живут над
 * контейнером прокрутки, поэтому не участвуют в его разметке.
 */
const FeedScrollHintComponent: React.FC<FeedScrollHintProps> = ({
  pull,
  pullSide,
  isBottomButtonVisible,
  onScrollToBottom,
}) => (
  <>
    {/* Past either end there is nothing left to scroll, so the hint travels instead. */}
    {pull > 0 && (
      <div
        data-testid="feed-pull-search"
        className="absolute inset-x-0 z-30 flex justify-center pointer-events-none"
        style={
          pullSide === 'top'
            ? { top: `${8 + pull}px` }
            : { bottom: `calc(var(--composer-inset, 104px) + 8px + ${pull}px)` }
        }
      >
        <span
          className="flex items-center gap-1.5 rounded-full border border-subtle bg-surface-elevated px-3 py-1.5 text-2xs font-medium text-fg-secondary shadow-xl"
          style={{ opacity: Math.min(1, pull / UI_GESTURES.SEARCH_PULL_PX) }}
        >
          <Icon name="action.search" size="sm" tone="inherit" /> поиск
        </span>
      </div>
    )}

    {/* Floating scroll to bottom button: centered comfortably above the composer island */}
    {/* Mounted on purpose: it fades in when you scroll up, and a node that is
        deleted on the first frame of the way back can only blink out. */}
    <div
      aria-hidden={!isBottomButtonVisible}
      style={{ bottom: 'calc(var(--composer-inset, 104px) + 8px)' }}
      className={`absolute inset-x-0 pointer-events-none z-30 flex justify-center px-4 transition-opacity duration-150 ${
        isBottomButtonVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={onScrollToBottom}
        tabIndex={isBottomButtonVisible ? 0 : -1}
        className={`${isBottomButtonVisible ? 'pointer-events-auto' : 'pointer-events-none'} w-10 h-10 rounded-full aspect-square shrink-0 bg-surface-elevated/95 hover:bg-surface-hover active:bg-tint-8 text-fg-tertiary hover:text-white border border-tint-14 shadow-2xl backdrop-blur-md flex items-center justify-center cursor-pointer motion-press group`}
        title="К последним заметкам"
        aria-label="Прокрутить к последним заметкам"
      >
        <Icon name="nav.down" size="lg" tone="tertiary" className="group-hover:text-white transition-transform group-hover:translate-y-0.5" />
      </button>
    </div>
  </>
);

export const FeedScrollHint = memo(FeedScrollHintComponent);
