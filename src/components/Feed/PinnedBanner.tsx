// The pinned strip over the feed: cycles this folder's pinned notes and jumps to them.
import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Icon } from '../UI/icons/Icon';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/ui/usePresence';
import { useAttachmentSrc } from '../../hooks/media/useAttachmentSrc';

export const PinnedBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const {
    items,
    currentFolder,
    scrollToItem,
    isPinnedOnlyFilter,
    togglePinnedOnlyFilter,
    openContextMenu,
  } = useApp();

  const [pinIndex, setPinIndex] = useState(0);

  // Filter pinned items in current folder/scope
  const pinnedItems = useMemo(() => {
    return items
      .filter(item => {
        const inScope =
          currentFolder === DEFAULT_INBOX_FOLDER
            ? true
            : item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
        return inScope && !item.isArchived && Boolean(item.isPinned);
      })
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [items, currentFolder]);

  // Reset index when folder changes (React pure adjustment pattern)
  const [prevFolder, setPrevFolder] = useState(currentFolder);
  if (prevFolder !== currentFolder) {
    setPrevFolder(currentFolder);
    setPinIndex(0);
  }

  const isPinnedVisible = pinnedItems.length > 0;
  const { ref: bannerRef, phase, isPresent, onTransitionEnd } = usePresence(isPinnedVisible);
  const [cachedPinnedItems, setCachedPinnedItems] = useState(pinnedItems);
  if (pinnedItems.length > 0 && pinnedItems !== cachedPinnedItems) {
    setCachedPinnedItems(pinnedItems);
  }
  const effectivePinnedItems = pinnedItems.length > 0 ? pinnedItems : cachedPinnedItems;

  const safeIndex = effectivePinnedItems.length > 0 ? pinIndex % effectivePinnedItems.length : 0;
  const currentPinnedItem = effectivePinnedItems[safeIndex];

  // First image attachment for thumbnail preview
  const firstImage = currentPinnedItem?.attachments?.find(a => a.type === 'image');
  // The note carries metadata only, so the thumbnail's bytes are resolved on demand.
  const firstImageSrc = useAttachmentSrc(firstImage);

  if (!isPresent || effectivePinnedItems.length === 0) return null;

  // Formatted preview text: strip markdown headers, bold, links
  const previewText = (() => {
    const rawContent = (currentPinnedItem.content || '')
      .replace(/^#+\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .trim();
    const firstLine = rawContent.split('\n').map(l => l.trim()).find(Boolean) || '';
    if (
      currentPinnedItem.title &&
      currentPinnedItem.title !== 'Без названия' &&
      currentPinnedItem.title !== 'Быстрая заметка' &&
      currentPinnedItem.title !== 'Новая таска' &&
      currentPinnedItem.title !== 'Новая статья'
    ) {
      return firstLine && firstLine !== currentPinnedItem.title
        ? `${currentPinnedItem.title} — ${firstLine}`
        : currentPinnedItem.title;
    }
    return firstLine || currentPinnedItem.title || 'Вложение';
  })();

  const handleBannerClick = () => {
    scrollToItem(currentPinnedItem.id);
    if (pinnedItems.length > 1) {
      setPinIndex(prev => (prev + 1) % pinnedItems.length);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenu({
      x: rect.left + 24,
      y: rect.bottom + 4,
      type: 'item',
      item: currentPinnedItem,
    });
  };

  return (
    <div
      ref={bannerRef}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isPinnedVisible}
      className={`motion-accordion w-full ${className}`}
      data-expanded={isPinnedVisible}
    >
      <div className="motion-accordion-inner w-full">
        <div
          onClick={handleBannerClick}
          onContextMenu={handleContextMenu}
          data-testid="pinned-banner"
          className="h-11 px-3 sm:px-4 bg-surface hover:bg-surface-hover border-b border-tint-6 flex items-center justify-between gap-3 transition-colors cursor-pointer select-none shrink-0 z-20"
          title="Нажмите, чтобы перейти к закрепленному сообщению (ПКМ — контекстное меню)"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Left Indicator Track (Telegram-style vertical dashes / chips with shadow fade transition) */}
            <div
              className="flex flex-col gap-0.5 justify-center py-0.5 h-7 shrink-0 relative overflow-hidden"
              style={
                effectivePinnedItems.length > 5
                  ? {
                      maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                    }
                  : undefined
              }
              title={`Закреплено записей: ${effectivePinnedItems.length}`}
            >
              {effectivePinnedItems.length === 1 ? (
                <div className="w-0.5 h-6 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]" />
              ) : (
                effectivePinnedItems.slice(0, Math.min(effectivePinnedItems.length, 6)).map((it, idx) => {
                  const isActive = idx === safeIndex;
                  return (
                    <div
                      key={it.id}
                      className={`w-0.5 rounded-full transition-colors duration-200 ${
                        isActive
                          ? 'h-2.5 bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]'
                          : 'h-1 bg-tint-20'
                      }`}
                    />
                  );
                })
              )}
            </div>

            {/* Thumbnail or Type Icon Box */}
            {firstImage ? (
              <img
                src={firstImageSrc}
                alt="Превью"
                className="w-7 h-7 rounded-md object-cover shrink-0 border border-tint-8"
              />
            ) : (
              <div className="w-7 h-7 rounded-md bg-tint-4 border border-tint-6 flex items-center justify-center shrink-0">
                {currentPinnedItem.type === 'task' ? (
                  <Icon name="entity.task" size="sm" tone="warning" />
                ) : currentPinnedItem.type === 'article' ? (
                  <Icon name="entity.article" size="sm" tone="accent" />
                ) : (
                  <Icon name="entity.note" size="sm" />
                )}
              </div>
            )}

            {/* Content Preview */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-xs font-semibold text-blue-400 truncate">
                  Закреплённое сообщение
                </span>
                {effectivePinnedItems.length > 1 && (
                  <span className="text-3xs font-mono text-fg-muted shrink-0">
                    {safeIndex + 1} / {effectivePinnedItems.length}
                  </span>
                )}
              </div>
              <span className="text-2xs text-fg-tertiary truncate leading-tight mt-0.5 font-normal">
                {previewText}
              </span>
            </div>
          </div>

          {/* Right Action: Pin List / Toggle Pinned Filter */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePinnedOnlyFilter();
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
              isPinnedOnlyFilter
                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-8'
            }`}
            title={
              isPinnedOnlyFilter
                ? 'Показать все сообщения (фильтр активен)'
                : `Показать только закрепленные (${effectivePinnedItems.length})`
            }
            aria-label="Фильтр закрепленных записей"
          >
            <Icon name="action.pin" size="sm" tone="inherit" className="rotate-45 shrink-0" />
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="w-2 h-0.5 bg-current rounded-full block" />
              <span className="w-1.5 h-0.5 bg-current rounded-full block" />
              <span className="w-1 h-0.5 bg-current rounded-full block" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
