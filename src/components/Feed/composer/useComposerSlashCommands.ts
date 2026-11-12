import type React from 'react';
import type { SlagItemPriority, SlagItemType } from '../../../types';
import type { SlashCommand } from '../../../types/slashCommands';
import { storage } from '../../../lib/storage';
import { getTodayIso, getTomorrowIso } from '../../../lib/time/dateUtils';

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

export interface UseComposerSlashCommandsOptions {
  content: string;
  setContent: (content: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setItemType: (type: SlagItemType) => void;
  setDueDate: (date: string) => void;
  setPriority: (priority: SlagItemPriority) => void;
  setIsDateDismissed: (dismissed: boolean) => void;
  setIsPriorityDismissed: (dismissed: boolean) => void;
  setSlashQuery: (query: string | null) => void;
  setIsRecordingAudio: (recording: boolean) => void;
  setIsRecordingVideo: (recording: boolean) => void;
  activeFolder: string;
  resetDraftState: () => void;
  generateAiTags: () => void;
  addToast: Toast;
}

/**
 * `/команда` rewrites the draft instead of inserting text: it either swaps the
 * record type, sets a property, or starts a recorder. The menu only supplies the
 * command; everything a command touches lives here.
 */
export function useComposerSlashCommands({
  content,
  setContent,
  textareaRef,
  setItemType,
  setDueDate,
  setPriority,
  setIsDateDismissed,
  setIsPriorityDismissed,
  setSlashQuery,
  setIsRecordingAudio,
  setIsRecordingVideo,
  activeFolder,
  resetDraftState,
  generateAiTags,
  addToast,
}: UseComposerSlashCommandsOptions) {
  const executeSlashCommand = (cmd: SlashCommand) => {
    const el = textareaRef.current;
    const cursorPos = el ? el.selectionStart || content.length : content.length;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);
    const slashMatch = textBefore.match(/(?:^|\s)\/([a-zA-Zа-яА-ЯёЁ0-9_-]*)$/);

    let newCursor = cursorPos;

    if (slashMatch && slashMatch.index !== undefined) {
      const isStartOfLine = slashMatch[0].startsWith('/');
      const replaceStart = isStartOfLine ? slashMatch.index : slashMatch.index + 1;
      const newText = textBefore.slice(0, replaceStart) + textAfter;
      newCursor = replaceStart;
      setContent(newText);
    }
    setSlashQuery(null);

    // Execute command action
    switch (cmd.id) {
      case 'task':
        setItemType('task');
        addToast('Режим переключен: Таска', 'info');
        break;
      case 'note':
        setItemType('note');
        addToast('Режим переключен: Заметка', 'info');
        break;
      case 'article':
        setItemType('article');
        addToast('Режим переключен: Статья', 'info');
        break;
      case 'today':
        setItemType('task');
        setDueDate(getTodayIso());
        setIsDateDismissed(false);
        addToast('Дедлайн установлен на сегодня', 'info');
        break;
      case 'tomorrow':
        setItemType('task');
        setDueDate(getTomorrowIso());
        setIsDateDismissed(false);
        addToast('Дедлайн установлен на завтра', 'info');
        break;
      case 'urgent':
        setItemType('task');
        setPriority('high');
        setIsPriorityDismissed(false);
        addToast('Приоритет: Urgent (P1)', 'info');
        break;
      case 'high':
        setItemType('task');
        setPriority('high');
        setIsPriorityDismissed(false);
        addToast('Приоритет: High (P2)', 'info');
        break;
      case 'medium':
        setItemType('task');
        setPriority('medium');
        setIsPriorityDismissed(false);
        addToast('Приоритет: Medium (P3)', 'info');
        break;
      case 'low':
        setItemType('task');
        setPriority('low');
        setIsPriorityDismissed(false);
        addToast('Приоритет: Low (P4)', 'info');
        break;
      case 'ai':
        generateAiTags();
        break;
      case 'audio':
        setIsRecordingAudio(true);
        break;
      case 'video':
        setIsRecordingVideo(true);
        break;
      case 'clear':
        storage.deleteComposerDraft(activeFolder);
        resetDraftState();
        addToast('Черновик очищен', 'info');
        return;
    }

    setTimeout(() => {
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  return { executeSlashCommand };
}
