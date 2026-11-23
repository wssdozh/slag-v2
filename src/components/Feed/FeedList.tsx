// The feed: render window, sentinels and the composition of cards; the edges live in `list/`.
import { selectVisibleItems } from '../../context/feed/feedView';
import type { TaskQuickFilter } from '../../lib/tasks/taskQuickFilter';
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useApp } from '../../context/AppContext';
import { ItemCard } from './ItemCard';
import type { SlagAttachment, SlagItem, LightboxImage } from '../../types';
import { FeedTaskSection } from './list/FeedTaskSection';
import { Icon } from '../UI/icons/Icon';
import { EmptyState } from '../UI/EmptyState';
import { Button } from '../UI/Button';
import { processFileListToAttachments } from '../../lib/media/fileDropHelper';
import { canEnrichAttachments, enrichItemAttachments } from '../../lib/media/enrichment/dispatch';
import { PinnedBanner } from './PinnedBanner';
import { FeedColumnResizer } from './FeedColumnResizer';
import { useFlipLayout } from '../../hooks/layout/useFlipLayout';
import { prefersReducedMotion } from '../../lib/motion';
import { usePullToSearch } from '../../hooks/gestures/usePullToSearch';
import { FeedDropOverlay } from './list/FeedDropOverlay';
import { FeedDateBubble } from './list/FeedDateBubble';
import { FeedScrollHint } from './list/FeedScrollHint';
import {
  WINDOW_CHUNK,
  groupFeedByDate,
  hasOlderItems,
  nextWindowSize,
  partitionFeedBySchedule,
  takeWindow,
  windowSizeAroundTarget,
} from './list/feedWindow';

// Writes the owner's own scroll position and leaves a mark, so the resulting scroll event is not
// mistaken for the reader leaving the bottom. A write that changes nothing leaves no mark.
function pinScroll(container: HTMLElement, top: number, target: { current: number | null }) {
  if (container.scrollTop === top) return;
  container.scrollTop = top;
  // The browser may clamp (a scrollHeight target becomes scrollHeight - clientHeight); remember
  // what actually landed, not what was asked.
  target.current = container.scrollTop;
}

// Within this distance of the bottom the note is arriving in front of the reader:
// settle the list in the same frame as the render, so the movement is the one FLIP
// animation instead of a glide plus a smooth scroll racing each other.

export const FeedList: React.FC<{ taskFilter?: TaskQuickFilter }> = ({ taskFilter }) => {
  const {
    today,
    items,
    vault,
    openContextMenu,
    saveItem,
    updateItem,
    aiSettings,
    currentFolder,
    activeTypeFilter,
    activeTagFilter,
    inboxMode,
    hideCompletedTasks,
    aiItemFilter,
    sortBy,
    sortOrder,
    addToast,
    highlightedItemId,
    openLightbox,
    isPinnedOnlyFilter,
    togglePinnedOnlyFilter,
    setIsSearchOpen,
  } = useApp();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  // Past either end there is nothing left to scroll, so the same drag opens search.
  const { pull, side: pullSide, handlers: pullHandlers } = usePullToSearch({
    onTrigger: () => setIsSearchOpen(true),
  });

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Окно всегда прижато к новым записям: размер — единственная ручка.
  const [windowSize, setWindowSize] = useState(WINDOW_CHUNK);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Fast O(1) item lookup map for reply targets
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  // Precomputed reply counts & first reply IDs in a single pass across items
  const replyMetaMap = useMemo(() => {
    const countMap = new Map<string, number>();
    const firstReplyMap = new Map<string, string>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.replyToId) {
        countMap.set(it.replyToId, (countMap.get(it.replyToId) || 0) + 1);
        if (!firstReplyMap.has(it.replyToId)) {
          firstReplyMap.set(it.replyToId, it.id);
        }
      }
    }
    return { countMap, firstReplyMap };
  }, [items]);

  const filteredItems = useMemo(() => selectVisibleItems(items, {
    currentFolder, inboxMode, activeTypeFilter, activeTagFilter, isPinnedOnlyFilter,
    hideCompletedTasks, aiItemFilter, sortBy, sortOrder,
  }, taskFilter), [items, currentFolder, inboxMode, activeTypeFilter, activeTagFilter,
    isPinnedOnlyFilter, hideCompletedTasks, aiItemFilter, sortBy, sortOrder, taskFilter]);

  // Windowed items: последние `windowSize` записей, новее всегда в кадре
  const { history, scheduledToday, overdue } = useMemo(() => partitionFeedBySchedule(filteredItems, today), [filteredItems, today]);
  const windowedItems = useMemo(() => takeWindow(history, windowSize), [history, windowSize]);

  // The note keeps attachment metadata and nothing else: every card resolves the bytes it shows
  // (`ItemCard`), and the viewer resolves a slide when it becomes one of the mounted neighbours.
  // The folder used to be preloaded here for the deck, which cost a folder of bytes for fifteen cards.

  // Stable handler for image lightbox in feed
  const handleImageClick = useCallback((img: SlagAttachment) => {
    const folderImages: LightboxImage[] = filteredItems.flatMap(it =>
      (it.attachments || [])
        // Photos and clips in one deck: the viewer pages through the folder the way it opened.
        .filter(att => att.type === 'image' || att.type === 'video')
        .map(att => ({
          id: att.id,
          name: att.name,
          // Only bytes that arrived inline are carried; the rest are resolved by the slide itself.
          url: att.dataUrl ?? '',
          kind: att.type === 'video' ? ('video' as const) : ('image' as const),
          extractedText: att.extractedText,
          summary: att.summary,
          enrichmentStatus: att.enrichmentStatus,
          enrichmentError: att.enrichmentError,
          sourceItem: it,
        }))
    );
    const clickedIdx = folderImages.findIndex(i => i.id === img.id);
    openLightbox(folderImages, clickedIdx >= 0 ? clickedIdx : 0);
  }, [filteredItems, openLightbox]);

  // Sync state during render on folder or filter change (React pure pattern)
  const filterKey = JSON.stringify([currentFolder, activeTypeFilter, activeTagFilter, taskFilter?.id, taskFilter?.today]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setWindowSize(WINDOW_CHUNK);
  }

  // Permanently expand the window during render when an item is targeted (React pure pattern)
  const highlightKey = `${filterKey}:${highlightedItemId || ''}`;
  const [prevHighlightKey, setPrevHighlightKey] = useState(highlightKey);
  if (prevHighlightKey !== highlightKey) {
    setPrevHighlightKey(highlightKey);
    if (highlightedItemId) {
      const targetIdx = history.findIndex(i => i.id === highlightedItemId);
      const grown = windowSizeAroundTarget(windowSize, history.length, targetIdx);
      if (grown !== windowSize) setWindowSize(grown);
    }
  }

  const prependAnchorRef = useRef<{ id: string; top: number; viewKey: string; aiFilter: typeof aiItemFilter } | null>(null);
  const skipFeedMotionRef = useRef(false);
  const viewKey = JSON.stringify([vault.id, highlightKey, inboxMode, isPinnedOnlyFilter, hideCompletedTasks, sortBy, sortOrder]);

  const hasMoreOlder = hasOlderItems(history.length, windowSize);
  const isStuckToBottomRef = useRef(true);
  // Auto-follow writes scrollTop itself. Those events must not be read as a reader leaving the
  // bottom; a scroll the code did not write is a reader (or an explicit jump).
  const programmaticScrollRef = useRef<number | null>(null);

  // Load more older items with scroll position preservation. An explicit click always opens
  // history and hands scroll ownership to the reader; only the automatic sentinel yields to the
  // pinned bottom, where growing the window would pull the reader away from the newest note.
  const loadMoreOlder = useCallback((auto = false) => {
    const container = containerRef.current;
    if (!container || !hasMoreOlder) return;
    if (auto && container.scrollHeight - container.scrollTop - container.clientHeight <= 40) return;
    if (!auto) isStuckToBottomRef.current = false;
    // Предыдущая догрузка ещё держит анкор: вторая подряд даёт скачок.
    if (prependAnchorRef.current) return;

    const viewport = container.getBoundingClientRect();
    for (const card of container.querySelectorAll<HTMLElement>('[data-flip-id]')) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
      prependAnchorRef.current = { id: card.dataset.flipId!, top: rect.top - viewport.top, viewKey, aiFilter: aiItemFilter };
      break;
    }

    setWindowSize(prev => nextWindowSize(prev, history.length));
  }, [hasMoreOlder, history.length, viewKey, aiItemFilter]);

  const syncAnchorRef = useRef<{
    items: typeof items;
    viewKey: string;
    aiFilter: typeof aiItemFilter;
    scrollTop: number;
    cards: { id: string; top: number }[];
  } | null>(null);

  // The sync event precedes React's publication of the new items. Capture the
  // live viewport, not a stale FLIP snapshot or geometry from a scroll handler.
  useLayoutEffect(() => {
    const capture = (event: Event) => {
      if ((event as CustomEvent<{ hasItemsChanged?: boolean }>).detail?.hasItemsChanged === false) return;
      const container = containerRef.current;
      if (!container || highlightedItemId || isStuckToBottomRef.current || syncAnchorRef.current) return;
      const viewport = container.getBoundingClientRect();
      const cards = [...container.querySelectorAll<HTMLElement>('[data-flip-id]')].flatMap((card) => {
        const rect = card.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom
          ? [{ id: card.dataset.flipId!, top: rect.top - viewport.top }]
          : [];
      });
      // Prefer the first readable top; keep partially visible cards as fallbacks.
      const first = cards.findIndex(({ top }) => top >= 0);
      if (first > 0) cards.push(...cards.splice(0, first));
      if (cards.length) syncAnchorRef.current = { items, viewKey, aiFilter: aiItemFilter, scrollTop: container.scrollTop, cards };
    };
    window.addEventListener('slag-sync-updated', capture);
    return () => window.removeEventListener('slag-sync-updated', capture);
  }, [items, viewKey, aiItemFilter, highlightedItemId]);

  // One owner of the scroll position: a prepend restores the anchor, and a note
  // appended at the bottom settles before the motion is measured. Keep it a single
  // jump in the same frame — a smooth scroll on top of the card animation reads as a
  // bounce, and it also runs when the reader is nowhere near the composer.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const anchor = prependAnchorRef.current;
    prependAnchorRef.current = null;
    skipFeedMotionRef.current = false;
    const remote = syncAnchorRef.current;
    if (remote && (remote.items !== items || remote.viewKey !== viewKey || remote.aiFilter !== aiItemFilter)) {
      syncAnchorRef.current = null;
      if (!anchor && !highlightedItemId && !isStuckToBottomRef.current && remote.viewKey === viewKey && remote.aiFilter === aiItemFilter) {
        const top = container.getBoundingClientRect().top;
        for (const candidate of remote.cards) {
          const card = container.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(candidate.id)}"]`);
          if (!card) continue;
          pinScroll(container, container.scrollTop + card.getBoundingClientRect().top - top - candidate.top, programmaticScrollRef);
          // A whole-list glide would put the anchored card back in motion.
          skipFeedMotionRef.current = true;
          return;
        }
      }
    }
    if (anchor && anchor.viewKey === viewKey && anchor.aiFilter === aiItemFilter) {
      skipFeedMotionRef.current = true;
      const card = container.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(anchor.id)}"]`);
      if (card) {
        // Correct only the movement that remains after any browser anchoring.
        const offset = card.getBoundingClientRect().top - container.getBoundingClientRect().top;
        pinScroll(container, container.scrollTop + offset - anchor.top, programmaticScrollRef);
        return;
      }
    }

    if (highlightedItemId) return;
    if (isStuckToBottomRef.current) {
      pinScroll(container, container.scrollHeight, programmaticScrollRef);
    }
  });

  // Cards glide when the list shrinks or reorders; a note appended at the end rises
  // from under the composer instead. Runs after the settle above, so the measured
  // boxes are the final ones and the delta carries the scroll the list just took.
  useFlipLayout(containerRef, windowedItems.map(item => item.id).join('|'), {
    enterFromBelow: true,
    skipMotionRef: skipFeedMotionRef,
  });

  // The keyboard and a growing composer resize the scrollport without rendering this list.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (isStuckToBottomRef.current && !highlightedItemId) {
        pinScroll(container, container.scrollHeight, programmaticScrollRef);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [highlightedItemId]);

  // Dedicated anchoring effect when an item is highlighted / targeted via wiki-link
  useEffect(() => {
    if (!highlightedItemId) return;
    const container = containerRef.current;
    if (!container) return;

    // Immediately un-pin from bottom so layout settling doesn't yank scroll back
    isStuckToBottomRef.current = false;

    let rafId: number;
    let timerId: ReturnType<typeof setTimeout>;

    const tryScrollToTarget = (attempt = 0) => {
      const el = document.getElementById(`item-${highlightedItemId}`);
      if (!el || !container) {
        if (attempt < 15) {
          timerId = setTimeout(() => tryScrollToTarget(attempt + 1), 35);
        }
        return;
      }

      isStuckToBottomRef.current = false;

      // Calculate exact centered position relative to feed container (no ancestor scroll jitter)
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const currentRelTop = elRect.top - containerRect.top;
      const targetScrollTop = container.scrollTop + currentRelTop - (container.clientHeight / 2) + (el.clientHeight / 2);

      const targetClamped = Math.max(0, Math.round(targetScrollTop));
      const distance = Math.abs(container.scrollTop - targetClamped);

      // If note is far away (>900px), leap close first then smooth-magnetize the final 200px
      if (distance > 900) {
        const intermediate = targetClamped > container.scrollTop
          ? targetClamped - 200
          : targetClamped + 200;
        container.scrollTop = Math.max(0, intermediate);
      }

      container.scrollTo({
        top: targetClamped,
        behavior: 'smooth',
      });
    };

    rafId = requestAnimationFrame(() => tryScrollToTarget(0));

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [highlightedItemId, currentFolder]);

  // Top sentinel intersection observer to auto-load older items when scrolling up
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMoreOlder) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          loadMoreOlder(true);
        }
      },
      { root: containerRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreOlder, loadMoreOlder]);

  const prevFolderForScrollRef = useRef(currentFolder);

  // Instant scroll-to-bottom strictly on folder switch
  useLayoutEffect(() => {
    if (prevFolderForScrollRef.current !== currentFolder) {
      prevFolderForScrollRef.current = currentFolder;
      if (!highlightedItemId) {
        isStuckToBottomRef.current = true;
        const container = containerRef.current;
        if (container) {
          pinScroll(container, container.scrollHeight, programmaticScrollRef);
        }
      }
    }
  }, [currentFolder, highlightedItemId]);

  // Multi-pass settling (RAF + timer) to ensure bottom-pin after async markdown/image layout shifts
  useEffect(() => {
    if (!isStuckToBottomRef.current || highlightedItemId) return;
    const container = containerRef.current;
    if (!container) return;

    const snap = () => {
      if (isStuckToBottomRef.current && !highlightedItemId && container) {
        pinScroll(container, container.scrollHeight, programmaticScrollRef);
      }
    };

    const rafId = requestAnimationFrame(snap);
    const timerId = setTimeout(snap, 60);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [currentFolder, windowedItems, highlightedItemId]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = programmaticScrollRef.current;
    programmaticScrollRef.current = null;
    const fromProgrammatic = target !== null && Math.abs(container.scrollTop - target) < 1;
    const pendingAnchor = syncAnchorRef.current;
    if (pendingAnchor && pendingAnchor.scrollTop !== container.scrollTop) syncAnchorRef.current = null;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // Bottom is regained by geometry; losing it takes a scroll this code did not write. A
    // programmatic snap, a window growth or a resize cannot unpin the reader.
    if (!highlightedItemId) {
      if (distFromBottom <= 40) {
        isStuckToBottomRef.current = true;
      } else if (!fromProgrammatic) {
        isStuckToBottomRef.current = false;
      }
    }
    setShowScrollBottom(!isStuckToBottomRef.current && distFromBottom > 220);

    // Выгрузка только внизу: там окно прижато к новым, срезание старых не двигает
    // видимую часть. По дороге вверх окно не трогаем — иначе догрузка и выгрузка
    // дёргают друг друга на каждом кадре скролла.
    // ponytail: выгрузка по «прилипанию к низу»; индексная виртуализация, если карточки станут тяжёлыми
    if (
      !highlightedItemId &&
      isStuckToBottomRef.current &&
      windowSize > WINDOW_CHUNK
    ) {
      setWindowSize(WINDOW_CHUNK);
    }
  }, [highlightedItemId, windowSize]);

  const scrollToBottom = useCallback(() => {
    isStuckToBottomRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    // Reduced motion: one write, no glide. The write is marked like every other bottom snap, so
    // its scroll event cannot unpin and the return control never appears on the way down.
    if (prefersReducedMotion()) {
      pinScroll(container, container.scrollHeight, programmaticScrollRef);
      setShowScrollBottom(false);
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleFeedContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.group')) return;
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'feed',
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
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
          const attachments = await processFileListToAttachments(e.dataTransfer.files);
          if (attachments.length > 0) {
            const created = saveItem({
              type: 'note',
              title: attachments.length === 1 ? attachments[0].name : `Файлы (${attachments.length})`,
              content: '',
              folder: currentFolder,
              attachments,
            });
            addToast(`Заметка создана с ${attachments.length} ${attachments.length === 1 ? 'файлом' : 'файлами'}`, 'success');

            if (canEnrichAttachments(aiSettings)) {
              enrichItemAttachments(created, updateItem, aiSettings).catch(() => {});
            }
          }
        } catch {
          addToast('Не удалось обработать прикрепленные файлы', 'error');
        }
      }
    }
  };

  // Группы по календарным дням и шаг между соседями считает feedWindow: здесь остаётся «сейчас».
  const grouped = useMemo(
    () => groupFeedByDate(windowedItems, today),
    [windowedItems, today],
  );
  const renderCard = useCallback((item: SlagItem, gap: number) => (
    <ItemCard
      key={item.id}
      item={item}
      gap={gap}
      isHighlighted={highlightedItemId === item.id}
      repliesCount={replyMetaMap.countMap.get(item.id) || 0}
      firstReplyId={replyMetaMap.firstReplyMap.get(item.id) || null}
      replyParent={item.replyToId ? itemMap.get(item.replyToId) || null : null}
      onImageClick={handleImageClick}
    />
  ), [handleImageClick, highlightedItemId, itemMap, replyMetaMap]);

  return (
    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
      <FeedColumnResizer />
      <PinnedBanner />
      <div
        ref={containerRef}
        data-testid="feed-list-container"
        onScroll={handleScroll}
        onContextMenu={handleFeedContextMenu}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        {...pullHandlers}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 flex flex-col gap-6 relative scrollbar-thin"
        // Padding, not a spacer element: the column has a flex gap, so a spacer would add it too
        // and the anchor would stop a gap short of the composer. The dock height is published by
        // whoever owns the composer, so a keyboard frame costs no render here.
        style={{ paddingBottom: 'calc(var(--composer-inset, 104px) + 4px)' }}
      >
        {/* Drag & Drop Visual Dropzone Overlay */}
        <FeedDropOverlay isVisible={isDraggingOver} />

        {filteredItems.length === 0 ? taskFilter ? (
          <EmptyState icon={<Icon name="action.filter" size="lg" />} title="Нет задач по этому фильтру" />
        ) : items.length === 0 && !isPinnedOnlyFilter ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-fg-secondary">
            <Icon name="system.ai" size="none" tone="inherit" className="size-9" />
            <p className="text-xs font-medium">Хранилище пустое</p>
          </div>
        ) : (
          <EmptyState
            icon={
              isPinnedOnlyFilter ? (
                <Icon name="action.pin" size="lg" tone="warning" className="rotate-45" />
              ) : (
                <Icon name="entity.inbox" size="lg" tone="inherit" />
              )
            }
            title={
              isPinnedOnlyFilter
                ? 'Нет закрепленных записей'
                : 'В этой папке пусто'
            }
            description={
              isPinnedOnlyFilter
                ? 'В текущей папке нет закрепленных сообщений.'
                : 'Напишите сообщение в поле внизу, запишите голосовое или прикрепите файл.'
            }
            action={
              isPinnedOnlyFilter ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={togglePinnedOnlyFilter}
                  className="gap-1.5 text-xs text-fg-soft hover:text-white"
                >
                  Показать все сообщения
                </Button>
              ) : undefined
            }
            className="flex-1"
          />
        ) : (
          <>
            {/* Top spacer to push items to the bottom when list doesn't fill screen (Telegram-style) */}
            <div className="mt-auto pointer-events-none" aria-hidden="true" />

            {/* Top sentinel / load earlier notes trigger */}
            {hasMoreOlder && (
              <div ref={topSentinelRef} className="flex justify-center py-2 select-none">
                <button
                  type="button"
                  onClick={() => loadMoreOlder(false)}
                  className="text-xs font-mono text-fg-muted hover:text-fg-tertiary transition-colors px-3 py-1 rounded-full bg-surface border border-tint-4 cursor-pointer"
                >
                  Показать более ранние записи...
                </button>
              </div>
            )}

            {grouped.map(group => (
              <div key={group.dateLabel} className="flex flex-col gap-2">
                <FeedDateBubble label={group.dateLabel} />

                {/* List of cards: the step between two notes is their own gap, not the column's */}
                <div className="flex flex-col">
                  {group.items.map(({ item, gap }) => renderCard(item, gap))}
                </div>
              </div>
            ))}
            <FeedTaskSection key={`${filterKey}:today`} label="Сегодня" showLabel={grouped.at(-1)?.dateLabel !== 'Сегодня'} items={scheduledToday} highlightedItemId={highlightedItemId} renderCard={renderCard} />
            <FeedTaskSection key={`${filterKey}:overdue`} label="Просрочено" items={overdue} highlightedItemId={highlightedItemId} renderCard={renderCard} />
          </>
        )}

      </div>

      <FeedScrollHint
        pull={pull}
        pullSide={pullSide}
        isBottomButtonVisible={showScrollBottom}
        onScrollToBottom={scrollToBottom}
      />
    </div>
  );
};
