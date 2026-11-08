import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemStatus, SlagAttachment } from '../../types';
import { processFileListToAttachments } from '../../lib/media/fileDropHelper';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { formatRecurrenceLabel, RECURRENCE_PRESETS } from '../../lib/time/recurrenceHelper';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { AtomicCodeMirrorEditor, type AtomicCodeMirrorEditorHandle } from '@atomic-editor/editor';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import {
  CheckCircle2,
  Circle,
  X,
  UploadCloud,
  Clock,
  Check,
  Calendar,
  Repeat,
} from 'lucide-react';
import { Select } from '../UI/Select';
import { TagChip } from '../UI/TagChip';
import { DatePickerPopover } from '../UI/DatePickerPopover';
import { formatDueDateLabel } from '../../lib/time/dateUtils';
import { categorizeDraft, generateSmartTags } from '../../lib/aiService';
import { expandFromRect, collapseToRect, enterFromEdge, exitToEdge } from '../../lib/motion';
import { usePresence } from '../../hooks/usePresence';
import { useSheetDrag } from '../../hooks/gestures/useSheetDrag';
import { useFullscreenDraft } from './useFullscreenDraft';
import { AttachmentStrip } from './AttachmentStrip';
import { MobileEditorBar } from './MobileEditorBar';
import { EditorToolbar } from './EditorToolbar';

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
  presencePhase?: string;
}

const FullscreenEditorContent: React.FC<FullscreenEditorContentProps> = ({ item, presencePhase }) => {
  const {
    setIsFullscreenEditorOpen,
    saveItem,
    updateItem,
    setSelectedItem,
    folders,
    addToast,
    openLightbox,
    aiSettings,
    isSearchOpen,
    isMobile,
  } = useApp();

  const handleEditorClose = useCallback(() => {
    setIsFullscreenEditorOpen(false);
    setSelectedItem(null);
  }, [setIsFullscreenEditorOpen, setSelectedItem]);

  const {
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
    duration,
    setDuration,
    recurrence,
    setRecurrence,
    attachments,
    setAttachments,
    isFullWidth,
    setIsFullWidth,
    saveStatus,
    handleSave,
    handleClose,
  } = useFullscreenDraft({
    item,
    saveItem,
    updateItem,
    onClose: handleEditorClose,
    addToast,
  });

  const [activeMobilePopover, setActiveMobilePopover] = useState<'formatting' | 'lists' | 'ai' | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
  const [isRecurrenceDropdownOpen, setIsRecurrenceDropdownOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Phone editor sits as a half sheet (56% of the surface) and grows to the full window when
  // the handle is pulled up. Reset belongs to render: a new note starts folded.
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [sheetItemId, setSheetItemId] = useState(item.id);
  if (sheetItemId !== item.id) {
    setSheetItemId(item.id);
    setIsSheetExpanded(false);
  }

  const { panelRef, scrimRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel, panelStyle } = useSheetDrag({
    isOpen: true,
    onDismiss: handleClose,
    onExpand: () => setIsSheetExpanded(true),
    // Свёрнутой шторке некуда сворачиваться: вниз — это закрытие, а не коллапс.
    onCollapse: isSheetExpanded ? () => setIsSheetExpanded(false) : undefined,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const hasExpandedRef = useRef(false);

  // Unfold out of the card that was tapped and collapse symmetrically on exit.
  useLayoutEffect(() => {
    // On a phone the surface is a half sheet: it has its own sheet motion, and a
    // card-to-fullscreen flip would fight the drag gesture.
    if (isMobile) return;
    // A wide surface lifts further than a phone screen, where the editor is the
    // whole window and reads as a sheet.
    const travel = window.matchMedia('(max-width: 767px)').matches ? 56 : 18;
    // A card if there is one, otherwise the composer the editor was opened from:
    // the surface still grows out of something, which is what makes it read as a
    // resize instead of an unrelated slide.
    const originOf = () =>
      document.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(item.id)}"]`) ??
      document.querySelector<HTMLElement>('[data-composer-root]');

    if (presencePhase === 'exiting') {
      const target = rootRef.current;
      if (!target || isSearchOpen) return;
      const origin = originOf();
      if (origin) collapseToRect(target, origin);
      else exitToEdge(target, travel);
      return;
    }
    if (hasExpandedRef.current) return;
    hasExpandedRef.current = true;
    const target = rootRef.current;
    if (!target || isSearchOpen) return;
    const origin = originOf();
    // Opened from the card: unfold out of it. Opened from the composer or a draft
    // there is no card, and doing nothing looked like the editor just appeared.
    if (origin) expandFromRect(origin, target);
    else enterFromEdge(target, travel);
  }, [item.id, isSearchOpen, presencePhase, isMobile]);

  // Zen mode & layout controls (persisting user's width preference)
  const [isZenMode, setIsZenMode] = useState(false);
  const [isAttachmentsCollapsed, setIsAttachmentsCollapsed] = useState(false);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);

  const selectedAttachment = attachments.find(a => a.id === selectedAttachmentId);

  const folderOptions = React.useMemo(() => {
    // Collect non-inbox folders
    const regularFolders = folders.filter(f => f.path !== DEFAULT_INBOX_FOLDER);

    // Hierarchy tree to sort exactly by root and nested paths
    interface Node {
      path: string;
      children: Node[];
    }
    const rootMap: Map<string, Node> = new Map();

    regularFolders.forEach(f => {
      const parts = f.path.split('/');
      let current = '';
      let parentNode: Node | null = null;

      parts.forEach((part, idx) => {
        current = current ? `${current}/${part}` : part;
        if (idx === 0) {
          if (!rootMap.has(part)) {
            rootMap.set(part, { path: current, children: [] });
          }
          parentNode = rootMap.get(part)!;
        } else if (parentNode) {
          let child = parentNode.children.find(c => c.path === current);
          if (!child) {
            child = { path: current, children: [] };
            parentNode.children.push(child);
          }
          parentNode = child;
        }
      });
    });

    const orderedPaths: { path: string; isRoot: boolean }[] = [];
    const traverse = (node: Node, isRoot: boolean) => {
      orderedPaths.push({ path: node.path, isRoot });
      // Sort children alphabetically
      node.children.sort((a, b) => a.path.localeCompare(b.path, 'ru'));
      node.children.forEach(c => traverse(c, false));
    };

    // Sort root nodes alphabetically
    const roots = Array.from(rootMap.values()).sort((a, b) => a.path.localeCompare(b.path, 'ru'));
    roots.forEach(r => traverse(r, true));

    return [
      { value: DEFAULT_INBOX_FOLDER, label: DEFAULT_INBOX_FOLDER },
      ...orderedPaths.map((it) => ({
        value: it.path,
        label: it.path,
        dividerBefore: it.isRoot,
      })),
    ];
  }, [folders]);

  const editorHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getEditorView = useCallback((): EditorView | null => activeEditorView, []);

  useEffect(() => {
    (window as any).__slagGetEditorMarkdown = () => editorHandleRef.current?.getMarkdown() ?? '';
    return () => {
      activeEditorView = null;
      delete (window as any).__slagGetEditorMarkdown;
    };
  }, []);

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
        // LIFO: сначала закрывается верхний слой (меню форматирования), редактор — следующим.
        if (activeMobilePopover) {
          // capture-фаза: гасим событие, чтобы глобальный обработчик Back
          // не закрыл редактор вместе с меню (LIFO).
          e.stopPropagation();
          setActiveMobilePopover(null);
          return;
        }
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
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleClose, handleSave, activeMobilePopover, setIsFullWidth]);

  const tagInputRef = useRef<HTMLInputElement | null>(null);

  const addTagValue = (raw: string) => {
    const parts = raw.split(/[\s,]+/).map(p => p.trim().replace(/^#/, '')).filter(Boolean);
    if (parts.length === 0) return;
    setTags(prev => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.includes(p)) {
          next.push(p);
        }
      }
      return next;
    });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      if (newTagInput.trim()) {
        addTagValue(newTagInput);
        setNewTagInput('');
      }
    } else if (e.key === 'Backspace' && !newTagInput && tags.length > 0) {
      e.preventDefault();
      setTags(tags.slice(0, -1));
    }
  };

  const handleTagBlur = () => {
    if (newTagInput.trim()) {
      addTagValue(newTagInput);
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
  }, [getEditorView, setContent]);

  const handleInsertTable = useCallback(() => {
    insertMarkdown('\n| Колонка 1 | Колонка 2 |\n|---|---|\n| Запись 1 | Запись 2 |\n', '');
  }, [insertMarkdown]);

  const handleAiDecomposeInline = useCallback(async () => {
    addToast('ИИ определяет папку и теги...', 'info');
    try {
      const fullText = `${title ? title + '\n' : ''}${content}`.trim();
      const res = await categorizeDraft(fullText, folder || DEFAULT_INBOX_FOLDER, folders, aiSettings);
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
  }, [title, content, folder, folders, aiSettings, addToast, setFolder, setTags]);

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
  }, [content, title, aiSettings, addToast, setTags]);

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
  }, [getEditorView, addToast, setContent]);

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
  }, [getEditorView, addToast, setAttachments, setContent]);

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
      ref={rootRef}
      data-testid="fullscreen-editor-modal"
      data-motion-state={presencePhase}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 z-[100] flex flex-col text-fg-primary"
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
        <div className="fixed inset-4 z-[120] rounded-3xl bg-surface border-2 border-dashed border-accent flex flex-col items-center justify-center gap-3 pointer-events-none select-none motion-fade">
          <UploadCloud className="w-12 h-12 text-accent animate-bounce" />
          <span className="text-base font-semibold text-white">
            Перетащите медиафайлы сюда
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            Войсы, видео, изображения или документы прикрепятся к заметке
          </span>
        </div>
      )}

      {/* Phone half sheet: the dim closes on tap and sits behind the panel. */}
      {isMobile && !isSheetExpanded && (
        <div
          ref={scrimRef}
          onClick={handleClose}
          className="absolute inset-0 bg-black/60"
        />
      )}

      {/* The editor surface: a half sheet on a phone, the plain window on desktop. */}
      <div
        ref={isMobile ? panelRef : undefined}
        data-testid={isMobile ? 'editor-sheet' : undefined}
        className={
          isMobile
            ? `absolute inset-x-0 bottom-0 flex flex-col overflow-hidden bg-surface border-t border-white/[0.08] shadow-2xl transition-[height] duration-[240ms] ${
                isSheetExpanded ? 'rounded-t-none' : 'rounded-t-2xl'
              }`
            : 'flex flex-1 flex-col bg-surface'
        }
        style={isMobile ? { height: isSheetExpanded ? '100%' : '56%', ...panelStyle } : undefined}
      >
        {/* The handle owns the sheet gesture; the scroller under it keeps scrolling. */}
        {isMobile && (
          <div
            data-sheet-handle
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerCancel}
            style={{ touchAction: 'none' }}
            className="flex h-6 shrink-0 items-center justify-center"
          >
            <div className="h-1 w-8 rounded-full bg-white/20" />
          </div>
        )}

        {/* Top Control Bar */}
        <EditorToolbar
          item={item}
          folder={folder}
          onFolderChange={setFolder}
          folderOptions={folderOptions}
          type={type}
          onTypeChange={setType}
          selectedAttachment={selectedAttachment}
          onSelectAttachment={setSelectedAttachmentId}
          onRemoveAttachment={removeAttachment}
          onInsertAttachmentMarkdown={insertAttachmentMarkdown}
          onOpenLightbox={openLightbox}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onInsertMarkdown={insertMarkdown}
          onInsertTable={handleInsertTable}
          onAttachClick={() => fileInputRef.current?.click()}
          onAiDecompose={handleAiDecomposeInline}
          isZenMode={isZenMode}
          onToggleZenMode={() => setIsZenMode(prev => !prev)}
          isFullWidth={isFullWidth}
          onToggleFullWidth={() => setIsFullWidth(prev => !prev)}
          saveStatus={saveStatus}
          onSave={handleSave}
          onClose={handleClose}
        />

        {/* Editor Body */}
        <div className="flex-1 overflow-y-auto py-6 md:py-8 bg-surface">
          <div
            className={`mx-auto w-full px-4 md:px-6 flex flex-col gap-4 pb-28 ${
              isFullWidth ? 'max-w-5xl' : 'max-w-3xl'
            }`}
          >
            {/* Title Input with optional task completion toggle */}
            <div className="flex items-center gap-3">
              {type === 'task' && (
                <button
                  type="button"
                  onClick={() => setStatus((prev: SlagItemStatus) => (prev === 'done' ? 'todo' : 'done'))}
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    status === 'done'
                      ? 'border border-emerald-500 bg-emerald-500/20 text-emerald-400'
                      : 'border border-zinc-600 hover:border-blue-400 text-transparent hover:text-blue-400'
                  }`}
                  title={status === 'done' ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </button>
              )}
              {/* textarea вместо input: заголовок переносится, а не обрезается на узком экране.
                  field-sizing:content даёт авто-высоту без JS (Chrome 123+, Android WebView 156). */}
              <textarea
                rows={1}
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder={type === 'task' ? 'Название таски...' : 'Заголовок...'}
                className={`w-full bg-transparent text-xl md:text-2xl font-semibold tracking-tight placeholder-zinc-600 border-none px-0 outline-none resize-none overflow-hidden [field-sizing:content] ${
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
                      onChange={(val) => setPriority(val as 'none' | 'low' | 'medium' | 'high')}
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
                        title="Установить срок таски"
                      >
                        <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>Срок</span>
                      </button>
                    )}

                    <DatePickerPopover
                      isOpen={isDatePickerOpen}
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
                        title="Установить длительность таски"
                      >
                        <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>Длительность</span>
                      </button>
                    )}

                    {isDurationDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-32 rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover pointer-events-auto">
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
                        title="Повторяющаяся таска"
                      >
                        <Repeat className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>Повтор</span>
                      </button>
                    )}

                    {isRecurrenceDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-44 rounded-xl bg-surface-elevated border border-white/[0.1] shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover pointer-events-auto">
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

              {/* Tags Ribbon Row - Seamless Flat Textarea-Like Area */}
              <div
                onClick={() => tagInputRef.current?.focus()}
                className="flex items-center gap-1.5 flex-wrap min-h-7 py-0.5 cursor-text text-xs"
              >
                {tags.map(t => (
                  <TagChip
                    key={t}
                    tag={t}
                    variant="pill"
                    onRemove={() => setTags(tags.filter(tag => tag !== t))}
                  />
                ))}
                <input
                  ref={tagInputRef}
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleTagBlur}
                  placeholder={tags.length === 0 ? 'добавьте теги...' : ''}
                  className="bg-transparent text-xs font-mono text-zinc-300 placeholder-zinc-600 outline-none min-w-[70px] flex-1 py-0.5"
                />
              </div>

              {/* Subtle Divider between Properties/Tags and Content */}
              <div className="h-px bg-white/[0.06] w-full mt-1" />
            </div>

            {/* Media Attachments Section in Fullscreen Editor - Collapsible */}
            <AttachmentStrip
              itemId={item.id}
              attachments={attachments}
              isCollapsed={isAttachmentsCollapsed}
              onToggleCollapse={() => setIsAttachmentsCollapsed(prev => !prev)}
              selectedAttachmentId={selectedAttachmentId}
              onSelectAttachment={setSelectedAttachmentId}
              onInsertMarkdown={insertAttachmentMarkdown}
              onMoveAttachment={moveAttachment}
              onRemoveAttachment={removeAttachment}
              onAddClick={() => fileInputRef.current?.click()}
              onOpenLightbox={openLightbox}
            />

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
      </div>

      {/* Mobile Telegram-Style Floating Bottom Toolbar */}
      <MobileEditorBar
        isDraft={item.id.startsWith('draft_')}
        activePopover={activeMobilePopover}
        onSetActivePopover={setActiveMobilePopover}
        onInsertMarkdown={insertMarkdown}
        onInsertTable={handleInsertTable}
        onAttachClick={() => fileInputRef.current?.click()}
        onAiDecompose={handleAiDecomposeInline}
        onAiTags={handleAiTagsInline}
        onSave={handleSave}
      />
    </div>
  );
};

export const FullscreenEditor: React.FC = () => {
  const { isFullscreenEditorOpen, selectedItem } = useApp();

  const isOpen = isFullscreenEditorOpen && Boolean(selectedItem);
  // The surface unfolds itself through `expandFromRect`/`enterFromEdge`, so it has
  // no use for the CSS `entering` frame: flipping that phase re-rendered the whole
  // editor mid-animation and ate the first frames of the unfold.
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isOpen, { skipEntering: true });

  const [cachedItem, setCachedItem] = useState(selectedItem);
  if (selectedItem && selectedItem !== cachedItem) {
    setCachedItem(selectedItem);
  }
  const effectiveItem = selectedItem || cachedItem;

  if (!isPresent || !effectiveItem) return null;

  return (
    <div
      ref={ref}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      className="fixed inset-0 z-[100] motion-presence-hold"
    >
      <FullscreenEditorContent
        key={effectiveItem.id}
        item={effectiveItem}
        presencePhase={phase}
      />
    </div>
  );
};
