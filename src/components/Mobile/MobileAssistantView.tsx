// The phone's assistant tab: a chat under a screen header, scoped to the open folder.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { AssistantChat } from '../Feed/AssistantChat';
import { Icon } from '../UI/icons/Icon';
import { MobileScreenHeader } from './MobileScreenHeader';
import { DEFAULT_INBOX_FOLDER } from '../../config';

export const MobileAssistantView: React.FC = () => {
  const {
    clearChatMessages,
    setIsSettingsOpen,
    setActiveMobileTab,
    chatMessages,
    folders,
    currentFolder
  } = useApp();

  const activeFolder = folders.find(f => f.path === currentFolder);
  const contextLabel =
    currentFolder === DEFAULT_INBOX_FOLDER || !activeFolder
      ? 'Все хранилище'
      : activeFolder.name;

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
      {/* Top Header */}
      <MobileScreenHeader
        onBack={() => setActiveMobileTab('folders')}
        backLabel="Назад"
        centerSlot={
          <>
            <h1 className="text-sm font-bold text-white tracking-tight">Ассистент</h1>
            <span className="text-3xs font-mono text-fg-muted truncate max-w-[200px]">
              {contextLabel}
            </span>
          </>
        }
        rightSlot={
          <>
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={clearChatMessages}
                className="w-ctrl-md h-ctrl-md rounded-lg hover:bg-tint-6 text-fg-muted hover:text-rose-400 flex items-center justify-center motion-press cursor-pointer touch-target"
                title="Очистить диалог"
                aria-label="Очистить диалог"
              >
                <Icon name="action.delete" size="md" tone="inherit" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-ctrl-md h-ctrl-md rounded-lg hover:bg-tint-6 text-fg-secondary hover:text-white flex items-center justify-center motion-press cursor-pointer touch-target"
              title="Настройки ИИ"
              aria-label="Настройки ИИ"
            >
              <Icon name="system.settings" size="md" tone="inherit" />
            </button>
          </>
        }
      />

      {/* Main Chat Container - No bottom dock padding */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-[max(var(--sab),4px)]">
        <AssistantChat variant="center" />
      </div>
    </div>
  );
};
