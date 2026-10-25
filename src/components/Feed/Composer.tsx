import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment, RecurrenceRule } from '../../types';
import { storage } from '../../lib/storage';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { Select } from '../UI/Select';
import { categorizeDraft } from '../../lib/aiService';
import { enrichItemAttachments } from '../../lib/attachmentEnrichment';
import { parseTodoistInput, extractAndStripTags, type ParsedTodoistTask } from '../../lib/todoistTaskParser';
import { formatRecurrenceLabel } from '../../lib/recurrenceHelper';
import { BaseComposer } from './BaseComposer';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SLASH_COMMANDS, type SlashCommand } from '../../types/slashCommands';
import {
  Trash2,
  Paperclip,
  Mic,
  Video,
  Sparkles,
  Folder,
  CheckSquare,
  X,
  Loader2,
  ChevronDown,
  Maximize2,
  CornerUpLeft,
  FileText,
  StickyNote,
  Lock,
  Calendar,
  Clock,
  Repeat,
  Hash
} from 'lucide-react';

const getTodayIso = (): string => new Date().toISOString().split('T')[0];
const getTomorrowIso = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const formatDueDateLabel = (dateIso: string, rawMatchedText?: string): string => {
  if (rawMatchedText && rawMatchedText.length <= 16) {
    return rawMatchedText.charAt(0).toUpperCase() + rawMatchedText.slice(1);
  }
  const today = getTodayIso();
  const tomorrow = getTomorrowIso();
  if (dateIso === today) return 'Сегодня';
  if (dateIso === tomorrow) return 'Завтра';

  try {
    const [y, m, d] = dateIso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return dateIso;
  }
};

export interface ComposerProps {
  isModal?: boolean;
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
    isMobile
  } = useApp();

  const activeFolder = initialFolder || currentFolder;
  const [initialDraft] = useState(() => storage.getComposerDraft(activeFolder));

  const [content, setContent] = useState(() => initialDraft?.content || '');
  const [itemType, setItemType] = useState<SlagItemType>(() => initialDraft?.itemType || initialType || 'note');
  const [taskStatus] = useState<SlagItemStatus>(initialStatus || 'todo');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>(() => initialDraft?.priority || 'none');
  const [dueDate, setDueDate] = useState<string>(() => initialDraft?.dueDate || initialDueDate || '');
  const [reminder] = useState<string | undefined>(initialReminder);
  const [tags, setTags] = useState<string[]>(() => initialDraft?.tags || []);
  const [targetFolderOverride, setTargetFolderOverride] = useState<{ folder: string; forCurrent: string } | null>(
    initialFolder ? { folder: initialFolder, forCurrent: currentFolder } : null
  );
  const targetFolder = targetFolderOverride?.forCurrent === currentFolder ? targetFolderOverride.folder : null;
  const setTargetFolder = (folder: string | null) => {
    setTargetFolderOverride(folder ? { folder, forCurrent: currentFolder } : null);
  };
  const [attachments, setAttachments] = useState<SlagAttachment[]>(() => initialDraft?.attachments || []);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  // Hold-to-record & lock state
  const [recordMode, setRecordMode] = useState<'idle' | 'holding' | 'locked'>('idle');
  const [lockHint, setLockHint] = useState<'audio' | 'video' | null>(null);
  const [mobileMediaType, setMobileMediaType] = useState<'audio' | 'video'>('audio');
  const pointerStartRef = useRef<{ x: number; y: number; time: number; target: 'audio' | 'video' } | null>(null);
  const triggerFinishRef = useRef<((autoSend?: boolean) => void) | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  // Clear hold timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  // WikiLink [[ autocomplete state
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [wikiSelectedIndex, setWikiSelectedIndex] = useState(0);

  // Slash command / state
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // Tag # autocomplete state
  const [tagQuery, setTagQuery] = useState<string | null>(null);
  const [tagSelectedIndex, setTagSelectedIndex] = useState(0);
  const [isTagNavigated, setIsTagNavigated] = useState(false);

  // Todoist parser & Ghost-chips state
  const [parsedTask, setParsedTask] = useState<ParsedTodoistTask | null>(null);
  const [isDateDismissed, setIsDateDismissed] = useState(false);
  const [isPriorityDismissed, setIsPriorityDismissed] = useState(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [isDurationDismissed, setIsDurationDismissed] = useState(false);
  const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(undefined);
  const [isRecurrenceDismissed, setIsRecurrenceDismissed] = useState(false);
  const [isRecurrenceDropdownOpen, setIsRecurrenceDropdownOpen] = useState(false);
  const [dismissedTags, setDismissedTags] = useState<Set<string>>(new Set());

  // 150ms debounced Todoist parsing when content changes
  useEffect(() => {
    if (!content.trim()) return;

    const timer = setTimeout(() => {
      const parsed = parseTodoistInput(content);
      setParsedTask(parsed);
      if (itemType === 'note' && (parsed.dueDate || (parsed.priority && parsed.priority !== 'none') || parsed.duration !== undefined || parsed.recurrence)) {
        setItemType('task');
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [content, itemType]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const draftRef = useRef({ content, itemType, priority, dueDate, tags, attachments, replyTarget });

  useEffect(() => {
    draftRef.current = { content, itemType, priority, dueDate, tags, attachments, replyTarget };
  }, [content, itemType, priority, dueDate, tags, attachments, replyTarget]);

  const resetDraftState = () => {
    draftRef.current = {
      content: '',
      itemType: 'note',
      priority: 'none',
      dueDate: '',
      tags: [],
      attachments: [],
      replyTarget: null,
    };
    setContent('');
    setTags([]);
    setTargetFolderOverride(null);
    setAttachments([]);
    setPriority('none');
    setDueDate('');
    setDuration(undefined);
    setIsDurationDismissed(false);
    setIsDurationDropdownOpen(false);
    setRecurrence(undefined);
    setIsRecurrenceDismissed(false);
    setIsRecurrenceDropdownOpen(false);
    setReplyTarget(null);
    setWikiQuery(null);
    setSlashQuery(null);
    setSlashSelectedIndex(0);
    setTagQuery(null);
    setTagSelectedIndex(0);
    setIsTagNavigated(false);
    setParsedTask(null);
    setIsDateDismissed(false);
    setIsPriorityDismissed(false);
    setDismissedTags(new Set());
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Focus textarea when replying or when mounted in modal
  useEffect(() => {
    if ((replyTarget || isModal) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTarget, isModal]);

  // Initialize replyTarget from draft on initial mount if available
  useEffect(() => {
    if (initialDraft?.replyTarget && !replyTarget) {
      setReplyTarget(initialDraft.replyTarget as any);
    }
  }, [initialDraft?.replyTarget, replyTarget, setReplyTarget]);

  // Autosave when unmounting (e.g. folder switch or page navigation)
  useEffect(() => {
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
          replyTarget: d.replyTarget ? { id: d.replyTarget.id, title: d.replyTarget.title } : null,
          updatedAt: Date.now(),
        });
      } else {
        storage.deleteComposerDraft(activeFolder);
      }
    };
  }, [activeFolder]);

  // Debounced autosave while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content.trim() || attachments.length > 0) {
        storage.saveComposerDraft(activeFolder, {
          content,
          itemType,
          priority,
          dueDate,
          tags,
          attachments,
          replyTarget: replyTarget ? { id: replyTarget.id, title: replyTarget.title } : null,
          updatedAt: Date.now(),
        });
      } else {
        storage.deleteComposerDraft(activeFolder);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [activeFolder, content, itemType, priority, dueDate, tags, attachments, replyTarget]);

  // Handle beforeunload to avoid lost text on immediate tab close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      const d = draftRef.current;
      if (d.content.trim() || d.attachments.length > 0) {
        storage.saveComposerDraft(activeFolder, {
          content: d.content,
          itemType: d.itemType,
          priority: d.priority,
          dueDate: d.dueDate,
          tags: d.tags,
          attachments: d.attachments,
          replyTarget: d.replyTarget ? { id: d.replyTarget.id, title: d.replyTarget.title } : null,
          updatedAt: Date.now(),
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeFolder]);

  // All unique tags in vault
  const allVaultTags = React.useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      it.tags?.forEach(t => {
        if (t && t.trim()) set.add(t.trim());
      });
    });
    return Array.from(set);
  }, [items]);

  // Tags matching current # autocomplete query
  const matchingAutocompleteTags = React.useMemo(() => {
    if (tagQuery === null) return [];
    const q = tagQuery.toLowerCase().trim();
    return allVaultTags
      .filter(t => !q || t.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tagQuery, allVaultTags]);

  // Live tags recognized from content (excluding dismissed)
  const currentInlineTags = React.useMemo(() => {
    return extractAndStripTags(content).tags.filter(t => !dismissedTags.has(t));
  }, [content, dismissedTags]);

  // Combined preview tags (manually selected + live inline hashtags)
  const allPreviewTags = React.useMemo(() => {
    return Array.from(new Set([...tags, ...currentInlineTags]));
  }, [tags, currentInlineTags]);

  // WikiLink items matching current query
  const matchingWikiItems = wikiQuery !== null
    ? items
        .filter(i => (i.title || '').toLowerCase().includes(wikiQuery.toLowerCase()))
        .slice(0, 5)
    : [];

  // Slash commands matching current query
  const matchingSlashCommands = slashQuery !== null
    ? SLASH_COMMANDS.filter((cmd) => {
        const q = slashQuery.toLowerCase().trim();
        if (!q) return true;
        if (cmd.command.toLowerCase().includes(q)) return true;
        if (cmd.title.toLowerCase().includes(q)) return true;
        if (cmd.description.toLowerCase().includes(q)) return true;
        return cmd.aliases.some((alias) => alias.toLowerCase().includes(q));
      })
    : [];

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);

    if (!text.trim()) {
      setParsedTask(null);
      setIsDateDismissed(false);
      setIsPriorityDismissed(false);
      setDismissedTags(new Set());
      setSlashQuery(null);
      setTagQuery(null);
    }

    // Smart type inference: typing checklist switches note to task
    if (itemType === 'note') {
      if (/^\s*(?:-\s*\[[ xX]?\]|\[[ xX]?\])\s+/m.test(text)) {
        setItemType('task');
      }
    }

    const cursorPos = e.target.selectionStart || text.length;
    const textBefore = text.slice(0, cursorPos);
    const wikiMatch = textBefore.match(/\[\[([^\]\n]*)$/);
    if (wikiMatch) {
      setWikiQuery(wikiMatch[1]);
      setWikiSelectedIndex(0);
      setSlashQuery(null);
      setTagQuery(null);
    } else {
      setWikiQuery(null);
      // Slash command trigger: beginning of line or preceded by whitespace, followed by non-space chars
      const slashMatch = textBefore.match(/(?:^|\s)\/([a-zA-Zа-яА-ЯёЁ0-9_-]*)$/);
      if (slashMatch) {
        setSlashQuery(slashMatch[1]);
        setSlashSelectedIndex(0);
        setTagQuery(null);
      } else {
        setSlashQuery(null);
        // Tag trigger: beginning of line or preceded by whitespace, followed by # and letters/digits
        const tagMatch = textBefore.match(/(?:^|\s)#([a-zA-Zа-яА-ЯёЁ0-9_-]*)$/);
        if (tagMatch) {
          setTagQuery(tagMatch[1]);
          setTagSelectedIndex(0);
          setIsTagNavigated(false);
        } else {
          setTagQuery(null);
          setIsTagNavigated(false);
        }
      }
    }
  };

  const insertTag = (selectedTag: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart || content.length;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);
    const hashIndex = textBefore.lastIndexOf('#');
    if (hashIndex !== -1) {
      const newText = textBefore.slice(0, hashIndex) + `#${selectedTag} ` + textAfter;
      setContent(newText);
      setTagQuery(null);
      setTimeout(() => {
        el.focus();
        const newCursor = hashIndex + selectedTag.length + 2;
        el.setSelectionRange(newCursor, newCursor);
      }, 10);
    }
  };

  const insertWikiLink = (targetItem: (typeof items)[0]) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart || content.length;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);
    if (match && match.index !== undefined) {
      const startIdx = match.index;
      const cleanTitle = targetItem.title || targetItem.id;
      const newText = textBefore.slice(0, startIdx) + `[[${cleanTitle}]] ` + textAfter;
      setContent(newText);
      setWikiQuery(null);
      setTimeout(() => {
        el.focus();
        const newCursor = startIdx + cleanTitle.length + 5;
        el.setSelectionRange(newCursor, newCursor);
      }, 10);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
        const attachment: SlagAttachment = {
          id,
          name: file.name,
          type: type === 'image' || file.type.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          relativePath: `.attachments/${id}_${file.name}`,
          dataUrl: reader.result as string,
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
      if (res.tags.length > 0) {
        const merged = Array.from(new Set([...tags, ...res.tags]));
        setTags(merged);
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
        addToast('Режим переключен: Задача', 'info');
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
        el.focus();
        el.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  const removeTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
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
      try {
        const processed = await processFileListToAttachments(clipboardFiles);
        if (processed.length > 0) {
          setAttachments(prev => [...prev, ...processed]);
          addToast(`Прикреплено: ${processed.length === 1 ? processed[0].name : `${processed.length} файла`}`, 'success');
        }
      } catch {
        addToast('Не удалось вставить медиа из буфера обмена', 'error');
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent, target: 'audio' | 'video') => {
    if (e.button !== 0) return;
    if (isRecordingAudio || isRecordingVideo) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      target,
    };
    setRecordMode('holding');
    setLockHint(target);

    if (target === 'audio') {
      setIsRecordingVideo(false);
      setIsRecordingAudio(true);
    } else {
      setIsRecordingAudio(false);
      setIsRecordingVideo(true);
    }
  };

  const handleMobileMediaPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (isRecordingAudio || isRecordingVideo) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const currentTarget = mobileMediaType;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      target: currentTarget,
    };

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    // 220ms hold threshold to differentiate single tap (toggle audio/video) from holding (record)
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setRecordMode('holding');
      setLockHint(currentTarget);
      if (currentTarget === 'audio') {
        setIsRecordingVideo(false);
        setIsRecordingAudio(true);
      } else {
        setIsRecordingAudio(false);
        setIsRecordingVideo(true);
      }
      try {
        navigator.vibrate?.(15);
      } catch {}
    }, 220);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dy = e.clientY - pointerStartRef.current.y;
    const dx = e.clientX - pointerStartRef.current.x;

    // If hold timer is still pending and user moved noticeably, trigger hold immediately
    if (holdTimerRef.current && (dy < -15 || dx < -15)) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      const target = pointerStartRef.current.target;
      setRecordMode('holding');
      setLockHint(target);
      if (target === 'audio') {
        setIsRecordingVideo(false);
        setIsRecordingAudio(true);
      } else {
        setIsRecordingAudio(false);
        setIsRecordingVideo(true);
      }
    }

    if (recordMode !== 'holding') return;

    // Swipe up -> Lock hands-free recording
    if (dy < -35) {
      setRecordMode('locked');
      setLockHint(null);
      pointerStartRef.current = null;
      try {
        navigator.vibrate?.(10);
      } catch {}
      return;
    }

    // Swipe left -> Cancel
    if (dx < -55) {
      setIsRecordingAudio(false);
      setIsRecordingVideo(false);
      setRecordMode('idle');
      setLockHint(null);
      pointerStartRef.current = null;
      addToast('Запись отменена', 'info');
      try {
        navigator.vibrate?.(15);
      } catch {}
    }
  };

  const handlePointerUp = (_e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const holdTime = Date.now() - pointerStartRef.current.time;
    pointerStartRef.current = null;

    if (holdTimerRef.current) {
      // Tap detected (<220ms): toggle audio <-> video mode
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      setMobileMediaType((prev) => (prev === 'audio' ? 'video' : 'audio'));
      try {
        navigator.vibrate?.(10);
      } catch {}
      return;
    }

    if (recordMode === 'holding') {
      if (holdTime < 350) {
        // Short tap while in holding mode -> lock in hands-free mode for comfortable recording
        setRecordMode('locked');
        setLockHint(null);
      } else {
        // Held and released -> auto-finish and send
        setRecordMode('idle');
        setLockHint(null);
        if (triggerFinishRef.current) {
          triggerFinishRef.current(true);
        }
      }
    }
  };

  const handlePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recordMode === 'holding') {
      setIsRecordingAudio(false);
      setIsRecordingVideo(false);
      setRecordMode('idle');
      setLockHint(null);
    }
    pointerStartRef.current = null;
  };

  const sendItemWithAttachments = (attachmentsToSend: SlagAttachment[]) => {
    if (!content.trim() && attachmentsToSend.length === 0) return;

    // Parse Todoist input synchronously for immediate state accuracy
    const currentParsed = parseTodoistInput(content);

    // Extract and strip hashtags from content
    const { cleanContent, tags: extractedTags } = extractAndStripTags(content);
    const finalContent = (cleanContent || content).trim();

    let title = '';
    const lines = finalContent.split('\n');
    const firstLine = lines[0].replace(/^#+\s*/, '').trim();

    if (itemType === 'article') {
      title = firstLine || 'Новая статья';
    } else if (itemType === 'task') {
      title = currentParsed.cleanTitle || 'Новая задача';
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

    let subtasks: Array<{ id: string; title: string; completed: boolean }> = [];
    if (itemType === 'task') {
      const checkboxLines = lines.filter(l => /^\s*-\s*\[([ xX])\]\s+(.+)$/.test(l));
      if (checkboxLines.length > 0) {
        subtasks = checkboxLines.map((l, idx) => {
          const match = l.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
          return {
            id: 'st_' + idx,
            title: match ? match[2].trim() : l,
            completed: match ? match[1].toLowerCase() === 'x' : false,
          };
        });
      }
    }

    const taskPriority = itemType === 'task'
      ? (!isPriorityDismissed && currentParsed.priority
          ? currentParsed.priority
          : priority)
      : undefined;

    const taskDueDate = itemType === 'task'
      ? (!isDateDismissed && currentParsed.dueDate
          ? currentParsed.dueDate
          : (dueDate || undefined))
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

    const taskRecurrence = itemType === 'task'
      ? (!isRecurrenceDismissed && currentParsed.recurrence
          ? currentParsed.recurrence
          : recurrence)
      : undefined;

    const destinationFolder = targetFolder || currentFolder;
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
    const { cleanContent, tags: extractedTags } = extractAndStripTags(content);
    const finalContent = (cleanContent || content).trim();
    const lines = finalContent.split('\n');
    const firstLine = lines[0]?.replace(/^#+\s*/, '').trim() || (itemType === 'article' ? 'Новая статья' : 'Черновик');
    const currentParsed = parseTodoistInput(content);

    const taskTitle = itemType === 'task'
      ? (currentParsed.cleanTitle || 'Новая задача')
      : firstLine;

    const rawGhostTags = currentParsed.tags.filter(t => !dismissedTags.has(t));
    const activeExtractedTags = extractedTags.filter(t => !dismissedTags.has(t));
    const finalTags = Array.from(new Set([...tags, ...rawGhostTags, ...activeExtractedTags]));

    const taskPriority = itemType === 'task'
      ? (!isPriorityDismissed && currentParsed.priority
          ? currentParsed.priority
          : priority)
      : undefined;

    const taskDueDate = itemType === 'task'
      ? (!isDateDismissed && currentParsed.dueDate
          ? currentParsed.dueDate
          : (dueDate || undefined))
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

    const taskRecurrence = itemType === 'task'
      ? (!isRecurrenceDismissed && currentParsed.recurrence
          ? currentParsed.recurrence
          : recurrence)
      : undefined;

    // Create a temporary draft object in memory WITHOUT saving to vault storage yet
    const draftItem: SlagItem = {
      id: 'draft_' + Date.now(),
      type: itemType,
      title: taskTitle,
      content: finalContent,
      folder: currentFolder,
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

    // Close dropdowns or dismiss active date / duration / recurrence / priority on Escape
    if (e.key === 'Escape') {
      if (isDurationDropdownOpen) {
        e.preventDefault();
        setIsDurationDropdownOpen(false);
        return;
      }
      if (isRecurrenceDropdownOpen) {
        e.preventDefault();
        setIsRecurrenceDropdownOpen(false);
        return;
      }
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

    // Wiki autocomplete keyboard controls
    if (wikiQuery !== null && matchingWikiItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWikiSelectedIndex(prev => (prev < matchingWikiItems.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWikiSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertWikiLink(matchingWikiItems[wikiSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setWikiQuery(null);
        return;
      }
    }

    // Tag autocomplete keyboard controls
    if (tagQuery !== null && matchingAutocompleteTags.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsTagNavigated(true);
        setTagSelectedIndex(prev => (prev < matchingAutocompleteTags.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsTagNavigated(true);
        setTagSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && isTagNavigated)) {
        e.preventDefault();
        insertTag(matchingAutocompleteTags[tagSelectedIndex]);
        setIsTagNavigated(false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTagQuery(null);
        setIsTagNavigated(false);
        return;
      }
    }

    if (isModal && e.key === 'Escape' && !wikiQuery && !slashQuery && !tagQuery) {
      e.preventDefault();
      onCancel?.();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const topSlot = (
    <>
        {/* Reply Banner (Flat, Anti-Matryoshka) */}
        {replyTarget && (
        <div className="flex items-center justify-between px-1 pb-1.5 pt-0.5 border-b border-white/[0.06] text-xs text-zinc-400 animate-in fade-in slide-in-from-bottom-1 select-none">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <CornerUpLeft className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">
              {replyTarget.type === 'task' ? 'Ответ на таску:' : replyTarget.type === 'article' ? 'Ответ на статью:' : 'Ответ:'}
            </span>
            <span className="truncate text-zinc-300 font-medium text-xs">
              {replyTarget.title || replyTarget.content.slice(0, 45)}
            </span>
          </div>
          <button
            onClick={() => setReplyTarget(null)}
            className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-colors shrink-0 cursor-pointer"
            title="Отменить ответ"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachments Preview Strip */}
      {attachments.length > 0 && (
        <div className="flex items-center gap-2 px-1 py-1 overflow-x-auto scrollbar-none whitespace-nowrap">
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
      {slashQuery !== null && (
        <SlashCommandMenu
          query={slashQuery}
          selectedIndex={slashSelectedIndex}
          onSelect={executeSlashCommand}
          placement="top"
          isModal={isModal}
        />
      )}
      {wikiQuery !== null && matchingWikiItems.length > 0 && (
        <div className={`absolute left-0 ${isModal ? 'bottom-full mb-[96px]' : 'bottom-full mb-1'} w-72 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100 pointer-events-auto`}>
          <div className="px-2 py-1 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
            Связать заметку [[...]]
          </div>
          {matchingWikiItems.map((wikiItem, idx) => {
            const isSelected = idx === wikiSelectedIndex;
            return (
              <button
                key={wikiItem.id}
                type="button"
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
        </div>
      )}
      {tagQuery !== null && matchingAutocompleteTags.length > 0 && (
        <div className={`absolute left-0 ${isModal ? 'bottom-full mb-[96px]' : 'bottom-full mb-1'} w-56 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100 pointer-events-auto`}>
          <div className="px-2 py-1 text-[10px] text-zinc-500 font-mono uppercase tracking-wider flex items-center justify-between">
            <span>Теги</span>
            <span className="text-zinc-600">#{tagQuery}</span>
          </div>
          {matchingAutocompleteTags.map((tagItem, idx) => {
            const isSelected = idx === tagSelectedIndex;
            return (
              <button
                key={tagItem}
                type="button"
                onClick={() => insertTag(tagItem)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-mono text-left transition-colors truncate cursor-pointer ${
                  isSelected ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.05]'
                }`}
              >
                <Hash className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">#{tagItem}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const customControls = isRecordingAudio ? (
    <div className="pt-1 w-full animate-in fade-in duration-150">
      <AudioRecorder
        finishTriggerRef={triggerFinishRef}
        onRecorded={handleRecordedAudio}
        onCancel={() => {
          setIsRecordingAudio(false);
          setRecordMode('idle');
          setLockHint(null);
        }}
      />
    </div>
  ) : isRecordingVideo ? (
    <div className="pt-1 w-full flex flex-col items-center animate-in fade-in duration-150">
      <VideoRecorder
        finishTriggerRef={triggerFinishRef}
        onRecorded={handleRecordedVideo}
        onCancel={() => {
          setIsRecordingVideo(false);
          setRecordMode('idle');
          setLockHint(null);
        }}
      />
    </div>
  ) : undefined;

  const hasActiveProperties =
    Boolean(targetFolder) ||
    allPreviewTags.length > 0 ||
    (itemType === 'task' &&
      (Boolean(effectiveDueDate) ||
        effectiveDuration !== undefined ||
        Boolean(effectiveRecurrence) ||
        effectivePriority !== 'none'));

  const propertiesSlot = hasActiveProperties ? (
    <div className="flex items-center gap-1.5 px-1 py-1 overflow-x-auto scrollbar-none whitespace-nowrap animate-in fade-in duration-150 text-xs">
      {/* Target Folder */}
      {targetFolder && (
        <span
          className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-zinc-200 text-[11px] font-medium"
          title={`Целевая папка для сохранения: «${targetFolder}»`}
        >
          <Folder className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{targetFolder}</span>
          <button
            type="button"
            onClick={() => setTargetFolder(null)}
            className="hover:text-rose-400 transition-colors cursor-pointer"
            title="Сбросить целевую папку"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      )}

      {/* Tags */}
      {allPreviewTags.map(tag => (
        <span
          key={tag}
          className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-[10px] font-mono"
        >
          #{tag}
          <button
            onClick={() => removeTag(tag)}
            className="hover:text-rose-400 transition-colors cursor-pointer"
            aria-label={`Удалить тег ${tag}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      {/* Due Date Chip */}
      {itemType === 'task' && effectiveDueDate && (
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker?.()}
            className="flex items-center gap-1 hover:text-blue-200 cursor-pointer"
            title="Изменить срок"
          >
            <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
            <span>{effectiveDateLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDateDismissed(true);
              setDueDate('');
            }}
            className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
            title="Снять срок"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      )}

      {/* Duration Chip */}
      {itemType === 'task' && effectiveDuration !== undefined && (
        <div className="relative shrink-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
              className="flex items-center gap-1 hover:text-blue-200 cursor-pointer"
              title="Изменить длительность"
            >
              <Clock className="w-3 h-3 text-blue-400 shrink-0" />
              <span>
                {effectiveDuration >= 60
                  ? `${Math.floor(effectiveDuration / 60)}ч${effectiveDuration % 60 ? ` ${effectiveDuration % 60}м` : ''}`
                  : `${effectiveDuration}м`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDurationDismissed(true);
                setDuration(undefined);
              }}
              className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
              title="Снять длительность"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>

          {isDurationDropdownOpen && (
            <div className="absolute left-0 bottom-full mb-1.5 w-32 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
              {[15, 30, 45, 60, 90, 120].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setDuration(mins);
                    setIsDurationDismissed(false);
                    setIsDurationDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    effectiveDuration === mins ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span>{mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recurrence Chip */}
      {itemType === 'task' && effectiveRecurrence && (
        <div className="relative shrink-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setIsRecurrenceDropdownOpen(!isRecurrenceDropdownOpen)}
              className="flex items-center gap-1 hover:text-amber-200 cursor-pointer"
              title="Изменить повторение"
            >
              <Repeat className="w-3 h-3 text-amber-400 shrink-0" />
              <span>{formatRecurrenceLabel(effectiveRecurrence)}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRecurrenceDismissed(true);
                setRecurrence(undefined);
              }}
              className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
              title="Снять повторение"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>

          {isRecurrenceDropdownOpen && (
            <div className="absolute left-0 bottom-full mb-1.5 w-44 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
              {[
                { label: 'Каждый день', rule: { freq: 'daily', interval: 1, resetSubtasks: true } as RecurrenceRule },
                { label: 'По будням (Пн-Пт)', rule: { freq: 'weekdays', interval: 1, resetSubtasks: true } as RecurrenceRule },
                { label: 'Каждую неделю', rule: { freq: 'weekly', interval: 1, resetSubtasks: true } as RecurrenceRule },
                { label: 'Каждый месяц', rule: { freq: 'monthly', interval: 1, resetSubtasks: true } as RecurrenceRule },
              ].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    setRecurrence(opt.rule);
                    setIsRecurrenceDismissed(false);
                    setIsRecurrenceDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Priority Chip */}
      {itemType === 'task' && effectivePriority !== 'none' && (
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
            effectivePriority === 'high'
              ? 'bg-rose-500/10 border border-rose-500/25 text-rose-300'
              : effectivePriority === 'medium'
              ? 'bg-amber-500/10 border border-amber-500/25 text-amber-300'
              : 'bg-blue-500/10 border border-blue-500/25 text-blue-300'
          }`}
        >
          <button
            type="button"
            className="flex items-center gap-1 cursor-pointer hover:opacity-80"
            title="Приоритет задачи"
          >
            <LinearSignalBars priority={effectivePriority} className="w-3 h-3" />
            <span>
              {effectivePriority === 'high' ? 'Высокий' : effectivePriority === 'medium' ? 'Средний' : 'Низкий'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsPriorityDismissed(true);
              setPriority('none');
            }}
            className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
            title="Снять приоритет"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      )}
    </div>
  ) : null;

  const leftControls = (
    <div className="flex items-center gap-1 shrink-0 relative">
      {/* Lock Hint Banner when holding mic/video button */}
      {lockHint && recordMode === 'holding' && (
        <div className="absolute bottom-full mb-3 right-2 z-50 px-3 py-1.5 rounded-full bg-[#141417] border border-white/10 shadow-2xl flex items-center gap-2 text-[11px] font-mono text-zinc-200 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
          <Lock className="w-3.5 h-3.5 text-[#529ee8] animate-bounce" />
          <span>Потяните вверх для фиксации</span>
        </div>
      )}

      {/* +AI Smart Tagging Button - Seamless embedded button */}
            <button
              type="button"
              onClick={handleSmartAiTags}
              disabled={isGeneratingAiTags}
              className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="ИИ классификация: папка и теги (+AI)"
              aria-label="ИИ классификация: папка и теги (+AI)"
            >
              {isGeneratingAiTags ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span>+AI</span>
            </button>

            {/* Type Selector Dropdown - Seamless embedded button */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-xs text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer flex items-center gap-1"
                aria-label="Сменить тип записи"
              >
                <span>
                  {itemType === 'note' ? 'Заметка' : itemType === 'task' ? 'Таска' : 'Статья'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-150 ${isTypeDropdownOpen ? 'rotate-180 text-zinc-300' : ''}`} />
              </button>

              {isTypeDropdownOpen && (
                <div className="absolute left-0 bottom-full mb-1.5 w-36 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('note');
                      setIsTypeDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      itemType === 'note' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Заметка</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('task');
                      setIsTypeDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      itemType === 'task' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                    <span>Таска</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('article');
                      setIsTypeDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      itemType === 'article' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Статья</span>
                  </button>
                </div>
              )}
            </div>

            {/* Task Controls: Quiet un-set property triggers (when active, displayed in propertiesSlot) */}
            {itemType === 'task' && (
              <div className="flex items-center gap-0.5 shrink-0">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={effectiveDueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setIsDateDismissed(false);
                  }}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />

                {!effectiveDueDate && (
                  <button
                    type="button"
                    onClick={() => dateInputRef.current?.showPicker?.()}
                    className="h-ctrl-md px-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                    title="Установить срок задачи"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                )}

                {effectiveDuration === undefined && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
                      className="h-ctrl-md px-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                      title="Установить длительность задачи"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>

                    {isDurationDropdownOpen && (
                      <div className="absolute left-0 bottom-full mb-1.5 w-32 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
                        {[15, 30, 45, 60, 90, 120].map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => {
                              setDuration(mins);
                              setIsDurationDismissed(false);
                              setIsDurationDropdownOpen(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span>{mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!effectiveRecurrence && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsRecurrenceDropdownOpen(!isRecurrenceDropdownOpen)}
                      className="h-ctrl-md px-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                      title="Повторяющаяся задача"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                    </button>

                    {isRecurrenceDropdownOpen && (
                      <div className="absolute left-0 bottom-full mb-1.5 w-44 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
                        {[
                          { label: 'Каждый день', rule: { freq: 'daily', interval: 1, resetSubtasks: true } as RecurrenceRule },
                          { label: 'По будням (Пн-Пт)', rule: { freq: 'weekdays', interval: 1, resetSubtasks: true } as RecurrenceRule },
                          { label: 'Каждую неделю', rule: { freq: 'weekly', interval: 1, resetSubtasks: true } as RecurrenceRule },
                          { label: 'Каждый месяц', rule: { freq: 'monthly', interval: 1, resetSubtasks: true } as RecurrenceRule },
                        ].map(opt => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => {
                              setRecurrence(opt.rule);
                              setIsRecurrenceDismissed(false);
                              setIsRecurrenceDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {effectivePriority === 'none' && (
                  <div className="flex items-center shrink-0">
                    <Select
                      size="md"
                      variant="ghost"
                      direction="up"
                      value={effectivePriority}
                      onChange={(val) => {
                        setPriority(val as any);
                        setIsPriorityDismissed(false);
                      }}
                      options={[
                        {
                          value: 'none',
                          label: 'Обычный',
                          icon: <LinearSignalBars priority="none" className="w-3.5 h-3.5" />,
                          color: 'text-zinc-400',
                        },
                        {
                          value: 'low',
                          label: 'Низкий',
                          icon: <LinearSignalBars priority="low" className="w-3.5 h-3.5" />,
                          color: 'text-zinc-300',
                        },
                        {
                          value: 'medium',
                          label: 'Средний',
                          icon: <LinearSignalBars priority="medium" className="w-3.5 h-3.5" />,
                          color: 'text-amber-400',
                        },
                        {
                          value: 'high',
                          label: 'Высокий',
                          icon: <LinearSignalBars priority="high" className="w-3.5 h-3.5" />,
                          color: 'text-rose-400',
                        },
                      ]}
                    />
                  </div>
                )}
              </div>
            )}
    </div>
  );

  const rightControls = (
    <>
      {(content.trim() || attachments.length > 0) && (
        <button
          type="button"
          onClick={() => {
            setContent('');
            setAttachments([]);
            setTags([]);
            setPriority('none');
            setDueDate('');
            setDuration(undefined);
            setIsDurationDismissed(false);
            setRecurrence(undefined);
            setIsRecurrenceDismissed(false);
            setParsedTask(null);
            setIsDateDismissed(false);
            setIsPriorityDismissed(false);
            setDismissedTags(new Set());
          }}
          className="w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors cursor-pointer shrink-0"
          title="Очистить"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* Desktop Dedicated Mic & Video Buttons */}
      {!isMobile && (
        <>
          <button
            type="button"
            onClick={() => {
              if (!isRecordingAudio) {
                setIsRecordingVideo(false);
                setIsRecordingAudio(true);
                setRecordMode('locked');
                setLockHint(null);
              }
            }}
            onPointerDown={(e) => handlePointerDown(e, 'audio')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center transition-colors cursor-pointer touch-none shrink-0 ${
              isRecordingAudio
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Записать голос (кликните или удерживайте)"
            aria-label="Записать голосовую заметку"
          >
            <Mic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isRecordingVideo) {
                setIsRecordingAudio(false);
                setIsRecordingVideo(true);
                setRecordMode('locked');
                setLockHint(null);
              }
            }}
            onPointerDown={(e) => handlePointerDown(e, 'video')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center transition-colors cursor-pointer touch-none shrink-0 ${
              isRecordingVideo
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Записать видео-кружок (кликните или удерживайте)"
            aria-label="Записать видео-кружок"
          >
            <Video className="w-4 h-4" />
          </button>
        </>
      )}

      {/* File Attach Button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
        title="Прикрепить файл"
      >
        <Paperclip className="w-4 h-4" />
      </button>

      {/* Expand to Fullscreen Editor Icon Button */}
      <button
        type="button"
        onClick={handleExpandToFullscreen}
        className="w-ctrl-md h-ctrl-md rounded-md hidden sm:flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        title="Раскрыть в полноэкранный редактор"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </>
  );

  const sendButton =
    isMobile && !content.trim() && attachments.length === 0 ? (
      <button
        type="button"
        onPointerDown={handleMobileMediaPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="w-ctrl-md h-ctrl-md rounded-lg flex items-center justify-center transition-all btn-press shrink-0 cursor-pointer touch-none bg-white/[0.08] hover:bg-white/[0.14] active:bg-white/[0.2] text-zinc-200 hover:text-white"
        title={
          mobileMediaType === 'audio'
            ? 'Записать аудио (удерживайте) / Нажмите для видео'
            : 'Записать видео (удерживайте) / Нажмите для аудио'
        }
        aria-label={mobileMediaType === 'audio' ? 'Записать аудио' : 'Записать видео'}
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
      variant={isModal ? 'flat' : 'card'}
      onChange={handleContentChange}
      onSubmit={handleSend}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={
        isModal
          ? itemType === 'task'
            ? 'Название задачи... (Enter)'
            : 'Содержимое записи... (Enter)'
          : isMobile
          ? itemType === 'task'
            ? 'Задача... ([[ для ссылки)'
            : itemType === 'article'
            ? 'Черновик статьи... ([[ для ссылки)'
            : 'Мысль, заметка или задача...'
          : itemType === 'task'
          ? 'Задача... (- [ ] для подзадач, [[ для ссылки)'
          : itemType === 'article'
          ? 'Черновик статьи... (Shift+Enter для новой строки, [[ для ссылки)'
          : 'Мысль, заметка или код... (Enter для отправки, [[ для ссылки)'
      }
      textareaRef={textareaRef}
      hideTextarea={isRecordingAudio && !content.trim()}
      isSubmitDisabled={!content.trim() && attachments.length === 0}
      submitTitle="Отправить (Enter)"
      topSlot={topSlot}
      propertiesSlot={propertiesSlot}
      overlaySlot={overlaySlot}
      customControls={customControls}
      leftControls={leftControls}
      rightControls={rightControls}
      sendButton={sendButton}
      className={isRecordingAudio ? 'max-w-[420px]' : 'max-w-2xl'}
    />
  );
};
