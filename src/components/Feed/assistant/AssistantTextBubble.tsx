// One chat bubble: markdown with embedded task blocks split out of the same text.
import React from 'react';
import { MarkdownRenderer } from '../../UI/MarkdownRenderer';
import { ChatTaskBlock } from './ChatTaskBlock';
import { splitTaskBlocks } from '../../../lib/text/chatMarkdown';

interface AssistantTextBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  onWikiLinkClick: (idOrTitle: string) => void;
}

export const AssistantTextBubble: React.FC<AssistantTextBubbleProps> = ({
  role,
  content,
  onWikiLinkClick,
}) => {
  return (
    <div
      className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
        role === 'user'
          ? 'bg-tint-10 text-fg-primary border border-tint-8'
          : 'bg-surface text-fg-soft border border-tint-6 shadow-sm'
      }`}
    >
      <div className="font-sans text-sm flex flex-col gap-1.5 break-words">
        {splitTaskBlocks(content).map((segment, segIdx) =>
          segment.kind === 'task' ? (
            <ChatTaskBlock
              key={segIdx}
              title={segment.title}
              lines={segment.lines}
              onWikiLinkClick={onWikiLinkClick}
            />
          ) : (
            <MarkdownRenderer
              key={segIdx}
              content={segment.text}
              onWikiLinkClick={onWikiLinkClick}
              className="text-inherit"
            />
          )
        )}
      </div>
    </div>
  );
};
