// Chat header strip: which folder the assistant is looking at, and clearing the thread.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
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
    <div className={`px-3 py-2 border-b border-tint-4 bg-tint-1 flex items-center justify-between text-xs text-fg-secondary shrink-0 ${isSidebar ? 'gap-1' : ''}`}>
      <div className="flex items-center gap-2 truncate min-w-0">
        <Icon name="system.ai" size="sm" className="shrink-0" />
        <span className="truncate">
          {isInbox ? (
            <span className="font-medium text-fg-soft">Все хранилище</span>
          ) : (
            <span>Контекст: <strong className="text-fg-soft">{folderLabel}</strong></span>
          )}
        </span>
      </div>

      {hasMessages && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-2xs text-fg-muted hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded hover:bg-tint-4 shrink-0"
          title="Очистить диалог"
        >
          <Icon name="action.delete" size="sm" tone="inherit" />
          <span className={isSidebar ? 'hidden sm:inline' : ''}>Очистить</span>
        </button>
      )}
    </div>
  );
};
