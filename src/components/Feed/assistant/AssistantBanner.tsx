import React from 'react';
import { Sparkles, Trash2 } from 'lucide-react';

interface AssistantBannerProps {
  isInbox: boolean;
  folderLabel: string;
  isSidebar: boolean;
  hasMessages: boolean;
  onClear: () => void;
}

export const AssistantBanner: React.FC<AssistantBannerProps> = ({
  isInbox,
  folderLabel,
  isSidebar,
  hasMessages,
  onClear,
}) => {
  return (
    <div className={`px-3 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between text-xs text-zinc-400 shrink-0 ${isSidebar ? 'gap-1' : ''}`}>
      <div className="flex items-center gap-2 truncate min-w-0">
        <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="truncate">
          {isInbox ? (
            <span className="font-medium text-zinc-200">Все хранилище</span>
          ) : (
            <span>Контекст: <strong className="text-zinc-200">{folderLabel}</strong></span>
          )}
        </span>
      </div>

      {hasMessages && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-2xs text-zinc-500 hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.04] shrink-0"
          title="Очистить диалог"
        >
          <Trash2 className="w-3 h-3" />
          <span className={isSidebar ? 'hidden sm:inline' : ''}>Очистить</span>
        </button>
      )}
    </div>
  );
};
