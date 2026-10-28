import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment, RecurrenceRule, FolderMeta } from '../../types';
import { storage } from '../../lib/storage';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { useComposerMedia } from '../../hooks/useComposerMedia';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { categorizeDraft } from '../../lib/aiService';
import { enrichItemAttachments, downscaleImageDataUrl } from '../../lib/attachmentEnrichment';
import { parseTodoistInput, extractAndStripTags, type ParsedTodoistTask } from '../../lib/todoistTaskParser';
import { parseSubtasksFromContent } from '../../lib/taskUtils';
import { BaseComposer } from './BaseComposer';
import { ResponsiveSegmented } from '../UI/ResponsiveSegmented';
import { ToolbarButton } from '../UI/ToolbarButton';
import { ComposerTaskControls } from './ComposerTaskControls';
import { TagChip } from '../UI/TagChip';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SLASH_COMMANDS, type SlashCommand } from '../../types/slashCommands';
import { FolderSuggestionMenu } from './FolderSuggestionMenu';
import { TagSuggestionMenu, type TagMeta } from './TagSuggestionMenu';
import { getTodayIso, getTomorrowIso, formatDueDateLabel } from '../../lib/dateUtils';
import {
  Paperclip,
  Mic,
  Video,
  Sparkles,
  Folder,
  CheckSquare,
  X,
  Loader2,
  Maximize2,
  CornerUpLeft,
  FileText,
  StickyNote,
  Lock,
} from 'lucide-react';

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

  const effectiveDefaultFolder = isModal ? 'Входящие' : (initialFolder || currentFolder);
  const activeFolder = isModal ? 'quick-composer' : effectiveDefaultFolder;
  const [initialDraft] = useState(() => storage.getComposerDraft(activeFolder));

  const [content, setContent] = useState(() => initialDraft?.content || '');
  const [itemType, setItemType] = useState<SlagItemType>(() => initialDraft?.itemType || initialType || 'note');
  const [taskStatus] = useState<SlagItemStatus>(initialStatus || 'todo');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>(() => initialDraft?.priority || 'none');
  const [dueDate, setDueDate] = useState<string>(() => initialDraft?.dueDate || initialDueDate || '');
  const [reminder] = useState<string | undefined>(initialReminder);
  const [tags, setTags] = useState<string[]>(() => initialDraft?.tags || []);
  const [targetFolderOverride, setTargetFolderOverride] = useState<{ folder: string; forCurrent: string } | null>(
    initialFolder && initialFolder !== effectiveDefaultFolder
      ? { folder: initialFolder, forCurrent: effectiveDefaultFolder }
      : null
  );
  const targetFolder = targetFolderOverride?.forCurrent === effectiveDefaultFolder ? targetFolderOverride.folder : null;
  const setTargetFolder = (folder: string | null) => {
    setTargetFolderOverride(folder ? { folder, forCurrent: effectiveDefaultFolder } : null);
  };
  const [attachments, setAttachments] = useState<SlagAttachment[]>(() => initialDraft?.attachments || []);
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false);

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

  // WikiLink [[ autocomplete state
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [wikiSelectedIndex, setWikiSelectedIndex] = useState(0);

  // Folder @ autocomplete state
  const [folderQuery, setFolderQuery] = useState<string | null>(null);
  const [folderSelectedIndex, setFolderSelectedIndex] = useState(0);

  // Slash command / state
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // Tag # autocomplete state
  const [tagQuery, setTagQuery] = useState<string | null>(null);
  const [tagSelectedIndex, setTagSelectedIndex] = useState(0);

  // Todoist parser & Ghost-chips state
  const [parsedTask, setParsedTask] = useState<ParsedTodoistTask | null>(null);
  const [isDateDismissed, setIsDateDismissed] = useState(false);
  const [isPriorityDismissed, setIsPriorityDismissed] = useState(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [isDurationDismissed, setIsDurationDismissed] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(undefined);
  const [isRecurrenceDismissed, setIsRecurrenceDismissed] = useState(false);
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
    setRecurrence(undefined);
    setIsRecurrenceDismissed(false);
    setReplyTarget(null);
    setWikiQuery(null);
    setFolderQuery(null);
    setFolderSelectedIndex(0);
    setSlashQuery(null);
    setSlashSelectedIndex(0);
    setTagQuery(null);
    setTagSelectedIndex(0);
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

  // All unique tags in vault with usage counts, sorted by frequency
  const allVaultTags = useMemo<TagMeta[]>(() => {
    const counts = new Map<string, number>();
    items.forEach(it => {
      it.tags?.forEach(t => {
        const clean = t && t.trim();
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
  }, [items]);

  // Tags matching current # autocomplete query
  const matchingAutocompleteTags = useMemo(() => {
    if (tagQuery === null) return [];
    const q = tagQuery.toLowerCase().trim();
    if (!q) return allVaultTags;
    return allVaultTags.filter(t => t.tag.toLowerCase().includes(q));
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

  // Folders matching current @ query
  const matchingFolders = useMemo(() => {
    if (folderQuery === null) return [];
    const sorted = [...folders].sort((a, b) => {
      if (a.path === currentFolder) return -1;
      if (b.path === currentFolder) return 1;
      if (a.path === 'Входящие') return -1;
      if (b.path === 'Входящие') return 1;
      return a.path.localeCompare(b.path, 'ru');
    });
    const q = folderQuery.toLowerCase().trim();
    if (!q) return sorted;
    return sorted.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [folderQuery, folders, currentFolder]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);

    if (!text.trim()) {
      setParsedTask(null);
      setIsDateDismissed(false);
      setIsPriorityDismissed(false);
      setDismissedTags(new Set());
      setFolderQuery(null);
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
      setFolderQuery(null);
      setSlashQuery(null);
      setTagQuery(null);
    } else {
      setWikiQuery(null);
      // Folder trigger: beginning of line or preceded by whitespace, followed by @ and folder characters
      const folderMatch = textBefore.match(/(?:^|\s)@([a-zA-Zа-яА-ЯёЁ0-9_/-]*)$/);
      if (folderMatch) {
        setFolderQuery(folderMatch[1]);
        setFolderSelectedIndex(0);
        setSlashQuery(null);
        setTagQuery(null);
      } else {
        setFolderQuery(null);
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
          } else {
            setTagQuery(null);
          }
        }
      }
    }
  };

  const insertTag = (selectedTag: string) => {
    const el = textareaRef.current;
    const cursorPos = el && typeof el.selectionStart === 'number' && el.selectionStart > 0
      ? el.selectionStart
      : content.length;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);
    const hashIndex = textBefore.lastIndexOf('#');
    if (hashIndex !== -1) {
      const newText = textBefore.slice(0, hashIndex) + `#${selectedTag} ` + textAfter;
      setContent(newText);
      setTagQuery(null);
      setTimeout(() => {
        if (el) {
          el.focus();
          const newCursor = hashIndex + selectedTag.length + 2;
          el.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    } else {
      const globalHashIndex = content.lastIndexOf('#');
      if (globalHashIndex !== -1) {
        const newText = content.slice(0, globalHashIndex) + `#${selectedTag} `;
        setContent(newText);
        setTagQuery(null);
        setTimeout(() => {
          if (el) {
            el.focus();
            const newCursor = newText.length;
            el.setSelectionRange(newCursor, newCursor);
          }
        }, 0);
      }
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

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const id = 'att_' + Date.now() + Math.random().toString(36).slice(2, 6);
        const isImg = type === 'image' || file.type.startsWith('image/');
        let finalDataUrl = reader.result as string;
        if (isImg && typeof finalDataUrl === 'string') {
          finalDataUrl = await downscaleImageDataUrl(finalDataUrl, 1440);
        }
        const attachment: SlagAttachment = {
          id,
          name: file.name,
          type: isImg ? 'image' : 'file',
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

  const selectFolder = (folder: FolderMeta) => {
    const el = textareaRef.current;
    const cursorPos = el && typeof el.selectionStart === 'number' && el.selectionStart > 0
      ? el.selectionStart
      : content.length;
    const textBefore = content.slice(0, cursorPos);
    const textAfter = content.slice(cursorPos);
    let atMatch = textBefore.match(/(?:^|\s)@([a-zA-Zа-яА-ЯёЁ0-9_/-]*)$/);

    if (atMatch && atMatch.index !== undefined) {
      const isStartOfLine = atMatch[0].startsWith('@');
      const replaceStart = isStartOfLine ? atMatch.index : atMatch.index + 1;
      const newText = textBefore.slice(0, replaceStart) + textAfter;
      setContent(newText);
      setTimeout(() => {
        if (el) {
          el.focus();
          el.setSelectionRange(replaceStart, replaceStart);
        }
      }, 0);
    } else {
      const globalMatch = content.match(/(?:^|\s)@([a-zA-Zа-яА-ЯёЁ0-9_/-]*)$/);
      if (globalMatch && globalMatch.index !== undefined) {
        const isStartOfLine = globalMatch[0].startsWith('@');
        const replaceStart = isStartOfLine ? globalMatch.index : globalMatch.index + 1;
        const newText = content.slice(0, replaceStart);
        setContent(newText);
        setTimeout(() => {
          if (el) {
            el.focus();
            el.setSelectionRange(replaceStart, replaceStart);
          }
        }, 0);
      }
    }

    setTargetFolder(folder.path);
    setFolderQuery(null);
    addToast(`Папка «${folder.name}» выбрана`, 'info');
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

    const destinationFolder = targetFolder || effectiveDefaultFolder;
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
        textareaRef.current?.focus();
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
    // Folder autocomplete keyboard controls
    if (folderQuery !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFolderQuery(null);
        return;
      }
      if (matchingFolders.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFolderSelectedIndex(prev => (prev < matchingFolders.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFolderSelectedIndex(prev => (prev > 0 ? prev - 1 : matchingFolders.length - 1));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          selectFolder(matchingFolders[folderSelectedIndex]);
          return;
        }
      }
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
    if (tagQuery !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTagQuery(null);
        return;
      }
      if (matchingAutocompleteTags.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setTagSelectedIndex(prev => (prev < matchingAutocompleteTags.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setTagSelectedIndex(prev => (prev > 0 ? prev - 1 : matchingAutocompleteTags.length - 1));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          // If the user already fully typed the exact tag, Enter sends the item while Tab confirms
          if (
            e.key === 'Enter' &&
            tagQuery &&
            matchingAutocompleteTags[tagSelectedIndex].tag.toLowerCase() === tagQuery.toLowerCase()
          ) {
            // Fall through to handleSend
          } else {
            e.preventDefault();
            insertTag(matchingAutocompleteTags[tagSelectedIndex].tag);
            return;
          }
        }
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
      {folderQuery !== null && (
        <FolderSuggestionMenu
          query={folderQuery}
          folders={matchingFolders}
          currentFolder={effectiveDefaultFolder}
          selectedFolder={targetFolder}
          selectedIndex={folderSelectedIndex}
          onSelect={selectFolder}
          placement="top"
          isModal={isModal}
        />
      )}
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
        <div className={`absolute left-0 ${isModal ? 'bottom-[calc(100%+55px)]' : 'bottom-[calc(100%+14px)]'} w-72 max-h-52 overflow-y-auto rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100 pointer-events-auto`}>
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
      {tagQuery !== null && (
        <TagSuggestionMenu
          query={tagQuery}
          tags={matchingAutocompleteTags}
          selectedIndex={tagSelectedIndex}
          onSelect={insertTag}
          placement="top"
          isModal={isModal}
        />
      )}
    </>
  );

  const customControls = isRecordingAudio ? (
    <div className="pt-1 w-full animate-in fade-in duration-150">
      <AudioRecorder
        finishTriggerRef={triggerFinishRef}
        onRecorded={handleRecordedAudio}
        onCancel={cancelRecording}
      />
    </div>
  ) : isRecordingVideo ? (
    <div className="pt-1 w-full flex flex-col items-center animate-in fade-in duration-150">
      <VideoRecorder
        finishTriggerRef={triggerFinishRef}
        onRecorded={handleRecordedVideo}
        onCancel={cancelRecording}
      />
    </div>
  ) : undefined;

  const hasActiveProperties = Boolean(targetFolder) || allPreviewTags.length > 0;

  const propertiesSlot = hasActiveProperties ? (
    <div className="flex items-center gap-2 px-1 pt-1 pb-1 overflow-x-auto scrollbar-none whitespace-nowrap animate-in fade-in duration-150 text-xs">
      {/* Target Folder */}
      {targetFolder && (
        <span
          className="shrink-0 inline-flex items-center gap-1.5 text-zinc-400 text-[11px] font-mono select-none"
          title={`Целевая папка для сохранения: «${targetFolder}»`}
        >
          <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>{targetFolder}</span>
          <button
            type="button"
            onClick={() => setTargetFolder(null)}
            className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer p-0.5 ml-0.5"
            title="Сбросить целевую папку"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      )}

      {/* Tags */}
      {allPreviewTags.map(tag => (
        <TagChip
          key={tag}
          tag={tag}
          variant="flat"
          onRemove={() => removeTag(tag)}
        />
      ))}
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

      {/* +AI Smart Tagging Button - Icon Only */}
      <ToolbarButton
        size="md"
        onClick={handleSmartAiTags}
        disabled={isGeneratingAiTags}
        title="ИИ классификация: папка и теги (+AI)"
        aria-label="ИИ классификация: папка и теги (+AI)"
        icon={
          isGeneratingAiTags ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-zinc-400" />
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
            icon: <StickyNote className="w-4 h-4 text-white" />,
            title: 'Заметка',
            ariaLabel: 'Заметка',
          },
          {
            value: 'task',
            label: 'Таска',
            showLabelInTrigger: true,
            icon: <CheckSquare className="w-4 h-4 text-white" />,
            title: 'Таска',
            ariaLabel: 'Таска',
          },
          {
            value: 'article',
            label: 'Статья',
            showLabelInTrigger: true,
            icon: <FileText className="w-4 h-4 text-white" />,
            title: 'Статья',
            ariaLabel: 'Статья',
          },
        ]}
        compact={true}
        size="md"
        direction="up"
        ariaLabel="Сменить тип записи"
      />

      {/* Task Controls: Always visible in toolbar, lights up blue when active */}
      {itemType === 'task' && (
        <div className="flex items-center gap-1 shrink-0">
          <div className="h-3.5 w-px bg-white/[0.1] mx-0.5 shrink-0" />
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
        </div>
      )}
    </div>
  );

  const rightControls = (
    <ToolbarButton
      size="md"
      onClick={() => fileInputRef.current?.click()}
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
        className="w-ctrl-md h-ctrl-md rounded-lg flex items-center justify-center transition-all btn-press shrink-0 cursor-pointer touch-none bg-white/[0.08] hover:bg-white/[0.14] active:bg-white/[0.2] text-zinc-200 hover:text-white"
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
      variant={isModal ? 'flat' : 'card'}
      minHeight={24}
      onChange={handleContentChange}
      onSubmit={handleSend}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={
        isModal
          ? itemType === 'task'
            ? 'Название задачи... (@ папка, # тег, Enter)'
            : 'Содержимое записи... (@ папка, # тег, Enter)'
          : isMobile
          ? itemType === 'task'
            ? 'Задача... (@ папка, # тег)'
            : itemType === 'article'
            ? 'Черновик статьи... (@ папка, # тег)'
            : 'Мысль, заметка или задача... (@ папка, # тег)'
          : itemType === 'task'
          ? 'Задача... (@ папка, # тег, - [ ] подзадачи, [[ ссылки)'
          : itemType === 'article'
          ? 'Черновик статьи... (@ папка, # тег, Shift+Enter, [[ ссылки)'
          : 'Мысль, заметка или код... (@ папка, # тег, / команды, [[ ссылки)'
      }
      textareaRef={textareaRef}
      hideTextarea={isRecordingAudio && !content.trim()}
      isSubmitDisabled={!content.trim() && attachments.length === 0}
      submitTitle="Отправить (Enter)"
      topSlot={topSlot}
      topRightSlot={
        !isModal ? (
          <ToolbarButton
            size="sm"
            onClick={handleExpandToFullscreen}
            title="Раскрыть в полноэкранный редактор"
            aria-label="Раскрыть в полноэкранный редактор"
            className="hidden sm:flex text-zinc-500 hover:text-zinc-200"
            icon={<Maximize2 className="w-3.5 h-3.5" />}
          />
        ) : undefined
      }
      propertiesSlot={propertiesSlot}
      overlaySlot={overlaySlot}
      customControls={customControls}
      leftControls={leftControls}
      rightControls={rightControls}
      sendButton={sendButton}
      className={isRecordingAudio ? 'max-w-[420px]' : isModal ? 'w-full' : 'max-w-2xl'}
    />
  );
};
