import React from 'react';
import { useApp } from '../../context/AppContext';
import { AssistantChat } from '../Feed/AssistantChat';
import { Sparkles, Trash2, Settings, ArrowLeft } from 'lucide-react';

export const MobileAssistantView: React.FC = () => {
  const {
    clearChatMessages,
    aiSettings,
    setIsSettingsOpen,
    setActiveMobileTab,
    chatMessages
  } = useApp();

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
      {/* Top Header */}
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-3 flex items-center justify-between shrink-0 z-10"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        {/* Left: Back Button */}
        <div className="flex items-center min-w-[70px]">
          <button
            onClick={() => setActiveMobileTab('folders')}
            aria-label="Назад"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-medium">Назад</span>
          </button>
        </div>

        {/* Center: Title & Model badge */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Sparkles className="w-2.5 h-2.5" />
            </div>
            <h1 className="text-sm font-bold text-white tracking-tight">Ассистент</h1>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[160px]">
            {aiSettings.model}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-end gap-1 min-w-[70px]">
          {chatMessages.length > 0 && (
            <button
              onClick={clearChatMessages}
              className="w-8 h-8 rounded-full hover:bg-white/[0.06] text-zinc-500 hover:text-rose-400 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Очистить диалог"
              aria-label="Очистить диалог"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-8 h-8 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            title="Настройки ИИ"
            aria-label="Настройки ИИ"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Chat Container - No bottom dock padding */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-[max(var(--sab),4px)]">
        <AssistantChat variant="center" />
      </div>
    </div>
  );
};
