import { useState, useRef, useEffect, useCallback } from 'react';
import { storage } from '../../lib/storage';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment, RecurrenceRule, ComposerDraft } from '../../types';
import { parseSubtasksFromContent, migrateLegacySubtasksToContent } from '../../lib/tasks/taskUtils';
import { DEFAULT_INBOX_FOLDER } from '../../config';

export interface UseFullscreenDraftOptions {
  item: SlagItem;
  saveItem: (item: SlagItem) => SlagItem;
  updateItem: (item: SlagItem) => void;
  onClose: () => void;
  /** The exit animation lands on this item's card, so the surface folds into what was saved. */
  onSaved?: (saved: SlagItem) => void;
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

export interface UseFullscreenDraftReturn {
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  type: SlagItemType;
  setType: React.Dispatch<React.SetStateAction<SlagItemType>>;
  folder: string;
  setFolder: React.Dispatch<React.SetStateAction<string>>;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  priority: 'none' | 'low' | 'medium' | 'high';
  setPriority: React.Dispatch<React.SetStateAction<'none' | 'low' | 'medium' | 'high'>>;
  status: SlagItemStatus;
  setStatus: React.Dispatch<React.SetStateAction<SlagItemStatus>>;
  dueDate: string;
  setDueDate: React.Dispatch<React.SetStateAction<string>>;
  duration: number | undefined;
  setDuration: React.Dispatch<React.SetStateAction<number | undefined>>;
  recurrence: RecurrenceRule | undefined;
  setRecurrence: React.Dispatch<React.SetStateAction<RecurrenceRule | undefined>>;
  attachments: SlagAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<SlagAttachment[]>>;
  isFullWidth: boolean;
  setIsFullWidth: React.Dispatch<React.SetStateAction<boolean>>;
  wordCount: number;
  readTime: number;
  saveStatus: 'idle' | 'saving' | 'saved';
  flushAutosave: () => void;
  syncDraftBackToComposer: () => void;
  handleSave: () => void;
  handleClose: () => void;
}

export function useFullscreenDraft({
  item,
  saveItem,
  updateItem,
  onClose,
  onSaved,
  addToast,
}: UseFullscreenDraftOptions): UseFullscreenDraftReturn {
  const initialDraft = storage.getFullscreenDraft(item.id);
  const initialFullWidth = storage.getFullscreenWidth();

  const [title, setTitle] = useState(() => initialDraft?.title ?? (item.title || ''));
  const [content, setContent] = useState(() => {
    if (initialDraft?.content !== undefined) return initialDraft.content;
    return item.type === 'task'
      ? migrateLegacySubtasksToContent(item.content || '', item.subtasks)
      : item.content || '';
  });
  const [type, setType] = useState<SlagItemType>(() => initialDraft?.type ?? (item.type || 'article'));
  const [folder, setFolder] = useState(() => initialDraft?.folder ?? (item.folder || DEFAULT_INBOX_FOLDER));
  const [tags, setTags] = useState<string[]>(() => initialDraft?.tags ?? (item.tags || []));
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>(() => initialDraft?.priority ?? (item.priority || 'none'));
  const [status, setStatus] = useState<SlagItemStatus>(() => initialDraft?.status ?? (item.status || 'todo'));
  const [dueDate, setDueDate] = useState(() => initialDraft?.dueDate ?? (item.dueDate || ''));
  const [duration, setDuration] = useState<number | undefined>(() => initialDraft?.duration ?? item.duration);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(() => initialDraft?.recurrence ?? item.recurrence);
  const [attachments, setAttachments] = useState<SlagAttachment[]>(item.attachments || []);
  const [isFullWidth, setIsFullWidth] = useState(() => initialFullWidth);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMountRef = useRef(true);
  // A saved draft must not come back as a composer draft when the editor unmounts.
  const didSaveRef = useRef(false);

  // Function to persist changes for existing item to disk and sync
  const flushAutosave = useCallback(() => {
    if (item.id.startsWith('draft_')) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const parsedSubtasks = type === 'task' ? parseSubtasksFromContent(content) : undefined;
    const updated: SlagItem = {
      ...item,
      title: title.trim() || 'Без названия',
      content: content.trim(),
      type,
      folder,
      tags,
      attachments,
      status: type === 'task' ? status : undefined,
      priority: type === 'task' ? priority : undefined,
      dueDate: type === 'task' ? dueDate : undefined,
      reminder: type === 'task' ? item.reminder : undefined,
      duration: type === 'task' ? duration : undefined,
      recurrence: type === 'task' ? recurrence : undefined,
      subtasks: parsedSubtasks && parsedSubtasks.length > 0 ? parsedSubtasks : undefined,
      readingTimeMinutes: type === 'article' ? readTime : undefined,
      updatedAt: Date.now(),
    };
    storage.saveItem(updated);
    storage.clearFullscreenDraft(item.id);
    setSaveStatus('saved');
  }, [item, title, content, type, folder, tags, attachments, status, priority, dueDate, duration, recurrence, readTime]);

  // Auto-save in-flight edits to crash-proof draft storage & live autosave for existing notes
  useEffect(() => {
    // Always persist to local/remote draft cache
    storage.saveFullscreenDraft(item.id, {
      itemId: item.id,
      title,
      content,
      tags,
      folder,
      type,
      priority: type === 'task' ? priority : undefined,
      status: type === 'task' ? status : undefined,
      dueDate: type === 'task' ? dueDate : undefined,
      duration: type === 'task' ? duration : undefined,
      recurrence: type === 'task' ? recurrence : undefined,
      updatedAt: Date.now(),
    });

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (item.id.startsWith('draft_')) {
      return;
    }

    const noticeTimer = setTimeout(() => {
      setSaveStatus('saving');
    }, 0);

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    const timer = setTimeout(() => {
      autosaveTimerRef.current = null;
      flushAutosave();
    }, 800);
    autosaveTimerRef.current = timer;

    return () => {
      clearTimeout(noticeTimer);
      clearTimeout(timer);
    };
  }, [item.id, title, content, tags, folder, type, priority, status, dueDate, duration, recurrence, flushAutosave]);

  const syncDraftBackToComposer = useCallback(() => {
    if (!item.id.startsWith('draft_')) return;
    const targetFolderVal = folder !== DEFAULT_INBOX_FOLDER ? folder : undefined;
    const draftData: ComposerDraft = {
      content: content.trim(),
      itemType: type,
      priority: type === 'task' ? priority : 'none',
      dueDate: type === 'task' ? (dueDate || '') : '',
      tags,
      attachments,
      replyTarget: item.replyToId ? { id: item.replyToId, title: '', content: '', type: 'note' } : null,
      targetFolder: targetFolderVal,
      duration: type === 'task' ? duration : undefined,
      recurrence: type === 'task' ? recurrence : undefined,
      updatedAt: Date.now(),
    };
    storage.saveComposerDraft(folder || DEFAULT_INBOX_FOLDER, draftData, 'local');
    if (folder && folder !== DEFAULT_INBOX_FOLDER) {
      storage.saveComposerDraft(DEFAULT_INBOX_FOLDER, draftData, 'local');
    }
    storage.clearFullscreenDraft(item.id);
  }, [item.id, item.replyToId, folder, content, type, priority, dueDate, tags, attachments, duration, recurrence]);

  // Flush on unmount if pending or sync back to composer draft. The latest closures live in refs:
  // as a dependency-driven cleanup this ran on every keystroke and wrote the composer draft
  // behind the editor.
  const itemIdRef = useRef(item.id);
  const flushRef = useRef(flushAutosave);
  const syncRef = useRef(syncDraftBackToComposer);
  useEffect(() => {
    itemIdRef.current = item.id;
    flushRef.current = flushAutosave;
    syncRef.current = syncDraftBackToComposer;
  });
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (didSaveRef.current) return;
      if (itemIdRef.current.startsWith('draft_')) syncRef.current();
      else flushRef.current();
      // The editor is gone; anything still queued for the throttled draft write must land now.
      storage.flushDrafts();
    };
  }, []);

  // Persist width preference
  useEffect(() => {
    storage.saveFullscreenWidth(isFullWidth);
  }, [isFullWidth]);

  const handleSave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const isNewDraft = item.id.startsWith('draft_');
    const parsedSubtasks = type === 'task' ? parseSubtasksFromContent(content) : undefined;
    const updated: SlagItem = {
      ...item,
      id: isNewDraft ? 'item_' + Date.now() : item.id,
      title: title.trim() || 'Без названия',
      content: content.trim(),
      type,
      folder,
      tags,
      attachments,
      status: type === 'task' ? status : undefined,
      priority: type === 'task' ? priority : undefined,
      dueDate: type === 'task' ? dueDate : undefined,
      reminder: type === 'task' ? item.reminder : undefined,
      duration: type === 'task' ? duration : undefined,
      recurrence: type === 'task' ? recurrence : undefined,
      subtasks: parsedSubtasks && parsedSubtasks.length > 0 ? parsedSubtasks : undefined,
      readingTimeMinutes: type === 'article' ? readTime : undefined,
      updatedAt: Date.now(),
    };

    didSaveRef.current = true;
    if (isNewDraft) {
      storage.clearFullscreenDraft(item.id);
      // The composer the draft came from must not keep a copy of what just became a note. Only
      // when it is that same text: a note opened from a hotkey may sit next to an unrelated draft.
      const composerDraft = storage.getComposerDraft(folder) ?? storage.getComposerDraft(DEFAULT_INBOX_FOLDER);
      if (composerDraft?.content.trim() === content.trim()) {
        storage.deleteComposerDraft(folder);
        storage.deleteComposerDraft(DEFAULT_INBOX_FOLDER);
      }
      const saved = saveItem(updated);
      onSaved?.(saved);
      addToast?.('Запись создана и сохранена', 'success');
    } else {
      storage.clearFullscreenDraft(item.id);
      updateItem(updated);
      onSaved?.(updated);
      addToast?.('Изменения сохранены', 'success');
    }
    setSaveStatus('saved');
    onClose();
  }, [item, title, content, type, folder, tags, attachments, status, priority, dueDate, duration, recurrence, readTime, saveItem, updateItem, onSaved, addToast, onClose]);

  const handleClose = useCallback(() => {
    if (!item.id.startsWith('draft_')) {
      flushAutosave();
    } else {
      syncDraftBackToComposer();
    }
    // Closing is the moment the text stops being visible; a pending write cannot wait out its window.
    storage.flushDrafts();
    onClose();
  }, [item.id, flushAutosave, syncDraftBackToComposer, onClose]);

  return {
    title,
    setTitle,
    content,
    setContent,
    type,
    setType,
    folder,
    setFolder,
    tags,
    setTags,
    priority,
    setPriority,
    status,
    setStatus,
    dueDate,
    setDueDate,
    duration,
    setDuration,
    recurrence,
    setRecurrence,
    attachments,
    setAttachments,
    isFullWidth,
    setIsFullWidth,
    wordCount,
    readTime,
    saveStatus,
    flushAutosave,
    syncDraftBackToComposer,
    handleSave,
    handleClose,
  };
}
