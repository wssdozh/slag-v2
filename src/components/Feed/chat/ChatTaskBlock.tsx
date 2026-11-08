import React from 'react';
import { Check, CheckSquare } from 'lucide-react';
import { MarkdownRenderer } from '../../UI/MarkdownRenderer';

interface ChatTaskBlockProps {
  title: string;
  lines: string[];
  onWikiLinkClick: (title: string) => void;
}

export const ChatTaskBlock: React.FC<ChatTaskBlockProps> = ({ title, lines, onWikiLinkClick }) => {
  return (
    <div className="my-2 rounded-xl bg-surface border border-white/[0.08] p-3 text-xs flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-zinc-400 font-medium font-mono text-2xs uppercase tracking-wider">
        <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />
        <span>Задача</span>
      </div>
      <div className="font-semibold text-zinc-100 text-xs">
        {title}
      </div>
      {lines.length > 0 && (
        <div className="text-zinc-300 flex flex-col gap-1">
          {lines.map((l, lIdx) => {
            const trimmedLine = l.trim();
            const checkMatch = trimmedLine.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
            if (checkMatch) {
              const isDone = checkMatch[1].toLowerCase() === 'x';
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-0.5 my-0.5">
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mt-0.5 select-none ${
                    isDone ? 'bg-white/15 border-white/40 text-zinc-200' : 'border-white/20 bg-white/[0.03] text-transparent'
                  }`}>
                    {isDone && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span className={`flex-1 min-w-0 ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
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
