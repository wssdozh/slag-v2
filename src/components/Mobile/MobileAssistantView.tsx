import React from 'react';
import { useApp } from '../../context/AppContext';
import { AssistantChat } from '../Feed/AssistantChat';
import { Sparkles, Trash2, Settings } from 'lucide-react';
import { MobileScreenHeader } from './MobileScreenHeader';

export const MobileAssistantView: React.FC = () => {
  const {
    clearChatMessages,
    aiSettings,
    setIsSettingsOpen,
    setActiveMobileTab,
    chatMessages
  } = useApp();

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
      {/* Top Header */}
      <MobileScreenHeader
        onBack={() => setActiveMobileTab('folders')}
        backLabel="Назад"
        centerSlot={
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-zinc-300 shrink-0">
                <Sparkles className="w-2.5 h-2.5" />
              </div>
              <h1 className="text-sm font-bold text-white tracking-tight">Ассистент</h1>
            </div>
            <span className="text-2xs font-mono text-zinc-500 truncate max-w-[160px]">
              {aiSettings.model}
            </span>
          </>
        }
        rightSlot={
          <>
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={clearChatMessages}
                className="w-ctrl-md h-ctrl-md rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-rose-400 flex items-center justify-center active:scale-95 transition-all cursor-pointer touch-target"
                title="Очистить диалог"
                aria-label="Очистить диалог"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-ctrl-md h-ctrl-md rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer touch-target"
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
