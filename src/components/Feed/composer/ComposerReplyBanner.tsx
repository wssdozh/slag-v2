// The reply-to banner above the composer that collapses instead of vanishing.
import React, { useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
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
          <div className="flex items-center pb-1.5 pt-0.5 border-b border-white/[0.06] text-xs text-zinc-400 select-none min-h-[28px]">
            <div className="flex items-center gap-1.5 truncate min-w-0">
              <CornerUpLeft className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                {bannerReply.type === 'task' ? 'Ответ на таску:' : bannerReply.type === 'article' ? 'Ответ на статью:' : 'Ответ:'}
              </span>
              <span className="truncate text-zinc-300 font-medium text-xs">
                {bannerReply.title || bannerReply.content.slice(0, 45)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
