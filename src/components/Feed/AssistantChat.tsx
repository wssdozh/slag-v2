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
  ArrowUpRight,
  Calendar,
  ListTodo,
  Check,
  FolderOpen,
  Link2,
  X
} from 'lucide-react';
import { Select } from '../UI/Select';

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
    rejectAction,
    aiSettings,
    saveAiSettings,
    scrollToItem,
    applyAiFilter,
    setIsSettingsOpen,
    isMobile
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

  // Render rich text with WikiLinks, markdown headers, dividers, code blocks, bold, italic, code, tags, and structured lists
  const renderRichContent = (content: string) => {
    const rawLines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockLines: string[] = [];

    const parseInline = (text: string, lineKey: string | number) => {
      // Split text by [Markdown Links](url), [[WikiLinks]] (with tolerance for [[[brackets]]]), `code`, **bold**, *italic*, ~~strikethrough~~, and #tags
      const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\[{2,}[^\]]+\]+|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|#[\wа-яА-ЯёЁ_-]+)/g;
      const parts = text.split(tokenRegex);

      return parts.map((part, index) => {
        const key = `${lineKey}-${index}`;

        // [Markdown Link](url)
        const mdLinkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (mdLinkMatch) {
          return (
            <a
              key={key}
              href={mdLinkMatch[2]}
              target="_blank"
              rel="noreferrer"
              className="inline text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              {mdLinkMatch[1]}
            </a>
          );
        }

        // [[WikiLink]] - Clean badge rendering without raw brackets or detached arrow
        if (part.startsWith('[[') && part.endsWith(']')) {
          const title = part.replace(/^\[+|\]+$/g, '').trim();
          return (
            <button
              key={key}
              type="button"
              onClick={() => scrollToItem(title)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 hover:text-blue-200 font-medium cursor-pointer transition-colors border border-blue-500/20 align-baseline text-[11px]"
              title={`Перейти к «${title}»`}
            >
              <Link2 className="w-2.5 h-2.5 text-blue-400 shrink-0 select-none" />
              <span className="underline decoration-blue-400/30 underline-offset-2">{title}</span>
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

        // *Italic*
        if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
          return (
            <em key={key} className="italic text-zinc-200">
              {part.slice(1, -1)}
            </em>
          );
        }

        // ~~Strikethrough~~
        if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
          return (
            <del key={key} className="line-through text-zinc-500">
              {part.slice(2, -2)}
            </del>
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

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Multi-line Code blocks start/end
      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = trimmed.slice(3).trim();
          codeBlockLines = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <div key={`cb-${i}`} className="my-2 rounded-lg bg-black/60 border border-white/[0.06] overflow-hidden">
              {codeBlockLang && (
                <div className="px-2.5 py-1 text-[10px] font-mono text-zinc-500 bg-white/[0.02] border-b border-white/[0.04]">
                  {codeBlockLang}
                </div>
              )}
              <pre className="p-2.5 overflow-x-auto text-[11px] font-mono text-zinc-300 leading-normal">
                <code>{codeBlockLines.join('\n')}</code>
              </pre>
            </div>
          );
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Empty line -> small vertical spacer
      if (!trimmed) {
        elements.push(<div key={`sp-${i}`} className="h-1.5" />);
        continue;
      }

      // Horizontal Divider: ---, ***, ___
      if (/^([-*_]){3,}$/.test(trimmed)) {
        elements.push(<hr key={`hr-${i}`} className="my-2.5 border-t border-white/[0.08]" />);
        continue;
      }

      // Blockquote: > text
      if (/^>\s+/.test(trimmed)) {
        elements.push(
          <div key={`quote-${i}`} className="border-l-2 border-zinc-600 pl-2.5 py-0.5 my-1 text-zinc-400 italic">
            {parseInline(trimmed.replace(/^>\s+/, ''), i)}
          </div>
        );
        continue;
      }

      // Heading: #, ##, ###
      if (/^#{1,4}\s+/.test(trimmed)) {
        const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = headingMatch[2];
          elements.push(
            <div
              key={`h-${i}`}
              className={`font-semibold ${
                level === 1 ? 'text-xs font-bold mt-2 mb-1 text-zinc-100' : 'text-xs mt-1.5 mb-0.5 text-zinc-200'
              }`}
            >
              {parseInline(text, i)}
            </div>
          );
          continue;
        }
      }

      // List item: - or *
      if (/^[-*]\s+/.test(trimmed)) {
        const itemText = trimmed.replace(/^[-*]\s+/, '');
        elements.push(
          <div key={`li-${i}`} className="flex items-start gap-2 pl-0.5 my-0.5 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0 mt-1.5 select-none" />
            <span className="flex-1 min-w-0">{parseInline(itemText, i)}</span>
          </div>
        );
        continue;
      }

      // Numbered list item: 1. or 2.
      if (/^\d+\.\s+/.test(trimmed)) {
        const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
        if (match) {
          elements.push(
            <div key={`ol-${i}`} className="flex items-start gap-1.5 pl-0.5 my-0.5 leading-relaxed">
              <span className="text-[10px] font-mono text-zinc-500 shrink-0 mt-0.5 select-none">{match[1]}</span>
              <span className="flex-1 min-w-0">{parseInline(match[2], i)}</span>
            </div>
          );
          continue;
        }
      }

      // Normal paragraph line
      elements.push(
        <div key={`p-${i}`} className="leading-relaxed">
          {parseInline(line, i)}
        </div>
      );
    }

    if (inCodeBlock && codeBlockLines.length > 0) {
      elements.push(
        <div key="cb-unclosed" className="my-2 rounded-lg bg-black/60 border border-white/[0.06] p-2.5 overflow-x-auto text-[11px] font-mono text-zinc-300">
          <code>{codeBlockLines.join('\n')}</code>
        </div>
      );
    }

    return elements;
  };

  const isConnected =
    (aiSettings.provider === 'groq' && Boolean(aiSettings.groqApiKey)) ||
    (aiSettings.provider === 'kie' && Boolean(aiSettings.kieApiKey)) ||
    (aiSettings.provider === 'gemini' && Boolean(aiSettings.geminiApiKey));

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#09090b] relative select-text overflow-hidden">
      {/* Scope Context Header Banner */}
      <div className={`px-3 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between text-xs text-zinc-400 shrink-0 ${isSidebar ? 'gap-1' : ''}`}>
        <div className="flex items-center gap-2 truncate min-w-0">
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
                onClick={() => handleQuickPrompt('Покажи план на сегодня и календарную повестку')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-[11px] text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>План на сегодня</span>
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">agenda</span>
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

                {/* Message Bubble - only rendered if has body text, reasoning or action */}
                {Boolean(
                  (msg.content && !msg.content.startsWith('[Подготовлен черновик')) ||
                    msg.reasoning ||
                    msg.suggestedAction
                ) && (
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
                  {msg.content && !msg.content.startsWith('[Подготовлен черновик') && (
                    <div className="font-sans text-xs flex flex-col gap-1">
                      {renderRichContent(msg.content)}
                    </div>
                  )}

                  {/* Interactive Action Card (Read-Only Safety & Lifecycle) */}
                  {msg.suggestedAction && (() => {
                    const action = msg.suggestedAction;
                    const actionState = action.actionState || 'suggested';
                    const isRejected = actionState === 'rejected';
                    const isApplied = actionState === 'applied';
                    const isExecuting = actionState === 'executing';

                    return (
                      <div className={`mt-2.5 p-2.5 rounded-xl border flex flex-col gap-2 transition-all ${
                        isRejected
                          ? 'bg-white/[0.01] border-white/[0.04] opacity-60'
                          : isApplied
                          ? 'bg-emerald-500/[0.04] border-emerald-500/20 shadow-sm'
                          : 'bg-white/[0.03] border-white/[0.08]'
                      }`}>
                        {/* Header: Action type & Folder */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono uppercase tracking-wider ${
                              isRejected ? 'text-zinc-500' : isApplied ? 'text-emerald-400' : 'text-amber-300'
                            }`}>
                              {action.type === 'schedule_task' && '📅 Планирование в календарь'}
                              {action.type === 'decompose_task' && '☑️ Декомпозиция задачи'}
                              {action.type === 'update_task_status' && '📊 Смена статуса канбан'}
                              {action.type === 'reschedule_task' && '⏱ Перенос срока'}
                              {action.type === 'move_note' && '📁 Перемещение по папкам'}
                              {action.type === 'create_note' && (
                                action.itemType === 'task'
                                  ? 'Черновик задачи'
                                  : action.itemType === 'article'
                                  ? 'Черновик статьи'
                                  : 'Черновик заметки'
                              )}
                            </span>
                            {/* Action category pill */}
                            {!isRejected && !isApplied && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                                {action.type === 'create_note' ? (action.itemType === 'article' ? 'Статья' : 'Запись') : 'Действие'}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[120px]">
                            {action.folder}
                          </span>
                        </div>

                        {/* Title & Priority */}
                        <div className="text-xs font-semibold flex items-center justify-between gap-2">
                          <span className={isRejected ? 'line-through text-zinc-500' : isApplied ? 'text-zinc-200' : 'text-zinc-100'}>
                            {action.title}
                          </span>
                          {action.priority && !isRejected && (
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              action.priority === 'high' ? 'bg-rose-500/15 text-rose-300' :
                              action.priority === 'medium' ? 'bg-amber-500/15 text-amber-300' :
                              'bg-blue-500/15 text-blue-300'
                            }`}>
                              {action.priority.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Schedule info if available */}
                        {action.dueDate && (
                          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                            <Calendar className="w-3 h-3 text-zinc-500" />
                            <span>Срок: {action.dueDate}</span>
                            {action.reminder && (
                              <span className="text-zinc-500">
                                ({new Date(action.reminder).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Subtasks checklist if decompose_task */}
                        {action.subtasks && action.subtasks.length > 0 && (
                          <div className="space-y-1 py-1">
                            {action.subtasks.map((st, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                                <span className="w-3.5 h-3.5 rounded border border-zinc-600 flex items-center justify-center shrink-0">
                                  {st.completed && <Check className="w-2 h-2 text-white" />}
                                </span>
                                <span className="truncate">{st.title}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Content snippet */}
                        {action.content && (
                          <p className="text-[11px] text-zinc-400 line-clamp-2">
                            {action.content}
                          </p>
                        )}

                        {/* Tags */}
                        {action.tags && action.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {action.tags.map((t, idx) => (
                              <span key={idx} className="text-[10px] font-mono text-zinc-500">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action Lifecycle Controls */}
                        {isRejected ? (
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 py-0.5">
                            <X className="w-3.5 h-3.5 text-zinc-600" />
                            <span>Действие отклонено</span>
                          </div>
                        ) : isApplied ? (
                          <div className="mt-1 flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                              <Check className="w-3.5 h-3.5" />
                              <span>{action.type === 'schedule_task' ? `Запланировано на ${action.dueDate}` : 'Сохранено в хранилище'}</span>
                            </div>
                            <button
                              onClick={() => scrollToItem(action.appliedItemId || action.title)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
                              title="Показать запись в ленте"
                            >
                              <span>Перейти к записи</span>
                              <ArrowUpRight className="w-3 h-3 text-zinc-400" />
                            </button>
                          </div>
                        ) : isExecuting ? (
                          <button
                            disabled
                            className="mt-1 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 font-semibold text-xs opacity-80 cursor-not-allowed shadow-sm"
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                            <span>Применение...</span>
                          </button>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              onClick={() => createNoteFromAction(action, msg.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
                            >
                              {action.type === 'decompose_task' && (
                                <>
                                  <ListTodo className="w-3.5 h-3.5" />
                                  <span>
                                    {action.subtasks?.length === 1
                                      ? 'Применить 1 подзадачу'
                                      : `Применить ${action.subtasks?.length || 0} подзадач`}
                                  </span>
                                </>
                              )}
                              {action.type === 'schedule_task' && (
                                <>
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>Запланировать на {action.dueDate}</span>
                                </>
                              )}
                              {action.type === 'update_task_status' && (
                                <>
                                  <CheckSquare className="w-3.5 h-3.5" />
                                  <span>Сменить статус на «{action.status}»</span>
                                </>
                              )}
                              {action.type === 'move_note' && (
                                <>
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  <span>Переместить в «{action.folder}»</span>
                                </>
                              )}
                              {(!action.type || action.type === 'create_note') && (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Сохранить в хранилище</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => rejectAction(msg.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-white/[0.06] transition-colors cursor-pointer flex items-center gap-1"
                              title="Отклонить это действие"
                            >
                              <X className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Отклонить</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

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
                : isMobile
                ? 'Спросите ассистента по базе знаний...'
                : isInbox
                ? 'Спросите ассистента по всем заметкам базы знаний... (Enter для отправки)'
                : `Спросите о заметках папки «${folderMeta?.name || currentFolder}»... (Enter для отправки)`
            }
            rows={1}
            className="w-full min-h-[28px] bg-transparent text-xs text-white placeholder-zinc-500 resize-none outline-none border-none leading-relaxed"
          />

          {/* Controls Bar: Unified MD height row matching Composer (32px desktop / 38px touch) */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Provider badge - Linear Monochrome */}
              {isConnected ? (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="h-ctrl-md inline-flex items-center gap-1.5 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.06] text-xs font-mono cursor-pointer transition-colors"
                  title={`Провайдер ${aiSettings.provider}: ${aiSettings.model} (нажмите для настроек)`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{aiSettings.provider === 'groq' ? 'Groq' : aiSettings.provider === 'kie' ? 'KIE.AI' : 'Gemini'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="h-ctrl-md inline-flex items-center gap-1.5 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.06] text-xs font-mono transition-colors cursor-pointer"
                  title="Нажмите для настройки API-ключа (⌘,)"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  <span>Локальный</span>
                </button>
              )}

              {/* Reasoning Selector */}
              <div className="flex items-center gap-1 text-xs font-mono text-zinc-400">
                <span className="text-zinc-500">R:</span>
                <Select
                  size="md"
                  direction="up"
                  value={aiSettings.reasoningEffort || 'low'}
                  onChange={(val) => saveAiSettings({ reasoningEffort: val as any })}
                  options={[
                    { value: 'none', label: 'Off' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Med' },
                    { value: 'high', label: 'High' },
                  ]}
                />
              </div>

              {/* Web search toggle - Linear Monochrome */}
              <button
                type="button"
                onClick={() => saveAiSettings({ webSearchEnabled: !aiSettings.webSearchEnabled })}
                className={`h-ctrl-md flex items-center gap-1.5 px-3 rounded-lg text-xs font-mono transition-colors cursor-pointer border ${
                  aiSettings.webSearchEnabled
                    ? 'bg-white/12 text-zinc-100 border-white/20 shadow-sm'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border-white/[0.06]'
                }`}
                title="Поиск информации в глобальной сети Интернет"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Сеть</span>
              </button>
            </div>

            {/* Send Button - Copied directly from Composer */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isChatLoading}
              className={`w-ctrl-md h-ctrl-md rounded-full flex items-center justify-center transition-all btn-press shrink-0 ${
                input.trim() && !isChatLoading
                  ? 'bg-white text-black hover:bg-zinc-200 active:scale-95 shadow-md cursor-pointer'
                  : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
              }`}
              title="Отправить сообщение (Enter)"
            >
              <Send className="w-4 h-4 ml-0.5 fill-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
