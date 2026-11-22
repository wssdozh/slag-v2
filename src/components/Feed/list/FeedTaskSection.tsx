import { useState, type ReactNode } from 'react';
import type { SlagItem } from '../../../types';
import { Button } from '../../UI/Button';
import { FeedDateBubble } from './FeedDateBubble';
import { nextWindowSize, WINDOW_CHUNK } from './feedWindow';

export function FeedTaskSection({ label, showLabel = true, items, highlightedItemId, renderCard }: {
  label: string;
  showLabel?: boolean;
  items: SlagItem[];
  highlightedItemId: string | null;
  renderCard: (item: SlagItem, gap: number) => ReactNode;
}) {
  const [size, setSize] = useState(WINDOW_CHUNK);
  const target = highlightedItemId ? items.findIndex(item => item.id === highlightedItemId) : -1;
  if (target >= size) setSize(target + 1);
  if (!items.length) return null;

  return (
    <section aria-label={label} className="flex flex-col gap-2">
      {showLabel && <FeedDateBubble label={label} />}
      <div className="flex flex-col">
        {items.slice(0, Math.max(size, target + 1)).map(item => renderCard(item, 0))}
      </div>
      {size < items.length && (
        <Button variant="ghost" size="sm" className="self-center" onClick={() => setSize(nextWindowSize(size, items.length))}>
          Показать ещё
        </Button>
      )}
    </section>
  );
}
