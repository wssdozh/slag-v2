import React from 'react';
import { ChevronRight } from 'lucide-react';

interface AssistantReasoningProps {
  reasoning: string;
  reasoningTimeMs?: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export const AssistantReasoning: React.FC<AssistantReasoningProps> = ({
  reasoning,
  reasoningTimeMs,
  isExpanded,
  onToggle,
}) => {
  return (
    <div className="flex flex-col gap-1 px-1 -mt-0.5 mb-1 max-w-[92%] select-text">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-2xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer w-fit"
      >
        <ChevronRight className={`w-3 h-3 text-amber-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
        <span>Рассуждения {reasoningTimeMs ? `(${(reasoningTimeMs / 1000).toFixed(1)}s)` : ''}</span>
      </button>

      <div
        className="motion-accordion w-full"
        data-expanded={isExpanded}
        aria-hidden={!isExpanded}
      >
        <div className="motion-accordion-inner pl-3 py-0.5 text-2xs font-mono text-zinc-500 whitespace-pre-wrap leading-relaxed select-text">
          {reasoning}
        </div>
      </div>
    </div>
  );
};
