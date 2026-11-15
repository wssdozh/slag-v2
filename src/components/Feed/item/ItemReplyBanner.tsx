// The quoted line above a reply: jump to what it answers, or say it is gone.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { SlagItem } from '../../../types';

export interface ItemReplyBannerProps {
  /** The note this one answers; without it the banner is not drawn at all. */
  replyToId?: string;
  /** The parent itself, when it is still in the vault. */
  replyParent: SlagItem | null;
  onScrollToParent: (id: string) => void;
}

const replyParentKind = (replyParent: SlagItem): string =>
  replyParent.type === 'task' ? 'Таска' : replyParent.type === 'article' ? 'Статья' : 'Заметка';

/** The quoted line above a reply: a jump back to what it answers, or a note that it is gone. */
const ItemReplyBannerComponent: React.FC<ItemReplyBannerProps> = ({
  replyToId,
  replyParent,
  onScrollToParent,
}) => {
  if (!replyToId) return null;

  return (
    <div
      onClick={() => replyParent && onScrollToParent(replyParent.id)}
      className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-tertiary cursor-pointer transition-colors select-none group/quote pt-0.5"
    >
      <Icon name="action.reply" size="sm" tone="muted" className="group-hover/quote:text-fg-tertiary shrink-0" />
      {replyParent ? (
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-mono text-2xs text-fg-muted shrink-0">
            {replyParentKind(replyParent)}:
          </span>
          <span className="text-fg-secondary group-hover/quote:text-fg-soft truncate font-medium text-xs">
            {replyParent.title || replyParent.content.slice(0, 45)}
          </span>
        </div>
      ) : (
        <span className="text-2xs text-fg-dim italic">Исходная запись удалена</span>
      )}
    </div>
  );
};

export const ItemReplyBanner = memo(ItemReplyBannerComponent);
