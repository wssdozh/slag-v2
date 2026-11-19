// The create-a-note form: wiring, the autocomplete overlay, and composition of `composer/`.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagItemType, SlagItemStatus } from '../../types';
import { AudioRecorder } from '../UI/AudioRecorder';
import { VideoRecorder } from '../UI/VideoRecorder';
import { useComposerMedia } from '../../hooks/media/useComposerMedia';
import { parseTodoistInput, type ParsedTodoistTask } from '../../lib/time/todoistTaskParser';
import { BaseComposer } from './BaseComposer';
import { useComposerFiles } from './composer/useComposerFiles';
import { ToolbarButton } from '../UI/ToolbarButton';
import { TaskMetaBar } from '../UI/TaskMetaBar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { FolderSuggestionMenu } from './FolderSuggestionMenu';
import { TagSuggestionMenu } from './TagSuggestionMenu';
import { SuggestionMenuShell } from './SuggestionMenuShell';
import { formatDueDateLabel, getTodayIso } from '../../lib/time/dateUtils';
import { reminderClockLabel, reminderToIso, shiftReminderToDay } from '../../lib/time/reminder';
import { DEFAULT_INBOX_FOLDER, UI_DELAYS } from '../../config';
import { getPref } from '../../lib/storage/prefs';
import { Icon } from '../UI/icons/Icon';
import { useComposerDraft } from './composer/useComposerDraft';
import { rememberComposerDraft } from '../Editor/fullscreen/composerDraftOwner';
import { useComposerAutocomplete } from './composer/useComposerAutocomplete';
import { ComposerReplyBanner } from './composer/ComposerReplyBanner';
import { ComposerAttachmentStrip } from './composer/ComposerAttachmentStrip';
import { ComposerTypeSelector } from './composer/ComposerTypeSelector';
import { ComposerAiButton } from './composer/ComposerAiButton';
import { ComposerRecordButton } from './composer/ComposerRecordButton';
import { useComposerAiTags } from './composer/useComposerAiTags';
import { useComposerSlashCommands } from './composer/useComposerSlashCommands';
import { useComposerSubmit } from './composer/useComposerSubmit';
import { resolveComposerFields, type ComposerDismissals } from './composer/composerFields';
import { buildComposerHighlights, type ComposerHighlight } from './composer/composerHighlights';
import type { ComposerEditorKeyEvent } from './composer/ComposerEditorField';
import { useComposerField, type ComposerEngine } from './composer/useComposerField';

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
    openAttachSheet,
  } = useApp();

  const effectiveDefaultFolder = isModal ? DEFAULT_INBOX_FOLDER : (initialFolder || currentFolder);
  const activeFolder = effectiveDefaultFolder;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // The markdown surface keeps its host here; the handle resolves the live view from it.
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  // The composer talks to the field through this handle, never to the DOM node directly.
  const [engine] = useState<ComposerEngine>(() => {
    // Explicit opt-out wins; automation keeps the plain field so the existing specs, which
    // drive a <textarea>, still describe a real surface. The live-preview spec opts in.
    const stored = getPref('slag:composer-engine');
    if (stored === 'textarea' || stored === 'markdown') return stored;
    const automated = typeof navigator !== 'undefined' && navigator.webdriver;
    return automated ? 'textarea' : 'markdown';
  });
  const field = useComposerField(textareaRef, editorContainerRef, engine);
  const [documentId] = useState(() => `composer-draft-${Date.now()}`);

  const [taskStatus] = useState<SlagItemStatus>(initialStatus || 'todo');
  const [reminder, setReminder] = useState<string | undefined>(initialReminder);

  // Todoist parser & Ghost-chips state
  const [parsedTask, setParsedTask] = useState<ParsedTodoistTask | null>(null);
  const [isDateDismissed, setIsDateDismissed] = useState(false);
  const [isPriorityDismissed, setIsPriorityDismissed] = useState(false);
  const [isDurationDismissed, setIsDurationDismissed] = useState(false);
  const [isRecurrenceDismissed, setIsRecurrenceDismissed] = useState(false);
  const [isTimeDismissed, setIsTimeDismissed] = useState(false);
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
    field,
    isModal,
    isActive,
    isFullscreenEditorOpen,
    onResetExtra: () => {
      clearQueries();
      setParsedTask(null);
      setIsDateDismissed(false);
      setIsPriorityDismissed(false);
      setIsTimeDismissed(false);
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
    items,
    folders,
    field,
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

  const { isGeneratingAiTags, generateAiTags } = useComposerAiTags({
    content,
    attachmentCount: attachments.length,
    currentFolder,
    folders,
    aiSettings,
    setContent,
    setTargetFolder,
    addToast,
  });

  const { executeSlashCommand } = useComposerSlashCommands({
    content,
    setContent,
    field,
    setItemType,
    setDueDate,
    setPriority,
    setIsDateDismissed,
    setIsPriorityDismissed,
    setSlashQuery,
    setIsRecordingAudio,
    setIsRecordingVideo,
    activeFolder,
    resetDraftState,
    generateAiTags,
    addToast,
  });

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

  // Focus the field when replying or when mounted in modal
  useEffect(() => {
    if (replyTarget || isModal) {
      field.focus();
    }
  }, [replyTarget, isModal, field]);

  // One path for both surfaces: CodeMirror hands the text, the textarea hands an event.
  const applyContent = (text: string) => {
    notifyUserEdit();
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

    const cursorPos = field.getSelection().from || text.length;
    updateAutocompleteQueries(text, cursorPos);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    applyContent(e.target.value);
  };

  // Draft restore, `/clear` and the AI tag pass all change `content` behind the field's back:
  // push those into the CodeMirror document so the two never drift apart.
  useEffect(() => {
    if (engine !== 'markdown') return;
    if (field.getValue() !== content) field.setValue(content);
  }, [content, engine, field]);

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const dismissals: ComposerDismissals = {
    isPriorityDismissed,
    isDateDismissed,
    isRecurrenceDismissed,
    isDurationDismissed,
    isTimeDismissed,
    dismissedTags,
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

  // The parser understands «в 10:00» too: the time it found wins until a person edits the field.
  const effectiveReminder = itemType === 'task'
    ? (!isTimeDismissed && parsedTask?.reminder ? parsedTask.reminder : reminder)
    : undefined;

  const effectiveDueTime = reminderClockLabel(effectiveReminder);

  // What the parser understood, painted right in the field: the date and tags in the
  // mention tone, the priority in the one the priority bars already use.
  const inlineHighlights = useMemo<ComposerHighlight[]>(() => {
    const parsed = buildComposerHighlights(content, parsedTask, { isDateDismissed, isPriorityDismissed });
    if (!folderTokenRange) return parsed;
    return [...parsed, { ...folderTokenRange, kind: 'tag' as const }];
  }, [content, parsedTask, isDateDismissed, isPriorityDismissed, folderTokenRange]);

  const {
    isDraggingOver, handleDragOver, handleDragLeave, handleDrop, handlePaste,
  } = useComposerFiles({ addToast, setAttachments, field, isModal, isActive });

  const { handleSend, handleRecordedAudio, handleRecordedVideo } = useComposerSubmit({
    content,
    itemType,
    tags,
    attachments,
    priority,
    dueDate,
    reminder,
    duration,
    recurrence,
    taskStatus,
    replyTarget,
    targetFolder,
    effectiveDefaultFolder,
    activeFolder,
    folders,
    aiSettings,
    dismissals,
    saveItem,
    updateItem,
    setAttachments,
    setIsRecordingAudio,
    setIsRecordingVideo,
    setRecordMode,
    setLockHint,
    resetDraftState,
    field,
    onComplete,
  });

  // Expand into Fullscreen Focus Mode directly from composer
  const handleExpandToFullscreen = () => {
    const fields = resolveComposerFields({
      content,
      folders,
      itemType,
      tags,
      priority,
      dueDate,
      reminder,
      duration,
      recurrence,
      dismissals,
    });

    const firstLine = fields.firstLine || (itemType === 'article' ? 'Новая статья' : 'Черновик');
    const taskTitle = itemType === 'task'
      ? (fields.cleanTitle || 'Новая таска')
      : firstLine;

    // Create a temporary draft object in memory WITHOUT saving to vault storage yet
    const draftItem: SlagItem = {
      id: 'draft_' + Date.now(),
      type: itemType,
      title: taskTitle,
      content: fields.finalContent,
      folder: fields.folder?.path || targetFolder || currentFolder,
      tags: fields.tags,
      attachments,
      replyToId: replyTarget?.id,
      priority: fields.priority,
      dueDate: fields.dueDate,
      reminder: fields.reminder,
      duration: fields.duration,
      recurrence: fields.recurrence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    rememberComposerDraft(draftItem, activeFolder, {
      content, itemType, priority, dueDate, tags, attachments, replyTarget,
      targetFolder, duration, recurrence, updatedAt: Date.now(),
    });
    setSelectedItem(draftItem);
    setIsFullscreenEditorOpen(true);
  };

  const handleKeyDown = (e: ComposerEditorKeyEvent) => {
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

    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSend();
    }
  };

  const topSlot = (
    <>
      {/* Reply Banner (Flat, Anti-Matryoshka) */}
      <ComposerReplyBanner replyTarget={replyTarget} />

      {/* Attachments Preview Strip */}
      <ComposerAttachmentStrip attachments={attachments} onRemove={removeAttachment} />
    </>
  );

  const overlaySlot = (
    <>
      <FolderSuggestionMenu
        isOpen={folderQuery !== null}
        query={folderQuery ?? lastFolderQuery}
        rows={folderQuery !== null ? matchingFolders : lastMatchingFolders}
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
                isSelected ? 'bg-tint-10 text-white font-medium' : 'text-fg-tertiary hover:bg-tint-5'
              }`}
            >
              {wikiItem.type === 'task' && <Icon name="entity.task" size="sm" tone="warning" className="shrink-0" />}
              {wikiItem.type === 'article' && <Icon name="entity.article" size="sm" tone="accent" className="shrink-0" />}
              {wikiItem.type === 'note' && <Icon name="entity.note" size="sm" className="shrink-0" />}
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
        <div className="absolute bottom-full mb-3 right-2 z-50 px-3 py-1.5 rounded-full bg-surface border border-tint-10 shadow-2xl flex items-center gap-2 text-2xs font-mono text-fg-soft pointer-events-none motion-popover">
          <Icon name="action.lock" size="sm" tone="accent" className="animate-bounce" />
          <span>Потяните вверх для фиксации</span>
        </div>
      )}

      {/* +AI Smart Tagging Button - Icon Only */}
      <ComposerAiButton isGenerating={isGeneratingAiTags} onClick={generateAiTags} />

      {/* Record Type Selector (Ghost droplist: icon + label + chevron, larger touch target) */}
      <ComposerTypeSelector value={itemType} onChange={setItemType} />

      {/* Task properties sit with the type selector, under the input */}
      {itemType === 'task' && (
        <TaskMetaBar
          size="md"
          direction="up"
          priority={effectivePriority}
          onPriorityChange={(val) => {
            setPriority(val);
            setIsPriorityDismissed(false);
          }}
          dueDate={effectiveDueDate}
          dateLabel={effectiveDateLabel}
          onDateChange={(newDate) => {
            // The reminder rides the day, exactly like the editor's: picking a new date must not
            // leave the time pinned to the old one.
            setReminder((prev) => shiftReminderToDay(prev ?? effectiveReminder, effectiveDueDate, newDate));
            setDueDate(newDate);
            setIsDateDismissed(false);
            setIsTimeDismissed(false);
          }}
          onDateClear={() => {
            setIsDateDismissed(true);
            setIsTimeDismissed(true);
            setDueDate('');
            setReminder(undefined);
          }}
          dueTime={effectiveDueTime}
          onDueTimeChange={(time) => {
            setIsTimeDismissed(!time);
            setReminder(time ? reminderToIso(effectiveDueDate || getTodayIso(), time) : undefined);
            if (time && !effectiveDueDate) setIsDateDismissed(false);
          }}
          duration={effectiveDuration}
          onDurationChange={(mins) => {
            setDuration(mins);
            setIsDurationDismissed(mins === undefined);
          }}
          recurrence={effectiveRecurrence}
          onRecurrenceChange={(rule) => {
            setRecurrence(rule);
            setIsRecurrenceDismissed(!rule);
          }}
        />
      )}
    </div>
  );

  const rightControls = (
    <ToolbarButton
      size="md"
      onClick={() => openAttachSheet((attachments) => setAttachments(prev => [...prev, ...attachments]))}
      className="composer-toolbar-control composer-toolbar-icon"
      title="Прикрепить файл"
      aria-label="Прикрепить файл"
      icon={<Icon name="action.attach" size="md" tone="inherit" />}
    />
  );

  const sendButton =
    !content.trim() && attachments.length === 0 ? (
      <ComposerRecordButton
        mediaType={mobileMediaType}
        onPointerDown={handleMobileMediaPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    ) : undefined;

  return (
    <BaseComposer
      value={content}
      variant={variant ?? (isModal ? 'flat' : 'card')}
      minHeight={24}
      mode={engine}
      editorContainerRef={engine === 'markdown' ? editorContainerRef : undefined}
      documentId={documentId}
      onTextChange={applyContent}
      onEditorKeyDown={handleKeyDown}
      onChange={handleContentChange}
      onSubmit={handleSend}
      onKeyDown={(event) => handleKeyDown(event)}
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
      highlights={inlineHighlights}
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
                className="text-fg-secondary hover:text-fg-soft"
                icon={<Icon name="action.close" size="sm" tone="inherit" />}
              />
            )}
            {!isModal && (
              <ToolbarButton
                size="sm"
                onClick={handleExpandToFullscreen}
                title="Раскрыть в полноэкранный редактор"
                aria-label="Раскрыть в полноэкранный редактор"
                className="flex text-fg-secondary hover:text-fg-soft"
                icon={<Icon name="action.expand" size="sm" tone="inherit" />}
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
      className={isRecordingAudio ? 'max-w-[420px]' : isModal ? 'w-full' : 'max-w-[var(--feed-content-width,42rem)]'}
    />
  );
};
