// Turning the draft into a record on submit: reply link, files, AI tags, then reset.
import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import type {
  AiSettings,
  FolderMeta,
  RecurrenceRule,
  ReplyTarget,
  SlagAttachment,
  SlagItem,
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
  addToast?: (text: string, type?: 'info' | 'success' | 'error') => void;
  setAttachments: React.Dispatch<React.SetStateAction<SlagAttachment[]>>;
  setIsRecordingAudio: (recording: boolean) => void;
  setIsRecordingVideo: (recording: boolean) => void;
  setRecordMode: (mode: 'idle' | 'holding' | 'locked') => void;
  setLockHint: (hint: 'audio' | 'video' | null) => void;
  resetDraftState: () => void;
  field: ComposerFieldHandle;
  onComplete?: () => void;
}

/** Everything the field and the property bar contribute to the record being written. */
interface ComposerDraftSnapshot {
  content: string;
  itemType: SlagItemType;
  priority: SlagItemPriority;
  dueDate: string;
  reminder?: string;
  duration?: number;
  recurrence?: RecurrenceRule;
  tags: string[];
  attachments: SlagAttachment[];
  replyTargetId?: string;
  targetFolder: string | null;
  activeFolder: string;
}

const sameDraft = (a: ComposerDraftSnapshot, b: ComposerDraftSnapshot): boolean =>
  a.content === b.content
  && a.itemType === b.itemType
  && a.priority === b.priority
  && a.dueDate === b.dueDate
  && a.reminder === b.reminder
  && a.duration === b.duration
  && JSON.stringify(a.recurrence ?? null) === JSON.stringify(b.recurrence ?? null)
  && a.tags.length === b.tags.length
  && a.tags.every((tag, index) => tag === b.tags[index])
  && a.attachments === b.attachments
  && a.replyTargetId === b.replyTargetId
  && a.targetFolder === b.targetFolder
  && a.activeFolder === b.activeFolder;

/**
 * Turning the draft into a note: build the item, save it, enrich it, clear the
 * draft. The one place that knows what the field's text and the composer's
 * properties add up to.
 *
 * The list is optimistic, the field is not: the draft is cleared and the composer
 * reports completion only after `whenNoteSaved` confirms the note reached the disk.
 * Until then the text stays where the person left it, and anything typed while the
 * write is pending survives the commit.
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
  addToast,
  setAttachments,
  setIsRecordingAudio,
  setIsRecordingVideo,
  setRecordMode,
  setLockHint,
  resetDraftState,
  field,
  onComplete,
}: UseComposerSubmitOptions) {
  // The latest committed render tells us whether it's still safe to clear the field.
  const draftRef = useRef<ComposerDraftSnapshot | null>(null);
  useLayoutEffect(() => {
    draftRef.current = {
      content,
      itemType,
      priority,
      dueDate,
      reminder,
      duration,
      recurrence,
      tags,
      attachments,
      replyTargetId: replyTarget?.id,
      targetFolder,
      activeFolder,
    };
  }, [content, itemType, priority, dueDate, reminder, duration, recurrence, tags, attachments, replyTarget, targetFolder, activeFolder]);
  // A second Enter while the note is still being written would create the same record twice.
  const pendingRef = useRef(false);

  const sendItemWithAttachments = (attachmentsToSend: SlagAttachment[]): boolean => {
    const draftSnapshot = draftRef.current;
    if (pendingRef.current || !draftSnapshot || (!content.trim() && attachmentsToSend.length === 0)) return false;
    pendingRef.current = true;
    const submittedContent = content.trim();
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
    const vault = storage.getCurrentVault();
    let saved: SlagItem;
    try {
      saved = saveItem({
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
    } catch {
      pendingRef.current = false;
      addToast?.('Не удалось сохранить запись; текст оставлен в композере', 'error');
      return false;
    }

    void (async () => {
      try {
        await storage.whenNoteSaved(saved);
      } catch {
        addToast?.('Не удалось сохранить запись; текст оставлен в композере', 'error');
        return;
      } finally {
        pendingRef.current = false;
      }
      // Another vault is open now: its drafts and its field are not ours to touch.
      if (storage.getCurrentVault() !== vault) return;

      // Derived writes (attachments, AI tags) start only after the note is on disk, so a
      // failed create leaves no orphaned follow-up edits behind.
      if (attachmentsToSend.length > 0 && canEnrichAttachments(aiSettings)) {
        enrichItemAttachments(saved, updateItem, aiSettings).catch(() => {});
      }

      if (aiSettings.autoTagging && fields.tags.length === 0 && submittedContent.length >= 15) {
        categorizeDraft(submittedContent, destinationFolder, folders, aiSettings).then(res => {
          if (storage.getCurrentVault() === vault && res.tags && res.tags.length > 0) {
            updateItem({ ...saved, tags: res.tags, updatedAt: Date.now() }, saved);
          }
        }).catch(() => {
          // quiet fallback
        });
      }

      if (!draftRef.current || !sameDraft(draftSnapshot, draftRef.current)) return;
      // The active slot supplied this submission; a destination draft may belong to another note.
      void storage.deleteComposerDraft(activeFolder).catch(() => addToast?.('Не удалось очистить черновик', 'error'));

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
    })();
    return true;
  };

  const handleSend = () => {
    sendItemWithAttachments(attachments);
  };

  const handleRecordedAudio = (att: SlagAttachment, autoSend?: boolean) => {
    setIsRecordingAudio(false);
    setRecordMode('idle');
    setLockHint(null);

    // A recording that lands while another write is pending is kept in the strip, not dropped.
    if (autoSend) {
      if (!sendItemWithAttachments([...attachments, att])) setAttachments(prev => [...prev, att]);
    } else {
      setAttachments(prev => [...prev, att]);
    }
  };

  const handleRecordedVideo = (att: SlagAttachment, autoSend?: boolean) => {
    setIsRecordingVideo(false);
    setRecordMode('idle');
    setLockHint(null);

    if (autoSend) {
      if (!sendItemWithAttachments([...attachments, att])) setAttachments(prev => [...prev, att]);
    } else {
      setAttachments(prev => [...prev, att]);
    }
  };

  return { sendItemWithAttachments, handleSend, handleRecordedAudio, handleRecordedVideo };
}
