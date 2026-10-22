import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
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
  Filter,
  BarChart3,
  Search,
  CheckSquare,
  ArrowUpRight
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
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
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
      const scrollHeight = textareaRef.current.scrollHeight;
      const targetHeight = Math.max(28, Math.min(scrollHeight || 28, isSidebar ? 120 : 160));
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [input, isSidebar]);

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

  const handleQuickPrompt = (prompt: string) => {
    setInput('');
    sendChatMessage(prompt);
  };

  // Render rich text with WikiLinks, bold, code, tags, and structured lists
  const renderRichContent = (content: string) => {
    const lines = content.split('\n');

    const parseInline = (text: string, lineKey: string | number) => {
      // Split text by [[WikiLinks]], `code`, **bold**, and #tags
      const tokenRegex = /(\[\[[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*|#[\wа-яА-ЯёЁ_-]+)/g;
      const parts = text.split(tokenRegex);

      return parts.map((part, index) => {
        const key = `${lineKey}-${index}`;

        // [[WikiLink]]
        if (part.startsWith('[[') && part.endsWith(']]')) {
          const title = part.slice(2, -2);
          return (
            <button
              key={key}
              type="button"
              onClick={() => scrollToItem(title)}
              className="inline text-left text-blue-400 hover:text-blue-300 font-medium cursor-pointer transition-colors hover:underline select-text text-xs"
              title={`Перейти к «${title}»`}
            >
              <span className="text-zinc-500 font-mono text-[11px] select-none">[[</span>
              <span className="underline decoration-blue-500/40 underline-offset-2">{title}</span>
              <span className="text-zinc-500 font-mono text-[11px] select-none">]]</span>
              <ArrowUpRight className="w-2.5 h-2.5 text-blue-400/70 inline-block align-baseline ml-0.5 select-none" />
            </button>
          );
        }

        // **Bold**
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return (
            <strong key={key} className="font-semibold text-zinc-100">
              {part.slice(2, -2)}
            </strong>
          );
        }

        // `Code`
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code key={key} className="font-mono text-[11px] px-1 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.04]">
              {part.slice(1, -1)}
            </code>
          );
        }

        // #Tag
        if (part.startsWith('#') && part.length > 1 && !part.includes(' ')) {
          return (
            <span key={key} className="text-zinc-400 font-mono text-[11px]">
              {part}
            </span>
          );
        }

        return <span key={key}>{part}</span>;
      });
    };

    return lines.map((line, lineIndex) => {
      const trimmed = line.trim();

      // Empty line -> small vertical spacer
      if (!trimmed) {
        return <div key={lineIndex} className="h-1.5" />;
      }

      // Heading: ### or ## or #
      if (/^#{1,4}\s+/.test(trimmed)) {
        const headingText = trimmed.replace(/^#{1,4}\s+/, '');
        return (
          <div key={lineIndex} className="font-semibold text-zinc-100 text-xs mt-1.5 mb-0.5">
            {parseInline(headingText, lineIndex)}
          </div>
        );
      }

      // List item: - or *
      if (/^[-*]\s+/.test(trimmed)) {
        const itemText = trimmed.replace(/^[-*]\s+/, '');
        return (
          <div key={lineIndex} className="flex items-start gap-2 pl-0.5 my-0.5 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0 mt-1.5 select-none" />
            <span className="flex-1 min-w-0">{parseInline(itemText, lineIndex)}</span>
          </div>
        );
      }

      // Numbered list item: 1. or 2.
      if (/^\d+\.\s+/.test(trimmed)) {
        const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
        if (match) {
          return (
            <div key={lineIndex} className="flex items-start gap-1.5 pl-0.5 my-0.5 leading-relaxed">
              <span className="text-[10px] font-mono text-zinc-500 shrink-0 mt-0.5 select-none">{match[1]}</span>
              <span className="flex-1 min-w-0">{parseInline(match[2], lineIndex)}</span>
            </div>
          );
        }
      }

      // Normal paragraph line
      return (
        <div key={lineIndex} className="leading-relaxed">
          {parseInline(line, lineIndex)}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#09090b] relative select-text overflow-hidden">
      {/* Scope Context Header Banner */}
      <div className={`px-3 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between text-xs text-zinc-400 shrink-0 ${isSidebar ? 'gap-1' : ''}`}>
        <div className="flex items-center gap-1.5 truncate">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="truncate">
            {isInbox ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-200">
                <Globe className="w-3.5 h-3.5 text-zinc-400" />
                <span>Все хранилище</span>
              </span>
            ) : (
              <span>Контекст: <strong className="text-zinc-200">{folderMeta?.name || currentFolder}</strong></span>
            )}
          </span>
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

      {/* Messages Stream */}
      <div className={`flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3.5 ${isSidebar ? 'text-[11px]' : 'p-4 gap-4'}`}>
        {chatMessages.length === 0 ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center p-4 max-w-sm mx-auto">
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
                <span className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Сводка хранилища</span>
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">stats</span>
              </button>
              <button
                onClick={() => handleQuickPrompt('Найди ключевые заметки')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-[11px] text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Поиск заметок</span>
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">search</span>
              </button>
              <button
                onClick={() => handleQuickPrompt('Создай новую задачу: Проверить синхронизацию заметок')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-[11px] text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Создать задачу</span>
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">task</span>
              </button>
            </div>
          </div>
        ) : (
          chatMessages.map(msg => {
            const searchCall = msg.toolCalls?.find(
              tc => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0
            );
            const filterItemIds = (searchCall?.result || []).map((r: any) => r.id).filter(Boolean);
            const filterQuery = searchCall?.args?.query || 'поиск';

            return (
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

                {/* Tool Calls execution: plain text outside message bubble without chips */}
                {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-col gap-0.5 px-1 -mt-0.5 mb-0.5 select-text">
                    {msg.toolCalls.map((tc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500"
                      >
                        <Terminal className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                        <span className="text-zinc-400">{tc.name}</span>
                        {tc.args?.query && (
                          <span className="text-zinc-500 truncate max-w-[200px]">("{tc.args.query}")</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-white/10 text-zinc-100 border border-white/[0.08]'
                      : 'bg-[#141416] text-zinc-200 border border-white/[0.06] shadow-sm'
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

                  {/* Body Content with rich Markdown & WikiLink formatting */}
                  <div className="font-sans text-xs flex flex-col gap-1">
                    {renderRichContent(msg.content)}
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

                {/* Telegram-style Inline Action Button below the message bubble */}
                {filterItemIds.length > 0 && (
                  <button
                    onClick={() => applyAiFilter(filterItemIds, filterQuery)}
                    className="max-w-[92%] w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#18181c] hover:bg-[#202024] text-zinc-200 border border-white/[0.08] hover:border-white/[0.14] text-xs font-medium transition-all shadow-sm cursor-pointer group mt-0.5"
                    title="Отобразить только эти найденные записи в центральной ленте"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span>Показать {filterItemIds.length} в ленте</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  </button>
                )}
              </div>
            );
          })
        )}

        {isChatLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs px-2 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
            <span>Ассистент думает...</span>
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
              isSidebar
                ? 'Спросите ассистента...'
                : isInbox
                ? 'Спросите ассистента по всем заметкам базы знаний... (Enter для отправки)'
                : `Спросите о заметках папки «${folderMeta?.name || currentFolder}»... (Enter для отправки)`
            }
            rows={1}
            className="w-full min-h-[28px] bg-transparent text-xs text-white placeholder-zinc-500 resize-none outline-none border-none leading-relaxed"
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
                className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
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
              className="p-1 rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm cursor-pointer"
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
