// One note in the feed: reply swipe, width, OCR/expansion state, and the slots it composes.
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItem, SlagAttachment } from '../../types';
import { TaskStatusMark } from '../UI/TaskStatusMark';
import { Icon } from '../UI/icons/Icon';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { canEnrichAttachments, enrichAttachment } from '../../lib/media/enrichment/dispatch';
import { extractFocalContext } from '../../lib/media/enrichment/text';
import { PRIORITY_LABELS } from '../../lib/tasks/taskUtils';
import { formatDueStamp } from '../../lib/time/dateUtils';
import { MarkdownRenderer } from '../UI/MarkdownRenderer';
import { resolveAttachmentEmbeds } from '../../lib/text/attachmentEmbed';
import { useAttachmentSrcs } from '../../hooks/media/useAttachmentSrc';
import { UI_DELAYS, DEFAULT_INBOX_FOLDER } from '../../config';
import { TagChip } from '../UI/TagChip';
import { ItemCardActions } from './item/ItemCardActions';
import { ItemReplyBanner } from './item/ItemReplyBanner';
import { ItemSubtasks } from './item/ItemSubtasks';
import { ItemVideoNotes } from './item/ItemVideoNotes';
import { ItemAudioNotes } from './item/ItemAudioNotes';
import { ItemImages } from './item/ItemImages';
import { ItemFiles } from './item/ItemFiles';
import {
  attachmentCounts,
  buildItemLightboxImages,
  groupItemAttachments,
  itemCardShape,
} from './item/itemAttachments';

const CARD_TRANSITION =
  'transform var(--slag-motion-base) var(--ease-standard), ' +
  'background-color var(--slag-motion-base) var(--ease-standard), ' +
  'border-color var(--slag-motion-base) var(--ease-standard)';

/**
 * The card re-renders whenever anything in the app context moves, and remark re-parses the
 * whole note on every render. The content and its handler are the only inputs, so the parse
 * result is memoized: same note in, same subtree out.
 */
const CardMarkdown = React.memo(MarkdownRenderer);

export interface ItemCardProps {
  item: SlagItem;
  isHighlighted?: boolean;
  repliesCount?: number;
  firstReplyId?: string | null;
  replyParent?: SlagItem | null;
  onImageClick?: (img: SlagAttachment, currentItem: SlagItem) => void;
  /**
   * Layout offset from the list: the gap between two notes, merged into the card box.
   * A number, not a style object: the list rebuilds an object every render and that
   * alone was enough to defeat the memo on every card.
   */
  gap?: number;
}

const isGenericTitle = (title?: string): boolean => {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return (
    t === 'заметка' ||
    t === 'новая заметка' ||
    t === 'голосовая заметка' ||
    t === 'видео-сообщение' ||
    t === 'видеосообщение' ||
    t === 'изображение' ||
    t === 'вложение' ||
    t === 'черновик' ||
    t === 'без названия'
  );
};


const ItemCardComponent: React.FC<ItemCardProps> = ({
  item,
  isHighlighted = false,
  repliesCount = 0,
  firstReplyId = null,
  replyParent = null,
  onImageClick,
  gap,
}) => {
  const {
    toggleTaskComplete,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    setActiveTagFilter,
    openContextMenu,
    setReplyTarget,
    scrollToItem,
    navigateToFolder,
    currentFolder,
    openLightbox,
    isMobile,
    setMobileActionSheetItem,
    updateItem,
    aiSettings,
    addToast
  } = useApp();

  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [expandedOcrIds, setExpandedOcrIds] = useState<Set<string>>(new Set());
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [visibleTagCount, setVisibleTagCount] = useState(0);
  const [tagsRowWidth, setTagsRowWidth] = useState(0);
  const tagsRowRef = useRef<HTMLDivElement | null>(null);

  const handleToggleOcr = useCallback((id: string) => {
    setExpandedOcrIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleEnrichAttachment = useCallback(async (targetAtt: SlagAttachment) => {
    if (!canEnrichAttachments(aiSettings)) {
      addToast('Подписка неактивна, а свой ключ Groq не указан — распознавание недоступно', 'info');
      return;
    }
    const focalContext = extractFocalContext(item);
    const inFlightAttachments = item.attachments.map(a =>
      a.id === targetAtt.id ? { ...a, enrichmentStatus: 'processing' as const } : a
    );
    updateItem({ ...item, attachments: inFlightAttachments });

    try {
      const enriched = await enrichAttachment(targetAtt, focalContext, aiSettings);
      const updatedAttachments = item.attachments.map(a => a.id === targetAtt.id ? enriched : a);
      updateItem({ ...item, attachments: updatedAttachments });
    } catch {
      // quiet fallback
    }
  }, [aiSettings, item, updateItem, addToast]);

  const longPressTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapAtRef = useRef(0);
  const suppressTapRef = useRef(false);

  // ponytail: замер ряда даёт лишний reflow на карточку; IntersectionObserver на чип, если карточки потяжелеют
  useLayoutEffect(() => {
    const row = tagsRowRef.current;
    if (!row || !item.tags || item.tags.length === 0) return;

    // Невидимые чипы остаются в раскладке, поэтому замер видит все теги сразу
    // и не зависит от того, сколько показано в прошлом проходе.
    let usedPx = 0;
    let count = 0;
    const limit = row.clientWidth;
    for (const child of Array.from(row.children) as HTMLElement[]) {
      if (child.dataset.tagOverflow === '1' || child.offsetWidth === 0) continue;
      usedPx += child.offsetWidth + 6;
      if (usedPx <= limit) count += 1;
    }
    const next = Math.max(1, count);
    setVisibleTagCount(prev => (prev === next ? prev : next));

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setTagsRowWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [item.tags, tagsRowWidth]);

  const copyItemText = () => {
    const text = (item.content || '').trim() || item.title;
    navigator.clipboard
      .writeText(text)
      .then(() => addToast('Текст скопирован', 'success'))
      .catch(() => addToast('Не удалось скопировать', 'error'));
    try {
      navigator.vibrate?.(10);
    } catch {
      // Ignore: вибрация не критична
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (!isMobile) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, [role="button"], .cursor-pointer')) return;
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    const now = performance.now();
    if (now - lastTapAtRef.current < UI_DELAYS.DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      copyItemText();
      return;
    }
    lastTapAtRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      setSelectedItem(item);
      setIsFullscreenEditorOpen(true);
    }, UI_DELAYS.DOUBLE_TAP_MS);
  };

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }

    longPressTimerRef.current = window.setTimeout(() => {
      try {
        navigator.vibrate?.(UI_DELAYS.HAPTIC_VIBRATION_MS);
      } catch {
        // Ignore
      }
      setMobileActionSheetItem(item);
      suppressTapRef.current = true;
      longPressTimerRef.current = null;
    }, UI_DELAYS.LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;

    // Cancel long press on movement
    if (Math.hypot(dx, dy) > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
    }

    // Horizontal swipe left for reply (Telegram style)
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      setSwipeOffset(Math.max(-70, dx));
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (swipeOffset < -45) {
      try {
        navigator.vibrate?.(10);
      } catch {
        // Ignore
      }
      setReplyTarget(item);
    }
    setSwipeOffset(0);
    touchStartPosRef.current = null;
  };

  const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isTask = item.type === 'task';
  const isArticle = item.type === 'article';

  // A file the text already shows as `![[name]]` must not also appear in the gallery below:
  // the embed is the file's place on the card, and a second copy reads as two attachments.
  const embeddedAttachmentIds = useMemo(
    () => new Set(resolveAttachmentEmbeds(item.content ?? '', item.attachments).map(({ attachment }) => attachment?.id)),
    [item.content, item.attachments]
  );
  const galleryAttachments = useMemo(
    () => (item.attachments ?? []).filter(
      (attachment) => !embeddedAttachmentIds.has(attachment.id)
    ),
    [item.attachments, embeddedAttachmentIds]
  );
  // One bucket per kind, so each slot of the card gets its own list and the shape counts once.
  const attachmentGroups = useMemo(() => groupItemAttachments(galleryAttachments), [galleryAttachments]);
  // Bytes are not in the note any more: they are resolved from IndexedDB or `.attachments/`.
  // `missing` tells pictures apart from bytes still on their way.
  const { srcs: attachmentSrcs, missing: missingAttachmentSrcs } = useAttachmentSrcs(item.attachments);

  const shape = itemCardShape(item, attachmentCounts(attachmentGroups));
  const isVoiceBubble = shape === 'voice';
  const isFileBubble = shape === 'file';

  // A picture hugs its own width instead of pulling a column-wide slab behind it. The one
  // exception is the open OCR panel: prose needs a column, not a 200px strip.
  const isPictureBubble = shape === 'image' && expandedOcrIds.size === 0;
  const hasFloatingActions = isVoiceBubble || isFileBubble || isPictureBubble || shape === 'video';

  const handleImageClick = useCallback((img: SlagAttachment) => {
    if (onImageClick) {
      onImageClick(img, item);
      return;
    }
    const itemImages = buildItemLightboxImages(item, attachmentSrcs);
    const clickedIdx = itemImages.findIndex(i => i.id === img.id);
    openLightbox(itemImages, clickedIdx >= 0 ? clickedIdx : 0);
  }, [onImageClick, item, attachmentSrcs, openLightbox]);

  // A `![[file]]` chip in the text opens pictures in the lightbox; anything else opens the
  // note's rail, where a player or a download row already exists.
  const handleAttachmentClick = useCallback((attachment: SlagAttachment) => {
    if (attachment.type === 'image') {
      handleImageClick(attachment);
      return;
    }
    setSelectedItem(item);
    setIsFullscreenEditorOpen(true);
  }, [handleImageClick, item, setSelectedItem, setIsFullscreenEditorOpen]);

  const attachmentMarkdownProps = {
    attachments: item.attachments,
    attachmentSrcs,
    onAttachmentClick: handleAttachmentClick,
  };

  const folderDisplayName =
    item.folder !== DEFAULT_INBOX_FOLDER
      ? item.folder.split('/').filter(Boolean).pop() || item.folder
      : currentFolder !== DEFAULT_INBOX_FOLDER
        ? DEFAULT_INBOX_FOLDER
        : '';

  const metaElements: React.ReactNode[] = [];

  if (folderDisplayName) {
    metaElements.push(
      <button
        key="folder"
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigateToFolder(item.folder, item.id);
        }}
        className="text-2xs text-fg-muted hover:text-fg-soft font-mono transition-colors cursor-pointer hover:underline underline-offset-2 truncate max-w-[96px] text-left leading-none inline-flex items-center shrink-0"
        title={`Перейти в папку «${item.folder}» и перейти к этой записи`}
      >
        {folderDisplayName}
      </button>
    );
  }

  if (isArticle) {
    metaElements.push(
      <span
        key="article"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openContextMenu({
            x: rect.left,
            y: rect.bottom + 4,
            type: 'item',
            item,
          });
        }}
        className="text-2xs font-mono text-fg-muted hover:text-fg-soft cursor-pointer transition-colors hover:underline underline-offset-2 shrink-0"
        title="Сменить тип записи (клик или ПКМ)"
      >
        Статья
      </span>
    );
  }

  if (isTask && item.priority && item.priority !== 'none') {
    const priorityLabel = PRIORITY_LABELS[item.priority];
    metaElements.push(
      <span
        key="priority"
        className="flex items-center shrink-0"
        title={`Приоритет: ${priorityLabel}`}
        aria-label={`Приоритет: ${priorityLabel}`}
      >
        <LinearSignalBars priority={item.priority} className="w-3.5 h-3.5" />
      </span>
    );
  }

  if (isTask && item.dueDate) {
    const dueLabel = formatDueStamp(item.dueDate, item.reminder);
    metaElements.push(
      <span
        key="due"
        className="flex items-center gap-1 text-2xs text-fg-muted font-mono shrink-0"
        title={`Срок: ${dueLabel}`}
      >
        <Icon name="time.date" size="sm" tone="dim" />
        <span>{dueLabel}</span>
      </span>
    );
  }

  if (isTask && item.recurrence) {
    const streak = item.streak ?? 0;
    const isZero = streak === 0;
    metaElements.push(
      <span
        key="streak"
        className="flex items-center gap-1 text-2xs font-mono select-none shrink-0"
        title={isZero ? 'Серия прервана (0)' : `Серия: ${streak}`}
      >
        <Icon name="status.urgent" size="xs" tone="inherit" className={`shrink-0 ${isZero ? 'text-rose-400/80' : 'text-amber-400/90'}`} />
        <span className={isZero ? 'text-rose-400/80 font-medium' : 'text-fg-muted font-medium'}>
          {streak}
        </span>
      </span>
    );
  }

  if (item.isPinned) {
    metaElements.push(
      <span
        key="pin"
        className="flex items-center gap-1 text-2xs font-mono text-amber-400/90 shrink-0"
        title="Закрепленная запись"
      >
        <Icon name="action.pin" size="xs" tone="inherit" className="rotate-45 shrink-0" />
        <span>Закреп</span>
      </span>
    );
  }

  const hasBottomMeta =
    metaElements.length > 0 || Boolean(item.tags && item.tags.length > 0);

  const shouldRenderBottomBar = (shape !== 'voice' && shape !== 'file') || hasBottomMeta;

  // The step before the card is a number, so its style object outlives the list's re-renders.
  const cardStyle = useMemo<React.CSSProperties | undefined>(
    () => (gap && gap > 0 ? { marginTop: gap } : undefined),
    [gap],
  );

  const handleOpenArticle = useCallback(() => {
    setSelectedItem(item);
    setIsFullscreenEditorOpen(true);
  }, [item, setSelectedItem, setIsFullscreenEditorOpen]);

  const handleReply = useCallback(() => setReplyTarget(item), [item, setReplyTarget]);

  const handleToggleSubtask = useCallback(
    (subtaskId: string) => toggleTaskComplete(item.id, subtaskId),
    [item.id, toggleTaskComplete],
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'item',
      item,
    });
  };

  const handleDragStart = (e: React.DragEvent) => {
    // If dragging an interactive element (wiki-link, tag, button, input), prevent card drag
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button, [role="button"], input, textarea, .cursor-pointer')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const taskBodyContent = (() => {
    let text = item.content || '';
    if (item.subtasks && item.subtasks.length > 0) {
      text = text
        .split('\n')
        .filter(line => !/^\s*[-*+]\s*\[[ xX]\]\s*/.test(line))
        .join('\n')
        .trim();
    }
    if (item.title && text) {
      const normalizedTitle = item.title.trim().toLowerCase();
      const lines = text.split('\n');
      const firstLineClean = lines[0].replace(/^#+\s*/, '').trim().toLowerCase();
      if (firstLineClean === normalizedTitle) {
        text = lines.slice(1).join('\n').trim();
      }
    }
    return text;
  })();

  return (
    <div className={`relative w-full mx-auto feed-card-contain ${swipeOffset ? 'overflow-hidden' : ''}`}>
      {/* Background Reply Swipe Indicator */}
      {swipeOffset < 0 && (
        <div className="absolute inset-y-0 right-0 w-16 flex items-center justify-center text-blue-400">
          <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <Icon name="action.reply" size="md" tone="inherit" />
          </div>
        </div>
      )}

      <div
        id={`item-${item.id}`}
        data-flip-id={item.id}
        onClick={handleCardClick}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
          // One declaration for the card: a separate `transition-colors` class would
          // be overridden here, which is why the hover colour used to snap.
          transition: swipeOffset ? 'none' : CARD_TRANSITION,
          ...cardStyle,
        }}
        className={`group relative flex flex-col ${
          isVoiceBubble || isFileBubble
            ? 'gap-0 max-w-sm sm:max-w-md'
            : isPictureBubble || shape === 'video'
              ? 'gap-0 w-fit max-w-full'
              : 'gap-1.5 w-full'
        } p-2.5 sm:p-3 rounded-xl cursor-default select-none ${
          isHighlighted
            ? 'bg-accent/10 border border-accent/40 item-highlight-pulse'
            : 'bg-surface hover:bg-surface-hover'
        }`}
      >
        {/* Action Buttons: desktop inside card for full-width items; floating right for pure voice/file bubbles */}
        <ItemCardActions
          isFloating={hasFloatingActions}
          isArticle={isArticle}
          onReply={handleReply}
          onOpenArticle={handleOpenArticle}
        />

      {/* Reply Parent Quote Banner */}
      <ItemReplyBanner
        replyToId={item.replyToId}
        replyParent={replyParent}
        onScrollToParent={scrollToItem}
      />

      {/* Main Content Area */}
      {isTask ? (
        /* Task Variant */
        <div className="flex flex-col gap-2 pt-0.5">
          <div className="flex items-start gap-2.5">
            <button
              onClick={() => toggleTaskComplete(item.id)}
              title={item.status === 'done' ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
              aria-label="Изменить статус таски"
              className="mt-0.5 text-fg-secondary hover:text-white transition-colors shrink-0"
            >
              <TaskStatusMark done={item.status === 'done'} className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0 pr-14 sm:pr-16">
              <h3
                className={`text-base font-medium leading-snug tracking-tight ${
                  item.status === 'done'
                    ? 'line-through text-fg-muted'
                    : 'text-fg-primary'
                }`}
              >
                <CardMarkdown
                  content={item.title}
                  inline
                  onWikiLinkClick={scrollToItem}
                  className={item.status === 'done' ? 'line-through text-fg-muted' : 'text-fg-primary'}
                  {...attachmentMarkdownProps}
                />
              </h3>

              {taskBodyContent && (
                <div className="mt-1 text-sm text-fg-tertiary leading-relaxed font-normal">
                  <CardMarkdown content={taskBodyContent} onWikiLinkClick={scrollToItem} {...attachmentMarkdownProps} />
                </div>
              )}
            </div>
          </div>

          {/* Subtasks Section - Flat Linear layout */}
          <ItemSubtasks
            subtasks={item.subtasks}
            onToggle={handleToggleSubtask}
            onWikiLinkClick={scrollToItem}
          />
        </div>
      ) : isArticle ? (
        /* Article Variant - Clean Teaser, opens Focus Editor on click */
        <div className="flex flex-col gap-1.5 pt-0.5">
          <h3
            onClick={handleOpenArticle}
            className="text-base font-medium text-fg-primary tracking-tight flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors pr-14 sm:pr-20"
          >
            <Icon name="entity.article" size="md" className="shrink-0" />
            <span>{item.title}</span>
          </h3>

          <p
            onClick={handleOpenArticle}
            className="text-sm text-fg-tertiary line-clamp-3 leading-relaxed font-normal cursor-pointer hover:text-fg-primary transition-colors"
          >
            {item.summary || item.content.slice(0, 200)}
          </p>
        </div>
      ) : (
        /* Note Variant: pure stream note without title header (title is managed only in Focus Editor) */
        (() => {
          const hasContent = Boolean(item.content && item.content.trim());
          const hasAttachments = Boolean(item.attachments && item.attachments.length > 0);
          const textToRender = hasContent
            ? item.content
            : (!hasAttachments && item.title && !isGenericTitle(item.title) ? item.title : null);

          if (!textToRender) return null;

          return (
            <div className="flex flex-col gap-1.5 pr-14 sm:pr-16">
              <div className="text-sm text-fg-soft leading-relaxed font-normal">
                <CardMarkdown content={textToRender} onWikiLinkClick={scrollToItem} {...attachmentMarkdownProps} />
              </div>
            </div>
          );
        })()
      )}

      {/* Video Circle Notes (Telegram style) */}
      <ItemVideoNotes
        attachments={attachmentGroups.video}
        srcs={attachmentSrcs}
        onOpen={handleImageClick}
      />

      {/* Audio Notes Player */}
      <ItemAudioNotes
        attachments={attachmentGroups.audio}
        srcs={attachmentSrcs}
        isVoiceBubble={isVoiceBubble}
        formattedTime={formattedTime}
        onEnrich={handleEnrichAttachment}
      />

      {/* Pictures: one keeps its own shape, a pile fills one canvas */}
      <ItemImages
        images={attachmentGroups.image}
        srcs={attachmentSrcs}
        missing={missingAttachmentSrcs}
        isPictureBubble={isPictureBubble}
        expandedOcrIds={expandedOcrIds}
        onToggleOcr={handleToggleOcr}
        onImageClick={handleImageClick}
        onEnrich={handleEnrichAttachment}
      />

      {/* File Attachments */}
      <ItemFiles
        attachments={attachmentGroups.file}
        srcs={attachmentSrcs}
        isFileBubble={isFileBubble}
        formattedTime={formattedTime}
      />

      {/* Bottom Bar: Metadata & Tags on left + Timestamp on right */}
      {shouldRenderBottomBar && (
        <div
          data-testid="item-meta-row"
          className="flex items-center gap-2 pt-1 min-h-[16px] w-full select-none"
        >
          {hasBottomMeta ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-nowrap">
              {metaElements.map((el, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />}
                  {el}
                </React.Fragment>
              ))}

              {/* Separator between metadata and tags */}
              {metaElements.length > 0 && item.tags && item.tags.length > 0 && (
                <span className="w-1 h-1 rounded-full bg-fg-dim/80 inline-block shrink-0" />
              )}

              {/* Tags with overflow folding */}
              {item.tags && item.tags.length > 0 && (() => {
                if (isMobile) {
                  const shown = Math.max(1, visibleTagCount);
                  const hidden = item.tags.length - shown;
                  return (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <div
                        ref={tagsRowRef}
                        data-testid="item-tags-row"
                        className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-nowrap"
                      >
                        {item.tags.map((tag, idx) => (
                          <TagChip
                            key={tag}
                            tag={tag}
                            variant="flat"
                            // Скрытие через visibility: чип остаётся в раскладке и меряется.
                            className={idx < shown ? '' : 'invisible'}
                            onClick={() => setActiveTagFilter(tag)}
                          />
                        ))}
                      </div>
                      {hidden > 0 && (
                        <span
                          data-tag-overflow="1"
                          className="shrink-0 text-2xs font-mono text-fg-muted"
                        >
                          +{hidden}
                        </span>
                      )}
                    </div>
                  );
                }

                const maxVisible = 3;
                const hasOverflow = item.tags.length > maxVisible;
                const visibleTags = isTagsExpanded || !hasOverflow ? item.tags : item.tags.slice(0, maxVisible);
                const hiddenCount = item.tags.length - maxVisible;

                return (
                  <div
                    data-testid="item-tags-row"
                    className={`flex items-center gap-1.5 min-w-0 overflow-hidden ${
                      isTagsExpanded ? 'flex-wrap' : 'flex-nowrap'
                    }`}
                  >
                    {visibleTags.map(tag => (
                      <TagChip
                        key={tag}
                        tag={tag}
                        variant="flat"
                        onClick={() => setActiveTagFilter(tag)}
                      />
                    ))}
                    {hasOverflow && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTagsExpanded(prev => !prev);
                        }}
                        className="text-2xs font-mono text-fg-muted hover:text-fg-tertiary transition-colors cursor-pointer select-none leading-none shrink-0"
                        title={isTagsExpanded ? 'Свернуть теги' : `Показать ещё ${hiddenCount} тегов`}
                      >
                        {isTagsExpanded ? 'свернуть' : `+${hiddenCount}`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div />
          )}

          {!isVoiceBubble && (
            <span className="text-2xs font-mono text-fg-muted select-none ml-auto shrink-0 leading-none">
              {formattedTime}
            </span>
          )}
        </div>
      )}

      {/* Replies Count Link */}
      {repliesCount > 0 && (
        <button
          onClick={() => {
            if (firstReplyId) scrollToItem(firstReplyId);
          }}
          className="flex items-center gap-1.5 text-2xs font-mono text-fg-muted hover:text-blue-400 transition-colors pt-1 select-none w-fit"
        >
          <Icon name="action.reply" size="sm" tone="muted" className="rotate-180" />
          <span>{repliesCount} {repliesCount === 1 ? 'ответ' : repliesCount < 5 ? 'ответа' : 'ответов'}</span>
        </button>
      )}
      </div>
    </div>
  );
};

export const ItemCard = React.memo(ItemCardComponent);
