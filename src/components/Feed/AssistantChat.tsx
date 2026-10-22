import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { ChatDisplayMode } from '../../types';
import {
  Sparkles,
  Send,
  Loader2,
  Trash2,
  Globe,
  ChevronDown,
  ChevronRight,
  Plus,
  Terminal,
  ExternalLink,
  Filter
} from 'lucide-react';

interface AssistantChatProps {
  variant?: 'center' | 'sidebar';
}

export const AssistantChat: React.FC<AssistantChatProps> = ({ variant = 'center' }) => {
  const {
    currentFolder,
    folders,
    chatMessages,
    isChatLoading,
    sendChatMessage,
    clearChatMessages,
    createNoteFromAction,
    aiSettings,
    saveAiSettings,
    scrollToItem,
    applyAiFilter
  } = useApp();

  const [input, setInput] = useState('');
  const [chatDisplayMode, setChatDisplayMode] = useState<ChatDisplayMode>(() => {
    try {
      const saved = localStorage.getItem('slag_chat_display_mode');
      if (saved === 'bubbles' || saved === 'document' || saved === 'terminal') {
        return saved;
      }
    } catch {
      // Fallback to default
    }
    return 'bubbles';
  });

  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
  const [terminalCollapsedReasoningIds, setTerminalCollapsedReasoningIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';
  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, isSidebar ? 120 : 160)}px`;
    }
  }, [input, isSidebar]);

  const handleSetChatDisplayMode = (mode: ChatDisplayMode) => {
    setChatDisplayMode(mode);
    try {
      localStorage.setItem('slag_chat_display_mode', mode);
    } catch {
      // Ignore localStorage write failures
    }
  };

  const handleSend = () => {
    if (!input.trim() || isChatLoading) return;
    const text = input;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    sendChatMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleReasoning = (msgId: string) => {
    setExpandedReasoningIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const toggleTerminalReasoning = (msgId: string) => {
    setTerminalCollapsedReasoningIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput('');
    sendChatMessage(prompt);
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // Render text with clickable [[WikiLinks]]
  const renderFormattedContent = (content: string) => {
    const parts = content.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, index) => {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const title = part.slice(2, -2);
        return (
          <button
            key={index}
            onClick={() => scrollToItem(title)}
            className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 hover:underline font-medium text-xs px-1 py-0.5 rounded bg-blue-500/10 cursor-pointer transition-colors"
            title="Перейти к записи"
          >
            <span>[[{title}]]</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#09090b] relative select-text overflow-hidden">
      {/* Scope Context Header Banner */}
      <div className="px-3 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between text-xs text-zinc-400 shrink-0 gap-2">
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="truncate">
            {isInbox ? (
              <strong className="text-zinc-200">🌐 Все хранилище</strong>
            ) : (
              <span>Контекст: <strong className="text-zinc-200">{folderMeta?.name || currentFolder}</strong></span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Linear-style Segmented Control */}
          <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/[0.06] text-[11px]">
            <button
              type="button"
              onClick={() => handleSetChatDisplayMode('bubbles')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                chatDisplayMode === 'bubbles'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Режим диалога: Чат"
            >
              <span>💬</span>
              <span>Чат</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetChatDisplayMode('document')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                chatDisplayMode === 'document'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Режим диалога: Документ"
            >
              <span>📄</span>
              <span>Документ</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetChatDisplayMode('terminal')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                chatDisplayMode === 'terminal'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Режим диалога: Терминал"
            >
              <span>💻</span>
              <span>Терминал</span>
            </button>
          </div>

          {chatMessages.length > 0 && (
            <button
              onClick={clearChatMessages}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.04] shrink-0"
              title="Очистить диалог"
            >
              <Trash2 className="w-3 h-3" />
              <span className={isSidebar ? 'hidden sm:inline' : ''}>Очистить</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div
        className={`flex-1 overflow-y-auto p-3 flex flex-col gap-3.5 ${
          chatDisplayMode === 'terminal' ? 'bg-[#050506]' : 'bg-[#09090b]'
        } ${isSidebar ? 'text-[11px]' : 'p-4 gap-4'}`}
      >
        {chatMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 max-w-sm mx-auto">
            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 mb-2.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <h3 className="text-xs font-semibold text-zinc-200 mb-1">
              {isInbox ? 'Ассистент по всем заметкам' : `Ассистент «${folderMeta?.name || currentFolder}»`}
            </h3>
            <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
              Задайте вопрос, найдите записи или попросите создать задачу.
            </p>

            <div className="flex flex-col gap-1.5 w-full">
              <button
                onClick={() => handleQuickPrompt('Сколько заметок и задач в хранилище?')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-[11px] text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>📊 Сводка хранилища</span>
                <span className="text-[10px] text-zinc-600 font-mono">stats</span>
              </button>
              <button
                onClick={() => handleQuickPrompt('Найди ключевые заметки')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-[11px] text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>🔍 Поиск заметок</span>
                <span className="text-[10px] text-zinc-600 font-mono">search</span>
              </button>
              <button
                onClick={() => handleQuickPrompt('Создай новую задачу: Проверить синхронизацию заметок')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-[11px] text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>📝 Создать задачу</span>
                <span className="text-[10px] text-zinc-600 font-mono">task</span>
              </button>
            </div>
          </div>
        ) : chatDisplayMode === 'bubbles' ? (
          /* =========================================================================
             A) BUBBLES MODE (Traditional Chat)
             ========================================================================= */
          chatMessages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Message Header */}
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono px-1">
                {msg.role === 'assistant' ? (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>SLAG</span>
                  </>
                ) : (
                  <span>Вы</span>
                )}
                <span>•</span>
                <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-white/10 text-zinc-100 border border-white/[0.08]'
                    : 'bg-[#141416] text-zinc-200 border border-white/[0.06]'
                }`}
              >
                {/* Reasoning Accordion */}
                {msg.reasoning && (
                  <div className="mb-2 pb-1.5 border-b border-white/[0.06]">
                    <button
                      onClick={() => toggleReasoning(msg.id)}
                      className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      {expandedReasoningIds.has(msg.id) ? (
                        <ChevronDown className="w-3 h-3 text-amber-400" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-amber-400" />
                      )}
                      <span>Рассуждения {msg.reasoningTimeMs ? `(${(msg.reasoningTimeMs / 1000).toFixed(1)}s)` : ''}</span>
                    </button>

                    {expandedReasoningIds.has(msg.id) && (
                      <div className="mt-1.5 p-2 rounded-lg bg-black/40 border border-white/[0.04] text-[10px] font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed">
                        {msg.reasoning}
                      </div>
                    )}
                  </div>
                )}

                {/* Tool Calls execution badges and Filter in Feed Button */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    <div className="flex flex-wrap gap-1">
                      {msg.toolCalls.map((tc, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-zinc-400"
                        >
                          <Terminal className="w-2.5 h-2.5 text-zinc-500" />
                          <span className="text-zinc-300 font-medium">{tc.name}</span>
                          {tc.args?.query && <span className="text-zinc-500 truncate max-w-[120px]">("{tc.args.query}")</span>}
                        </div>
                      ))}
                    </div>

                    {/* Filter notes in center feed button */}
                    {msg.toolCalls.some(tc => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0) && (
                      (() => {
                        const searchCall = msg.toolCalls.find(tc => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0);
                        const ids = (searchCall?.result || []).map((r: any) => r.id).filter(Boolean);
                        const query = searchCall?.args?.query || 'поиск';

                        return (
                          <button
                            onClick={() => applyAiFilter(ids, query)}
                            className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[10px] font-medium transition-colors cursor-pointer w-full"
                            title="Отобразить только эти найденные записи в центральной ленте"
                          >
                            <Filter className="w-3 h-3 text-blue-400" />
                            <span>Показать {ids.length} в ленте</span>
                          </button>
                        );
                      })()
                    )}
                  </div>
                )}

                {/* Body Content */}
                <div className="whitespace-pre-wrap font-sans text-xs">
                  {renderFormattedContent(msg.content)}
                </div>

                {/* Interactive Action Card (Read-Only Safety) */}
                {msg.suggestedAction && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                        Черновик {msg.suggestedAction.itemType === 'task' ? 'задачи' : 'заметки'}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[100px]">
                        {msg.suggestedAction.folder}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-zinc-100">
                      {msg.suggestedAction.title}
                    </div>

                    {msg.suggestedAction.content && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2">
                        {msg.suggestedAction.content}
                      </p>
                    )}

                    {msg.suggestedAction.tags && msg.suggestedAction.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {msg.suggestedAction.tags.map((t, idx) => (
                          <span key={idx} className="text-[10px] font-mono text-zinc-500">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => createNoteFromAction(msg.suggestedAction!)}
                      className="mt-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Сохранить в хранилище</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : chatDisplayMode === 'document' ? (
          /* =========================================================================
             B) DOCUMENT MODE (Notion AI / Linear Docs format)
             ========================================================================= */
          <div className={`flex flex-col gap-6 mx-auto w-full ${isSidebar ? 'max-w-none' : 'max-w-3xl px-2'}`}>
            {chatMessages.map(msg => (
              <div key={msg.id} className="flex flex-col gap-2">
                {msg.role === 'user' ? (
                  /* User Prompt: subtle prompt quote or heading */
                  <div className="border-l-2 border-zinc-600 pl-3 py-1 my-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-0.5">
                      ### Вопрос
                    </div>
                    <div className="text-xs sm:text-sm font-medium text-zinc-200 leading-relaxed whitespace-pre-wrap">
                      <span className="text-zinc-500 font-mono select-none mr-1.5">&gt; ❯</span>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant Output: pure typography */
                  <div className="flex flex-col gap-2.5 pl-1">
                    {/* Collapsible Reasoning */}
                    {msg.reasoning && (
                      <div>
                        <button
                          onClick={() => toggleReasoning(msg.id)}
                          className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                        >
                          {expandedReasoningIds.has(msg.id) ? (
                            <ChevronDown className="w-3 h-3 text-amber-400" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-amber-400" />
                          )}
                          <span>🧠 Рассуждения {msg.reasoningTimeMs ? `(${(msg.reasoningTimeMs / 1000).toFixed(1)}s)` : ''}</span>
                        </button>
                        {expandedReasoningIds.has(msg.id) && (
                          <div className="mt-1.5 pl-3 border-l border-zinc-700/60 text-[11px] font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed">
                            {msg.reasoning}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tool Calls rendered as subtle footnote line */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="flex flex-col gap-1 text-[11px] text-zinc-500">
                        {msg.toolCalls.map((tc, idx) => {
                          const count = Array.isArray(tc.result) ? tc.result.length : (tc.result ? 1 : 0);
                          const isSearch = tc.name === 'search_notes';
                          const ids = isSearch && Array.isArray(tc.result) ? tc.result.map((r: any) => r.id).filter(Boolean) : [];
                          const query = tc.args?.query || '';

                          return (
                            <div key={idx} className="flex items-center flex-wrap gap-1.5">
                              <span className="italic">
                                • {isSearch ? `Выполнен поиск по ${count} заметкам${query ? ` («${query}»)` : ''}` : `Выполнен инструмент ${tc.name}`}
                              </span>
                              {isSearch && count > 0 && (
                                <button
                                  onClick={() => applyAiFilter(ids, query)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[10px] font-medium transition-colors cursor-pointer not-italic"
                                  title="Отобразить найденные записи в центральной ленте"
                                >
                                  <Filter className="w-2.5 h-2.5 text-blue-400" />
                                  <span>Показать {count} в ленте</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Assistant Text Typography */}
                    <div className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-zinc-200 leading-relaxed">
                      {renderFormattedContent(msg.content)}
                    </div>

                    {/* Suggested Action: Clean inline block */}
                    {msg.suggestedAction && (
                      <div className="my-2 p-3 rounded-lg bg-zinc-900/60 border-l-2 border-amber-400/80 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                          <span className="uppercase text-amber-300 font-semibold tracking-wider">
                            Черновик {msg.suggestedAction.itemType === 'task' ? 'задачи' : 'заметки'}
                          </span>
                          <span>{msg.suggestedAction.folder}</span>
                        </div>
                        <div className="text-xs sm:text-sm font-semibold text-zinc-100">
                          {msg.suggestedAction.title}
                        </div>
                        {msg.suggestedAction.content && (
                          <p className="text-xs text-zinc-400 line-clamp-3">
                            {msg.suggestedAction.content}
                          </p>
                        )}
                        {msg.suggestedAction.tags && msg.suggestedAction.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {msg.suggestedAction.tags.map((t, idx) => (
                              <span key={idx} className="text-[10px] font-mono text-zinc-500">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="pt-1">
                          <button
                            onClick={() => createNoteFromAction(msg.suggestedAction!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Сохранить в хранилище</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* =========================================================================
             C) TERMINAL MODE (Developer Log / Hacker view)
             ========================================================================= */
          <div className="p-3 rounded-xl bg-[#050506] border border-white/[0.04] font-mono text-xs flex flex-col gap-3 leading-relaxed">
            {chatMessages.map(msg => (
              <div key={msg.id} className="flex flex-col gap-1.5">
                {msg.role === 'user' ? (
                  /* User Prompt */
                  <div className="flex items-start gap-2 text-zinc-300 py-0.5">
                    <span className="text-zinc-600 select-none shrink-0">[{formatTime(msg.createdAt)}]</span>
                    <span className="text-emerald-400 font-bold select-none shrink-0">❯ USER:</span>
                    <div className="whitespace-pre-wrap text-zinc-200 flex-1">{msg.content}</div>
                  </div>
                ) : (
                  /* Assistant Output */
                  <div className="flex flex-col gap-1.5">
                    {/* Reasoning step: visible / unfolded by default in terminal mode */}
                    {msg.reasoning && (
                      <div className="flex flex-col gap-1 text-amber-300/90 bg-amber-500/[0.03] border-l-2 border-amber-500/40 pl-2.5 py-1">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-600 select-none">[{formatTime(msg.createdAt)}]</span>
                          <span className="text-amber-400 font-bold">
                            ⚙ [REASONING]{msg.reasoningTimeMs ? ` (${(msg.reasoningTimeMs / 1000).toFixed(1)}s):` : ':'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleTerminalReasoning(msg.id)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer ml-auto"
                          >
                            {terminalCollapsedReasoningIds.has(msg.id) ? '[+ unfold]' : '[- fold]'}
                          </button>
                        </div>
                        {!terminalCollapsedReasoningIds.has(msg.id) && (
                          <div className="text-zinc-400 text-[11px] whitespace-pre-wrap pl-1 leading-relaxed">
                            {msg.reasoning}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tool Calls */}
                    {msg.toolCalls && msg.toolCalls.map((tc, idx) => {
                      const isSearch = tc.name === 'search_notes';
                      const count = Array.isArray(tc.result) ? tc.result.length : (tc.result ? 1 : 0);
                      const argsStr = tc.args ? JSON.stringify(tc.args) : '{}';

                      return (
                        <div key={idx} className="flex flex-wrap items-center gap-2 text-cyan-300/90 py-0.5">
                          <span className="text-zinc-600 select-none">[{formatTime(msg.createdAt)}]</span>
                          <span className="text-cyan-400 font-bold">🛠 [TOOL_CALL]</span>
                          <span className="text-zinc-300">{tc.name}({argsStr})</span>
                          <span className="text-zinc-500">-&gt; [{count} results]</span>
                          {isSearch && count > 0 && (
                            <button
                              onClick={() => {
                                const ids = tc.result.map((r: any) => r.id).filter(Boolean);
                                const query = tc.args?.query || 'поиск';
                                applyAiFilter(ids, query);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] cursor-pointer transition-colors"
                              title="Отобразить найденные записи в центральной ленте"
                            >
                              <Filter className="w-2.5 h-2.5" />
                              <span>Показать {count} в ленте</span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Assistant Output */}
                    <div className="flex items-start gap-2 text-zinc-200 py-0.5">
                      <span className="text-zinc-600 select-none shrink-0">
                        [{formatTime(msg.createdAt + (msg.reasoningTimeMs || 1000))}]
                      </span>
                      <span className="text-emerald-400 font-bold select-none shrink-0">✔ [OUTPUT]:</span>
                      <div className="whitespace-pre-wrap flex-1 text-zinc-100 leading-relaxed">
                        {renderFormattedContent(msg.content)}
                      </div>
                    </div>

                    {/* Suggested Action: ASCII monospace box */}
                    {msg.suggestedAction && (
                      <div className="my-1 p-2.5 rounded bg-black/60 border border-white/[0.06] text-xs text-zinc-300 space-y-1">
                        <div className="text-amber-400 text-[11px] font-mono">
                          ┌── [{msg.suggestedAction.itemType === 'task' ? 'DRAFT TASK' : 'DRAFT NOTE'}] ──────────────────────────────────────┐
                        </div>
                        <div className="pl-2 text-zinc-100 font-semibold">
                          │ Title:   {msg.suggestedAction.title}
                        </div>
                        <div className="pl-2 text-zinc-400 text-[11px]">
                          │ Folder:  {msg.suggestedAction.folder}
                        </div>
                        {msg.suggestedAction.content && (
                          <div className="pl-2 text-zinc-400 text-[11px] line-clamp-2">
                            │ Content: {msg.suggestedAction.content}
                          </div>
                        )}
                        {msg.suggestedAction.tags && msg.suggestedAction.tags.length > 0 && (
                          <div className="pl-2 text-zinc-500 text-[10px]">
                            │ Tags:    {msg.suggestedAction.tags.map(t => `#${t}`).join(', ')}
                          </div>
                        )}
                        <div className="text-amber-400 text-[11px] font-mono">
                          └─────────────────────────────────────────────────────────────────┘
                        </div>
                        <div className="pt-1">
                          <button
                            onClick={() => createNoteFromAction(msg.suggestedAction!)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Сохранить в хранилище</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isChatLoading && (
          <div className={`flex items-center gap-2 text-zinc-500 text-xs px-2 py-1 ${chatDisplayMode === 'terminal' ? 'font-mono' : ''}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
            <span>
              {chatDisplayMode === 'terminal'
                ? '[EXEC] Processing request...'
                : chatDisplayMode === 'document'
                ? 'Генерация ответа...'
                : 'Ассистент думает...'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Composer */}
      <div className="p-2.5 border-t border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md shrink-0">
        <div className="flex flex-col gap-1.5 bg-[#141416] border border-white/[0.08] rounded-xl p-2 focus-within:border-white/20 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              chatDisplayMode === 'terminal'
                ? '[USER]> Введите запрос к ассистенту... (Enter для отправки)'
                : isSidebar
                ? 'Спросите ассистента...'
                : isInbox
                ? 'Спросите ассистента по всем заметкам базы знаний... (Enter для отправки)'
                : `Спросите о заметках папки «${folderMeta?.name || currentFolder}»... (Enter для отправки)`
            }
            rows={1}
            className={`w-full bg-transparent text-xs text-white placeholder-zinc-500 resize-none outline-none border-none leading-relaxed ${
              chatDisplayMode === 'terminal' ? 'font-mono' : ''
            }`}
          />

          {/* Controls Bar: Reasoning selector + Web Search toggle + Send */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
            <div className="flex items-center gap-1.5">
              {/* Reasoning Selector */}
              <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                <span>R:</span>
                <select
                  value={aiSettings.reasoningEffort || 'low'}
                  onChange={(e) => saveAiSettings({ reasoningEffort: e.target.value as any })}
                  className="bg-black/40 border border-white/[0.06] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 outline-none cursor-pointer"
                >
                  <option value="none">Off</option>
                  <option value="low">Low</option>
                  <option value="medium">Med</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Web search toggle */}
              <button
                type="button"
                onClick={() => saveAiSettings({ webSearchEnabled: !aiSettings.webSearchEnabled })}
                className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  aiSettings.webSearchEnabled
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Поиск информации в глобальной сети Интернет"
              >
                <Globe className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">Сеть</span>
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isChatLoading}
              className="p-1 rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
              title="Отправить сообщение (Enter)"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
