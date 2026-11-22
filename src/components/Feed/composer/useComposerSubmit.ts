// Turning the draft into a record on submit: reply link, files, AI tags, then reset.
import { useRef } from 'react';
import type React from 'react';
import type {
  AiSettings,
  FolderMeta,
  RecurrenceRule,
  ReplyTarget,
  SlagAttachment,
  SlagItemPriority,
  SlagItemStatus,
  SlagItemType,
} from '../../../types';
import type { AppContextType } from '../../../context/appContext.types';
import { storage } from '../../../lib/storage';
import { canEnrichAttachments, enrichItemAttachments } from '../../../lib/media/enrichment/dispatch';
import { categorizeDraft } from '../../../lib/ai/aiService';
import { resolveComposerFields, type ComposerDismissals } from './composerFields';
import type { ComposerFieldHandle } from './field';

export interface UseComposerSubmitOptions {
  content: string;
  itemType: SlagItemType;
  tags: string[];
  attachments: SlagAttachment[];
  priority: SlagItemPriority;
  dueDate: string;
  reminder?: string;
  duration?: number;
  recurrence?: RecurrenceRule;
  taskStatus: SlagItemStatus;
  replyTarget: ReplyTarget | null;
  targetFolder: string | null;
  effectiveDefaultFolder: string;
  activeFolder: string;
  folders: FolderMeta[];
  aiSettings: AiSettings;
  dismissals: ComposerDismissals;
  saveItem: AppContextType['saveItem'];
  updateItem: AppContextType['updateItem'];
  setAttachments: React.Dispatch<React.SetStateAction<SlagAttachment[]>>;
  setIsRecordingAudio: (recording: boolean) => void;
  setIsRecordingVideo: (recording: boolean) => void;
  setRecordMode: (mode: 'idle' | 'holding' | 'locked') => void;
  setLockHint: (hint: 'audio' | 'video' | null) => void;
  resetDraftState: () => void;
  field: ComposerFieldHandle;
  onComplete?: () => void;
}

/**
 * Turning the draft into a note: build the item, save it, enrich it, clear the
 * draft. The one place that knows what the field's text and the composer's
 * properties add up to.
 */
export function useComposerSubmit({
  content,
  itemType,
  tags,
  attachments,
  priority,
  dueDate,
  reminder,
  duration,
  recurrence,
  taskStatus,
  replyTarget,
  targetFolder,
  effectiveDefaultFolder,
  activeFolder,
  folders,
  aiSettings,
  dismissals,
  saveItem,
  updateItem,
  setAttachments,
  setIsRecordingAudio,
  setIsRecordingVideo,
  setRecordMode,
  setLockHint,
  resetDraftState,
  field,
  onComplete,
}: UseComposerSubmitOptions) {
  // Защита от повторного создания: второй вызов в том же тике видит те же данные
  // и успел бы создать дубль, потому что состояние очищается уже после рендера.
  const sendGuardRef = useRef(false);

  const sendItemWithAttachments = (attachmentsToSend: SlagAttachment[]) => {
    if (sendGuardRef.current) return;
    if (!content.trim() && attachmentsToSend.length === 0) return;
    sendGuardRef.current = true;
    queueMicrotask(() => { sendGuardRef.current = false; });

    const fields = resolveComposerFields({
      content,
      folders,
      itemType,
      tags,
      priority,
      dueDate,
      reminder,
      duration,
      recurrence,
      dismissals,
    });

    let title = '';
    if (itemType === 'article') {
      title = fields.firstLine || 'Новая статья';
    } else if (itemType === 'task') {
      title = fields.cleanTitle || 'Новая таска';
    } else if (fields.firstLine) {
      title = fields.firstLine.slice(0, 50);
    } else if (attachmentsToSend.length > 0) {
      const first = attachmentsToSend[0];
      if (first.type === 'audio') title = 'Голосовая заметка';
      else if (first.type === 'video') title = 'Видео-сообщение';
      else if (first.type === 'image') title = 'Изображение';
      else title = first.name || 'Вложение';
    } else {
      title = 'Заметка';
    }

    const destinationFolder = fields.folder?.path || targetFolder || effectiveDefaultFolder;
    const saved = saveItem({
      type: itemType,
      title,
      content: fields.finalContent,
      folder: destinationFolder,
      tags: fields.tags,
      attachments: attachmentsToSend,
      replyToId: replyTarget?.id,
      status: itemType === 'task' ? taskStatus : undefined,
      priority: fields.priority,
      dueDate: fields.dueDate,
      reminder: fields.reminder,
      duration: fields.duration,
      recurrence: fields.recurrence,
      subtasks: fields.subtasks.length > 0 ? fields.subtasks : undefined,
    });

    if (attachmentsToSend.length > 0 && canEnrichAttachments(aiSettings)) {
      enrichItemAttachments(saved, updateItem, aiSettings).catch(() => {});
    }

    if (aiSettings.autoTagging && fields.tags.length === 0 && content.trim().length >= 15) {
      categorizeDraft(content.trim(), destinationFolder, folders, aiSettings).then(res => {
        if (res.tags && res.tags.length > 0) {
          updateItem({ ...saved, tags: res.tags, updatedAt: Date.now() }, saved);
        }
      }).catch(() => {
        // quiet fallback
      });
    }

    storage.deleteComposerDraft(destinationFolder);
    storage.deleteComposerDraft(activeFolder);
    resetDraftState();
    if (onComplete) {
      onComplete();
    } else {
      requestAnimationFrame(() => {
        // Only reclaim focus if it actually left. Retyping the caret into an
        // already focused field re-opens the keyboard on Android and reads as a
        // second bounce right after the note lands.
        if (!field.isFocused()) {
          field.focus();
        }
      });
    }
  };

  const handleSend = () => {
    sendItemWithAttachments(attachments);
  };

  const handleRecordedAudio = (att: SlagAttachment, autoSend?: boolean) => {
    setIsRecordingAudio(false);
    setRecordMode('idle');
    setLockHint(null);

    if (autoSend) {
      sendItemWithAttachments([...attachments, att]);
    } else {
      setAttachments(prev => [...prev, att]);
    }
  };

  const handleRecordedVideo = (att: SlagAttachment, autoSend?: boolean) => {
    setIsRecordingVideo(false);
    setRecordMode('idle');
    setLockHint(null);

    if (autoSend) {
      sendItemWithAttachments([...attachments, att]);
    } else {
      setAttachments(prev => [...prev, att]);
    }
  };

  return { sendItemWithAttachments, handleSend, handleRecordedAudio, handleRecordedVideo };
}
