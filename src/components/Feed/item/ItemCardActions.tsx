// The card's corner: reply, and the way into the focus editor for an article.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
export interface ItemCardActionsProps {
  isArticle: boolean;
  onReply: () => void;
  onOpenArticle: () => void;
  onDragStart?: React.DragEventHandler<HTMLSpanElement>;
}

/**
 * The corner of the card: the reply shortcut every note carries, plus the way into the focus
 * editor for an article. Actions on the note itself live on the right click.
 */
const ItemCardActionsComponent: React.FC<ItemCardActionsProps> = ({
  isArticle,
  onReply,
  onOpenArticle,
  onDragStart,
}) => (
  <div
    className="pointer-events-auto absolute top-1.5 right-1.5 z-20 flex items-center gap-1 rounded-md bg-surface-hover sm:pointer-events-none sm:top-auto sm:bottom-1 sm:right-1 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
  >
    <button
      type="button"
      onClick={onReply}
      className="hidden shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-tint-8 hover:text-fg-soft focus-visible:bg-tint-8 sm:flex sm:size-6 cursor-pointer"
      title="Ответить (R)"
    >
      <Icon name="action.reply" size="sm" tone="inherit" className="shrink-0" />
    </button>

    {onDragStart && (
      <span
        draggable
        onDragStart={onDragStart}
        data-testid="item-drag-handle"
        title="Перетащить в папку"
        className="hidden sm:flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-tint-8 cursor-grab active:cursor-grabbing"
      >
        <Icon name="action.dragHandle" size="sm" tone="inherit" />
      </span>
    )}

    {/* Article Focus Editor Button in top-right corner - kept in place on the far right */}
    {isArticle && (
      <button
        type="button"
        onClick={onOpenArticle}
        className="w-7 h-7 sm:w-6 sm:h-6 rounded-md text-fg-secondary hover:text-fg-soft hover:bg-tint-8 transition-colors cursor-pointer flex items-center justify-center shrink-0"
        title="Открыть в фокус-редакторе (⌘E)"
        aria-label="Открыть в фокус-редакторе"
      >
        <Icon name="action.expand" size="sm" tone="inherit" className="shrink-0" />
      </button>
    )}
  </div>
);

export const ItemCardActions = memo(ItemCardActionsComponent);
