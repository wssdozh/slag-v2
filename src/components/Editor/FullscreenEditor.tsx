import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment, RecurrenceRule } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { formatRecurrenceLabel, RECURRENCE_PRESETS } from '../../lib/recurrenceHelper';
import { parseSubtasksFromContent, migrateLegacySubtasksToContent } from '../../lib/taskUtils';
import { AtomicCodeMirrorEditor, type AtomicCodeMirrorEditorHandle } from '@atomic-editor/editor';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import {
  ArrowLeft,
  Save,
  Trash2,
  CheckCircle2,
  Circle,
  X,
  Tag,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  CheckSquare,
  Code,
  Quote,
  Link2,
  Paperclip,
  UploadCloud,
  ArrowUp,
  ArrowDown,
  Clock,
  Check,
  Calendar,
  Repeat,
  Undo2,
  Redo2,
  Sparkles,
  Table,
  Send,
} from 'lucide-react';
import { Select } from '../UI/Select';
import { TagChip } from '../UI/TagChip';
import { DatePickerPopover } from '../UI/DatePickerPopover';
import { formatDueDateLabel } from '../../lib/dateUtils';
import { decomposeItemWithAi, generateSmartTags } from '../../lib/aiService';

let activeEditorView: EditorView | null = null;

const editorExtensions = [
  ViewPlugin.define((view) => {
    console.log('[DEBUG] ViewPlugin MOUNTED');
    activeEditorView = view;
    return {
      destroy() {
        console.log('[DEBUG] ViewPlugin DESTROYED');
        if (activeEditorView === view) {
          activeEditorView = null;
        }
      },
    };
  }),
];

interface FullscreenEditorContentProps {
  item: SlagItem;
}

const FullscreenEditorContent: React.FC<FullscreenEditorContentProps> = ({ item }) => {
  const {
    setIsFullscreenEditorOpen,
    saveItem,
    updateItem,
    deleteItem,
    setSelectedItem,
    folders,
    addToast,
    openLightbox,
    aiSettings,
  } = useApp();

  const [activeMobilePopover, setActiveMobilePopover] = useState<'formatting' | 'lists' | 'ai' | null>(null);

  const [title, setTitle] = useState(item.title || '');
  const [content, setContent] = useState(() =>
    item.type === 'task'
      ? migrateLegacySubtasksToContent(item.content || '', item.subtasks)
      : item.content || ''
  );
  const [type, setType] = useState<SlagItemType>(item.type || 'article');
  const [folder, setFolder] = useState(item.folder || 'Входящие');
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high'>(item.priority || 'none');
  const [status, setStatus] = useState<SlagItemStatus>(item.status || 'todo');
  const [dueDate, setDueDate] = useState(item.dueDate || '');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [duration, setDuration] = useState<number | undefined>(item.duration);
  const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(item.recurrence);
  const [isRecurrenceDropdownOpen, setIsRecurrenceDropdownOpen] = useState(false);
  const [attachments, setAttachments] = useState<SlagAttachment[]>(item.attachments || []);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const editorHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  const getEditorView = useCallback((): EditorView | null => activeEditorView, []);

  useEffect(() => {
    (window as any).__slagGetEditorMarkdown = () => editorHandleRef.current?.getMarkdown() ?? '';
    return () => {
      activeEditorView = null;
      delete (window as any).__slagGetEditorMarkdown;
    };
  }, []);

  const handleSave = useCallback(() => {
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

    if (isNewDraft) {
      saveItem(updated);
      addToast('Запись создана и сохранена', 'success');
    } else {
      updateItem(updated);
      addToast('Изменения сохранены', 'success');
    }
    setIsFullscreenEditorOpen(false);
    setSelectedItem(null);
  }, [item, title, content, type, folder, tags, attachments, status, priority, dueDate, duration, recurrence, readTime, saveItem, updateItem, addToast, setIsFullscreenEditorOpen, setSelectedItem]);

  const handleClose = useCallback(() => {
    // Pure back / cancel: DO NOT save or publish note to feed
    setIsFullscreenEditorOpen(false);
    setSelectedItem(null);
  }, [setIsFullscreenEditorOpen, setSelectedItem]);

  const handleUndo = useCallback(() => {
    const view = getEditorView();
    if (view) undo(view);
  }, [getEditorView]);

  const handleRedo = useCallback(() => {
    const view = getEditorView();
    if (view) redo(view);
  }, [getEditorView]);

  // Keyboard shortcuts: Esc = Cancel / Back, Ctrl/Cmd+S = Save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleSave]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const cleaned = newTagInput.trim().replace(/^#/, '');
      if (!tags.includes(cleaned)) {
        setTags([...tags, cleaned]);
      }
      setNewTagInput('');
    }
  };

  const insertMarkdown = useCallback((prefix: string, suffix: string = '') => {
    const view = getEditorView();
    if (!view) {
      setContent(prev => prev + prefix + suffix);
      return;
    }
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const replacement = `${prefix}${selectedText || 'текст'}${suffix}`;
    const insertPos = selection.from + prefix.length;
    const endPos = insertPos + (selectedText ? selectedText.length : 5);

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: replacement },
      selection: { anchor: insertPos, head: endPos },
    });
    view.focus();
  }, [getEditorView]);

  const handleInsertTable = useCallback(() => {
    insertMarkdown('\n| Колонка 1 | Колонка 2 |\n|---|---|\n| Запись 1 | Запись 2 |\n', '');
  }, [insertMarkdown]);

  const handleAiDecomposeInline = useCallback(async () => {
    addToast('ИИ разбирает запись на шаги...', 'info');
    try {
      const res = await decomposeItemWithAi(
        { ...item, title, content, type, tags, folder, attachments },
        aiSettings
      );
      if (res.subtasks && res.subtasks.length > 0) {
        const subtasksMd = '\n' + res.subtasks.map(s => `- [ ] ${s.title}`).join('\n') + '\n';
        insertMarkdown(subtasksMd, '');
        if (res.tags && res.tags.length > 0) {
          setTags(prev => Array.from(new Set([...prev, ...(res.tags || [])])));
        }
        addToast(`Добавлено ${res.subtasks.length} подзадач`, 'success');
      }
    } catch {
      addToast('Не удалось разобрать запись через ИИ', 'error');
    }
  }, [item, title, content, type, tags, folder, attachments, aiSettings, insertMarkdown, addToast]);

  const handleAiTagsInline = useCallback(async () => {
    addToast('Подбор тегов...', 'info');
    try {
      const newTags = await generateSmartTags(content || title, aiSettings);
      if (newTags.length > 0) {
        setTags(prev => Array.from(new Set([...prev, ...newTags])));
        addToast(`Добавлены теги: #${newTags.join(' #')}`, 'success');
      } else {
        addToast('Новых подходящих тегов не найдено', 'info');
      }
    } catch {
      addToast('Ошибка генерации тегов', 'error');
    }
  }, [content, title, aiSettings, addToast]);

  const insertAttachmentMarkdown = useCallback((attName: string) => {
    const link = `![[${attName}]]\n`;
    const view = getEditorView();
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: link },
        selection: { anchor: pos + link.length },
      });
      view.focus();
      addToast(`Ссылка ![[${attName}]] добавлена в позицию курсора`, 'info');
    } else {
      setContent(prev => (prev.trim() ? prev + '\n\n' + link : link));
      addToast(`Ссылка ![[${attName}]] добавлена в текст`, 'info');
    }
  }, [getEditorView, addToast]);

  const handleAttachmentsAdded = useCallback((newAtts: SlagAttachment[]) => {
    setAttachments(prev => [...prev, ...newAtts]);
    const links = newAtts.map(a => `![[${a.name}]]`).join('\n') + '\n';
    const view = getEditorView();
    console.log('[DEBUG] handleAttachmentsAdded called, view is:', Boolean(view), 'links:', links);
    if (view) {
      const pos = view.state.selection.main.head;
      console.log('[DEBUG] pos is', pos, 'doc length is', view.state.doc.length);
      view.dispatch({
        changes: { from: pos, insert: links },
        selection: { anchor: pos + links.length },
      });
      console.log('[DEBUG] doc after dispatch is:', view.state.doc.toString());
      view.focus();
    } else {
      setContent(prev => (prev.trim() ? prev + '\n\n' + links : links));
    }
    addToast(`Добавлено медиа: ${newAtts.length} ${newAtts.length === 1 ? 'файл' : 'файла'}`, 'success');
  }, [getEditorView, addToast]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files: File[] = [];
    if (e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const it = e.clipboardData.items[i];
        if (it.kind === 'file') {
          const file = it.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      try {
        const processed = await processFileListToAttachments(files);
        if (processed.length > 0) {
          handleAttachmentsAdded(processed);
        }
      } catch {
        addToast('Не удалось вставить медиа из буфера', 'error');
      }
    }
  }, [handleAttachmentsAdded, addToast]);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        try {
          const processed = await processFileListToAttachments(e.dataTransfer.files);
          if (processed.length > 0) {
            handleAttachmentsAdded(processed);
          }
        } catch {
          addToast('Не удалось обработать файлы', 'error');
        }
      }
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        const processed = await processFileListToAttachments(e.target.files);
        if (processed.length > 0) {
          handleAttachmentsAdded(processed);
        }
      } catch {
        addToast('Ошибка при чтении файлов', 'error');
      }
      e.target.value = '';
    }
  };

  const moveAttachment = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= attachments.length) return;
    const next = [...attachments];
    const it = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = it;
    setAttachments(next);
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 z-50 z-[100] bg-[#09090b] flex flex-col animate-in fade-in duration-150 text-[#f4f4f5]"
    >
      {/* Hidden File Picker Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-4 z-[120] rounded-3xl bg-[#09090b]/92 backdrop-blur-md border-2 border-dashed border-[#2a82e4] flex flex-col items-center justify-center gap-3 pointer-events-none select-none animate-in fade-in duration-100">
          <UploadCloud className="w-12 h-12 text-[#529ee8] animate-bounce" />
          <span className="text-base font-semibold text-white">
            Перетащите медиафайлы сюда
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            Войсы, видео, изображения или документы прикрепятся к заметке
          </span>
        </div>
      )}
      {/* Top Floating Control Bar - Centered to match content width */}
      <header
        className="min-h-14 border-b border-white/[0.06] bg-[#0c0c0e] shrink-0"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="max-w-4xl mx-auto w-full h-full flex flex-wrap md:flex-nowrap items-center justify-between px-4 md:px-6 py-2 md:py-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>

            <span className="text-zinc-600 hidden md:inline">/</span>

            {/* Folder Selector */}
            <Select
              size="sm"
              value={folder}
              onChange={setFolder}
              options={folders.map(f => ({ value: f.path, label: f.name }))}
              className="max-w-[150px] md:max-w-[200px]"
            />

            {/* Item Type Switcher */}
            <div className="flex items-center gap-0.5">
              {(['note', 'task', 'article'] as SlagItemType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-2 md:px-2.5 py-1 rounded-md text-[11px] capitalize transition-colors cursor-pointer ${
                    type === t ? 'bg-white/10 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                  }`}
                >
                  {t === 'note' ? 'Заметка' : t === 'task' ? 'Таска' : 'Статья'}
                </button>
              ))}
            </div>
          </div>

          {/* Stats & Actions */}
          <div className="flex items-center gap-1.5 md:gap-3 text-xs text-zinc-500 ml-auto">
            {/* Undo / Redo in header */}
            <div className="flex items-center gap-0.5 border-r border-white/[0.08] pr-1.5 mr-0.5">
              <button
                type="button"
                onClick={handleUndo}
                className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                title="Отменить (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                title="Повторить (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px]">
              <span>{wordCount} слов</span>
              <span>•</span>
              <span>~{readTime} мин</span>
            </div>

            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm shadow-blue-500/20 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Сохранить</span>
            </button>

            <button
              onClick={() => {
                deleteItem(item.id);
                setIsFullscreenEditorOpen(false);
                setSelectedItem(null);
              }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Удалить запись"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto py-4 md:py-8">
        <div className="max-w-4xl mx-auto w-full px-4 md:px-6 flex flex-col gap-5 md:gap-6">
          {/* Title Input with optional task completion toggle */}
          <div className="flex items-center gap-3">
            {type === 'task' && (
              <button
                type="button"
                onClick={() => setStatus((prev: SlagItemStatus) => (prev === 'done' ? 'todo' : 'done'))}
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                  status === 'done'
                    ? 'border border-emerald-500 bg-emerald-500/20 text-emerald-400'
                    : 'border border-zinc-600 hover:border-blue-400 text-transparent hover:text-blue-400'
                }`}
                title={status === 'done' ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </button>
            )}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заголовок..."
              className={`w-full bg-transparent text-xl md:text-2xl font-semibold tracking-tight placeholder-zinc-600 border-none px-0 outline-none ${
                type === 'task' && status === 'done' ? 'text-zinc-500 line-through' : 'text-white'
              }`}
            />
          </div>

          {/* Task-Specific Metadata Options: ALWAYS AT THE TOP */}
          {type === 'task' && (
            <div className="flex flex-col gap-2.5 pb-2 border-b border-white/[0.06]">
              {/* Task Controls Row */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                {/* Status Selector */}
                <div className="flex items-center shrink-0">
                  <Select
                    size="sm"
                    variant="ghost"
                    direction="down"
                    value={status}
                    onChange={(val) => setStatus(val as SlagItemStatus)}
                    options={[
                      {
                        value: 'backlog',
                        label: 'Бэклог',
                        icon: <Circle className="w-3.5 h-3.5 text-zinc-500" />,
                        color: 'text-zinc-500',
                      },
                      {
                        value: 'todo',
                        label: 'К выполнению',
                        icon: <Circle className="w-3.5 h-3.5 text-zinc-400" />,
                        color: 'text-zinc-400',
                      },
                      {
                        value: 'in_progress',
                        label: 'В работе',
                        icon: <Clock className="w-3.5 h-3.5 text-blue-400" />,
                        color: 'text-blue-400',
                      },
                      {
                        value: 'done',
                        label: 'Выполнено',
                        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
                        color: 'text-emerald-400',
                      },
                    ]}
                  />
                </div>

                {/* Due Date Trigger */}
                <span className="text-[11px] font-mono text-zinc-500 mr-1 hidden sm:inline">Срок выполнения:</span>
                <div className="relative shrink-0">
                  {dueDate ? (
                    <div className="flex items-center gap-1 h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-xs transition-colors shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsDatePickerOpen(prev => !prev)}
                        className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                        title="Изменить срок"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-medium max-w-[85px] truncate">{formatDueDateLabel(dueDate)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDueDate('')}
                        className="p-0.5 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Снять срок"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(prev => !prev)}
                      className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                      title="Установить срок задачи"
                    >
                      <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>Срок</span>
                    </button>
                  )}

                  {isDatePickerOpen && (
                    <DatePickerPopover
                      value={dueDate}
                      onChange={(newDate) => {
                        setDueDate(newDate);
                        setIsDatePickerOpen(false);
                      }}
                      onClear={() => {
                        setDueDate('');
                        setIsDatePickerOpen(false);
                      }}
                      onClose={() => setIsDatePickerOpen(false)}
                      direction="down"
                    />
                  )}
                </div>

                {/* Duration Selector */}
                <div className="relative shrink-0">
                  {duration !== undefined ? (
                    <div className="flex items-center gap-1 h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-xs transition-colors shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
                        className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                        title="Изменить длительность"
                      >
                        <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-medium max-w-[70px] truncate">
                          {duration >= 60
                            ? `${Math.floor(duration / 60)}ч${duration % 60 ? ` ${duration % 60}м` : ''}`
                            : `${duration}м`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDuration(undefined)}
                        className="p-0.5 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Снять длительность"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
                      className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                      title="Установить длительность задачи"
                    >
                      <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>Длительность</span>
                    </button>
                  )}

                  {isDurationDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-32 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
                      {[15, 30, 45, 60, 90, 120].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            setDuration(mins);
                            setIsDurationDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                            duration === mins ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span>{mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recurrence Selector */}
                <div className="relative shrink-0">
                  {recurrence ? (
                    <div className="flex items-center gap-1 h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-xs transition-colors shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsRecurrenceDropdownOpen(!isRecurrenceDropdownOpen)}
                        className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                        title="Изменить повторение"
                      >
                        <Repeat className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="font-medium max-w-[85px] truncate">
                          {formatRecurrenceLabel(recurrence)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecurrence(undefined)}
                        className="p-0.5 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Снять повторение"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsRecurrenceDropdownOpen(!isRecurrenceDropdownOpen)}
                      className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                      title="Повторяющаяся задача"
                    >
                      <Repeat className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>Повтор</span>
                    </button>
                  )}

                  {isRecurrenceDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-44 rounded-xl bg-[#141417] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in pointer-events-auto">
                      {RECURRENCE_PRESETS.map(opt => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            setRecurrence(opt.rule);
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

                {/* Priority Selector */}
                <div className="flex items-center shrink-0">
                  <Select
                    size="sm"
                    variant="ghost"
                    direction="down"
                    value={priority}
                    onChange={(val) => setPriority(val as any)}
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
              </div>
            </div>
          )}

          {/* Desktop Sticky Shortcut Toolbar (PINS TO TOP ON SCROLL) */}
          <div className="hidden md:flex sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 border-y border-white/[0.08] bg-[#09090b]/95 backdrop-blur-md text-zinc-300 items-center justify-between gap-1 overflow-x-auto scrollbar-none shadow-sm">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Отменить (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Повторить (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-white/[0.1] mx-1" />
              <button
                type="button"
                onClick={() => insertMarkdown('# ', '')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Заголовок 1"
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('## ', '')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Заголовок 2"
              >
                <Heading2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('**', '**')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Жирный"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('*', '*')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Курсив"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('- ', '')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Список"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('- [ ] ', '')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Чекбокс"
              >
                <CheckSquare className="w-4 h-4 text-emerald-400" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('> ', '')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Цитата"
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('```\n', '\n```')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Блок кода"
              >
                <Code className="w-4 h-4 text-blue-400" />
              </button>
              <button
                type="button"
                onClick={handleInsertTable}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Вставить таблицу"
              >
                <Table className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('[[', ']]')}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Ссылка [[заметка]]"
              >
                <Link2 className="w-4 h-4 text-purple-400" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1"
                title="Прикрепить файл или медиа"
              >
                <Paperclip className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleAiDecomposeInline}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-medium transition-colors cursor-pointer"
                title="Декомпозировать на шаги через ИИ"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Разобрать ИИ</span>
              </button>
            </div>
          </div>

          {/* Media Attachments Section in Fullscreen Editor */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-medium flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Медиа и вложения ({attachments.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  + Добавить еще
                </button>
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                {attachments.map((att, idx) => (
                  <div
                    key={att.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-2.5 rounded-lg bg-black/40 border border-white/[0.06]"
                  >
                    {/* Media Rendering */}
                    <div className="flex-1 min-w-0">
                      {att.type === 'audio' ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-zinc-400 font-medium">
                              🎙 Войс:
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">
                              {att.name}
                            </span>
                          </div>
                          <AudioPlayer
                            src={att.dataUrl || ''}
                            duration={att.duration}
                            waveform={att.waveform}
                            size={att.size}
                            extractedText={att.extractedText}
                            enrichmentStatus={att.enrichmentStatus}
                          />
                        </div>
                      ) : att.type === 'video' ? (
                        <div className="flex items-center gap-3">
                          <VideoCirclePlayer src={att.dataUrl || ''} compact={true} />
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs font-mono text-zinc-300 font-medium truncate">
                              {att.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Видео-кружок {att.duration ? `• ${att.duration} сек` : ''}
                            </span>
                          </div>
                        </div>
                      ) : att.type === 'image' ? (
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => {
                              if (att.dataUrl) {
                                openLightbox([{
                                  id: att.id,
                                  name: att.name,
                                  url: att.dataUrl,
                                  extractedText: att.extractedText,
                                  summary: att.summary,
                                  enrichmentStatus: att.enrichmentStatus,
                                  enrichmentError: att.enrichmentError,
                                  itemId: item.id,
                                }], 0);
                              }
                            }}
                            className="w-14 h-14 rounded-lg overflow-hidden bg-black/60 border border-white/10 shrink-0 cursor-pointer hover:opacity-90"
                          >
                            <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs font-mono text-zinc-300 font-medium truncate">
                              {att.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {Math.round(att.size / 1024)} KB
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Paperclip className="w-4 h-4 text-zinc-400 shrink-0" />
                          <span className="text-xs font-mono text-zinc-300 truncate">{att.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {Math.round(att.size / 1024)} KB
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions: Insert into text, Move up/down, Delete */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => insertAttachmentMarkdown(att.name)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white text-[11px] font-mono transition-colors cursor-pointer"
                        title="Вставить ссылку ![[файл]] в позицию курсора markdown для структурирования заметки"
                      >
                        <Link2 className="w-3 h-3 text-[#529ee8]" />
                        <span>Вставить в текст</span>
                      </button>

                      {/* Reorder Up */}
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveAttachment(idx, 'up')}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Переместить выше"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Reorder Down */}
                      <button
                        type="button"
                        disabled={idx === attachments.length - 1}
                        onClick={() => moveAttachment(idx, 'down')}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title="Переместить ниже"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Markdown Editor with Obsidian-style Live Preview */}
          <div
            id="fullscreen-editor-root"
            onPaste={handlePaste}
            className="w-full relative min-h-[420px]"
          >
            <AtomicCodeMirrorEditor
              documentId={item.id}
              markdownSource={content}
              onMarkdownChange={setContent}
              editorHandleRef={editorHandleRef}
              extensions={editorExtensions}
            />
          </div>

          {/* Tags Section */}
          <div className="flex flex-wrap items-center gap-1.5 pt-4 border-t border-white/[0.06]">
            <Tag className="w-3.5 h-3.5 text-zinc-500" />
            {tags.map(t => (
              <TagChip
                key={t}
                tag={t}
                variant="pill"
                onRemove={() => setTags(tags.filter(tag => tag !== t))}
              />
            ))}
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="+ тег (Enter)"
              className="bg-transparent text-xs font-mono text-white placeholder-zinc-600 w-28 px-1 outline-none"
            />
          </div>

          {/* Bottom spacer on mobile so last lines clear the bottom bar */}
          <div className="h-24 md:hidden shrink-0" aria-hidden="true" />
        </div>
      </div>

      {/* Mobile Telegram-Style Floating Bottom Toolbar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 select-none pointer-events-auto">
        {/* Invisible Backdrop to dismiss active popover */}
        {activeMobilePopover && (
          <div
            className="fixed inset-0 z-35 bg-black/20"
            onClick={() => setActiveMobilePopover(null)}
          />
        )}

        {/* Floating Popovers */}
        {activeMobilePopover === 'formatting' && (
          <div className="relative z-40 px-3 pb-2">
            <div className="max-w-xs mx-auto rounded-2xl bg-[#18181c] border border-white/[0.1] shadow-2xl p-1.5 flex flex-col gap-0.5 animate-in slide-in-from-bottom-2 duration-150">
              <div className="px-3 py-1 text-xs text-zinc-400 font-medium border-b border-white/[0.06] mb-0.5 flex items-center justify-between">
                <span>Стили текста</span>
                <span className="font-mono text-[10px] text-zinc-500">Aa</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('# ', '');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Heading1 className="w-4 h-4 text-zinc-400" />
                <span>Заголовок 1</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('## ', '');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Heading2 className="w-4 h-4 text-zinc-400" />
                <span>Заголовок 2</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('**', '**');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left font-bold"
              >
                <Bold className="w-4 h-4 text-zinc-400" />
                <span>Жирный</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('*', '*');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left italic"
              >
                <Italic className="w-4 h-4 text-zinc-400" />
                <span>Курсив</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('~~', '~~');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left line-through"
              >
                <span className="font-mono text-xs text-zinc-400">S</span>
                <span>Зачёркнутый</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('`', '`');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left font-mono"
              >
                <Code className="w-4 h-4 text-blue-400" />
                <span>Моноширинный</span>
              </button>
            </div>
          </div>
        )}

        {activeMobilePopover === 'lists' && (
          <div className="relative z-40 px-3 pb-2">
            <div className="max-w-xs mx-auto rounded-2xl bg-[#18181c] border border-white/[0.1] shadow-2xl p-1.5 flex flex-col gap-0.5 animate-in slide-in-from-bottom-2 duration-150">
              <div className="px-3 py-1 text-xs text-zinc-400 font-medium border-b border-white/[0.06] mb-0.5 flex items-center justify-between">
                <span>Списки и блоки</span>
                <span className="font-mono text-[10px] text-zinc-500">:=</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('- ', '');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <List className="w-4 h-4 text-zinc-400" />
                <span>Список с маркерами</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('1. ', '');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <span className="font-mono text-xs text-zinc-400 font-bold">1=</span>
                <span>Список с номерами</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('- [ ] ', '');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                <span>Чек-лист</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('> ', '');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Quote className="w-4 h-4 text-zinc-400" />
                <span>Цитата</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('```\n', '\n```');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Code className="w-4 h-4 text-blue-400" />
                <span>Блок кода</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertMarkdown('[[', ']]');
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Link2 className="w-4 h-4 text-purple-400" />
                <span>Ссылка [[заметка]]</span>
              </button>
            </div>
          </div>
        )}

        {activeMobilePopover === 'ai' && (
          <div className="relative z-40 px-3 pb-2">
            <div className="max-w-xs mx-auto rounded-2xl bg-[#18181c] border border-white/[0.1] shadow-2xl p-1.5 flex flex-col gap-0.5 animate-in slide-in-from-bottom-2 duration-150">
              <div className="px-3 py-1 text-xs text-zinc-400 font-medium border-b border-white/[0.06] mb-0.5 flex items-center justify-between">
                <span>ИИ-Помощник</span>
                <span className="font-mono text-[10px] text-purple-400">AI</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleAiDecomposeInline();
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-purple-300 hover:bg-purple-500/10 active:scale-98 transition-all text-left"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Разобрать на подзадачи</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAiTagsInline();
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Tag className="w-4 h-4 text-zinc-400" />
                <span>Подобрать теги</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Bar Container */}
        <div
          className="relative z-40 bg-[#0c0c0e]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 py-2 flex items-center justify-between"
          style={{ paddingBottom: 'max(var(--sab), 0.5rem)' }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* AI Button */}
            <button
              type="button"
              onClick={() => setActiveMobilePopover(prev => (prev === 'ai' ? null : 'ai'))}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                activeMobilePopover === 'ai'
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="ИИ-инструменты"
            >
              <div className="flex items-center gap-0.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold">Ai</span>
              </div>
            </button>

            {/* Aa Text Styles Button */}
            <button
              type="button"
              onClick={() => setActiveMobilePopover(prev => (prev === 'formatting' ? null : 'formatting'))}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                activeMobilePopover === 'formatting'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="Форматирование текста"
            >
              <span className="font-semibold text-sm leading-none px-0.5">Aa</span>
            </button>

            {/* Lists Button */}
            <button
              type="button"
              onClick={() => setActiveMobilePopover(prev => (prev === 'lists' ? null : 'lists'))}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                activeMobilePopover === 'lists'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="Списки и чек-листы"
            >
              <List className="w-4 h-4" />
            </button>

            {/* Table Button */}
            <button
              type="button"
              onClick={handleInsertTable}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Вставить таблицу"
            >
              <Table className="w-4 h-4" />
            </button>

            {/* Attachments (Paperclip) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Прикрепить файл"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          {/* Telegram-style Circular Send / Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className="w-10 h-10 rounded-full bg-[#2a82e4] hover:bg-[#2474cd] text-white flex items-center justify-center shadow-lg shadow-blue-500/25 active:scale-90 transition-all cursor-pointer shrink-0 ml-2"
            title="Сохранить и закрыть (Ctrl+S)"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullscreenEditor: React.FC = () => {
  const { isFullscreenEditorOpen, selectedItem } = useApp();

  if (!isFullscreenEditorOpen || !selectedItem) return null;

  return <FullscreenEditorContent key={selectedItem.id} item={selectedItem} />;
};
