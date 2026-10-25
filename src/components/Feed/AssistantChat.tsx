import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { BaseComposer } from './BaseComposer';
import {
  Sparkles,
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
  X,
  Circle,
  Clock,
  FileText
} from 'lucide-react';
import { Select } from '../UI/Select';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { TagChip } from '../UI/TagChip';

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
  const [expandedResultsMap, setExpandedResultsMap] = useState<Record<string, boolean>>({});
  const [batchSelections, setBatchSelections] = useState<Record<string, Record<string, boolean>>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isTaskSelected = (msgId: string, taskId: string): boolean => {
    if (!batchSelections[msgId]) return true;
    return batchSelections[msgId][taskId] !== false;
  };

  const toggleTaskSelection = (msgId: string, taskId: string) => {
    setBatchSelections(prev => {
      const currentMsgMap = prev[msgId] || {};
      const currentVal = currentMsgMap[taskId] !== false;
      return {
        ...prev,
        [msgId]: {
          ...currentMsgMap,
          [taskId]: !currentVal,
        },
      };
    });
  };

  const isResultsExpanded = (msgId: string, count: number) => {
    if (expandedResultsMap[msgId] !== undefined) {
      return expandedResultsMap[msgId];
    }
    return count <= 3;
  };

  const toggleResultsExpanded = (msgId: string, count: number) => {
    setExpandedResultsMap(prev => ({
      ...prev,
      [msgId]: !isResultsExpanded(msgId, count)
    }));
  };

  const formatReminderTime = (rem?: string) => {
    if (!rem) return '';
    if (/^\d{2}:\d{2}$/.test(rem)) return rem;
    try {
      const d = new Date(rem);
      return isNaN(d.getTime()) ? rem : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return rem;
    }
  };

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';
  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  const handleSend = () => {
    if (!input.trim() || isChatLoading) return;
    const text = input;
    setInput('');
    sendChatMessage(text);
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
              className="text-blue-400 hover:text-blue-300 hover:underline"
            >
              {mdLinkMatch[1]}
            </a>
          );
        }

        // [[WikiLink]] - Clean inline text link without boxes, chips or icons
        if (part.startsWith('[[') && part.endsWith(']')) {
          const title = part.replace(/^\[+|\]+$/g, '').trim();
          return (
            <span
              key={key}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                scrollToItem(title);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  scrollToItem(title);
                }
              }}
              className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
              title={`Перейти к «${title}»`}
            >
              {title}
            </span>
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
          <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="truncate">
            {isInbox ? (
              <span className="font-medium text-zinc-200">Все хранилище</span>
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
              <Sparkles className="w-4 h-4 text-zinc-300" />
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
                  <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
            const searchResults = (searchCall?.result || []) as Array<{
              id: string;
              title: string;
              type?: string;
              folder?: string;
              tags?: string[];
              snippet?: string;
            }>;
            const filterItemIds = searchResults.map(r => r.id).filter(Boolean);
            const filterQuery = searchCall?.args?.query || 'поиск';
            const isExpanded = isResultsExpanded(msg.id, filterItemIds.length);

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Message Header */}
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono px-1">
                  {msg.role === 'assistant' ? (
                    <>
                      <Sparkles className="w-3 h-3 text-zinc-400" />
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

                {/* Reasoning Accordion: outside message bubble, underneath tool calls */}
                {msg.role === 'assistant' && msg.reasoning && (
                  <div className="flex flex-col gap-1 px-1 -mt-0.5 mb-1 max-w-[92%] select-text">
                    <button
                      onClick={() => toggleReasoning(msg.id)}
                      className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer w-fit"
                    >
                      {expandedReasoningIds.has(msg.id) ? (
                        <ChevronDown className="w-3 h-3 text-amber-400" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-amber-400" />
                      )}
                      <span>Рассуждения {msg.reasoningTimeMs ? `(${(msg.reasoningTimeMs / 1000).toFixed(1)}s)` : ''}</span>
                    </button>

                    {expandedReasoningIds.has(msg.id) && (
                      <div className="pl-3 py-0.5 text-[10px] font-mono text-zinc-500 whitespace-pre-wrap leading-relaxed select-text">
                        {msg.reasoning}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Bubble - pure text bubble, no embedded action card */}
                {Boolean(msg.content && !msg.content.startsWith('[Подготовлен черновик')) && (
                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-white/10 text-zinc-100 border border-white/[0.08]'
                        : 'bg-[#141416] text-zinc-200 border border-white/[0.06] shadow-sm'
                    }`}
                  >
                    <div className="font-sans text-xs flex flex-col gap-1">
                      {renderRichContent(msg.content)}
                    </div>
                  </div>
                )}

                {/* Standalone Action Cards (supporting single or multiple actions) */}
                {(() => {
                  const actionsToRender = msg.suggestedActions && msg.suggestedActions.length > 0
                    ? msg.suggestedActions
                    : (msg.suggestedAction ? [msg.suggestedAction] : []);
                  if (actionsToRender.length === 0) return null;

                  return actionsToRender.map((action, actIdx) => {
                    const actionState = action.actionState || 'suggested';
                    const isRejected = actionState === 'rejected';
                    const isApplied = actionState === 'applied';
                    const isExecuting = actionState === 'executing';

                    return (
                      <div
                        key={`act-${actIdx}-${action.type}`}
                        className={`max-w-[92%] w-full rounded-xl bg-[#141416] border border-white/[0.08] overflow-hidden mt-1 text-xs shadow-sm transition-opacity ${
                          isRejected ? 'opacity-50' : ''
                        }`}
                      >
                        {/* Header bar: Monochrome Linear style */}
                        <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.02] border-b border-white/[0.04] text-2xs font-mono text-zinc-400">
                          <div className="flex items-center gap-1.5">
                            {action.type === 'schedule_task' && <Calendar className="w-3.5 h-3.5 text-zinc-400" />}
                            {action.type === 'decompose_task' && <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />}
                            {action.type === 'update_task_status' && <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />}
                            {(action.type === 'reschedule_task' || action.type === 'batch_reschedule') && <Clock className="w-3.5 h-3.5 text-zinc-400" />}
                            {action.type === 'append_to_note' && <Plus className="w-3.5 h-3.5 text-zinc-400" />}
                            {action.type === 'move_note' && <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />}
                            {(!action.type || action.type === 'create_note') && <Plus className="w-3.5 h-3.5 text-zinc-400" />}
                            <span className={isRejected ? 'text-zinc-500' : isApplied ? 'text-zinc-300 font-medium' : 'text-zinc-200 font-medium'}>
                              {action.type === 'schedule_task' && 'Планирование в календарь'}
                              {action.type === 'decompose_task' && 'Декомпозиция задачи'}
                              {action.type === 'update_task_status' && 'Смена статуса канбан'}
                              {action.type === 'reschedule_task' && 'Перенос срока'}
                              {action.type === 'batch_reschedule' && (action.title || 'Перенос задач')}
                              {action.type === 'append_to_note' && 'Дополнение заметки'}
                              {action.type === 'move_note' && 'Перемещение по папкам'}
                              {action.type === 'create_note' && (
                                action.itemType === 'task'
                                  ? 'Черновик задачи'
                                  : action.itemType === 'article'
                                  ? 'Черновик статьи'
                                  : 'Черновик заметки'
                              )}
                            </span>
                          </div>
                          <span className="text-zinc-500 truncate max-w-[130px]">
                            {action.folder}
                          </span>
                        </div>

                        <div className="p-3.5 flex flex-col gap-2.5">
                          {/* Title & Priority (Only for single-item actions, omitted for batch_reschedule to prevent duplicate header) */}
                          {action.type !== 'batch_reschedule' && (
                            <div className="text-xs font-semibold flex items-center justify-between gap-2">
                              <span className={isRejected ? 'line-through text-zinc-500' : isApplied ? 'text-zinc-300' : 'text-zinc-100'}>
                                {action.title}
                              </span>
                              {action.priority && !isRejected && (
                                <span className="flex items-center gap-1 shrink-0">
                                  <LinearSignalBars priority={action.priority} className="w-3 h-3" />
                                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                                    action.priority === 'high' ? 'bg-rose-500/15 text-rose-300' :
                                    action.priority === 'medium' ? 'bg-amber-500/15 text-amber-300' :
                                    'bg-blue-500/15 text-blue-300'
                                  }`}>
                                    {action.priority.toUpperCase()}
                                  </span>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Single Schedule info */}
                          {action.dueDate && (
                            <div className="flex items-center gap-2 text-2xs font-mono text-zinc-400">
                              <Calendar className="w-3 h-3 text-zinc-500" />
                              <span>Срок: {action.dueDate}</span>
                              {action.reminder && (
                                <span className="text-zinc-500">
                                  ({formatReminderTime(action.reminder)})
                                </span>
                              )}
                            </div>
                          )}

                          {/* Subtasks checklist if decompose_task */}
                          {action.subtasks && action.subtasks.length > 0 && (
                            <div className="flex flex-col gap-1.5 py-0.5">
                              {action.subtasks.map((st, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-2 text-xs text-zinc-300">
                                  <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                                  <span className="leading-tight">{st.title}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Batch reschedule items list with selection checkboxes */}
                          {action.type === 'batch_reschedule' && action.batchItems && action.batchItems.length > 0 && (
                            <div className="flex flex-col divide-y divide-white/[0.04] border-t border-b border-white/[0.04] -mx-3.5 px-3.5 py-1">
                              {action.batchItems.map((item, bIdx) => {
                                const selected = isTaskSelected(msg.id, item.targetItemId);
                                return (
                                  <div key={bIdx} className={`flex items-center justify-between text-xs py-1.5 gap-2 transition-opacity ${
                                    !selected && !isApplied ? 'opacity-40' : ''
                                  }`}>
                                    <div className="flex items-center gap-2 truncate flex-1">
                                      {!isApplied && !isRejected && (
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={() => toggleTaskSelection(msg.id, item.targetItemId)}
                                          className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-zinc-200 cursor-pointer shrink-0"
                                        />
                                      )}
                                      <span className={`truncate leading-tight ${selected ? 'text-zinc-200' : 'text-zinc-500 line-through'}`}>
                                        {item.title}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 text-2xs font-mono text-zinc-400">
                                      <Calendar className="w-3 h-3 text-zinc-500" />
                                      <span>{item.dueDate || 'без срока'}</span>
                                      {item.reminder && (
                                        <span className="text-zinc-400 font-medium">
                                          {formatReminderTime(item.reminder)}
                                        </span>
                                      )}
                                      {item.priority && item.priority !== 'none' && (
                                        <span className={`px-1 py-0.5 rounded text-[9px] font-semibold ${
                                          item.priority === 'high' ? 'bg-rose-500/15 text-rose-300' :
                                          item.priority === 'medium' ? 'bg-amber-500/15 text-amber-300' :
                                          'bg-blue-500/15 text-blue-300'
                                        }`}>
                                          {item.priority.toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Append to note diff preview: flat on first surface, no matryoshka container */}
                          {action.type === 'append_to_note' && action.content && (
                            <div className="border-l border-white/20 pl-2.5 py-0.5 text-xs text-zinc-200 font-mono whitespace-pre-wrap leading-relaxed">
                              + {action.content}
                            </div>
                          )}

                          {/* Content snippet */}
                          {action.type !== 'append_to_note' && action.content && (
                            <p className="text-[11px] text-zinc-400 line-clamp-2">
                              {action.content}
                            </p>
                          )}

                          {/* Tags */}
                          {action.tags && action.tags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {action.tags.map((t, idx) => (
                                <TagChip key={idx} tag={t} variant="flat" />
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
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 font-medium whitespace-nowrap shrink-0">
                                <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span>
                                  {action.type === 'schedule_task' ? `Запланировано на ${action.dueDate}` :
                                   action.type === 'batch_reschedule' ? `Перенесено: ${action.batchItems?.length || 0}` :
                                   action.type === 'reschedule_task' ? `Срок: ${action.dueDate || 'бэклог'}` :
                                   action.type === 'append_to_note' ? 'Дополнено' :
                                   'Сохранено'}
                                </span>
                              </div>
                              <button
                                onClick={() => scrollToItem(action.appliedItemId || action.title)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white text-[11px] font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                                title="Показать запись в ленте"
                              >
                                <span>{action.type === 'append_to_note' ? 'Открыть' : 'Перейти к записи'}</span>
                                <ArrowUpRight className="w-3 h-3 text-zinc-400" />
                              </button>
                            </div>
                          ) : isExecuting ? (
                            <button
                              disabled
                              className="mt-1 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 font-semibold text-xs opacity-80 cursor-not-allowed shadow-sm"
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                              <span>Применение...</span>
                            </button>
                          ) : (
                            <div className="mt-1 flex items-center gap-2">
                              {(() => {
                                let finalAction = action;
                                let count = action.batchItems?.length || 0;
                                let isDisabled = false;

                                if (action.type === 'batch_reschedule' && action.batchItems) {
                                  const activeItems = action.batchItems.filter(it => isTaskSelected(msg.id, it.targetItemId));
                                  count = activeItems.length;
                                  isDisabled = count === 0;
                                  finalAction = {
                                    ...action,
                                    batchItems: activeItems,
                                  };
                                }

                                return (
                                  <button
                                    disabled={isDisabled}
                                    onClick={() => createNoteFromAction(finalAction, msg.id)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap transition-colors shadow-sm ${
                                      isDisabled
                                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/[0.04]'
                                        : 'bg-white text-black hover:bg-zinc-200 cursor-pointer'
                                    }`}
                                  >
                                    {action.type === 'decompose_task' && (
                                      <>
                                        <ListTodo className="w-3.5 h-3.5 shrink-0" />
                                        <span>
                                          {action.subtasks?.length ? `Применить (${action.subtasks.length})` : 'Применить'}
                                        </span>
                                      </>
                                    )}
                                    {action.type === 'schedule_task' && (
                                      <>
                                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                                        <span>Запланировать</span>
                                      </>
                                    )}
                                    {action.type === 'reschedule_task' && (
                                      <>
                                        <Clock className="w-3.5 h-3.5 shrink-0" />
                                        <span>Перенести</span>
                                      </>
                                    )}
                                    {action.type === 'batch_reschedule' && (
                                      <>
                                        <Clock className="w-3.5 h-3.5 shrink-0" />
                                        <span>Применить ({count})</span>
                                      </>
                                    )}
                                    {action.type === 'append_to_note' && (
                                      <>
                                        <Plus className="w-3.5 h-3.5 shrink-0" />
                                        <span>Дописать</span>
                                      </>
                                    )}
                                    {action.type === 'update_task_status' && (
                                      <>
                                        <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                        <span>Сменить статус</span>
                                      </>
                                    )}
                                    {action.type === 'move_note' && (
                                      <>
                                        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                                        <span>Переместить</span>
                                      </>
                                    )}
                                    {(!action.type || action.type === 'create_note') && (
                                      <>
                                        <Plus className="w-3.5 h-3.5 shrink-0" />
                                        <span>Сохранить</span>
                                      </>
                                    )}
                                  </button>
                                );
                              })()}
                              <button
                                onClick={() => rejectAction(msg.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-white/[0.06] transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                                title="Отклонить это действие"
                              >
                                <X className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                <span>Отклонить</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* Expandable found notes list with instant navigation */}
                {filterItemIds.length > 0 && (() => {
                  const count = filterItemIds.length;
                  const showHeader = count > 3;
                  const showFilterButton = count > 1;

                  return (
                    <div className="max-w-[92%] w-full rounded-xl bg-[#141416] border border-white/[0.08] overflow-hidden mt-0.5 text-xs shadow-sm">
                      {/* Header trigger only when more than 3 results */}
                      {showHeader && (
                        <button
                          onClick={() => toggleResultsExpanded(msg.id, count)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer text-zinc-300"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Search className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Найдено {count} в хранилище</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </div>
                        </button>
                      )}

                      {/* Items list: always rendered when count <= 3, or when isExpanded */}
                      {(isExpanded || !showHeader) && (
                        <div className={`flex flex-col divide-y divide-white/[0.04] ${showHeader ? 'border-t border-white/[0.06]' : ''}`}>
                          {searchResults.map((res, rIdx) => (
                            <button
                              key={res.id || rIdx}
                              onClick={() => scrollToItem(res.id || res.title)}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors cursor-pointer group"
                              title={`Перейти к «${res.title}» (${res.folder || 'Входящие'})`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {res.type === 'task' ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                )}
                                <span className="text-zinc-200 group-hover:text-white truncate font-medium">
                                  {res.title}
                                </span>
                                {res.folder && (
                                  <span className="text-[10px] font-mono text-zinc-500 shrink-0 truncate max-w-[120px]">
                                    {res.folder}
                                  </span>
                                )}
                              </div>
                              <ArrowUpRight className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0 transition-colors" />
                            </button>
                          ))}

                          {/* Button to show in feed (only if more than 1 result) */}
                          {showFilterButton && (
                            <button
                              onClick={() => applyAiFilter(filterItemIds, filterQuery)}
                              className="flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-[11px] font-medium"
                              title="Отобразить только эти найденные записи в центральной ленте"
                            >
                              <div className="flex items-center gap-1.5">
                                <Filter className="w-3 h-3 text-zinc-400" />
                                <span>Показать {count} в ленте</span>
                              </div>
                              <ArrowUpRight className="w-3 h-3 text-zinc-500" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}

        {isChatLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs px-2 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            <span>Ассистент думает...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Composer */}
      <div className="p-2.5 border-t border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md shrink-0 flex justify-center">
        <div className={`w-full ${isSidebar ? '' : 'max-w-2xl'}`}>
          <BaseComposer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSubmit={handleSend}
            disabled={isChatLoading}
            isSubmitDisabled={!input.trim() || isChatLoading}
            submitTitle="Отправить сообщение (Enter)"
            maxHeight={isSidebar ? 120 : 180}
            placeholder={
              isSidebar
                ? 'Спросите ассистента...'
                : isMobile
                ? 'Спросите ассистента по базе знаний...'
                : isInbox
                ? 'Спросите ассистента по всем заметкам базы знаний... (Enter для отправки)'
                : `Спросите о заметках папки «${folderMeta?.name || currentFolder}»... (Enter для отправки)`
            }
            leftControls={
              <div className="flex items-center gap-1 flex-wrap">
                {/* Provider badge - Embedded Linear Monochrome */}
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="h-ctrl-md inline-flex items-center gap-1.5 px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-mono cursor-pointer transition-colors"
                    title={`Провайдер ${aiSettings.provider}: ${aiSettings.model} (нажмите для настроек)`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>{aiSettings.provider === 'groq' ? 'Groq' : aiSettings.provider === 'kie' ? 'KIE.AI' : 'Gemini'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="h-ctrl-md inline-flex items-center gap-1.5 px-2 rounded-md hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors cursor-pointer"
                    title="Нажмите для настройки API-ключа (⌘,)"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <span>Локальный</span>
                  </button>
                )}

                {/* Reasoning Selector - Embedded ghost */}
                <div className="flex items-center gap-0.5 text-xs font-mono text-zinc-400">
                  <span className="text-zinc-500 pl-0.5">R:</span>
                  <Select
                    size="md"
                    variant="ghost"
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

                {/* Web search toggle - Embedded ghost */}
                <button
                  type="button"
                  onClick={() => saveAiSettings({ webSearchEnabled: !aiSettings.webSearchEnabled })}
                  className={`h-ctrl-md flex items-center gap-1 px-2 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                    aiSettings.webSearchEnabled
                      ? 'text-sky-400 bg-sky-500/10 hover:bg-sky-500/15 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                  }`}
                  title="Поиск информации в глобальной сети Интернет"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">Сеть</span>
                </button>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
};
