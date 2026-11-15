// The reply-to banner above the composer that collapses instead of vanishing.
import React, { useState } from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { ReplyTarget } from '../../../types';

export interface ComposerReplyBannerProps {
  replyTarget: ReplyTarget | null;
}

/**
 * The banner collapses instead of vanishing, so sending or cancelling a reply
 * does not yank the whole composer up by the height of the row.
 */
export const ComposerReplyBanner: React.FC<ComposerReplyBannerProps> = ({ replyTarget }) => {
  const [stickyReply, setStickyReply] = useState(replyTarget);
  if (replyTarget && replyTarget !== stickyReply) setStickyReply(replyTarget);
  const bannerReply = replyTarget ?? stickyReply;

  return (
    <div className="motion-accordion w-full" data-expanded={Boolean(replyTarget)}>
      <div className="motion-accordion-inner">
        {bannerReply && (
          <div className="flex items-center pb-1.5 pt-0.5 border-b border-tint-6 text-xs text-fg-secondary select-none min-h-[28px]">
            <div className="flex items-center gap-1.5 truncate min-w-0">
              <Icon name="action.reply" size="sm" tone="muted" className="shrink-0" />
              <span className="text-2xs font-mono text-fg-muted shrink-0">
                {bannerReply.type === 'task' ? 'Ответ на таску:' : bannerReply.type === 'article' ? 'Ответ на статью:' : 'Ответ:'}
              </span>
              <span className="truncate text-fg-tertiary font-medium text-xs">
                {bannerReply.title || bannerReply.content.slice(0, 45)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
