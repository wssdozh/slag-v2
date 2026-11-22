// The editor's draft: every editable field, dirty tracking, autosave and the save call.
import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { storage } from '../../lib/storage';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment, RecurrenceRule, ComposerDraft, FullscreenDraft } from '../../types';
import { parseSubtasksFromContent, migrateLegacySubtasksToContent } from '../../lib/tasks/taskUtils';
import { equal } from '../../lib/sync/notes/merge';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { consumeComposerDraft, restoreComposerDraft } from './fullscreen/composerDraftOwner';

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
  /** ISO date-time of the task's reminder: the day in `dueDate` plus the time of day. */
  reminder: string | undefined;
  setReminder: React.Dispatch<React.SetStateAction<string | undefined>>;
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
  const [initialDraft] = useState(() => storage.getFullscreenDraft(item.id));
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
  // The time of day lives in `reminder` — the same field the feed stamps under a task.
  const [reminder, setReminder] = useState<string | undefined>(() => initialDraft?.reminder ?? item.reminder);
  const [duration, setDuration] = useState<number | undefined>(() => initialDraft?.duration ?? item.duration);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(() => initialDraft?.recurrence ?? item.recurrence);
  const [attachments, setAttachments] = useState<SlagAttachment[]>(() => initialDraft?.attachments ?? item.attachments ?? []);
  const [isFullWidth, setIsFullWidth] = useState(() => initialFullWidth);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft = useMemo<Omit<FullscreenDraft, 'updatedAt'>>(() => ({
    itemId: item.id, title, content, tags, folder, type, attachments,
    priority: type === 'task' ? priority : undefined,
    status: type === 'task' ? status : undefined,
    dueDate: type === 'task' ? dueDate : undefined,
    reminder: type === 'task' ? reminder : undefined,
    duration: type === 'task' ? duration : undefined,
    recurrence: type === 'task' ? recurrence : undefined,
  }), [item.id, title, content, tags, folder, type, attachments, priority, status, dueDate, reminder, duration, recurrence]);
  const latestDraft = useRef(draft);
  const savedDraft = useRef(draft);
  const adopting = useRef(false);
  const retryAdoption = useRef<(() => Promise<void>) | null>(null);
  const pendingNoteEdit = useRef(false);
  const adoptedCanonical = useRef(false);
  const lastObservedDraft = useRef(draft);
  const resetBaseline = useRef(false);
  const itemRef = useRef(item);
  useLayoutEffect(() => {
    itemRef.current = item;
    latestDraft.current = draft;
    if (resetBaseline.current) {
      savedDraft.current = draft;
      lastObservedDraft.current = draft;
      resetBaseline.current = false;
    }
  }, [draft, item]);
  // A saved draft must not come back as a composer draft when the editor unmounts.
  const didSaveRef = useRef(false);

  // Function to persist changes for existing item to disk and sync
  const flushAutosave = useCallback(() => {
    if (adopting.current || !pendingNoteEdit.current || item.id.startsWith('draft_')) return;
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
      reminder: type === 'task' ? reminder : undefined,
      duration: type === 'task' ? duration : undefined,
      recurrence: type === 'task' ? recurrence : undefined,
      subtasks: parsedSubtasks && parsedSubtasks.length > 0 ? parsedSubtasks : undefined,
      readingTimeMinutes: type === 'article' ? readTime : undefined,
      updatedAt: Date.now(),
    };
    pendingNoteEdit.current = false;
    storage.saveItem(updated);
    storage.clearFullscreenDraft(item.id);
    setSaveStatus('saved');
  }, [item, title, content, type, folder, tags, attachments, status, priority, dueDate, reminder, duration, recurrence, readTime]);

  // Auto-save in-flight edits to crash-proof draft storage & live autosave for existing notes
  useEffect(() => {
    if (adopting.current) return;
    if (!equal(draft, lastObservedDraft.current)) {
      lastObservedDraft.current = draft;
      if (!equal(draft, savedDraft.current)) {
        pendingNoteEdit.current = true;
        void storage.saveFullscreenDraft(item.id, { ...draft, updatedAt: Date.now() }).then(() => {
          if (!adopting.current) savedDraft.current = draft;
        }, () => addToast?.('Не удалось сохранить черновик редактора', 'error'));
      }
    }
    if (!pendingNoteEdit.current) return;

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
  }, [item.id, draft, flushAutosave, addToast]);

  useEffect(() => {
    let active = true;
    let savingAlternative = false;
    let incoming: FullscreenDraft | null = null;
    const vault = storage.getCurrentVault();
    let inFlight: Omit<FullscreenDraft, 'updatedAt'> | null = null;
    const preserve = (snapshot: Omit<FullscreenDraft, 'updatedAt'>) => {
      if (storage.getCurrentVault() !== vault) return Promise.reject(new Error('Vault changed before draft preservation'));
      inFlight = snapshot;
      return storage.keepFullscreenDraftAlternative(item.id, { ...snapshot, updatedAt: Date.now() }).finally(() => {
        if (inFlight === snapshot) inFlight = null;
      });
    };
    const adopt = async () => {
      if (savingAlternative) return;
      savingAlternative = true;
      adopting.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      try {
        while (active && !equal(latestDraft.current, savedDraft.current)) {
          const snapshot = latestDraft.current;
          const { updatedAt, ...remote } = incoming ?? { updatedAt: 0 };
          void updatedAt;
          if (!equal(remote, snapshot)) {
            await preserve(snapshot);
            if (active) addToast?.('Локальная правка сохранена в конфликтах синхронизации', 'info');
          }
          if (!active) return;
          savedDraft.current = snapshot;
        }
      } catch {
        addToast?.(active ? 'Не удалось сохранить локальную правку; черновик оставлен в редакторе' : 'Не удалось сохранить локальную правку при закрытии редактора', 'error');
        return;
      } finally {
        savingAlternative = false;
      }
      if (!active) return;
      adopting.current = false;
      pendingNoteEdit.current = false;
      adoptedCanonical.current = true;
      resetBaseline.current = true;
      const base = itemRef.current;
      const next = incoming ?? base;
      setTitle(next.title || '');
      setContent(!incoming && base.type === 'task' ? migrateLegacySubtasksToContent(base.content || '', base.subtasks) : next.content || '');
      setType(next.type);
      setFolder(next.folder || DEFAULT_INBOX_FOLDER);
      setTags(next.tags || []);
      setAttachments(incoming ? incoming.attachments ?? base.attachments ?? [] : base.attachments ?? []);
      setPriority(next.priority || 'none');
      setStatus(next.status || 'todo');
      setDueDate(next.dueDate || '');
      setReminder(next.reminder);
      setDuration(next.duration);
      setRecurrence(next.recurrence);
      setSaveStatus('idle');
    };
    retryAdoption.current = adopt;
    const unsubscribe = storage.subscribeChanges((event) => {
      if (event.kind !== 'draft' || event.origin !== 'remote' || !event.registry || event.id !== `fullscreen:${item.id}`) return;
      incoming = event.action === 'delete' ? null : event.payload as FullscreenDraft;
      void adopt();
    });
    return () => {
      active = false;
      retryAdoption.current = null;
      unsubscribe();
      const snapshot = latestDraft.current;
      if (adopting.current && !equal(snapshot, savedDraft.current) && !equal(snapshot, inFlight)) {
        void preserve(snapshot).catch(() => addToast?.('Не удалось сохранить локальную правку при закрытии редактора', 'error'));
      }
    };
  }, [item.id, addToast]);

  const syncDraftBackToComposer = useCallback(() => {
    if (adopting.current || (adoptedCanonical.current && !pendingNoteEdit.current)) return;
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
    if (!restoreComposerDraft(item, draftData)) {
      storage.saveComposerDraft(folder || DEFAULT_INBOX_FOLDER, draftData, 'local');
      if (folder && folder !== DEFAULT_INBOX_FOLDER) {
        storage.saveComposerDraft(DEFAULT_INBOX_FOLDER, draftData, 'local');
      }
    }
    storage.clearFullscreenDraft(item.id);
  }, [item, folder, content, type, priority, dueDate, tags, attachments, duration, recurrence]);

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
    if (adopting.current) return;
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
      reminder: type === 'task' ? reminder : undefined,
      duration: type === 'task' ? duration : undefined,
      recurrence: type === 'task' ? recurrence : undefined,
      subtasks: parsedSubtasks && parsedSubtasks.length > 0 ? parsedSubtasks : undefined,
      readingTimeMinutes: type === 'article' ? readTime : undefined,
      updatedAt: Date.now(),
    };

    if (isNewDraft) {
      const saved = saveItem(updated);
      didSaveRef.current = true;
      storage.clearFullscreenDraft(item.id);
      consumeComposerDraft(item);
      onSaved?.(saved);
      addToast?.('Запись создана и сохранена', 'success');
    } else {
      storage.clearFullscreenDraft(item.id);
      updateItem(updated);
      didSaveRef.current = true;
      onSaved?.(updated);
      addToast?.('Изменения сохранены', 'success');
    }
    setSaveStatus('saved');
    onClose();
  }, [item, title, content, type, folder, tags, attachments, status, priority, dueDate, reminder, duration, recurrence, readTime, saveItem, updateItem, onSaved, addToast, onClose]);

  const handleClose = useCallback(() => {
    if (adopting.current) {
      // Close only after the latest input is safely in the journal, including retries after disk failure.
      void retryAdoption.current?.().then(() => {
        if (!adopting.current) onClose();
      });
      return;
    }
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
    reminder,
    setReminder,
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
