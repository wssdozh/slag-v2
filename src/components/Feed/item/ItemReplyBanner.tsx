import React, { memo } from 'react';
import { CornerUpLeft } from 'lucide-react';
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
      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors select-none group/quote pt-0.5"
    >
      <CornerUpLeft className="w-3.5 h-3.5 text-zinc-500 group-hover/quote:text-zinc-300 shrink-0" />
      {replyParent ? (
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-mono text-2xs text-zinc-500 shrink-0">
            {replyParentKind(replyParent)}:
          </span>
          <span className="text-zinc-400 group-hover/quote:text-zinc-200 truncate font-medium text-xs">
            {replyParent.title || replyParent.content.slice(0, 45)}
          </span>
        </div>
      ) : (
        <span className="text-2xs text-zinc-600 italic">Исходная запись удалена</span>
      )}
    </div>
  );
};

export const ItemReplyBanner = memo(ItemReplyBannerComponent);
