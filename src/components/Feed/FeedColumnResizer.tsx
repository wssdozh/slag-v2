// Drag handles that set the feed's reading width and keep it as a CSS variable.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UI_LAYOUT } from '../../config/ui';
import { STORAGE_KEYS } from '../../config/storage';

const MIN_WIDTH = UI_LAYOUT.FEED_COLUMN_MIN_WIDTH;
const MAX_WIDTH = UI_LAYOUT.FEED_COLUMN_MAX_WIDTH;
const DEFAULT_WIDTH = UI_LAYOUT.FEED_COLUMN_DEFAULT_WIDTH;

const clampWidth = (value: number, max: number = MAX_WIDTH) =>
  Math.min(Math.max(value, MIN_WIDTH), Math.min(max, MAX_WIDTH));

const readSavedWidth = (): number => {
  const saved = Number(localStorage.getItem(STORAGE_KEYS.FEED_CONTENT_WIDTH));
  return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : DEFAULT_WIDTH;
};

/**
 * Grab strips on both sides of the reading column. The width is published as
 * `--feed-content-width` on the root, so cards and the composer share one
 * value and the strip itself is invisible until the pointer is on it.
 */
export const FeedColumnResizer: React.FC = () => {
  const [width, setWidth] = useState<number>(readSavedWidth);
  const dragRef = useRef<{ startX: number; startWidth: number; side: 1 | -1; max: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--feed-content-width', `${width}px`);
  }, [width]);

  const commit = useCallback((next: number) => {
    setWidth(next);
    localStorage.setItem(STORAGE_KEYS.FEED_CONTENT_WIDTH, String(next));
  }, []);

  const handlePointerDown = (side: 1 | -1) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // Never wider than the pane it lives in, otherwise the strip slides under the neighbour.
    const paneWidth = event.currentTarget.parentElement?.clientWidth ?? MAX_WIDTH;
    dragRef.current = { startX: event.clientX, startWidth: width, side, max: paneWidth - 32 };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // The column is centered, so both edges move: hand travel counts double.
    setWidth(clampWidth(drag.startWidth + drag.side * (event.clientX - drag.startX) * 2, drag.max));
  };

  const handlePointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    commit(width);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    commit(clampWidth(width + (event.key === 'ArrowRight' ? 40 : -40)));
  };

  return (
    <>
      {([1, -1] as const).map(side => (
        <div
          key={side}
          role="separator"
          aria-orientation="vertical"
          aria-label="Ширина ленты"
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          tabIndex={0}
          data-testid={side === 1 ? 'feed-width-handle-right' : 'feed-width-handle-left'}
          onPointerDown={handlePointerDown(side)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          style={{ [side === 1 ? 'right' : 'left']: 'calc(50% - var(--feed-content-width, 42rem) / 2 - 6px)' }}
          className="group absolute inset-y-0 z-10 hidden w-3 cursor-col-resize touch-none outline-none md:block"
        >
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-white/25 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:bg-accent-strong group-active:opacity-100" />
        </div>
      ))}
    </>
  );
};
