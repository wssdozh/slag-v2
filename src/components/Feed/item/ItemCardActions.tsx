// The card's corner: reply, and the way into the focus editor for an article.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
export interface ItemCardActionsProps {
  /** A bubble keeps its buttons outside the card; a row-wide note keeps them in the corner. */
  isFloating: boolean;
  isArticle: boolean;
  onReply: () => void;
  onOpenArticle: () => void;
}

/**
 * The corner of the card: the reply shortcut every note carries, plus the way into the focus
 * editor for an article. Actions on the note itself live on the right click.
 */
const ItemCardActionsComponent: React.FC<ItemCardActionsProps> = ({
  isFloating,
  isArticle,
  onReply,
  onOpenArticle,
}) => (
  <div
    className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 ${
      isFloating
        ? 'sm:right-auto sm:left-full sm:pl-1.5 flex flex-col'
        : 'flex items-center'
    } gap-1 sm:gap-0 sm:group-hover:gap-1 z-20 pointer-events-auto`}
  >
    <button
      onClick={onReply}
      className="w-7 h-7 sm:w-0 sm:h-6 sm:opacity-0 sm:overflow-hidden sm:group-hover:w-6 sm:group-hover:opacity-100 rounded-md text-fg-secondary hover:text-fg-soft hover:bg-tint-8 transition-[color,background-color,opacity,width] duration-150 cursor-pointer hidden sm:flex items-center justify-center shrink-0"
      title="Ответить (R)"
    >
      <Icon name="action.reply" size="sm" tone="inherit" className="shrink-0" />
    </button>

    {/* Действия с карточкой живут на ПКМ: кнопка в углу дублировала меню и шумела. */}

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
