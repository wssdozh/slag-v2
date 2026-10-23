import React from 'react';
import { useApp } from '../../context/AppContext';
import { AssistantChat } from '../Feed/AssistantChat';
import { Sparkles, Trash2, Settings } from 'lucide-react';

export const MobileAssistantView: React.FC = () => {
  const {
    clearChatMessages,
    aiSettings,
    setIsSettingsOpen,
    chatMessages
  } = useApp();

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
      {/* Top Header */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-10"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">Ассистент</h1>
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[120px]">
            {aiSettings.model}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {chatMessages.length > 0 && (
            <button
              onClick={clearChatMessages}
              className="w-9 h-9 rounded-full hover:bg-white/[0.06] text-zinc-500 hover:text-rose-400 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Очистить диалог"
              aria-label="Очистить диалог"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-9 h-9 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            title="Настройки ИИ"
            aria-label="Настройки ИИ"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Chat Container */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-20">
        <AssistantChat variant="center" />
      </div>
    </div>
  );
};
