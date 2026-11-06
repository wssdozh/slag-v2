import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Pin, CheckSquare, FileText, StickyNote } from 'lucide-react';
import { DEFAULT_INBOX_FOLDER } from '../../config';

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

  if (pinnedItems.length === 0) return null;

  const safeIndex = pinIndex % pinnedItems.length;
  const currentPinnedItem = pinnedItems[safeIndex];

  // First image attachment for thumbnail preview
  const firstImage = currentPinnedItem.attachments?.find(
    a => a.type === 'image' && a.dataUrl
  );

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
      onClick={handleBannerClick}
      onContextMenu={handleContextMenu}
      data-testid="pinned-banner"
      className={`h-11 px-3 sm:px-4 bg-surface/75 hover:bg-surface/95 border-b border-white/[0.06] backdrop-blur-md flex items-center justify-between gap-3 transition-colors cursor-pointer select-none shrink-0 z-20 ${className}`}
      title="Нажмите, чтобы перейти к закрепленному сообщению (ПКМ — контекстное меню)"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Left Indicator Track (Telegram-style vertical dashes / chips with shadow fade transition) */}
        <div
          className="flex flex-col gap-0.5 justify-center py-0.5 h-7 shrink-0 relative overflow-hidden"
          style={
            pinnedItems.length > 5
              ? {
                  maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                }
              : undefined
          }
          title={`Закреплено записей: ${pinnedItems.length}`}
        >
          {pinnedItems.length === 1 ? (
            <div className="w-0.5 h-6 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]" />
          ) : (
            pinnedItems.slice(0, Math.min(pinnedItems.length, 6)).map((it, idx) => {
              const isActive = idx === safeIndex;
              return (
                <div
                  key={it.id}
                  className={`w-0.5 rounded-full transition-colors duration-200 ${
                    isActive
                      ? 'h-2.5 bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]'
                      : 'h-1 bg-white/20'
                  }`}
                />
              );
            })
          )}
        </div>

        {/* Thumbnail or Type Icon Box */}
        {firstImage ? (
          <img
            src={firstImage.dataUrl}
            alt="Превью"
            className="w-7 h-7 rounded-md object-cover shrink-0 border border-white/[0.08]"
          />
        ) : (
          <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
            {currentPinnedItem.type === 'task' ? (
              <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
            ) : currentPinnedItem.type === 'article' ? (
              <FileText className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </div>
        )}

        {/* Content Preview */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-xs font-semibold text-blue-400 truncate">
              Закреплённое сообщение
            </span>
            {pinnedItems.length > 1 && (
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                {safeIndex + 1} / {pinnedItems.length}
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-300 truncate leading-tight mt-0.5 font-normal">
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
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]'
        }`}
        title={
          isPinnedOnlyFilter
            ? 'Показать все сообщения (фильтр активен)'
            : `Показать только закрепленные (${pinnedItems.length})`
        }
        aria-label="Фильтр закрепленных записей"
      >
        <Pin className="w-3.5 h-3.5 rotate-45 shrink-0" />
        <div className="flex flex-col gap-0.5 shrink-0">
          <span className="w-2 h-0.5 bg-current rounded-full block" />
          <span className="w-1.5 h-0.5 bg-current rounded-full block" />
          <span className="w-1 h-0.5 bg-current rounded-full block" />
        </div>
      </button>
    </div>
  );
};
