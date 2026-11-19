// The focused editor surface: CodeMirror wiring, hotkeys and the sheet's chrome.
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemStatus } from '../../types';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import { AtomicCodeMirrorEditor, type AtomicCodeMirrorEditorHandle } from '@atomic-editor/editor';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import { Icon } from '../UI/icons/Icon';
import { SheetPanel } from '../UI/SheetPanel';
import { expandFromRect, collapseToRect, enterFromEdge, exitToEdge } from '../../lib/motion';
import { usePresence } from '../../hooks/ui/usePresence';
import { useEditorPaneRect } from '../../hooks/layout/useEditorPaneRect';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import { formatDueDateLabel } from '../../lib/time/dateUtils';
import { useFullscreenDraft } from './useFullscreenDraft';
import { AttachmentStrip } from './AttachmentStrip';
import { MobileEditorBar } from './MobileEditorBar';
import { EditorToolbar } from './EditorToolbar';
import { TaskMetaBar } from '../UI/TaskMetaBar';
import { EditorTagsRow } from './fullscreen/EditorTagsRow';
import { useEditorAttachments } from './fullscreen/useEditorAttachments';
import { useEditorAiActions } from './fullscreen/useEditorAiActions';
import { attachmentEmbeds, syncAttachmentEmbedDeps, type AttachmentEmbedDeps } from './fullscreen/attachmentEmbeds';

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
  onExited: () => void;
}

const FullscreenEditorContent: React.FC<FullscreenEditorContentProps> = ({ item, presencePhase, onExited }) => {
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
    openAttachSheet,
  } = useApp();

  const handleEditorClose = useCallback(() => {
    setIsFullscreenEditorOpen(false);
    setSelectedItem(null);
  }, [setIsFullscreenEditorOpen, setSelectedItem]);

  // Where the surface folds back to. A draft is saved under a new id, so the card is only known
  // after the save; without this the exit has no target and slides off to the screen edge.
  const exitTargetIdRef = useRef<string | null>(null);

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
    reminder,
    setReminder,
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
    // A fresh note becomes a different id on save; the exit folds into its card, not the composer.
    onSaved: (saved) => {
      exitTargetIdRef.current = saved.id;
    },
    addToast,
  });

  // Phone editor sits as a half sheet (56% of the surface) and grows to the full window when
  // the handle is pulled up. Reset belongs to render: a new note starts folded.
  const [activeMobilePopover, setActiveMobilePopover] = useState<'formatting' | 'lists' | 'ai' | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [sheetItemId, setSheetItemId] = useState(item.id);
  if (sheetItemId !== item.id) {
    setSheetItemId(item.id);
    setIsSheetExpanded(false);
  }

  // Desktop has the same two detents as the phone sheet, with a different first one: the note
  // opens inside the pane it was clicked in, and only the second detent takes the whole window.
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  // Only the detent switch animates: while docked, a sash drag must move the surface with the
  // pane, not trail it by a fifth of a second.
  const [isDetentMoving, setIsDetentMoving] = useState(false);
  const paneRect = useEditorPaneRect(item.id, !isMobile);
  const isDocked = !isMobile && !isEditorExpanded && paneRect !== null;
  const toggleEditorExpanded = useCallback(() => {
    setIsDetentMoving(true);
    setIsEditorExpanded(prev => !prev);
  }, []);

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
      const savedId = exitTargetIdRef.current;
      const origin =
        (savedId && document.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(savedId)}"]`)) ||
        originOf();
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
  // The rail starts folded: it belongs under the text, not between the tags and the note.
  const [isAttachmentsCollapsed, setIsAttachmentsCollapsed] = useState(true);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);

  const selectedAttachment = attachments.find(a => a.id === selectedAttachmentId);

  const folderOptions = React.useMemo(() => buildFolderOptions(folders), [folders]);

  const editorHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);

  const getEditorView = useCallback((): EditorView | null => activeEditorView, []);

  // `![[file]]` paints as a widget in the note body. CM6 captures extensions at mount, so the
  // plugin reads a deps object that outlives renders and is repainted when `version` moves.
  const { srcs: attachmentSrcs } = useAttachmentSrcs(attachments);
  const [embedDeps] = useState<AttachmentEmbedDeps>(() => ({ attachments, srcs: {}, version: 0 }));
  const [extensionsForEditor] = useState<readonly Extension[]>(() => [
    ...editorExtensions,
    attachmentEmbeds(embedDeps),
  ]);

  useEffect(() => {
    syncAttachmentEmbedDeps(embedDeps, attachments, attachmentSrcs);
    // An empty transaction is enough: the plugin rebuilds on its own version check.
    getEditorView()?.dispatch({});
  }, [attachments, attachmentSrcs, embedDeps, getEditorView]);

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
        // Развёрнутый редактор сначала возвращается в свою панель, закрывается вторым нажатием.
        // capture-фаза: событие не должно дойти до глобального стека слоёв, иначе Esc закроет
        // редактор целиком вместо того, чтобы свернуть его в панель.
        if (!isMobile && isEditorExpanded && paneRect) {
          e.stopPropagation();
          setIsEditorExpanded(false);
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
  }, [handleClose, handleSave, activeMobilePopover, setIsFullWidth, isMobile, isEditorExpanded, paneRect]);

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

  const { handleAiDecomposeInline, handleAiTagsInline } = useEditorAiActions({
    title,
    content,
    folder,
    folders,
    aiSettings,
    addToast,
    setFolder,
    setTags,
  });

  const {
    isDraggingOver,
    insertAttachmentMarkdown,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleAttachClick,
    moveAttachment,
    removeAttachment,
  } = useEditorAttachments({
    getEditorView,
    attachments,
    setAttachments,
    setContent,
    setIsAttachmentsCollapsed,
    addToast,
    openAttachSheet,
  });

  return (
    <div
      ref={rootRef}
      data-testid="fullscreen-editor-modal"
      data-motion-state={presencePhase}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      // Both detents are an explicit box, so left/top/width/height can interpolate between them
      // instead of snapping. Flush with the pane: no card chrome, or a docked editor reads as an
      // overlay again.
      style={
        isMobile
          ? undefined
          : isDocked && paneRect
            ? { left: paneRect.left, top: paneRect.top, width: paneRect.width, height: paneRect.height }
            : { left: 0, top: 0, width: '100vw', height: '100vh' }
      }
      onTransitionEnd={(event) => {
        if (event.propertyName === 'width') setIsDetentMoving(false);
      }}
      // The phone surface is the sheet itself (56% tall over a dimmed backdrop), so only the
      // desktop root paints: an opaque root would black out the scrim and the app behind it.
      className={`pointer-events-auto fixed inset-0 z-[100] flex flex-col text-fg-primary ${
        isMobile ? '' : 'bg-surface'
      } ${
        isDetentMoving ? 'transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none' : ''
      }`}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-4 z-[120] rounded-3xl bg-surface border-2 border-dashed border-accent flex flex-col items-center justify-center gap-3 pointer-events-none select-none motion-fade">
          <Icon name="action.upload" size="xl" tone="accent" className="animate-bounce" />
          <span className="text-base font-semibold text-white">
            Перетащите медиафайлы сюда
          </span>
          <span className="text-xs text-fg-secondary font-mono">
            Войсы, видео, изображения или документы прикрепятся к заметке
          </span>
        </div>
      )}

      {/* On a phone the surface is a two-detent sheet: the dim closes on tap, the handle and
          the body pull it between half and the whole window. On desktop the same markup is a
          plain pane. */}
      <SheetPanel
        enabled={isMobile}
        expanded={isSheetExpanded}
        exiting={presencePhase === 'exiting'}
        onExpandedChange={setIsSheetExpanded}
        onDismiss={handleClose}
        onExited={onExited}
        testId={isMobile ? 'editor-sheet' : undefined}
        scrimClassName="bg-scrim-60"
        panelClassName={
          isMobile
            ? `bg-surface border-t border-subtle ${isSheetExpanded ? 'rounded-t-none' : 'rounded-t-2xl'}`
            : 'flex min-h-0 flex-1 flex-col bg-surface'
        }
      >
        {({ setBody, setBar }) => (
          <>
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
          onAttachClick={handleAttachClick}
          onAiDecompose={handleAiDecomposeInline}
          isZenMode={isZenMode}
          onToggleZenMode={() => setIsZenMode(prev => !prev)}
          isFullWidth={isMobile ? isSheetExpanded : isFullWidth}
          onToggleFullWidth={isMobile ? () => setIsSheetExpanded(prev => !prev) : undefined}
          saveStatus={saveStatus}
          onSave={handleSave}
          onClose={handleClose}
          isCompact={isMobile && !isSheetExpanded}
          isExpanded={isEditorExpanded}
          onToggleExpanded={isMobile ? undefined : toggleEditorExpanded}
        />

        {/* Editor Body */}
        <div
          ref={setBody}
          data-editor-body
          className="min-h-0 flex-1 overflow-y-auto py-6 md:py-8 bg-surface"
        >
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
                      : 'border border-fg-dim hover:border-blue-400 text-transparent hover:text-blue-400'
                  }`}
                  title={status === 'done' ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
                >
                  <Icon name="action.check" size="xs" tone="inherit" className="stroke-[3]" />
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
                className={`w-full bg-transparent text-xl md:text-2xl font-semibold tracking-tight placeholder-fg-dim border-none px-0 outline-none resize-none overflow-hidden [field-sizing:content] ${
                  type === 'task' && status === 'done' ? 'text-fg-muted line-through' : 'text-white'
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
                <div className="flex flex-wrap items-center gap-1">
                  <TaskMetaBar
                    size="sm"
                    direction="down"
                    status={status}
                    onStatusChange={(s) => setStatus(s)}
                    priority={priority}
                    onPriorityChange={(p) => setPriority(p)}
                    dueDate={dueDate}
                    dateLabel={formatDueDateLabel(dueDate)}
                    onDateChange={setDueDate}
                    onDateClear={() => { setDueDate(''); setReminder(undefined); }}
                    dueTime={reminder ? reminder.slice(11, 16) : undefined}
                    onDueTimeChange={(t) => setReminder(t ?? undefined)}
                    duration={duration}
                    onDurationChange={setDuration}
                    recurrence={recurrence}
                    onRecurrenceChange={setRecurrence}
                  />
                </div>
              )}

              {/* Subtle Divider between Task Controls and Tags */}
              {type === 'task' && (
                <div className="h-px bg-tint-6 w-full" />
              )}

              {/* Tags Ribbon Row: chips are stepped into and renamed, not just appended to. */}
              <EditorTagsRow tags={tags} onChange={setTags} />

              {/* Subtle Divider between Properties/Tags and Content */}
              <div className="h-px bg-tint-6 w-full mt-1" />
            </div>

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
                extensions={extensionsForEditor}
              />
            </div>

            {/* The rail lives under the note: attachments are a footnote to the text, not a
                block glued over it. Folded until a file arrives or the reader opens it. */}
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
              onAddClick={handleAttachClick}
              onOpenLightbox={openLightbox}
            />

            {/* Bottom spacer on mobile so last lines clear the floating bottom bar */}
            <div className="h-16 md:hidden shrink-0" aria-hidden="true" />
          </div>
        </div>

      {/* Chrome shares the sheet's entrance, drag and exit. */}
      <MobileEditorBar
        ref={setBar}
        isDraft={item.id.startsWith('draft_')}
        activePopover={activeMobilePopover}
        onSetActivePopover={setActiveMobilePopover}
        onInsertMarkdown={insertMarkdown}
        onInsertTable={handleInsertTable}
        onAttachClick={handleAttachClick}
        onAiDecompose={handleAiDecomposeInline}
        onAiTags={handleAiTagsInline}
        onSave={handleSave}
      />
          </>
        )}
      </SheetPanel>
    </div>
  );
};

export const FullscreenEditor: React.FC = () => {
  const { isFullscreenEditorOpen, selectedItem, isMobile } = useApp();

  const isOpen = isFullscreenEditorOpen && Boolean(selectedItem);
  // Mobile lifetime follows the spring, not an unrelated 200ms CSS timeout.
  const { ref, phase, isPresent, onTransitionEnd, finishExit } = usePresence(isOpen, {
    skipEntering: true,
    manualExit: isMobile,
  });

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
      className="fixed inset-0 z-[100] motion-presence-hold pointer-events-none"
    >
      <FullscreenEditorContent
        key={effectiveItem.id}
        item={effectiveItem}
        presencePhase={phase}
        onExited={finishExit}
      />
    </div>
  );
};
