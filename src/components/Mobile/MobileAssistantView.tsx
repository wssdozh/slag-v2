import React from 'react';
import { useApp } from '../../context/AppContext';
import { AssistantChat } from '../Feed/AssistantChat';
import { Trash2, Settings } from 'lucide-react';
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
            <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">
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
                className="w-ctrl-md h-ctrl-md rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-rose-400 flex items-center justify-center motion-press cursor-pointer touch-target"
                title="Очистить диалог"
                aria-label="Очистить диалог"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-ctrl-md h-ctrl-md rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center motion-press cursor-pointer touch-target"
              title="Настройки ИИ"
              aria-label="Настройки ИИ"
            >
              <Settings className="w-4 h-4" />
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
