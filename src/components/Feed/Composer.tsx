import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagAttachment } from '../../types';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { Select } from '../UI/Select';
import { generateSmartTags } from '../../lib/aiService';
import { parseTodoistInput, type ParsedTodoistTask } from '../../lib/todoistTaskParser';
import {
  Send,
  Trash2,
  Paperclip,
  Mic,
  Video,
  Sparkles,
  CheckSquare,
  X,
  Loader2,
  ChevronDown,
  Maximize2,
  CornerUpLeft,
  FileText,
  StickyNote,
  Lock
} from 'lucide-react';

export const Composer: React.FC = () => {
  const {
    saveItem,
    updateItem,
    currentFolder,
    aiSettings,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    replyTarget,
    setReplyTarget,
    items,
    addToast,
    isMobile
  } = useApp();

  const [content, setContent] = useState('');
  const [itemType, setItemType] = useState<SlagItemType>('note');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>('none');
  const [dueDate, setDueDate] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<SlagAttachment[]>([]);
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

  // Todoist parser & Ghost-chips state
  const [parsedTask, setParsedTask] = useState<ParsedTodoistTask | null>(null);
  const [isDateDismissed, setIsDateDismissed] = useState(false);
  const [isPriorityDismissed, setIsPriorityDismissed] = useState(false);
  const [dismissedTags, setDismissedTags] = useState<Set<string>>(new Set());

  // 150ms debounced Todoist parsing when content changes
  useEffect(() => {
    if (!content.trim()) return;

    const timer = setTimeout(() => {
      const parsed = parseTodoistInput(content);
      setParsedTask(parsed);
      if (itemType === 'note' && (parsed.dueDate || (parsed.priority && parsed.priority !== 'none'))) {
        setItemType('task');
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [content, itemType]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Focus textarea when replying
  useEffect(() => {
    if (replyTarget && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTarget]);

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const targetHeight = content.trim() ? Math.min(textareaRef.current.scrollHeight, 220) : 22;
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [content]);

  // WikiLink items matching current query
  const matchingWikiItems = wikiQuery !== null
    ? items
        .filter(i => (i.title || '').toLowerCase().includes(wikiQuery.toLowerCase()))
        .slice(0, 5)
    : [];

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);

    if (!text.trim()) {
      setParsedTask(null);
      setIsDateDismissed(false);
      setIsPriorityDismissed(false);
      setDismissedTags(new Set());
    }

    // Smart type inference: typing checklist switches note to task
    if (itemType === 'note') {
      if (/^\s*(?:-\s*\[[ xX]?\]|\[[ xX]?\])\s+/m.test(text)) {
        setItemType('task');
      }
    }

    const cursorPos = e.target.selectionStart || text.length;
    const textBefore = text.slice(0, cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);
    if (match) {
      setWikiQuery(match[1]);
      setWikiSelectedIndex(0);
    } else {
      setWikiQuery(null);
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
      const suggestedTags = await generateSmartTags(content, aiSettings);
      if (suggestedTags.length > 0) {
        const merged = Array.from(new Set([...tags, ...suggestedTags]));
        setTags(merged);
        addToast(`Теги: ${suggestedTags.map(t => '#' + t).join(' ')}`, 'success');
      } else {
        addToast('ИИ не нашел подходящих тегов', 'info');
      }
    } catch {
      addToast('Ошибка запроса к Gemini', 'error');
    } finally {
      setIsGeneratingAiTags(false);
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const hasDetectedDateOrPriority = Boolean(
    parsedTask && (parsedTask.dueDate || (parsedTask.priority && parsedTask.priority !== 'none'))
  );
  const isGhostActive = itemType === 'task' || hasDetectedDateOrPriority;

  const hasActiveDateChip = Boolean(isGhostActive && parsedTask?.dueDate && !isDateDismissed);
  const hasActivePriorityChip = Boolean(
    isGhostActive && parsedTask?.priority && !isPriorityDismissed
  );
  const activeGhostTags = isGhostActive && parsedTask?.tags
    ? parsedTask.tags.filter(t => !dismissedTags.has(t))
    : [];
  const hasActiveTagChips = activeGhostTags.length > 0;

  const hasAnyActiveGhostChips = hasActiveDateChip || hasActivePriorityChip || hasActiveTagChips;

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

    let title = '';
    const lines = content.trim().split('\n');
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
    const inlineTags = Array.from(content.matchAll(/#([a-zA-Zа-яА-Я0-9_-]+)/g))
      .map(m => m[1])
      .filter(t => !dismissedTags.has(t));
    const finalTags = Array.from(new Set([...tags, ...rawGhostTags, ...inlineTags]));

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
          : undefined)
      : undefined;

    const saved = saveItem({
      type: itemType,
      title,
      content: content.trim(),
      folder: currentFolder,
      tags: finalTags,
      attachments: attachmentsToSend,
      replyToId: replyTarget?.id,
      priority: taskPriority,
      dueDate: taskDueDate,
      reminder: taskReminder,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });

    if (aiSettings.autoTagging && finalTags.length === 0 && content.trim().length >= 15) {
      generateSmartTags(content.trim(), aiSettings).then(autoTags => {
        if (autoTags && autoTags.length > 0) {
          updateItem({ ...saved, tags: autoTags, updatedAt: Date.now() });
        }
      }).catch(() => {
        // quiet fallback
      });
    }

    setContent('');
    setTags([]);
    setAttachments([]);
    setPriority('none');
    setDueDate('');
    setReplyTarget(null);
    setWikiQuery(null);
    setParsedTask(null);
    setIsDateDismissed(false);
    setIsPriorityDismissed(false);
    setDismissedTags(new Set());
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
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
    const lines = content.trim().split('\n');
    const firstLine = lines[0]?.replace(/^#+\s*/, '').trim() || (itemType === 'article' ? 'Новая статья' : 'Черновик');
    const currentParsed = parseTodoistInput(content);

    const taskTitle = itemType === 'task'
      ? (currentParsed.cleanTitle || 'Новая задача')
      : firstLine;

    const rawGhostTags = currentParsed.tags.filter(t => !dismissedTags.has(t));
    const inlineTags = Array.from(content.matchAll(/#([a-zA-Zа-яА-Я0-9_-]+)/g))
      .map(m => m[1])
      .filter(t => !dismissedTags.has(t));
    const finalTags = Array.from(new Set([...tags, ...rawGhostTags, ...inlineTags]));

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
          : undefined)
      : undefined;

    // Create a temporary draft object in memory WITHOUT saving to vault storage yet
    const draftItem: SlagItem = {
      id: 'draft_' + Date.now(),
      type: itemType,
      title: taskTitle,
      content: content.trim(),
      folder: currentFolder,
      tags: finalTags,
      attachments,
      replyToId: replyTarget?.id,
      priority: taskPriority,
      dueDate: taskDueDate,
      reminder: taskReminder,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSelectedItem(draftItem);
    setIsFullscreenEditorOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Dismiss active ghost chips first on Escape
    if (e.key === 'Escape') {
      if (hasAnyActiveGhostChips) {
        e.preventDefault();
        setIsDateDismissed(true);
        setIsPriorityDismissed(true);
        if (parsedTask?.tags) {
          setDismissedTags(new Set(parsedTask.tags));
        }
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isPureAudioRecording = isRecordingAudio && !content.trim() && attachments.length === 0 && !replyTarget;

  if (isPureAudioRecording) {
    return (
      <div className="w-full select-none">
        <div className="rounded-full bg-[#18181c]/95 backdrop-blur-xl border border-white/[0.12] px-3 py-1.5 shadow-2xl shadow-black/50 animate-in fade-in duration-150 flex items-center">
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
      </div>
    );
  }

  return (
    <div className="w-full select-none">
      <div className="rounded-2xl bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.12] p-2.5 flex flex-col gap-1.5 shadow-2xl shadow-black/50">
        {/* Reply Banner */}
        {replyTarget && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate min-w-0">
            <CornerUpLeft className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="text-[11px] font-mono text-zinc-400 shrink-0">
              {replyTarget.type === 'task' ? 'Ответ на таску:' : replyTarget.type === 'article' ? 'Ответ на статью:' : 'Ответ:'}
            </span>
            <span className="truncate text-zinc-200 font-medium text-xs">
              {replyTarget.title || replyTarget.content.slice(0, 45)}
            </span>
          </div>
          <button
            onClick={() => setReplyTarget(null)}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors shrink-0 cursor-pointer"
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

      {/* Active Tags Preview */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 px-1 py-0.5 overflow-x-auto scrollbar-none whitespace-nowrap">
          {tags.map(tag => (
            <span
              key={tag}
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-300 text-[10px] font-mono"
            >
              #{tag}
              <button
                onClick={() => removeTag(tag)}
                className="hover:text-rose-400 transition-colors cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
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

      {/* Interactive Ghost-chips right above the textarea */}
      {hasAnyActiveGhostChips && (
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs overflow-x-auto scrollbar-none whitespace-nowrap animate-in fade-in duration-150">
          {hasActiveDateChip && (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] font-mono">
              <span>📅</span>
              <span>{parsedTask?.rawMatchedDateText || parsedTask?.dueDate}</span>
              <button
                type="button"
                onClick={() => setIsDateDismissed(true)}
                className="ml-0.5 p-0.5 rounded text-blue-400/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Отменить дату для этого черновика"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {hasActivePriorityChip && (
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                parsedTask?.priority === 'high'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  : parsedTask?.priority === 'medium'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  : parsedTask?.priority === 'low'
                  ? 'bg-sky-500/10 border-sky-500/20 text-sky-300'
                  : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-300'
              }`}
            >
              <span>
                {parsedTask?.priority === 'high'
                  ? '🔴'
                  : parsedTask?.priority === 'medium'
                  ? '🟠'
                  : parsedTask?.priority === 'low'
                  ? '🔵'
                  : '⚪'}
              </span>
              <span>
                {parsedTask?.priority === 'high'
                  ? 'p1 (High)'
                  : parsedTask?.priority === 'medium'
                  ? 'p2 (Medium)'
                  : parsedTask?.priority === 'low'
                  ? 'p3 (Low)'
                  : 'p4 (None)'}
              </span>
              <button
                type="button"
                onClick={() => setIsPriorityDismissed(true)}
                className="ml-0.5 p-0.5 rounded hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Отменить приоритет"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {activeGhostTags.map(tag => (
            <span
              key={tag}
              className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-800/80 border border-white/[0.08] text-zinc-300 text-[11px] font-mono"
            >
              <span>🏷</span>
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => setDismissedTags(prev => new Set(prev).add(tag))}
                className="ml-0.5 p-0.5 rounded text-zinc-400 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
                title="Отменить тег"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea Input Container with WikiLink popover - Monolithic, direct on card surface */}
      <div className="relative">
        {wikiQuery !== null && matchingWikiItems.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 w-72 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-30 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
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

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          placeholder={
            isMobile
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
          className="w-full bg-transparent text-base md:text-sm text-[#f4f4f5] placeholder-zinc-500 resize-none overflow-y-auto leading-normal py-0 px-1 outline-none border-none"
          style={{ minHeight: '22px', maxHeight: '220px' }}
        />
      </div>

      {/* Task Extra Controls (Priority & Due Date) */}
      {itemType === 'task' && (
        <div className="flex items-center gap-2 px-1 py-1 text-xs text-zinc-400 border-t border-white/[0.04] overflow-x-auto scrollbar-none whitespace-nowrap">
          <div className="shrink-0 flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">Приоритет:</span>
            <Select
              size="sm"
              variant="ghost"
              direction="up"
              value={priority}
              onChange={(val) => setPriority(val as any)}
              options={[
                { value: 'none', label: 'Обычный' },
                { value: 'low', label: 'Низкий' },
                { value: 'medium', label: 'Средний' },
                { value: 'high', label: 'Высокий' },
              ]}
            />
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">Дедлайн:</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent hover:bg-white/[0.06] rounded px-1.5 py-0.5 text-xs text-zinc-300 outline-none transition-colors"
            />
          </div>
        </div>
      )}

      {/* Bottom Control Bar: Unified MD height (32px desktop / 38px mobile) */}
      {isRecordingAudio ? (
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
      ) : (
        <div className="flex items-center justify-between pt-1 gap-2 relative">
          {/* Lock Hint Banner when holding mic/video button */}
          {lockHint && recordMode === 'holding' && (
            <div className="absolute bottom-full mb-3 right-2 z-50 px-3 py-1.5 rounded-full bg-[#141417] border border-white/10 shadow-2xl flex items-center gap-2 text-[11px] font-mono text-zinc-200 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
              <Lock className="w-3.5 h-3.5 text-[#529ee8] animate-bounce" />
              <span>Потяните вверх для фиксации</span>
            </div>
          )}

          {/* Left Side: +Ai Button, Type Selector, Voice Mic, Video Square, Attach */}
          <div className="flex items-center gap-1 shrink-0">
            {/* +AI Smart Tagging Button - Seamless embedded button */}
            <button
              type="button"
              onClick={handleSmartAiTags}
              disabled={isGeneratingAiTags}
              className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="ИИ авто-тегирование (+AI)"
              aria-label="ИИ авто-тегирование (+AI)"
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
                <div className="absolute left-0 bottom-full mb-1.5 w-36 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in">
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

            {/* Desktop Dedicated Mic & Video Buttons (Hidden on mobile where they merge into Send/Media button) */}
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
                  title="Записать голосовую заметку (кликните или удерживайте)"
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
          </div>

          {/* Right Side: Clear draft, Fullscreen Expand Icon, and Send / Media Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {(content.trim() || attachments.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setContent('');
                  setAttachments([]);
                  setTags([]);
                  setPriority('none');
                  setDueDate('');
                  setParsedTask(null);
                  setIsDateDismissed(false);
                  setIsPriorityDismissed(false);
                  setDismissedTags(new Set());
                }}
                className="w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors cursor-pointer"
                title="Очистить"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Expand to Fullscreen Editor Icon Button */}
            <button
              type="button"
              onClick={handleExpandToFullscreen}
              className="w-ctrl-md h-ctrl-md rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Раскрыть в полноэкранный редактор"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Send or Mobile Media Record Button */}
            {isMobile && !content.trim() && attachments.length === 0 ? (
              <button
                type="button"
                onPointerDown={handleMobileMediaPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                className="w-ctrl-md h-ctrl-md rounded-full flex items-center justify-center transition-all btn-press shrink-0 cursor-pointer touch-none bg-white/[0.08] hover:bg-white/[0.14] active:bg-white/[0.2] text-zinc-200 hover:text-white"
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
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!content.trim() && attachments.length === 0}
                className={`w-ctrl-md h-ctrl-md rounded-full flex items-center justify-center transition-all btn-press shrink-0 ${
                  content.trim() || attachments.length > 0
                    ? 'bg-white text-black hover:bg-zinc-200 active:scale-95 shadow-md cursor-pointer'
                    : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
                }`}
                title="Отправить (Enter)"
              >
                <Send className="w-4 h-4 ml-0.5 fill-current" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
  );
};
