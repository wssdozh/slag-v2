// Collapsible reasoning trace under a reply, with how long the model spent on it.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
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
        className="flex items-center gap-1 text-2xs font-mono text-fg-secondary hover:text-fg-soft transition-colors cursor-pointer w-fit"
      >
        <Icon name="nav.next" size="sm" tone="warning" className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
        <span>Рассуждения {reasoningTimeMs ? `(${(reasoningTimeMs / 1000).toFixed(1)}s)` : ''}</span>
      </button>

      <div
        className="motion-accordion w-full"
        data-expanded={isExpanded}
        aria-hidden={!isExpanded}
      >
        <div className="motion-accordion-inner pl-3 py-0.5 text-2xs font-mono text-fg-muted whitespace-pre-wrap leading-relaxed select-text">
          {reasoning}
        </div>
      </div>
    </div>
  );
};
