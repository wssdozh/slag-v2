import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagItemStatus, SlagAttachment, RecurrenceRule } from '../../types';
import { AudioPlayer } from '../UI/AudioPlayer';
import { VideoCirclePlayer } from '../UI/VideoCirclePlayer';
import { processFileListToAttachments } from '../../lib/fileDropHelper';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { formatRecurrenceLabel } from '../../lib/recurrenceHelper';
import { parseSubtasksFromContent, migrateLegacySubtasksToContent } from '../../lib/taskUtils';
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
} from 'lucide-react';
import { Select } from '../UI/Select';

const getTodayIso = (): string => new Date().toISOString().split('T')[0];
const getTomorrowIso = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const formatDueDateLabel = (dateIso: string): string => {
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
    openLightbox
  } = useApp();

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
  const [duration, setDuration] = useState<number | undefined>(item.duration);
  const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(item.recurrence);
  const [isRecurrenceDropdownOpen, setIsRecurrenceDropdownOpen] = useState(false);
  const [attachments, setAttachments] = useState<SlagAttachment[]>(item.attachments || []);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.round(wordCount / 200));

  // Auto-resize textarea to prevent nested scrollbars cutting through content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(450, textareaRef.current.scrollHeight)}px`;
    }
  }, [content]);

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

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd, value } = textarea;
      if (selectionStart !== selectionEnd) return;

      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const lineEnd = value.indexOf('\n', selectionStart);
      const currentLine = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);

      const checkboxMatch = currentLine.match(/^(\s*[-*+]\s*\[[ xX]\]\s*)(.*)$/);
      if (checkboxMatch) {
        e.preventDefault();
        const prefix = checkboxMatch[1];
        const itemText = checkboxMatch[2];

        // Empty checkbox line: pressing Enter clears it (exit checklist)
        if (!itemText.trim()) {
          const nextVal = value.slice(0, lineStart) + value.slice(selectionStart);
          setContent(nextVal);
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          return;
        }

        const indentMatch = prefix.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        const newPrefix = `\n${indent}- [ ] `;

        const nextVal = value.slice(0, selectionStart) + newPrefix + value.slice(selectionStart);
        setContent(nextVal);
        const newCursor = selectionStart + newPrefix.length;
        setTimeout(() => {
          textarea.setSelectionRange(newCursor, newCursor);
        }, 0);
        return;
      }

      const bulletMatch = currentLine.match(/^(\s*[-*+]\s+)(.*)$/);
      if (bulletMatch && !currentLine.includes('[')) {
        e.preventDefault();
        const prefix = bulletMatch[1];
        const itemText = bulletMatch[2];

        if (!itemText.trim()) {
          const nextVal = value.slice(0, lineStart) + value.slice(selectionStart);
          setContent(nextVal);
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          return;
        }

        const nextVal = value.slice(0, selectionStart) + `\n${prefix}` + value.slice(selectionStart);
        setContent(nextVal);
        const newCursor = selectionStart + prefix.length + 1;
        setTimeout(() => {
          textarea.setSelectionRange(newCursor, newCursor);
        }, 0);
        return;
      }
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('fullscreen-textarea') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = content.slice(start, end);
    const rep = `${prefix}${sel || 'текст'}${suffix}`;
    const nextContent = content.slice(0, start) + rep + content.slice(end);
    setContent(nextContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (sel ? sel.length : 5));
    }, 10);
  };

  const insertAttachmentMarkdown = (attName: string) => {
    const textarea = textareaRef.current;
    const link = `![[${attName}]]\n`;
    if (!textarea) {
      setContent(prev => (prev.trim() ? prev + '\n\n' + link : link));
      addToast(`Ссылка ![[${attName}]] добавлена в текст`, 'info');
      return;
    }
    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const next = content.slice(0, start) + link + content.slice(end);
    setContent(next);
    addToast(`Ссылка ![[${attName}]] добавлена в позицию курсора`, 'info');
    setTimeout(() => {
      textarea.focus();
      const pos = start + link.length;
      textarea.setSelectionRange(pos, pos);
    }, 10);
  };

  const handleAttachmentsAdded = (newAtts: SlagAttachment[]) => {
    setAttachments(prev => [...prev, ...newAtts]);
    const textarea = textareaRef.current;
    const links = newAtts.map(a => `![[${a.name}]]`).join('\n') + '\n';
    if (!textarea) {
      setContent(prev => (prev.trim() ? prev + '\n\n' + links : links));
    } else {
      const start = textarea.selectionStart ?? content.length;
      const end = textarea.selectionEnd ?? content.length;
      const next = content.slice(0, start) + links + content.slice(end);
      setContent(next);
      setTimeout(() => {
        textarea.focus();
        const pos = start + links.length;
        textarea.setSelectionRange(pos, pos);
      }, 10);
    }
    addToast(`Добавлено медиа: ${newAtts.length} ${newAtts.length === 1 ? 'файл' : 'файла'}`, 'success');
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
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
  };

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
          <div className="flex items-center gap-2 md:gap-3 text-xs text-zinc-500 ml-auto">
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

          {/* Formatting Shortcut Toolbar */}
          <div className="flex items-center gap-1 py-1.5 border-y border-white/[0.04] text-zinc-400 overflow-x-auto scrollbar-none">
            <button
              onClick={() => insertMarkdown('# ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Заголовок 1"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('## ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Заголовок 2"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('**', '**')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Жирный"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('*', '*')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Курсив"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('- ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Список"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('- [ ] ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Чекбокс"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('> ', '')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Цитата"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('```\n', '\n```')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Блок кода"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertMarkdown('[[', ']]')}
              className="p-1.5 rounded hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Ссылка [[заметка]]"
            >
              <Link2 className="w-4 h-4" />
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

          {/* Task-Specific Metadata Options copied from Composer */}
          {type === 'task' && (
            <div className="flex flex-col gap-2.5 pt-1 pb-3 border-b border-white/[0.06]">
              {/* Task Controls Row copied directly from Composer */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                {/* Hidden Date Input */}
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />

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
                <span className="text-[11px] font-mono text-zinc-500 mr-1">Срок выполнения:</span>
                {dueDate ? (
                  <div className="flex items-center gap-1 h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-xs transition-colors shrink-0">
                    <button
                      type="button"
                      onClick={() => dateInputRef.current?.showPicker?.()}
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
                    onClick={() => dateInputRef.current?.showPicker?.()}
                    className="h-ctrl-md px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                    title="Установить срок задачи"
                  >
                    <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Срок</span>
                  </button>
                )}

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

          {/* Main Markdown Textarea - Auto-resizing font-mono, no double scrollbar */}
          <textarea
            ref={textareaRef}
            id="fullscreen-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onPaste={handlePaste}
            placeholder="Пишите здесь... Поддерживается полный синтаксис Markdown (#, **, -, [ ], таблицы, ссылки)"
            className="w-full bg-transparent font-mono text-[13px] text-[#f4f4f5] placeholder-zinc-600 resize-none leading-relaxed border-none focus:outline-none overflow-hidden"
          />

          {/* Tags Section */}
          <div className="flex flex-wrap items-center gap-1.5 pt-4 border-t border-white/[0.06]">
            <Tag className="w-3.5 h-3.5 text-zinc-500" />
            {tags.map(t => (
              <span
                key={t}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] text-xs font-mono text-zinc-300"
              >
                #{t}
                <button
                  onClick={() => setTags(tags.filter(tag => tag !== t))}
                  className="hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
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
