// The composer draft on disk: restore, autosave, reset, and repairing pre-reply stubs.
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  SlagItemType,
  SlagAttachment,
  RecurrenceRule,
  FolderMeta,
  ComposerDraft,
  ReplyTarget,
} from '../../../types';
import { storage } from '../../../lib/storage';
import { extractFolderToken } from '../../../lib/time/todoistTaskParser';
import { UI_DELAYS } from '../../../config';
import type { ComposerFieldHandle } from './field';

export interface ComposerDraftState {
  content: string;
  itemType: SlagItemType;
  priority: 'none' | 'low' | 'medium' | 'high';
  dueDate: string;
  tags: string[];
  attachments: SlagAttachment[];
  replyTarget: ReplyTarget | null;
  targetFolder: string | null;
  duration?: number;
  recurrence?: RecurrenceRule;
}

export interface UseComposerDraftOptions {
  activeFolder: string;
  effectiveDefaultFolder: string;
  initialType?: SlagItemType;
  initialDueDate?: string;
  initialFolder?: string;
  replyTarget: ReplyTarget | null;
  setReplyTarget: (target: ReplyTarget | null) => void;
  folders: FolderMeta[];
  field: ComposerFieldHandle;
  isModal?: boolean;
  isActive?: boolean;
  isFullscreenEditorOpen?: boolean;
  onResetExtra?: () => void;
}

/**
 * Drafts written before the reply text was persisted only carried an id and a title.
 * A stub without any text cannot describe what it replies to, and an empty banner is
 * worse than no banner, so it is dropped.
 */
export const reviveReplyTarget = (target: ReplyTarget | null | undefined): ReplyTarget | null => {
  if (!target) return null;
  const title = target.title ?? '';
  const content = target.content ?? '';
  if (!title && !content) return null;
  return { ...target, title, content, type: target.type ?? 'note' };
};

export const useComposerDraft = ({
  activeFolder,
  effectiveDefaultFolder,
  initialType,
  initialDueDate,
  initialFolder,
  replyTarget,
  setReplyTarget,
  folders,
  field,
  isModal = false,
  isActive = true,
  isFullscreenEditorOpen = false,
  onResetExtra,
}: UseComposerDraftOptions) => {
  const [initialDraft] = useState(() => storage.getComposerDraft(activeFolder));

  const [content, setContent] = useState(() => initialDraft?.content || '');
  const [itemType, setItemType] = useState<SlagItemType>(() => initialDraft?.itemType || initialType || 'note');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>(() => initialDraft?.priority || 'none');
  const [dueDate, setDueDate] = useState<string>(() => initialDraft?.dueDate || initialDueDate || '');
  const [tags, setTags] = useState<string[]>(() => initialDraft?.tags || []);
  const [targetFolderOverride, setTargetFolderOverride] = useState<{ folder: string; forCurrent: string } | null>(
    initialDraft?.targetFolder
      ? { folder: initialDraft.targetFolder, forCurrent: effectiveDefaultFolder }
      : initialFolder && initialFolder !== effectiveDefaultFolder
      ? { folder: initialFolder, forCurrent: effectiveDefaultFolder }
      : null
  );

  const inlineFolder = useMemo(() => extractFolderToken(content, folders).folder, [content, folders]);
  const folderTokenRange = useMemo(() => {
    if (!inlineFolder) return null;
    const needle = `@${inlineFolder.name}`;
    const start = content.toLowerCase().indexOf(needle.toLowerCase());
    return start === -1 ? null : { start, end: start + needle.length };
  }, [content, inlineFolder]);
  const targetFolder = inlineFolder?.path
    ?? (targetFolderOverride?.forCurrent === effectiveDefaultFolder ? targetFolderOverride.folder : null);
  const setTargetFolder = useCallback((folder: string | null) => {
    setTargetFolderOverride(folder ? { folder, forCurrent: effectiveDefaultFolder } : null);
  }, [effectiveDefaultFolder]);

  const [attachments, setAttachments] = useState<SlagAttachment[]>(() => initialDraft?.attachments || []);
  const [duration, setDuration] = useState<number | undefined>(() => initialDraft?.duration);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(() => initialDraft?.recurrence);

  const draftRef = useRef<ComposerDraftState>({
    content,
    itemType,
    priority,
    dueDate,
    tags,
    attachments,
    replyTarget,
    targetFolder,
    duration,
    recurrence,
  });
  const isApplyingRemoteDraftRef = useRef(false);
  const lastAdoptedRemoteDraftUpdatedAtRef = useRef<number>(initialDraft?.updatedAt ?? 0);
  const lastLocalUserEditTimeRef = useRef<number>(0);
  /**
   * The stamp of this window's own last draft write. A draft read back from the queue or
   * from `prefs` is that same write, with the attachment bytes already stripped:
   * adopting it would replace a photo that is still in memory with metadata that has
   * nothing behind it yet.
   */
  const lastLocalDraftWriteAtRef = useRef<number>(0);

  const localDraftStamp = useCallback(() => {
    const stampedAt = Date.now();
    lastLocalDraftWriteAtRef.current = stampedAt;
    return stampedAt;
  }, []);

  useEffect(() => {
    draftRef.current = { content, itemType, priority, dueDate, tags, attachments, replyTarget, targetFolder, duration, recurrence };
  }, [content, itemType, priority, dueDate, tags, attachments, replyTarget, targetFolder, duration, recurrence]);

  const onResetExtraRef = useRef(onResetExtra);
  useEffect(() => {
    onResetExtraRef.current = onResetExtra;
  }, [onResetExtra]);

  const resetDraftState = useCallback(() => {
    draftRef.current = {
      content: '',
      itemType: 'note',
      priority: 'none',
      dueDate: '',
      tags: [],
      attachments: [],
      replyTarget: null,
      targetFolder: null,
      duration: undefined,
      recurrence: undefined,
    };
    setContent('');
    setTags([]);
    setTargetFolderOverride(null);
    setAttachments([]);
    setPriority('none');
    setDueDate('');
    setDuration(undefined);
    setRecurrence(undefined);
    setReplyTarget(null);
    onResetExtraRef.current?.();
  }, [setReplyTarget]);

  // Initialize replyTarget from draft on initial mount if available
  useEffect(() => {
    if (initialDraft?.replyTarget && !replyTarget) {
      setReplyTarget(reviveReplyTarget(initialDraft.replyTarget));
    }
  }, [initialDraft?.replyTarget, replyTarget, setReplyTarget]);

  // Synchronize with stored draft when folder changes, on focus or when returning to tab
  useEffect(() => {
    const syncWithStorage = () => {
      // If user is actively typing right now in focused window, don't overwrite
      if (
        typeof document !== 'undefined' &&
        document.hasFocus() &&
        field.isFocused() &&
        Date.now() - lastLocalUserEditTimeRef.current < 800
      ) {
        return;
      }
      const currentStored = storage.getComposerDraft(activeFolder);
      if (currentStored) {
        // Our own echo is not a remote draft: this window wrote it a moment ago, and it
        // comes back without the bytes an attachment in the field still carries.
        if ((currentStored.updatedAt ?? 0) <= lastLocalDraftWriteAtRef.current) return;
        if ((currentStored.updatedAt ?? 0) >= lastAdoptedRemoteDraftUpdatedAtRef.current) {
          isApplyingRemoteDraftRef.current = true;
          lastAdoptedRemoteDraftUpdatedAtRef.current = currentStored.updatedAt ?? 0;
          setContent(currentStored.content || '');
          setItemType(currentStored.itemType || 'note');
          setPriority(currentStored.priority || 'none');
          setDueDate(currentStored.dueDate || '');
          setTags(currentStored.tags || []);
          setAttachments(currentStored.attachments || []);
          if (currentStored.replyTarget) setReplyTarget(reviveReplyTarget(currentStored.replyTarget));
          setTargetFolder(currentStored.targetFolder || null);
          setDuration(currentStored.duration);
          setRecurrence(currentStored.recurrence);
        }
      } else {
        // Stored draft was cleared/deleted on remote device
        if (lastAdoptedRemoteDraftUpdatedAtRef.current > 0) {
          isApplyingRemoteDraftRef.current = true;
          lastAdoptedRemoteDraftUpdatedAtRef.current = 0;
          resetDraftState();
        }
      }
    };

    // Check immediately on folder change or when returning from fullscreen editor
    if (!isFullscreenEditorOpen) {
      syncWithStorage();
    }

    // Check when window gains focus or becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncWithStorage();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', syncWithStorage);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', syncWithStorage);
    };
  }, [activeFolder, isFullscreenEditorOpen, resetDraftState, setReplyTarget, setTargetFolder, field]);

  // Saving from the fullscreen editor consumes the draft: the editor closes with nothing stored,
  // so the field must not keep a copy that would become a duplicate note on the next Enter.
  const wasEditorOpenRef = useRef(isFullscreenEditorOpen);
  useEffect(() => {
    if (wasEditorOpenRef.current && !isFullscreenEditorOpen) {
      if (!storage.getComposerDraft(activeFolder) && draftRef.current.content.trim()) {
        resetDraftState();
      }
    }
    wasEditorOpenRef.current = isFullscreenEditorOpen;
  }, [isFullscreenEditorOpen, activeFolder, resetDraftState]);

  // Flush on logical modal close as well as unmount; exit motion must not delay saving.
  useEffect(() => {
    if (!isActive) return;
    return () => {
      const d = draftRef.current;
      if (d.content.trim() || d.attachments.length > 0) {
        storage.saveComposerDraft(activeFolder, {
          content: d.content,
          itemType: d.itemType,
          priority: d.priority,
          dueDate: d.dueDate,
          tags: d.tags,
          attachments: d.attachments,
          replyTarget: d.replyTarget ? { id: d.replyTarget.id, title: d.replyTarget.title, content: d.replyTarget.content, type: d.replyTarget.type } : null,
          targetFolder: d.targetFolder,
          duration: d.duration,
          recurrence: d.recurrence,
          updatedAt: localDraftStamp(),
        });
      }
      // Unmount or a folder switch: the text leaves the screen before the throttle window ends.
      storage.flushDrafts();
    };
  }, [activeFolder, isModal, isActive, localDraftStamp]);

  // The editor owns edits while expanded; a pending composer write must not replace its snapshot.
  // Debounced autosave while typing
  useEffect(() => {
    if (!isActive || isFullscreenEditorOpen) return;
    const timer = setTimeout(() => {
      // If we just applied an incoming remote draft, skip echoing it back out
      if (isApplyingRemoteDraftRef.current) {
        isApplyingRemoteDraftRef.current = false;
        return;
      }

      // A draft's deletion tombstone belongs to the sync ledger, not to the composer: typing here
      // does not undo a delete that happened elsewhere, and clearing the tombstone would let a
      // stale copy of the old text come back on the next catch-up.

      if (content.trim() || attachments.length > 0) {
        storage.saveComposerDraft(activeFolder, {
          content,
          itemType,
          priority,
          dueDate,
          tags,
          attachments,
          replyTarget: replyTarget ? { id: replyTarget.id, title: replyTarget.title, content: replyTarget.content, type: replyTarget.type } : null,
          targetFolder,
          duration,
          recurrence,
          updatedAt: localDraftStamp(),
        });
      } else if (lastLocalUserEditTimeRef.current > 0) {
        storage.deleteComposerDraft(activeFolder);
      }
    }, UI_DELAYS.COMPOSER_AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [activeFolder, content, itemType, priority, dueDate, tags, attachments, replyTarget, targetFolder, duration, recurrence, isModal, isActive, isFullscreenEditorOpen, localDraftStamp]);

  // Handle beforeunload to avoid lost text on immediate tab close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isApplyingRemoteDraftRef.current) return;
      const d = draftRef.current;
      if (d.content.trim() || d.attachments.length > 0) {
        storage.saveComposerDraft(activeFolder, {
          content: d.content,
          itemType: d.itemType,
          priority: d.priority,
          dueDate: d.dueDate,
          tags: d.tags,
          attachments: d.attachments,
          replyTarget: d.replyTarget ? { id: d.replyTarget.id, title: d.replyTarget.title, content: d.replyTarget.content, type: d.replyTarget.type } : null,
          targetFolder: d.targetFolder,
          duration: d.duration,
          recurrence: d.recurrence,
          updatedAt: localDraftStamp(),
        });
      }
      // `pagehide` follows, but the tab can die between the two; the write must already be on disk.
      storage.flushDrafts();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeFolder, localDraftStamp]);

  // Listen to draft changes (typing on another device, quick composer window, or editor sync)
  useEffect(() => {
    const unsubscribe = storage.subscribeChanges((event) => {
      if (event.kind === 'draft') {
        const isCurrentFolder = event.id === `composer:${activeFolder}`;
        // Эхо собственной записи: состояние уже актуально, применять его обратно нельзя —
        // иначе только что выбранная папка/теги откатываются к предыдущему черновику.
        if (isCurrentFolder && event.origin === 'local') return;
        if (isCurrentFolder) {
          if (event.action === 'upsert' && event.payload) {
            const incomingDraft = event.payload as ComposerDraft;
            const incomingTs = incomingDraft.updatedAt ?? 0;
            const isUserActivelyTyping =
              typeof document !== 'undefined' &&
              document.hasFocus() &&
              field.isFocused() &&
              Date.now() - lastLocalUserEditTimeRef.current < 800;

            const isIdentical =
              draftRef.current.content === (incomingDraft.content || '') &&
              draftRef.current.itemType === (incomingDraft.itemType || 'note') &&
              draftRef.current.priority === (incomingDraft.priority || 'none') &&
              draftRef.current.dueDate === (incomingDraft.dueDate || '') &&
              JSON.stringify(draftRef.current.tags) === JSON.stringify(incomingDraft.tags || []) &&
              draftRef.current.attachments.length === (incomingDraft.attachments?.length || 0) &&
              draftRef.current.targetFolder === (incomingDraft.targetFolder || null) &&
              draftRef.current.duration === incomingDraft.duration &&
              JSON.stringify(draftRef.current.recurrence) === JSON.stringify(incomingDraft.recurrence);

            if (isIdentical) return;

            const hasLocalUnsavedChanges = draftRef.current.content.trim().length > 0;
            const shouldAdopt =
              !isUserActivelyTyping &&
              // A draft older than this window's own last write is not news, whatever its reader.
              incomingTs > lastLocalDraftWriteAtRef.current &&
              ((!hasLocalUnsavedChanges && draftRef.current.attachments.length === 0) ||
                incomingTs >= lastAdoptedRemoteDraftUpdatedAtRef.current);

            if (shouldAdopt) {
              isApplyingRemoteDraftRef.current = true;
              lastAdoptedRemoteDraftUpdatedAtRef.current = incomingTs;
              setContent(incomingDraft.content || '');
              setItemType(incomingDraft.itemType || 'note');
              setPriority(incomingDraft.priority || 'none');
              setDueDate(incomingDraft.dueDate || '');
              setTags(incomingDraft.tags || []);
              setAttachments(incomingDraft.attachments || []);
              if (incomingDraft.replyTarget) setReplyTarget(reviveReplyTarget(incomingDraft.replyTarget));
              setTargetFolder(incomingDraft.targetFolder || null);
              setDuration(incomingDraft.duration);
              setRecurrence(incomingDraft.recurrence);
            }
          } else if (event.action === 'delete') {
            isApplyingRemoteDraftRef.current = true;
            lastAdoptedRemoteDraftUpdatedAtRef.current = 0;
            resetDraftState();
          }
        }
      }
    });
    return unsubscribe;
  }, [activeFolder, resetDraftState, setReplyTarget, setTargetFolder, field]);

  const notifyUserEdit = useCallback(() => {
    lastLocalUserEditTimeRef.current = Date.now();
  }, []);

  return {
    content,
    setContent,
    itemType,
    setItemType,
    priority,
    setPriority,
    dueDate,
    setDueDate,
    tags,
    setTags,
    attachments,
    setAttachments,
    targetFolderOverride,
    setTargetFolderOverride,
    inlineFolder,
    folderTokenRange,
    targetFolder,
    setTargetFolder,
    duration,
    setDuration,
    recurrence,
    setRecurrence,
    draftRef,
    isApplyingRemoteDraftRef,
    lastAdoptedRemoteDraftUpdatedAtRef,
    lastLocalUserEditTimeRef,
    resetDraftState,
    notifyUserEdit,
    initialDraft,
  };
};
