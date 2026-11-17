// A task rendered inside a chat reply: title plus checkbox lines, read-only.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import { MarkdownRenderer } from '../../UI/MarkdownRenderer';

interface ChatTaskBlockProps {
  title: string;
  lines: string[];
  onWikiLinkClick: (title: string) => void;
}

export const ChatTaskBlock: React.FC<ChatTaskBlockProps> = ({ title, lines, onWikiLinkClick }) => {
  return (
    <div className="my-2 rounded-xl bg-surface border border-tint-8 p-3 text-xs flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-fg-secondary font-medium font-mono text-2xs uppercase tracking-wider">
        <Icon name="entity.task" size="sm" />
        <span>Задача</span>
      </div>
      <div className="font-semibold text-fg-primary text-xs">
        {title}
      </div>
      {lines.length > 0 && (
        <div className="text-fg-tertiary flex flex-col gap-1">
          {lines.map((l, lIdx) => {
            const trimmedLine = l.trim();
            const checkMatch = trimmedLine.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
            if (checkMatch) {
              const isDone = checkMatch[1].toLowerCase() === 'x';
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-0.5 my-0.5">
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mt-0.5 select-none ${
                    isDone ? 'bg-tint-15 border-tint-40 text-fg-soft' : 'border-tint-20 bg-tint-3 text-transparent'
                  }`}>
                    {isDone && <Icon name="action.check" size="xs" tone="inherit" className="stroke-[3]" />}
                  </span>
                  <span className={`flex-1 min-w-0 ${isDone ? 'line-through text-fg-muted' : 'text-fg-soft'}`}>
                    <MarkdownRenderer content={checkMatch[2]} onWikiLinkClick={onWikiLinkClick} inline />
                  </span>
                </div>
              );
            }
            return (
              <div key={lIdx}>
                <MarkdownRenderer content={l} onWikiLinkClick={onWikiLinkClick} inline />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
