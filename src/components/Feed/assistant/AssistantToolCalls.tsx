import React from 'react';
import { Terminal } from 'lucide-react';
import type { ChatToolCall } from '../../../types';

interface AssistantToolCallsProps {
  toolCalls: ChatToolCall[];
}

export const AssistantToolCalls: React.FC<AssistantToolCallsProps> = ({ toolCalls }) => {
  return (
    <div className="flex flex-col gap-0.5 px-1 -mt-0.5 mb-0.5 select-text min-w-0">
      {toolCalls.map((tc, idx) => (
        <div
          key={idx}
          className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500 min-w-0"
        >
          <Terminal className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
          <span className="text-zinc-400 shrink-0">{tc.name}</span>
          {tc.args?.query && (
            <span className="text-zinc-500 truncate max-w-[200px] min-w-0">("{tc.args.query}")</span>
          )}
        </div>
      ))}
    </div>
  );
};
