import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  Loader2,
  Search,
  CheckSquare,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { prefersReducedMotion } from '../../../lib/motion';
import type { ChatMessage, SuggestedAction } from '../../../types';
import { AssistantToolCalls } from './AssistantToolCalls';
import { AssistantReasoning } from './AssistantReasoning';
import { AssistantTextBubble } from './AssistantTextBubble';
import { AssistantActionCard } from './AssistantActionCard';
import { AssistantSearchResults, type AssistantSearchResult } from './AssistantSearchResults';

interface AssistantMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isSidebar: boolean;
  isInbox: boolean;
  folderLabel: string;
  onQuickPrompt: (prompt: string) => void;
  expandedReasoningIds: ReadonlySet<string>;
  onToggleReasoning: (messageId: string) => void;
  isResultsExpanded: (messageId: string, count: number) => boolean;
  onToggleResultsExpanded: (messageId: string, count: number) => void;
  isTaskSelected: (messageId: string, taskId: string) => boolean;
  onToggleTaskSelection: (messageId: string, taskId: string) => void;
  onOpenDiff: (action: SuggestedAction, messageId: string, initialIndex?: number) => void;
}

export const AssistantMessages: React.FC<AssistantMessagesProps> = ({
  messages,
  isLoading,
  isSidebar,
  isInbox,
  folderLabel,
  onQuickPrompt,
  expandedReasoningIds,
  onToggleReasoning,
  isResultsExpanded,
  onToggleResultsExpanded,
  isTaskSelected,
  onToggleTaskSelection,
  onOpenDiff,
}) => {
  const { scrollToItem, applyAiFilter, executeSuggestedAction, rejectAction } = useApp();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Seeded with the history that is already there: opening the panel is not the
  // arrival of a message, and a smooth scroll across the whole log on open reads
  // as a glitch.
  const lastMessageCountRef = useRef(messages.length);

  // A new message earns a smooth scroll; the rest of the time the list is being
  // rewritten token by token, and restarting an animation on every token is what
  // made the chat shake while an answer streamed in.
  useEffect(() => {
    const count = messages.length;
    const arrived = count !== lastMessageCountRef.current;
    lastMessageCountRef.current = count;
    messagesEndRef.current?.scrollIntoView({
      behavior: arrived && !prefersReducedMotion() ? 'smooth' : 'auto',
      block: 'end',
    });
  }, [messages, isLoading]);

  return (
    <div data-testid="assistant-messages" className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 flex flex-col ${isSidebar ? 'text-xs' : 'p-4 text-sm'}`}>
      <div className={`w-full flex-1 flex flex-col gap-3.5 ${isSidebar ? '' : 'max-w-2xl mx-auto'}`}>
        {messages.length === 0 ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center p-4 max-w-sm mx-auto">
            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 mb-2.5">
              <Sparkles className="w-4 h-4 text-zinc-300" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">
              {isInbox ? 'Ассистент по всем заметкам' : `Ассистент «${folderLabel}»`}
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Задайте вопрос, найдите записи или попросите создать таску.
            </p>

            <div className="flex flex-col gap-1.5 w-full">
              <button
                onClick={() => onQuickPrompt('Покажи план на сегодня и календарную повестку')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-xs text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>План на сегодня</span>
                </span>
                <span className="text-2xs text-zinc-500 font-mono">agenda</span>
              </button>
              <button
                onClick={() => onQuickPrompt('Найди ключевые заметки')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-xs text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Поиск заметок</span>
                </span>
                <span className="text-2xs text-zinc-500 font-mono">search</span>
              </button>
              <button
                onClick={() => onQuickPrompt('Создай новую таску: Проверить синхронизацию заметок')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-xs text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Создать таску</span>
                </span>
                <span className="text-2xs text-zinc-500 font-mono">task</span>
              </button>
              <button
                onClick={() => onQuickPrompt('Сколько заметок и задач в хранилище?')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] text-xs text-zinc-300 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Сводка хранилища</span>
                </span>
                <span className="text-2xs text-zinc-500 font-mono">stats</span>
              </button>
            </div>
          </div>
        ) : (
        messages.map(msg => {
          const searchCall = msg.toolCalls?.find(
            tc => tc.name === 'search_notes' && Array.isArray(tc.result) && tc.result.length > 0
          );
          const searchResults = (searchCall?.result || []) as AssistantSearchResult[];
          const filterItemIds = searchResults.map(r => r.id).filter(Boolean);
          const filterQuery: string = searchCall?.args?.query || 'поиск';
          const isExpanded = isResultsExpanded(msg.id, filterItemIds.length);
          const actionsToRender = msg.suggestedActions && msg.suggestedActions.length > 0
            ? msg.suggestedActions
            : (msg.suggestedAction ? [msg.suggestedAction] : []);

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Message Header */}
              <div className="flex items-center gap-1.5 text-2xs text-zinc-500 font-mono px-1">
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
                <AssistantToolCalls toolCalls={msg.toolCalls} />
              )}

              {/* Reasoning Accordion: outside message bubble, underneath tool calls */}
              {msg.role === 'assistant' && msg.reasoning && (
                <AssistantReasoning
                  reasoning={msg.reasoning}
                  reasoningTimeMs={msg.reasoningTimeMs}
                  isExpanded={expandedReasoningIds.has(msg.id)}
                  onToggle={() => onToggleReasoning(msg.id)}
                />
              )}

              {/* Message Bubble - pure text bubble, no embedded action card */}
              {Boolean(msg.content && !msg.content.startsWith('[Подготовлен черновик')) && (
                <AssistantTextBubble
                  role={msg.role}
                  content={msg.content}
                  onWikiLinkClick={scrollToItem}
                />
              )}

              {/* Standalone Action Cards (supporting single or multiple actions) */}
              {actionsToRender.map((action, actIdx) => (
                <AssistantActionCard
                  key={`act-${actIdx}-${action.type}`}
                  action={action}
                  isSidebar={isSidebar}
                  isTaskSelected={(taskId) => isTaskSelected(msg.id, taskId)}
                  onToggleTaskSelection={(taskId) => onToggleTaskSelection(msg.id, taskId)}
                  onOpenDiff={(initialIndex) => onOpenDiff(action, msg.id, initialIndex)}
                  onExecute={(finalAction) => executeSuggestedAction(finalAction, msg.id)}
                  onReject={() => rejectAction(msg.id)}
                  onOpenItem={scrollToItem}
                />
              ))}

              {/* Expandable found notes list with instant navigation */}
              {filterItemIds.length > 0 && (
                <AssistantSearchResults
                  results={searchResults}
                  isExpanded={isExpanded}
                  onToggleExpanded={() => onToggleResultsExpanded(msg.id, filterItemIds.length)}
                  onShowInFeed={() => applyAiFilter(filterItemIds, filterQuery)}
                  onOpenItem={scrollToItem}
                />
              )}
            </div>
          );
        })
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-zinc-500 text-xs px-2 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          <span>Ассистент думает...</span>
        </div>
      )}

      <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
