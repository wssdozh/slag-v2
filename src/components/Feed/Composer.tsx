import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment } from '../../types';
import { storage } from '../../lib/storage';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { useComposerMedia } from '../../hooks/useComposerMedia';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { categorizeDraft } from '../../lib/aiService';
import { enrichItemAttachments, downscaleImageDataUrl } from '../../lib/attachmentEnrichment';
import { extractFolderToken, parseTodoistInput, extractAndStripTags, type ParsedTodoistTask } from '../../lib/todoistTaskParser';
import { parseSubtasksFromContent } from '../../lib/taskUtils';
import { BaseComposer } from './BaseComposer';
import { ResponsiveSegmented } from '../UI/ResponsiveSegmented';
import { ToolbarButton } from '../UI/ToolbarButton';
import { ComposerTaskControls } from './ComposerTaskControls';
import { SlashCommandMenu } from './SlashCommandMenu';
import { type SlashCommand } from '../../types/slashCommands';
import { FolderSuggestionMenu } from './FolderSuggestionMenu';
import { TagSuggestionMenu } from './TagSuggestionMenu';
import { SuggestionMenuShell } from './SuggestionMenuShell';
import { SuggestionMenuHeader } from './SuggestionMenuHeader';
import { getTodayIso, getTomorrowIso, formatDueDateLabel } from '../../lib/dateUtils';
import { DEFAULT_INBOX_FOLDER, UI_DELAYS } from '../../config';
import {
  Paperclip,
  Mic,
  Video,
  Sparkles,
  CheckSquare,
  X,
  Loader2,
  Maximize2,
  CornerUpLeft,
  FileText,
  StickyNote,
  Lock,
} from 'lucide-react';
import { useComposerDraft } from './useComposerDraft';
import { useComposerAutocomplete } from './useComposerAutocomplete';

export interface ComposerProps {
  isModal?: boolean;
  variant?: 'card' | 'flat';
  isActive?: boolean;
  initialType?: SlagItemType;
  initialStatus?: SlagItemStatus;
  initialFolder?: string;
  initialDueDate?: string;
  initialReminder?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export const Composer: React.FC<ComposerProps> = ({
  isModal = false,
  variant,
  isActive = true,
  initialType,
  initialStatus,
  initialFolder,
  initialDueDate,
  initialReminder,
  onComplete,
  onCancel,
}) => {
  const {
    saveItem,
    updateItem,
    currentFolder,
    folders,
    aiSettings,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    replyTarget,
    setReplyTarget,
    items,
    addToast,
    isMobile,
    isFullscreenEditorOpen,
  } = useApp();

  const effectiveDefaultFolder = isModal ? DEFAULT_INBOX_FOLDER : (initialFolder || currentFolder);
  const activeFolder = effectiveDefaultFolder;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [taskStatus] = useState<SlagItemStatus>(initialStatus || 'todo');
  const [reminder] = useState<string | undefined>(initialReminder);
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false);

  // Todoist parser & Ghost-chips state
  const [parsedTask, setParsedTask] = useState<ParsedTodoistTask | null>(null);
  const [isDateDismissed, setIsDateDismissed] = useState(false);
  const [isPriorityDismissed, setIsPriorityDismissed] = useState(false);
  const [isDurationDismissed, setIsDurationDismissed] = useState(false);
  const [isRecurrenceDismissed, setIsRecurrenceDismissed] = useState(false);
  const [dismissedTags, setDismissedTags] = useState<Set<string>>(new Set());

  const {
    content,
    setContent,
    itemType,
    setItemType,
    priority,
    setPriority,
    dueDate,
    setDueDate,
    tags,
    attachments,
    setAttachments,
    folderTokenRange,
    targetFolder,
    setTargetFolder,
    duration,
    setDuration,
    recurrence,
    setRecurrence,
    resetDraftState,
    notifyUserEdit,
  } = useComposerDraft({
    activeFolder,
    effectiveDefaultFolder,
    initialType,
    initialDueDate,
    initialFolder,
    replyTarget,
    setReplyTarget,
    folders,
    textareaRef,
    isModal,
    isActive,
    isFullscreenEditorOpen,
    onResetExtra: () => {
      clearQueries();
      setParsedTask(null);
      setIsDateDismissed(false);
      setIsPriorityDismissed(false);
      setDismissedTags(new Set());
    },
  });

  const {
    wikiQuery,
    wikiSelectedIndex,
    folderQuery,
    folderSelectedIndex,
    slashQuery,
    setSlashQuery,
    slashSelectedIndex,
    setSlashSelectedIndex,
    tagQuery,
    tagSelectedIndex,
    matchingAutocompleteTags,
    matchingWikiItems,
    matchingSlashCommands,
    matchingFolders,
    lastFolderQuery,
    lastMatchingFolders,
    lastSlashQuery,
    lastTagQuery,
    lastMatchingTags,
    lastMatchingWikiItems,
    insertTag,
    insertWikiLink,
    selectFolder,
    updateAutocompleteQueries,
    clearQueries,
    handleAutocompleteKeyDown,
  } = useComposerAutocomplete({
    content,
    setContent,
    items,
    folders,
    currentFolder,
    DEFAULT_INBOX_FOLDER,
    textareaRef,
    addToast,
    setTargetFolder,
  });

  // Hold-to-record & lock state via custom hook
  const {
    isRecordingAudio,
    setIsRecordingAudio,
    isRecordingVideo,
    setIsRecordingVideo,
    recordMode,
    setRecordMode,
    lockHint,
    setLockHint,
    mobileMediaType,
    triggerFinishRef,
    handlePointerDown: handleMobileMediaPointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    cancelRecording,
  } = useComposerMedia({ addToast });

  // 150ms debounced Todoist parsing when content changes
  useEffect(() => {
    if (!content.trim()) return;

    const timer = setTimeout(() => {
      const parsed = parseTodoistInput(content);
      setParsedTask(parsed);
      if (itemType === 'note' && (parsed.dueDate || (parsed.priority && parsed.priority !== 'none') || parsed.duration !== undefined || parsed.recurrence)) {
        setItemType('task');
      }
    }, UI_DELAYS.COMPOSER_TODOIST_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [content, itemType, setItemType]);

  // Focus textarea when replying or when mounted in modal
  useEffect(() => {
    if ((replyTarget || isModal) && textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
    }
  }, [replyTarget, isModal]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    notifyUserEdit();
    const text = e.target.value;
    setContent(text);

    if (!text.trim()) {
      setParsedTask(null);
      setIsDateDismissed(false);
      setIsPriorityDismissed(false);
      setDismissedTags(new Set());
      clearQueries();
    }

    // Smart type inference: typing checklist switches note to task
    if (itemType === 'note') {
      if (/^\s*(?:-\s*\[[ xX]?\]|\[[ xX]?\])\s+/m.test(text)) {
        setItemType('task');
      }
    }

    const cursorPos = e.target.selectionStart || text.length;
    updateAutocompleteQueries(text, cursorPos);
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
        const isImg = type === 'image' || file.type.startsWith('image/');
        // Android SAF sometimes reports an empty MIME, so fall back to the extension.
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isAudio = file.type.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba'].includes(ext);
        const isVideo = !isAudio && (file.type.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext));
        let finalDataUrl = reader.result as string;
        if (isImg && typeof finalDataUrl === 'string') {
          finalDataUrl = await downscaleImageDataUrl(finalDataUrl, 1440);
        }
        const attachment: SlagAttachment = {
          id,
          name: file.name,
          type: isImg ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file',
          mimeType: isImg ? 'image/jpeg' : (file.type || 'application/octet-stream'),
          size: file.size,
          relativePath: `.attachments/${id}_${file.name}`,
          dataUrl: finalDataUrl,
        };
        setAttachments(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSmartAiTags = async () => {
    if (!content.trim() && attachments.length === 0) {
      addToast('Введите текст заметки для ИИ', 'info');
      return;
    }

    setIsGeneratingAiTags(true);
    try {
      const res = await categorizeDraft(content, currentFolder, folders, aiSettings);
      const folderToken = res.targetFolder && res.targetFolder !== currentFolder
        ? `@${folders.find(f => f.path === res.targetFolder)?.name ?? res.targetFolder}`
        : '';
      const tokens = [folderToken, ...res.tags.map(t => `#${t}`)].filter(Boolean).join(' ');
      if (tokens) {
        setContent(prev => `${prev.trimEnd()}${prev.trim() ? ' ' : ''}${tokens} `);
      }
      if (res.targetFolder && res.targetFolder !== currentFolder) {
        setTargetFolder(res.targetFolder);
        addToast(`Папка «${res.targetFolder}» · ${res.tags.map(t => '#' + t).join(' ')}`, 'success');
      } else if (res.tags.length > 0) {
        addToast(`Теги: ${res.tags.map(t => '#' + t).join(' ')}`, 'success');
      } else {
        addToast('ИИ не нашел подходящих тегов', 'info');
      }
    } catch {
      addToast('Ошибка запроса к ИИ', 'error');
    } finally {
      setIsGeneratingAiTags(false);
    }
  };

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
        handleSmartAiTags();
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

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const effectivePriority = itemType === 'task'
    ? (!isPriorityDismissed && parsedTask?.priority && parsedTask.priority !== 'none'
        ? parsedTask.priority
        : priority)
    : 'none';

  const effectiveDueDate = itemType === 'task'
    ? (!isDateDismissed && parsedTask?.dueDate
        ? parsedTask.dueDate
        : dueDate)
    : '';

  const effectiveDateLabel = itemType === 'task'
    ? (!isDateDismissed && parsedTask?.dueDate
        ? formatDueDateLabel(parsedTask.dueDate, parsedTask.rawMatchedDateText)
        : dueDate
        ? formatDueDateLabel(dueDate)
        : '')
    : '';

  const effectiveDuration = itemType === 'task'
    ? (!isDurationDismissed && parsedTask?.duration !== undefined
        ? parsedTask.duration
        : duration)
    : undefined;

  const effectiveRecurrence = itemType === 'task'
    ? (!isRecurrenceDismissed && parsedTask?.recurrence
        ? parsedTask.recurrence
        : recurrence)
    : undefined;

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const attachFiles = useCallback(async (files: FileList | File[]) => {
    try {
      const processed = await processFileListToAttachments(files);
      if (processed.length > 0) {
        setAttachments(prev => [...prev, ...processed]);
        addToast(`Прикреплено: ${processed.length === 1 ? processed[0].name : `${processed.length} файла`}`, 'success');
        requestAnimationFrame(() => {
          textareaRef.current?.focus({ preventScroll: true });
        });
      }
    } catch {
      addToast('Не удалось обработать прикрепленные файлы', 'error');
    }
  }, [addToast, setAttachments]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await attachFiles(e.dataTransfer.files);
      }
    }
  }, [attachFiles]);

  // Window-level drag & drop and paste support when running as a dedicated modal/window island
  useEffect(() => {
    if (!isModal || !isActive) return;

    const onWindowDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setIsDraggingOver(true);
      }
    };

    const onWindowDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        setIsDraggingOver(false);
      }
    };

    const onWindowDrop = async (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await attachFiles(e.dataTransfer.files);
        }
      }
    };

    const onWindowPaste = async (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const clipboardFiles: File[] = [];
      if (e.clipboardData?.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) clipboardFiles.push(file);
          }
        }
      }
      if (clipboardFiles.length > 0) {
        e.preventDefault();
        await attachFiles(clipboardFiles);
      }
    };

    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('paste', onWindowPaste);

    return () => {
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('paste', onWindowPaste);
    };
  }, [isModal, isActive, attachFiles]);

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles: File[] = [];
    if (e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) clipboardFiles.push(file);
        }
      }
    }

    if (clipboardFiles.length > 0) {
      e.preventDefault();
      await attachFiles(clipboardFiles);
    }
  };

  // Защита от повторного создания: второй вызов в том же тике видит те же данные
  // и успел бы создать дубль, потому что состояние очищается уже после рендера.
  const sendGuardRef = useRef(false);
  const sendItemWithAttachments = (attachmentsToSend: SlagAttachment[]) => {
    if (sendGuardRef.current) return;
    if (!content.trim() && attachmentsToSend.length === 0) return;
    sendGuardRef.current = true;
    queueMicrotask(() => { sendGuardRef.current = false; });

    // Parse Todoist input synchronously for immediate state accuracy
    const currentParsed = parseTodoistInput(content);

    // `@Папка` and `#тег` are composer syntax: both are stripped before saving.
    const { cleanContent: withoutFolder, folder: inlineFolder } = extractFolderToken(content, folders);
    const { cleanContent, tags: extractedTags } = extractAndStripTags(withoutFolder);
    const finalContent = (cleanContent || withoutFolder || content).trim();

    let title = '';
    const lines = finalContent.split('\n');
    const firstLine = lines[0].replace(/^#+\s*/, '').trim();

    if (itemType === 'article') {
      title = firstLine || 'Новая статья';
    } else if (itemType === 'task') {
      title = currentParsed.cleanTitle || 'Новая таска';
    } else if (firstLine) {
      title = firstLine.slice(0, 50);
    } else if (attachmentsToSend.length > 0) {
      const first = attachmentsToSend[0];
      if (first.type === 'audio') title = 'Голосовая заметка';
      else if (first.type === 'video') title = 'Видео-сообщение';
      else if (first.type === 'image') title = 'Изображение';
      else title = first.name || 'Вложение';
    } else {
      title = 'Заметка';
    }

    const rawGhostTags = currentParsed.tags.filter(t => !dismissedTags.has(t));
    const activeExtractedTags = extractedTags.filter(t => !dismissedTags.has(t));
    const finalTags = Array.from(new Set([...tags, ...rawGhostTags, ...activeExtractedTags]));

    const subtasks = itemType === 'task' ? parseSubtasksFromContent(finalContent) : [];

    const taskPriority = itemType === 'task'
      ? (!isPriorityDismissed && currentParsed.priority
          ? currentParsed.priority
          : priority)
      : undefined;

    const taskRecurrence = itemType === 'task'
      ? (!isRecurrenceDismissed && currentParsed.recurrence
          ? currentParsed.recurrence
          : recurrence)
      : undefined;

    const taskDueDate = itemType === 'task'
      ? (!isDateDismissed && currentParsed.dueDate
          ? currentParsed.dueDate
          : (dueDate || (taskRecurrence ? getTodayIso() : undefined)))
      : undefined;

    const taskReminder = itemType === 'task'
      ? (!isDateDismissed && currentParsed.reminder
          ? currentParsed.reminder
          : (reminder || undefined))
      : undefined;

    const taskDuration = itemType === 'task'
      ? (!isDurationDismissed && currentParsed.duration !== undefined
          ? currentParsed.duration
          : duration)
      : undefined;

    const destinationFolder = inlineFolder?.path || targetFolder || effectiveDefaultFolder;
    const saved = saveItem({
      type: itemType,
      title,
      content: finalContent,
      folder: destinationFolder,
      tags: finalTags,
      attachments: attachmentsToSend,
      replyToId: replyTarget?.id,
      status: itemType === 'task' ? taskStatus : undefined,
      priority: taskPriority,
      dueDate: taskDueDate,
      reminder: taskReminder,
      duration: taskDuration,
      recurrence: taskRecurrence,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });

    if (attachmentsToSend.length > 0 && aiSettings.groqApiKey) {
      enrichItemAttachments(saved, updateItem, aiSettings).catch(() => {});
    }

    if (aiSettings.autoTagging && finalTags.length === 0 && content.trim().length >= 15) {
      categorizeDraft(content.trim(), destinationFolder, folders, aiSettings).then(res => {
        if (res.tags && res.tags.length > 0) {
          updateItem({ ...saved, tags: res.tags, updatedAt: Date.now() });
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
        const field = textareaRef.current;
        if (field && document.activeElement !== field) {
          field.focus({ preventScroll: true });
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
      const merged = [...attachments, att];
      sendItemWithAttachments(merged);
    } else {
      setAttachments(prev => [...prev, att]);
    }
  };

  const handleRecordedVideo = (att: SlagAttachment, autoSend?: boolean) => {
    setIsRecordingVideo(false);
    setRecordMode('idle');
    setLockHint(null);

    if (autoSend) {
      const merged = [...attachments, att];
      sendItemWithAttachments(merged);
    } else {
      setAttachments(prev => [...prev, att]);
    }
  };

  // Expand into Fullscreen Focus Mode directly from composer
  const handleExpandToFullscreen = () => {
    const { cleanContent: withoutFolder, folder: inlineFolder } = extractFolderToken(content, folders);
    const { cleanContent, tags: extractedTags } = extractAndStripTags(withoutFolder);
    const finalContent = (cleanContent || withoutFolder || content).trim();
    const lines = finalContent.split('\n');
    const firstLine = lines[0]?.replace(/^#+\s*/, '').trim() || (itemType === 'article' ? 'Новая статья' : 'Черновик');
    const currentParsed = parseTodoistInput(content);

    const taskTitle = itemType === 'task'
      ? (currentParsed.cleanTitle || 'Новая таска')
      : firstLine;

    const rawGhostTags = currentParsed.tags.filter(t => !dismissedTags.has(t));
    const activeExtractedTags = extractedTags.filter(t => !dismissedTags.has(t));
    const finalTags = Array.from(new Set([...tags, ...rawGhostTags, ...activeExtractedTags]));

    const taskPriority = itemType === 'task'
      ? (!isPriorityDismissed && currentParsed.priority
          ? currentParsed.priority
          : priority)
      : undefined;

    const taskRecurrence = itemType === 'task'
      ? (!isRecurrenceDismissed && currentParsed.recurrence
          ? currentParsed.recurrence
          : recurrence)
      : undefined;

    const taskDueDate = itemType === 'task'
      ? (!isDateDismissed && currentParsed.dueDate
          ? currentParsed.dueDate
          : (dueDate || (taskRecurrence ? getTodayIso() : undefined)))
      : undefined;

    const taskReminder = itemType === 'task'
      ? (!isDateDismissed && currentParsed.reminder
          ? currentParsed.reminder
          : (reminder || undefined))
      : undefined;

    const taskDuration = itemType === 'task'
      ? (!isDurationDismissed && currentParsed.duration !== undefined
          ? currentParsed.duration
          : duration)
      : undefined;

    // Create a temporary draft object in memory WITHOUT saving to vault storage yet
    const draftItem: SlagItem = {
      id: 'draft_' + Date.now(),
      type: itemType,
      title: taskTitle,
      content: finalContent,
      folder: inlineFolder?.path || targetFolder || currentFolder,
      tags: finalTags,
      attachments,
      replyToId: replyTarget?.id,
      priority: taskPriority,
      dueDate: taskDueDate,
      reminder: taskReminder,
      duration: taskDuration,
      recurrence: taskRecurrence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSelectedItem(draftItem);
    setIsFullscreenEditorOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleAutocompleteKeyDown(e)) {
      return;
    }

    // Slash commands keyboard controls
    if (slashQuery !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
      if (matchingSlashCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashSelectedIndex(prev => (prev < matchingSlashCommands.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashSelectedIndex(prev => (prev > 0 ? prev - 1 : matchingSlashCommands.length - 1));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          executeSlashCommand(matchingSlashCommands[slashSelectedIndex]);
          return;
        }
      }
    }

    // Dismiss active date / duration / recurrence / priority on Escape
    if (e.key === 'Escape') {
      if (!isDurationDismissed && (parsedTask?.duration !== undefined || duration !== undefined)) {
        e.preventDefault();
        setIsDurationDismissed(true);
        setDuration(undefined);
        return;
      }
      if (!isRecurrenceDismissed && (parsedTask?.recurrence || recurrence)) {
        e.preventDefault();
        setIsRecurrenceDismissed(true);
        setRecurrence(undefined);
        return;
      }
      if (!isDateDismissed && (parsedTask?.dueDate || dueDate)) {
        e.preventDefault();
        setIsDateDismissed(true);
        setDueDate('');
        return;
      }
      if (!isPriorityDismissed && (parsedTask?.priority || priority !== 'none')) {
        e.preventDefault();
        setIsPriorityDismissed(true);
        setPriority('none');
        return;
      }
    }

    if (isModal && e.key === 'Escape' && !wikiQuery && !folderQuery && !slashQuery && !tagQuery) {
      e.preventDefault();
      onCancel?.();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // The banner collapses instead of vanishing, so sending or cancelling a reply
  // does not yank the whole composer up by the height of the row.
  const [stickyReply, setStickyReply] = useState(replyTarget);
  if (replyTarget && replyTarget !== stickyReply) setStickyReply(replyTarget);
  const bannerReply = replyTarget ?? stickyReply;

  const topSlot = (
    <>
        {/* Reply Banner (Flat, Anti-Matryoshka) */}
        <div className="motion-accordion w-full" data-expanded={Boolean(replyTarget)}>
        <div className="motion-accordion-inner">
        {bannerReply && (
        <div className="flex items-center pb-1.5 pt-0.5 border-b border-white/[0.06] text-xs text-zinc-400 select-none min-h-[28px]">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <CornerUpLeft className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">
              {bannerReply.type === 'task' ? 'Ответ на таску:' : bannerReply.type === 'article' ? 'Ответ на статью:' : 'Ответ:'}
            </span>
            <span className="truncate text-zinc-300 font-medium text-xs">
              {bannerReply.title || bannerReply.content.slice(0, 45)}
            </span>
          </div>
        </div>
        )}
        </div>
        </div>

      {/* Attachments Preview Strip */}
      {attachments.length > 0 && (
        <div data-composer-attachments="" className="flex items-center gap-2 py-1 overflow-x-auto scrollbar-none whitespace-nowrap">
          {attachments.map(att => (
            <div key={att.id} className="shrink-0 flex items-center">
              {att.type === 'audio' ? (
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] relative group">
                  <AudioPlayer
                    src={att.dataUrl || ''}
                    duration={att.duration}
                    size={att.size}
                    waveform={att.waveform}
                    compact={true}
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="p-1 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-white/[0.08] transition-colors cursor-pointer"
                    title="Удалить войс"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : att.type === 'video' ? (
                <div className="relative group p-0.5">
                  <VideoCirclePlayer src={att.dataUrl || ''} compact={true} />
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1 -right-1 p-1 rounded-full bg-black/80 border border-white/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer shadow-md"
                    title="Удалить видео-кружок"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : att.type === 'image' ? (
                <div className="relative group rounded-lg overflow-hidden border border-white/[0.08] bg-black/40">
                  <img src={att.dataUrl} alt={att.name} className="w-11 h-11 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Удалить"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-zinc-300 relative group">
                  <Paperclip className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[120px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Удалить"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden File / Image inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'file')}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'image')}
      />
    </>
  );

  const overlaySlot = (
    <>
      <FolderSuggestionMenu
        isOpen={folderQuery !== null}
        query={folderQuery ?? lastFolderQuery}
        folders={folderQuery !== null ? matchingFolders : lastMatchingFolders}
        currentFolder={effectiveDefaultFolder}
        selectedFolder={targetFolder}
        selectedIndex={folderSelectedIndex}
        onSelect={selectFolder}
        placement="top"
        isModal={isModal}
      />
      <SlashCommandMenu
        isOpen={slashQuery !== null}
        query={slashQuery ?? lastSlashQuery}
        selectedIndex={slashSelectedIndex}
        onSelect={executeSlashCommand}
        placement="top"
        isModal={isModal}
      />
      <SuggestionMenuShell
        isOpen={wikiQuery !== null && (matchingWikiItems.length > 0 || lastMatchingWikiItems.length > 0)}
        selectedIndex={wikiSelectedIndex}
        placement="top"
        isModal={isModal}
        isEmpty={(wikiQuery !== null ? matchingWikiItems : lastMatchingWikiItems).length === 0}
        emptyContent={<span>Заметка не найдена</span>}
        header={<SuggestionMenuHeader icon={<FileText className="w-3 h-3 text-zinc-400" />} title="Связать заметку [[...]]" />}
      >
        {(wikiQuery !== null ? matchingWikiItems : lastMatchingWikiItems).map((wikiItem, idx) => {
          const isSelected = idx === wikiSelectedIndex;
          return (
            <button
              key={wikiItem.id}
              type="button"
              data-selected={isSelected}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertWikiLink(wikiItem)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors truncate cursor-pointer ${
                isSelected ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.05]'
              }`}
            >
              {wikiItem.type === 'task' && <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {wikiItem.type === 'article' && <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {wikiItem.type === 'note' && <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
              <span className="truncate">{wikiItem.title || wikiItem.id}</span>
            </button>
          );
        })}
      </SuggestionMenuShell>
      <TagSuggestionMenu
        isOpen={tagQuery !== null}
        query={tagQuery ?? lastTagQuery}
        tags={tagQuery !== null ? matchingAutocompleteTags : lastMatchingTags}
        selectedIndex={tagSelectedIndex}
        onSelect={insertTag}
        placement="top"
        isModal={isModal}
      />
    </>
  );

  // Recording is a composer state, not a layer on top of it: the shell steps
  // aside and the recorder morphs in from the composer edge.
  if (isRecordingAudio || isRecordingVideo) {
    return isRecordingAudio ? (
      <AudioRecorder
        finishTriggerRef={triggerFinishRef}
        onRecorded={handleRecordedAudio}
        onCancel={cancelRecording}
      />
    ) : (
      <VideoRecorder
        finishTriggerRef={triggerFinishRef}
        onRecorded={handleRecordedVideo}
        onCancel={cancelRecording}
      />
    );
  }

  const leftControls = (
    <div className="composer-toolbar-group relative">
      {/* Lock Hint Banner when holding mic/video button */}
      {lockHint && recordMode === 'holding' && (
        <div className="absolute bottom-full mb-3 right-2 z-50 px-3 py-1.5 rounded-full bg-surface border border-white/10 shadow-2xl flex items-center gap-2 text-[11px] font-mono text-zinc-200 pointer-events-none motion-popover">
          <Lock className="w-3.5 h-3.5 text-accent animate-bounce" />
          <span>Потяните вверх для фиксации</span>
        </div>
      )}

      {/* +AI Smart Tagging Button - Icon Only */}
      <ToolbarButton
        size="md"
        className="composer-toolbar-control composer-toolbar-icon"
        onClick={handleSmartAiTags}
        disabled={isGeneratingAiTags}
        title="ИИ классификация: папка и теги (+AI)"
        aria-label="ИИ классификация: папка и теги (+AI)"
        icon={
          isGeneratingAiTags ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )
        }
      >
        <span className="sr-only">+AI</span>
      </ToolbarButton>

      {/* Record Type Selector (Ghost droplist: icon + label + chevron, larger touch target) */}
      <ResponsiveSegmented<SlagItemType>
        value={itemType}
        onChange={setItemType}
        options={[
          {
            value: 'note',
            label: 'Заметка',
            showLabelInTrigger: true,
            icon: <StickyNote className="w-4 h-4" />,
            title: 'Заметка',
            ariaLabel: 'Заметка',
          },
          {
            value: 'task',
            label: 'Таска',
            showLabelInTrigger: true,
            icon: <CheckSquare className="w-4 h-4" />,
            title: 'Таска',
            ariaLabel: 'Таска',
          },
          {
            value: 'article',
            label: 'Статья',
            showLabelInTrigger: true,
            icon: <FileText className="w-4 h-4" />,
            title: 'Статья',
            ariaLabel: 'Статья',
          },
        ]}
        triggerClassName="composer-toolbar-control composer-record-type"
        compact={true}
        size="md"
        direction="up"
        ariaLabel="Сменить тип записи"
      />

      {/* Task properties sit with the type selector, under the input */}
      {itemType === 'task' && (
        <ComposerTaskControls
          effectiveDueDate={effectiveDueDate}
          effectiveDateLabel={effectiveDateLabel}
          onDateChange={(newDate) => {
            setDueDate(newDate);
            setIsDateDismissed(false);
          }}
          onDateClear={() => {
            setIsDateDismissed(true);
            setDueDate('');
          }}
          effectiveDuration={effectiveDuration}
          onDurationChange={(mins) => {
            setDuration(mins);
            setIsDurationDismissed(mins === undefined);
          }}
          effectiveRecurrence={effectiveRecurrence}
          onRecurrenceChange={(rule) => {
            setRecurrence(rule);
            setIsRecurrenceDismissed(!rule);
          }}
          effectivePriority={effectivePriority}
          onPriorityChange={(val) => {
            setPriority(val);
            setIsPriorityDismissed(false);
          }}
        />
      )}
    </div>
  );

  const rightControls = (
    <ToolbarButton
      size="md"
      onClick={() => fileInputRef.current?.click()}
      className="composer-toolbar-control composer-toolbar-icon"
      title="Прикрепить файл"
      aria-label="Прикрепить файл"
      icon={<Paperclip className="w-4 h-4" />}
    />
  );

  const sendButton =
    !content.trim() && attachments.length === 0 ? (
      <button
        type="button"
        onPointerDown={handleMobileMediaPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="composer-toolbar-control composer-toolbar-icon w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center motion-press shrink-0 cursor-pointer touch-none bg-transparent hover:bg-surface-hover text-fg-secondary hover:text-fg-primary"
        title={
          mobileMediaType === 'audio'
            ? 'Записать аудио (удерживайте) / Кликните для видео'
            : 'Записать видео (удерживайте) / Кликните для аудио'
        }
        aria-label={mobileMediaType === 'audio' ? 'Записать голосовую заметку' : 'Записать видео'}
      >
        {mobileMediaType === 'audio' ? (
          <Mic className="w-4 h-4 transition-transform duration-150" />
        ) : (
          <Video className="w-4 h-4 transition-transform duration-150" />
        )}
      </button>
    ) : undefined;

  return (
    <BaseComposer
      value={content}
      variant={variant ?? (isModal ? 'flat' : 'card')}
      minHeight={24}
      onChange={handleContentChange}
      onSubmit={handleSend}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={
        isModal
          ? itemType === 'task'
            ? 'Название таски... (@ папка, # тег, Enter)'
            : 'Содержимое записи... (@ папка, # тег, Enter)'
          : isMobile
          ? itemType === 'task'
            ? 'Таска…'
            : itemType === 'article'
            ? 'Черновик статьи…'
            : 'Мысль, заметка или таска…'
          : itemType === 'task'
          ? 'Таска... (@ папка, # тег, - [ ] подзадачи, [[ ссылки)'
          : itemType === 'article'
          ? 'Черновик статьи... (@ папка, # тег, Shift+Enter, [[ ссылки)'
          : 'Мысль, заметка или код... (@ папка, # тег, / команды, [[ ссылки)'
      }
      textareaRef={textareaRef}
      highlightRange={folderTokenRange}
      hideTextarea={isRecordingAudio && !content.trim()}
      isSubmitDisabled={!content.trim() && attachments.length === 0}
      submitTitle="Отправить (Enter)"
      topSlot={topSlot}
      topRightSlot={
        replyTarget || !isModal ? (
          <div className="flex items-center gap-1">
            {replyTarget && (
              <ToolbarButton
                size="sm"
                onClick={() => setReplyTarget(null)}
                title="Отменить ответ"
                aria-label="Отменить ответ"
                className="text-zinc-400 hover:text-zinc-200"
                icon={<X className="w-3.5 h-3.5" />}
              />
            )}
            {!isModal && (
              <ToolbarButton
                size="sm"
                onClick={handleExpandToFullscreen}
                title="Раскрыть в полноэкранный редактор"
                aria-label="Раскрыть в полноэкранный редактор"
                className="flex text-zinc-400 hover:text-zinc-200"
                icon={<Maximize2 className="w-3.5 h-3.5" />}
              />
            )}
          </div>
        ) : undefined
      }
      overlaySlot={overlaySlot}
      leftControls={leftControls}
      rightControls={rightControls}
      sendButton={sendButton}
      isDraggingOver={isDraggingOver}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={isRecordingAudio ? 'max-w-[420px]' : isModal ? 'w-full' : 'max-w-2xl'}
    />
  );
};
