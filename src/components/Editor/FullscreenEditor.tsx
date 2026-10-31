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
  Maximize2,
  Minimize2,
  Eye,
  ChevronDown,
  ChevronRight,
  Strikethrough,
} from 'lucide-react';
import { Select } from '../UI/Select';
import { TagChip } from '../UI/TagChip';
import { DatePickerPopover } from '../UI/DatePickerPopover';
import { formatDueDateLabel } from '../../lib/dateUtils';
import { categorizeDraft, generateSmartTags } from '../../lib/aiService';

let activeEditorView: EditorView | null = null;

const editorExtensions = [
  ViewPlugin.define((view) => {
    activeEditorView = view;
    return {
      destroy() {
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

  // Zen mode & layout controls
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isAttachmentsCollapsed, setIsAttachmentsCollapsed] = useState(false);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [activeTopDropdown, setActiveTopDropdown] = useState<'style' | 'list' | null>(null);

  const selectedAttachment = attachments.find(a => a.id === selectedAttachmentId);

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

  // Keyboard shortcuts: Esc = Cancel / Back, Ctrl/Cmd+S = Save, Ctrl+Shift+F = Zen, Ctrl+Shift+W = Width
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
        e.preventDefault();
        setIsZenMode(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'w' || e.code === 'KeyW')) {
        e.preventDefault();
        setIsFullWidth(prev => !prev);
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
    addToast('ИИ определяет папку и теги...', 'info');
    try {
      const fullText = `${title ? title + '\n' : ''}${content}`.trim();
      const res = await categorizeDraft(fullText, folder || 'Входящие', folders, aiSettings);
      if (res.targetFolder && res.targetFolder !== folder) {
        setFolder(res.targetFolder);
      }
      if (res.tags && res.tags.length > 0) {
        setTags(prev => Array.from(new Set([...prev, ...res.tags])));
      }
      const folderNotice = res.targetFolder && res.targetFolder !== folder ? `папка: ${res.targetFolder}` : '';
      const tagsNotice = res.tags.length > 0 ? `теги: #${res.tags.join(' #')}` : '';
      const details = [folderNotice, tagsNotice].filter(Boolean).join(', ');
      addToast(`Запись разобрана${details ? ` (${details})` : ''}: ${res.reason}`, 'success');
    } catch {
      addToast('Не удалось разобрать запись через ИИ', 'error');
    }
  }, [title, content, folder, folders, aiSettings, addToast]);

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
    setIsAttachmentsCollapsed(false);
    const links = newAtts.map(a => `![[${a.name}]]`).join('\n') + '\n';
    const view = getEditorView();
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: links },
        selection: { anchor: pos + links.length },
      });
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
      data-testid="fullscreen-editor-modal"
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 z-50 z-[100] bg-[#141417] flex flex-col animate-in fade-in duration-150 text-[#f4f4f5]"
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
        <div className="fixed inset-4 z-[120] rounded-3xl bg-[#141417]/95 backdrop-blur-md border-2 border-dashed border-[#2a82e4] flex flex-col items-center justify-center gap-3 pointer-events-none select-none animate-in fade-in duration-100">
          <UploadCloud className="w-12 h-12 text-[#529ee8] animate-bounce" />
          <span className="text-base font-semibold text-white">
            Перетащите медиафайлы сюда
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            Войсы, видео, изображения или документы прикрепятся к заметке
          </span>
        </div>
      )}
      {/* Top Floating Control Bar - Seamless Note Palette #141417 & Edge-to-Edge */}
      <header
        className={`min-h-14 border-b border-white/[0.04] bg-[#141417]/90 backdrop-blur-md shrink-0 sticky top-0 z-30 transition-opacity duration-200 ${
          isZenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'
        }`}
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        {/* Invisible Backdrop to dismiss active top dropdown */}
        {activeTopDropdown && (
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setActiveTopDropdown(null)}
          />
        )}

        <div className="w-full h-full flex items-center justify-between px-4 md:px-6 py-2.5 gap-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
              title="Назад к ленте (Escape)"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Назад</span>
            </button>

            <span className="text-zinc-700 hidden sm:inline select-none">/</span>

            {/* Folder Selector */}
            <Select
              size="sm"
              variant="ghost"
              value={folder}
              onChange={setFolder}
              options={folders.map(f => ({ value: f.path, label: f.name }))}
              className="max-w-[130px] md:max-w-[170px] h-7 text-xs bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] rounded-md"
            />

            {/* Item Type Switcher */}
            <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {(['note', 'task', 'article'] as SlagItemType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    type === t ? 'bg-white/10 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t === 'note' ? 'Заметка' : t === 'task' ? 'Таска' : 'Статья'}
                </button>
              ))}
            </div>
          </div>

          {/* Teletype Center Utilities: Context-Aware for Selected Object (Text, Image, Audio, File) */}
          <div className="hidden md:flex items-center justify-center mx-2 z-50">
            {selectedAttachment ? (
              /* Selected Object (Media / File) Action Bar */
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs shadow-sm animate-in fade-in duration-150">
                <span className="flex items-center gap-1.5 text-zinc-200 font-mono text-[11px] max-w-[180px] truncate pl-0.5">
                  <span className="text-sm">
                    {selectedAttachment.type === 'image' ? '🖼' : selectedAttachment.type === 'audio' ? '🎙' : '📎'}
                  </span>
                  <span className="truncate font-medium">{selectedAttachment.name}</span>
                </span>

                <div className="h-3.5 w-px bg-white/[0.1] mx-1" />

                {selectedAttachment.type === 'image' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAttachment.dataUrl) {
                        openLightbox([{
                          id: selectedAttachment.id,
                          name: selectedAttachment.name,
                          url: selectedAttachment.dataUrl,
                          itemId: item.id,
                        }], 0);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                    title="Открыть изображение (Lightbox)"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>Просмотр</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => insertAttachmentMarkdown(selectedAttachment.name)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white text-xs font-mono transition-colors cursor-pointer"
                  title="Вставить ссылку ![[файл]] в курсор текста"
                >
                  <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Вставить</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeAttachment(selectedAttachment.id);
                    setSelectedAttachmentId(null);
                  }}
                  className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Удалить файл"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div className="h-3.5 w-px bg-white/[0.1] mx-0.5" />

                <button
                  type="button"
                  onClick={() => setSelectedAttachmentId(null)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Снять выбор (вернуть текст)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* Teletype Text Context Bar */
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 shadow-xs">
                {/* History: Undo / Redo */}
                <button
                  type="button"
                  onClick={handleUndo}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer text-zinc-400"
                  title="Отменить (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer text-zinc-400"
                  title="Повторить (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>

                <div className="h-3.5 w-px bg-white/[0.08] mx-0.5" />

                {/* Aa Text Styles Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveTopDropdown(prev => prev === 'style' ? null : 'style')}
                    className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      activeTopDropdown === 'style' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                    title="Стили текста (Aa)"
                  >
                    <span className="font-semibold text-sm leading-none">Aa</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>

                  {activeTopDropdown === 'style' && (
                    <div className="absolute top-full mt-1.5 left-0 w-44 rounded-xl bg-[#16161a] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in duration-100">
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('# ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Heading1 className="w-4 h-4 text-zinc-400" />
                        <span>Заголовок 1</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('## ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Heading2 className="w-4 h-4 text-zinc-400" />
                        <span>Заголовок 2</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('### ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <span className="font-mono text-xs text-zinc-400 font-bold px-0.5">H3</span>
                        <span>Заголовок 3</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('> ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Quote className="w-4 h-4 text-zinc-400" />
                        <span>Цитата</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('```\n', '\n```');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Code className="w-4 h-4 text-zinc-400" />
                        <span>Блок кода</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Lists & Alignment Dropdown (≡ ▾) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveTopDropdown(prev => prev === 'list' ? null : 'list')}
                    className={`flex items-center gap-0.5 px-1.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      activeTopDropdown === 'list' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                    title="Списки и структуры (≡)"
                  >
                    <List className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>

                  {activeTopDropdown === 'list' && (
                    <div className="absolute top-full mt-1.5 left-0 w-48 rounded-xl bg-[#16161a] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in duration-100">
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('- ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <List className="w-4 h-4 text-zinc-400" />
                        <span>Маркированный список</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('1. ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <span className="font-mono text-xs text-zinc-400 font-bold px-0.5">1.</span>
                        <span>Нумерованный список</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertMarkdown('- [ ] ', '');
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-4 h-4 text-zinc-400" />
                        <span>Чек-лист задач</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleInsertTable();
                          setActiveTopDropdown(null);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Table className="w-4 h-4 text-zinc-400" />
                        <span>Таблица Markdown</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-3.5 w-px bg-white/[0.08] mx-0.5" />

                {/* Inline Formatting: B, I, S, Inline Code */}
                <button
                  type="button"
                  onClick={() => insertMarkdown('**', '**')}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer font-bold"
                  title="Жирный (Ctrl+B)"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('*', '*')}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer italic"
                  title="Курсив (Ctrl+I)"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('~~', '~~')}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                  title="Зачёркнутый"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('`', '`')}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                  title="Инлайн-код"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>

                <div className="h-3.5 w-px bg-white/[0.08] mx-0.5" />

                {/* Anchor / Link (⚓) */}
                <button
                  type="button"
                  onClick={() => insertMarkdown('[[', ']]')}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                  title="Ссылка [[заметка]]"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>

                {/* Attachments / Paperclip */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                  title="Прикрепить файл, фото или медиа"
                >
                  <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                </button>

                <div className="h-3.5 w-px bg-white/[0.08] mx-0.5" />

                {/* AI Sparkles */}
                <button
                  type="button"
                  onClick={handleAiDecomposeInline}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-purple-300 hover:bg-purple-500/10 active:scale-95 transition-all cursor-pointer"
                  title="Разобрать через ИИ (папка и теги)"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Stats & Actions */}
          <div className="flex items-center gap-2 md:gap-2.5 text-xs text-zinc-400 ml-auto shrink-0">
            {/* Word count & Read time */}
            <div className="hidden lg:flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 pr-1">
              <span>{wordCount} слов</span>
              <span className="text-zinc-700">•</span>
              <span>~{readTime} мин</span>
            </div>

            {/* Reading measure / width toggle: Focus (768px) vs Wide (1024px) */}
            <button
              type="button"
              onClick={() => setIsFullWidth(prev => !prev)}
              className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                isFullWidth
                  ? 'text-white bg-white/10 border border-white/10'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={isFullWidth ? 'Стандартная ширина фокуса (768px)' : 'Широкая область (1024px)'}
            >
              {isFullWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Zen Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsZenMode(prev => !prev)}
              className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                isZenMode
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={isZenMode ? 'Выйти из режима фокуса (Zen)' : 'Режим полного фокуса (Zen)'}
            >
              <Eye className="w-4 h-4" />
            </button>

            {/* Linear Dark Save Button */}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 text-xs font-medium border border-white/[0.08] hover:border-white/[0.16] shadow-sm transition-all cursor-pointer active:scale-95"
              title="Сохранить изменения (Ctrl+S / ⌘S)"
            >
              <Save className="w-3.5 h-3.5 text-zinc-300" />
              <span>Сохранить</span>
              <kbd className="hidden sm:inline font-mono text-[10px] text-zinc-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/[0.06] leading-none">
                ⌘S
              </kbd>
            </button>

            {/* Delete button */}
            <button
              onClick={() => {
                deleteItem(item.id);
                setIsFullscreenEditorOpen(false);
                setSelectedItem(null);
              }}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Удалить запись"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto py-6 md:py-8 bg-[#141417]">
        <div
          className={`mx-auto w-full px-4 md:px-6 flex flex-col gap-4 pb-28 transition-all duration-200 ${
            isFullWidth ? 'max-w-5xl' : 'max-w-3xl'
          }`}
        >
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
              placeholder={type === 'task' ? 'Название задачи...' : 'Заголовок...'}
              className={`w-full bg-transparent text-xl md:text-2xl font-semibold tracking-tight placeholder-zinc-600 border-none px-0 outline-none ${
                type === 'task' && status === 'done' ? 'text-zinc-500 line-through' : 'text-white'
              }`}
            />
          </div>

          {/* Unified Linear Properties & Taxonomy Container */}
          <div
            className={`flex flex-col gap-2.5 pb-1 transition-opacity duration-200 ${
              isZenMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'
            }`}
          >
            {/* Task Controls Row */}
            {type === 'task' && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
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
                    className="h-7 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] px-2 text-xs"
                  />
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
                    className="h-7 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] px-2 text-xs"
                  />
                </div>

                {/* Due Date Trigger */}
                <div className="relative shrink-0">
                  {dueDate ? (
                    <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs transition-colors shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsDatePickerOpen(prev => !prev)}
                        className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
                        title="Изменить срок"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-medium max-w-[85px] truncate">{formatDueDateLabel(dueDate)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDueDate('')}
                        className="p-0.5 text-blue-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Снять срок"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(prev => !prev)}
                      className="h-7 px-2 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
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
                    <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-white/[0.08] border border-white/[0.12] text-xs text-white transition-colors shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
                        className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        title="Изменить длительность"
                      >
                        <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
                      className="h-7 px-2 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
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
                    <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs transition-colors shrink-0">
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
                      className="h-7 px-2 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-zinc-400 hover:text-zinc-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
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
              </div>
            )}

            {/* Subtle Divider between Task Controls and Tags */}
            {type === 'task' && (
              <div className="h-px bg-white/[0.06] w-full" />
            )}

            {/* Tags Ribbon Row */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              {tags.map(t => (
                <TagChip
                  key={t}
                  tag={t}
                  variant="pill"
                  onRemove={() => setTags(tags.filter(tag => tag !== t))}
                />
              ))}
              <div className="h-7 px-2 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] flex items-center gap-1 transition-colors">
                <Tag className="w-3 h-3 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="+ тег"
                  className="bg-transparent text-xs font-mono text-zinc-300 placeholder-zinc-500 w-16 outline-none"
                />
              </div>
            </div>

            {/* Subtle Divider between Properties/Tags and Content */}
            <div className="h-px bg-white/[0.06] w-full mt-1" />
          </div>

          {/* Media Attachments Section in Fullscreen Editor - Collapsible */}
          {attachments.length > 0 && (
            <div className="flex flex-col rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              <div
                onClick={() => setIsAttachmentsCollapsed(prev => !prev)}
                className="flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.03] cursor-pointer transition-colors select-none"
              >
                <div className="flex items-center gap-2">
                  {isAttachmentsCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="font-medium text-zinc-300">
                    Медиа и вложения ({attachments.length})
                  </span>
                  {isAttachmentsCollapsed && (
                    <span className="text-[11px] font-mono text-zinc-500">
                      • {attachments.map(a => a.type === 'audio' ? '🎙' : a.type === 'video' ? '📹' : a.type === 'image' ? '🖼' : '📎').slice(0, 5).join(' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    + Добавить
                  </button>
                </div>
              </div>

              {!isAttachmentsCollapsed && (
                <div className="flex flex-col gap-2.5 p-3 pt-1 border-t border-white/[0.04]">
                {attachments.map((att, idx) => (
                  <div
                    key={att.id}
                    onClick={() => setSelectedAttachmentId(att.id === selectedAttachmentId ? null : att.id)}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                      selectedAttachmentId === att.id
                        ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/40 shadow-sm'
                        : 'bg-black/40 border-white/[0.06] hover:border-white/[0.12]'
                    }`}
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
              )}
            </div>
          )}

          {/* Main Markdown Editor with Obsidian-style Live Preview */}
          <div
            id="fullscreen-editor-root"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const img = target.closest('img');
              if (img) {
                const src = img.getAttribute('src');
                const alt = img.getAttribute('alt');
                const found = attachments.find(a => a.name === alt || a.dataUrl === src);
                if (found) {
                  setSelectedAttachmentId(found.id);
                  return;
                }
              }
              if (selectedAttachmentId) {
                setSelectedAttachmentId(null);
              }
            }}
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

          {/* Bottom spacer on mobile so last lines clear the floating bottom bar */}
          <div className="h-16 md:hidden shrink-0" aria-hidden="true" />
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
                <Code className="w-4 h-4 text-zinc-400" />
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
                <CheckSquare className="w-4 h-4 text-zinc-400" />
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
                <Code className="w-4 h-4 text-zinc-400" />
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
                <Link2 className="w-4 h-4 text-zinc-400" />
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
                <span className="font-mono text-[10px] text-zinc-400">AI</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleAiDecomposeInline();
                  setActiveMobilePopover(null);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-98 transition-all text-left"
              >
                <Sparkles className="w-4 h-4 text-zinc-400" />
                <span>Разобрать (папка и теги)</span>
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
          className="relative z-40 bg-[#141417]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 py-2 flex items-center justify-between"
          style={{ paddingBottom: 'max(var(--sab), 0.5rem)' }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* AI Button */}
            <button
              type="button"
              onClick={() => setActiveMobilePopover(prev => (prev === 'ai' ? null : 'ai'))}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                activeMobilePopover === 'ai'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="ИИ-инструменты"
            >
              <div className="flex items-center gap-0.5">
                <Sparkles className="w-4 h-4 text-zinc-400" />
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

          {/* Refined Linear Dark Mobile Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className="h-9 px-3.5 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-white flex items-center gap-1.5 border border-white/[0.1] shadow-md active:scale-95 transition-all cursor-pointer shrink-0 ml-2"
            title="Сохранить и закрыть (Ctrl+S)"
          >
            <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
            <span className="text-xs font-medium">Готово</span>
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
