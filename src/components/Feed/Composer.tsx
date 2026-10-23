import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagAttachment } from '../../types';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
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
  StickyNote
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
    addToast
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

  const handleSend = () => {
    if (!content.trim() && attachments.length === 0) return;

    // Parse Todoist input synchronously for immediate state accuracy
    const currentParsed = parseTodoistInput(content);

    let title = '';
    const lines = content.trim().split('\n');
    const firstLine = lines[0].replace(/^#+\s*/, '').trim();

    if (itemType === 'article') {
      title = firstLine || 'Новая статья';
    } else if (itemType === 'task') {
      title = currentParsed.cleanTitle || 'Новая задача';
    } else {
      title = firstLine.slice(0, 50) || 'Заметка';
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
      attachments,
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
        <div className="flex flex-wrap gap-2 px-1 py-1">
          {attachments.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-2 p-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 relative group"
            >
              {att.type === 'image' && (
                <img src={att.dataUrl} alt={att.name} className="w-8 h-8 object-cover rounded-md" />
              )}
              {att.type === 'video' && (
                <span className="text-[10px] font-mono text-zinc-400">⏹ Видео-квадратик</span>
              )}
              {att.type === 'audio' && (
                <span className="text-[10px] font-mono text-zinc-400">🎙 Войс</span>
              )}
              {att.type === 'file' && (
                <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[100px]">{att.name}</span>
              )}
              <button
                onClick={() => removeAttachment(att.id)}
                className="p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Tags Preview */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-300 text-[10px] font-mono"
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

      {/* Media Recorders Active Banners */}
      {isRecordingAudio && (
        <AudioRecorder
          onRecorded={(att) => {
            setAttachments(prev => [...prev, att]);
            setIsRecordingAudio(false);
          }}
          onCancel={() => setIsRecordingAudio(false)}
        />
      )}

      {isRecordingVideo && (
        <VideoRecorder
          onRecorded={(att) => {
            setAttachments(prev => [...prev, att]);
            setIsRecordingVideo(false);
          }}
          onCancel={() => setIsRecordingVideo(false)}
        />
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
        <div className="flex flex-wrap items-center gap-1.5 px-1 py-1 text-xs animate-in fade-in duration-150">
          {hasActiveDateChip && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] font-mono">
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
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
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
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-800/80 border border-white/[0.08] text-zinc-300 text-[11px] font-mono"
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
          rows={1}
          placeholder={
            itemType === 'task'
              ? 'Задача... (- [ ] для подзадач, [[ для ссылки)'
              : itemType === 'article'
              ? 'Черновик статьи... (Shift+Enter для новой строки, [[ для ссылки)'
              : 'Мысль, заметка или код... (Enter для отправки, [[ для ссылки)'
          }
          className="w-full bg-transparent text-sm text-[#f4f4f5] placeholder-zinc-500 resize-none overflow-y-auto leading-normal py-0 px-1 outline-none border-none"
          style={{ minHeight: '22px', maxHeight: '220px' }}
        />
      </div>

      {/* Task Extra Controls (Priority & Due Date) */}
      {itemType === 'task' && (
        <div className="flex items-center gap-3 px-1 py-1 text-xs text-zinc-400 border-t border-white/[0.04]">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Приоритет:</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="bg-black/40 border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-zinc-300"
            >
              <option value="none">Обычный</option>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Дедлайн:</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-black/40 border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-zinc-300"
            />
          </div>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-between pt-0.5">
        {/* Left Side: +Ai Button, Type Selector, Voice Mic, Video Square, Attach */}
        <div className="flex items-center gap-2">
          {/* +Ai Smart Tagging Button */}
          <button
            onClick={handleSmartAiTags}
            disabled={isGeneratingAiTags}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 text-xs font-medium transition-colors border border-white/[0.05] cursor-pointer"
            title="ИИ тегирование"
          >
            {isGeneratingAiTags ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            )}
            <span>+Ai</span>
          </button>

          {/* Type Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06] text-xs text-zinc-300 transition-colors cursor-pointer"
            >
              <span>
                {itemType === 'note' ? 'Заметка' : itemType === 'task' ? 'Таска' : 'Статья'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {isTypeDropdownOpen && (
              <div className="absolute left-0 bottom-full mb-1 w-32 rounded-xl bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-30 text-xs flex flex-col gap-0.5 animate-in fade-in">
                <button
                  onClick={() => {
                    setItemType('note');
                    setIsTypeDropdownOpen(false);
                  }}
                  className={`text-left px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                    itemType === 'note' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  Заметка
                </button>
                <button
                  onClick={() => {
                    setItemType('task');
                    setIsTypeDropdownOpen(false);
                  }}
                  className={`text-left px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                    itemType === 'task' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  Таска
                </button>
                <button
                  onClick={() => {
                    setItemType('article');
                    setIsTypeDropdownOpen(false);
                  }}
                  className={`text-left px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                    itemType === 'article' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  Статья
                </button>
              </div>
            )}
          </div>

          {/* Voice Mic Button */}
          <button
            onClick={() => {
              setIsRecordingVideo(false);
              setIsRecordingAudio(!isRecordingAudio);
            }}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isRecordingAudio
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Записать голосовую заметку (войс)"
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Video Square Camera Button */}
          <button
            onClick={() => {
              setIsRecordingAudio(false);
              setIsRecordingVideo(!isRecordingVideo);
            }}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isRecordingVideo
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Записать видео-квадратик"
          >
            <Video className="w-4 h-4" />
          </button>

          {/* File Attach Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Прикрепить файл"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>

        {/* Right Side: Clear draft, Fullscreen Expand Icon, and Send Button */}
        <div className="flex items-center gap-1.5">
          {(content.trim() || attachments.length > 0) && (
            <button
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
              className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors cursor-pointer"
              title="Очистить"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Expand to Fullscreen Editor Icon Button */}
          <button
            onClick={handleExpandToFullscreen}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Раскрыть в полноэкранный редактор"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Telegram-style Circular Send Button */}
          <button
            onClick={handleSend}
            disabled={!content.trim() && attachments.length === 0}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all btn-press ${
              content.trim() || attachments.length > 0
                ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb] shadow-lg shadow-blue-500/20 cursor-pointer'
                : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
            }`}
            title="Отправить (Enter)"
          >
            <Send className="w-4 h-4 ml-0.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};
