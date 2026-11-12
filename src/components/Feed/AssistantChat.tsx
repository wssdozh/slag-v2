// The assistant view: thread state, input, expanded traces, and the diff it opens.
import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { AssistantBanner } from './assistant/AssistantBanner';
import { AssistantMessages } from './assistant/AssistantMessages';
import { AssistantComposer } from './assistant/AssistantComposer';
import { DiffModal, type DiffModalItemEntry } from '../Modals/DiffModal';
import type { SuggestedAction } from '../../types';

interface AssistantChatProps {
  variant?: 'center' | 'sidebar';
}

export const AssistantChat: React.FC<AssistantChatProps> = ({ variant = 'center' }) => {
  const {
    currentFolder,
    folders,
    items,
    chatMessages,
    isChatLoading,
    sendChatMessage,
    clearChatMessages,
    executeSuggestedAction,
    isMobile
  } = useApp();

  const [input, setInput] = useState('');
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
  const [expandedResultsMap, setExpandedResultsMap] = useState<Record<string, boolean>>({});
  const [batchSelections, setBatchSelections] = useState<Record<string, Record<string, boolean>>>({});
  const [diffModalData, setDiffModalData] = useState<{
    action: SuggestedAction;
    messageId: string;
    initialIndex?: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevLoadingRef = useRef(isChatLoading);

  const getDiffEntriesForAction = (action: SuggestedAction): DiffModalItemEntry[] => {
    if (action.type === 'batch_update' && action.batchUpdateItems && action.batchUpdateItems.length > 0) {
      return action.batchUpdateItems.map(bItem => {
        const tId = bItem.targetItemId;
        const tTitle = (bItem.title || '').toLowerCase().trim();
        const target = items.find(i =>
          (tId && i.id === tId) ||
          (tTitle && (i.title.toLowerCase() === tTitle || i.title.toLowerCase().includes(tTitle) || tTitle.includes(i.title.toLowerCase())))
        );
        return {
          title: bItem.title,
          targetItem: target,
          updates: bItem.updates,
        };
      });
    }

    const target = items.find(i =>
      (action.appliedItemId && i.id === action.appliedItemId) ||
      (action.title && i.title.toLowerCase() === action.title.toLowerCase())
    );
    const baseUpdates = action.updates || {
      content: action.content,
      appendContent: action.appendContent,
      dueDate: action.dueDate,
      priority: action.priority,
      tags: action.tags,
      folder: action.folder,
    };
    const updates = action.appendContent && baseUpdates.appendContent === undefined
      ? { ...baseUpdates, appendContent: action.appendContent }
      : baseUpdates;
    return [{
      title: action.title,
      targetItem: target,
      updates,
    }];
  };

  // Restore focus to composer when AI response finishes
  useEffect(() => {
    if (prevLoadingRef.current && !isChatLoading) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
    prevLoadingRef.current = isChatLoading;
  }, [isChatLoading]);

  // Focus textarea on desktop mount
  useEffect(() => {
    if (!isMobile) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

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

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;
  const isSidebar = variant === 'sidebar';
  const folderLabel = folderMeta?.name || currentFolder;

  const handleSend = () => {
    if (!input.trim() || isChatLoading) return;
    const text = input;
    setInput('');
    sendChatMessage(text);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
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
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleOpenDiff = (action: SuggestedAction, messageId: string, initialIndex?: number) => {
    setDiffModalData({ action, messageId, initialIndex });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-canvas relative select-text overflow-hidden">
      {/* Scope Context Header Banner (desktop only — mobile header already carries the scope) */}
      {!isMobile && (
        <AssistantBanner
          isInbox={isInbox}
          folderLabel={folderLabel}
          isSidebar={isSidebar}
          hasMessages={chatMessages.length > 0}
          onClear={clearChatMessages}
        />
      )}

      {/* Messages Stream */}
      <AssistantMessages
        messages={chatMessages}
        isLoading={isChatLoading}
        isSidebar={isSidebar}
        isInbox={isInbox}
        folderLabel={folderLabel}
        onQuickPrompt={handleQuickPrompt}
        expandedReasoningIds={expandedReasoningIds}
        onToggleReasoning={toggleReasoning}
        isResultsExpanded={isResultsExpanded}
        onToggleResultsExpanded={toggleResultsExpanded}
        isTaskSelected={isTaskSelected}
        onToggleTaskSelection={toggleTaskSelection}
        onOpenDiff={handleOpenDiff}
      />

      {/* Floating Bottom Composer */}
      <AssistantComposer
        textareaRef={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={handleSend}
        isSubmitDisabled={!input.trim() || isChatLoading}
        isSidebar={isSidebar}
        isMobile={isMobile}
        isInbox={isInbox}
        folderLabel={folderLabel}
      />

      {diffModalData && (
        <DiffModal
          isOpen={true}
          onClose={() => setDiffModalData(null)}
          title={`Сравнение: ${diffModalData.action.actionLabel || diffModalData.action.title || 'Изменения'}`}
          items={getDiffEntriesForAction(diffModalData.action)}
          initialIndex={diffModalData.initialIndex}
          isApplied={diffModalData.action.actionState === 'applied'}
          onApply={() => {
            let finalAction = diffModalData.action;
            if (finalAction.type === 'batch_update' && finalAction.batchUpdateItems) {
              const activeItems = finalAction.batchUpdateItems.filter(it => isTaskSelected(diffModalData.messageId, it.targetItemId));
              finalAction = {
                ...finalAction,
                batchUpdateItems: activeItems,
              };
            }
            executeSuggestedAction(finalAction, diffModalData.messageId);
          }}
        />
      )}
    </div>
  );
};
