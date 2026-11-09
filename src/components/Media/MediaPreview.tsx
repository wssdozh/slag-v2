import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { readEntryObjectUrl, readEntryThumbnail } from '../../lib/media/folderBrowser';
import { enterFromEdge, exitToEdge } from '../../lib/motion';
import { usePhotoPager } from '../../hooks/gestures/usePhotoPager';
import type { DeviceMediaItem, DevicePick } from '../../types';

/** Full bytes for the photo on screen; above this the stored thumbnail is all we show. */
const FULL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

interface PreviewImageProps {
  item: DeviceMediaItem;
  isActive: boolean;
}

/**
 * A grid cell's preview is a stored thumbnail, which on a phone is about 600px — sharp in a tile,
 * mush full screen. The photo on screen upgrades to its real bytes; its neighbours stay cheap,
 * so a swipe never holds three full-size bitmaps at once.
 */
const PreviewImage: React.FC<PreviewImageProps> = ({ item, isActive }) => {
  const [src, setSrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void readEntryThumbnail(item.uri, 800).then((value) => {
      if (alive) setSrc(value);
    });
    return () => { alive = false; };
  }, [item.uri]);

  useEffect(() => {
    if (!isActive || item.size > FULL_IMAGE_MAX_BYTES) return;
    let alive = true;
    void readEntryObjectUrl(item.uri, item.mimeType)
      .then((url) => {
        objectUrlRef.current = url;
        if (alive) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      // The thumbnail is already on screen: a failed read degrades, it does not break.
      .catch(() => undefined);
    return () => { alive = false; };
  }, [isActive, item.mimeType, item.size, item.uri]);

  // The browser frees the bytes only when the URL is gone, and the viewer is opened over and over.
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  if (!src) return <span className="text-[10px] text-fg-muted">открываю</span>;
  return <img src={src} alt="" draggable={false} className="h-full w-full select-none object-contain" />;
};

export interface MediaPreviewProps {
  items: DeviceMediaItem[];
  index: number;
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onAttach: () => void;
}

/**
 * One photo, full screen, swipe to the next. Selection lives here rather than in the grid, the
 * way every gallery on a phone does it: open, look, tick, swipe on.
 *
 * Portalled to the body on purpose: the sheet owns a `translate`, and a translated ancestor is
 * a containing block for `position: fixed` — that is what used to shrink this viewer down to
 * the picker's panel.
 */
export const MediaPreview: React.FC<MediaPreviewProps> = ({
  items,
  index,
  selected,
  onToggle,
  onIndexChange,
  onClose,
  onAttach,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    const node = nodeRef.current;
    const animation = node ? exitToEdge(node, 44) : undefined;
    if (!animation) {
      onClose();
      return;
    }
    closingRef.current = true;
    void animation.finished.then(onClose, onClose);
  }, [onClose]);

  const { rootRef, stageRef, trackRef, imageRef, zoom, pan, isChromeVisible, handlers } = usePhotoPager({
    count: items.length,
    index,
    onIndexChange,
    onDismiss: close,
  });

  useEffect(() => {
    const node = nodeRef.current;
    if (node) enterFromEdge(node, 44);
  }, []);

  // Escape closes the viewer, not the sheet underneath it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [close]);

  const item = items[index];
  const isSelected = selected.some((pick) => item && pick.uri.uri === item.uri.uri);

  if (!item) return null;

  return createPortal(
    <div
      ref={(node) => {
        nodeRef.current = node;
        rootRef.current = node;
      }}
      className="fixed inset-0 z-[120] flex select-none flex-col overflow-hidden bg-black"
      data-testid="media-preview"
      style={{ touchAction: 'none' }}
      {...handlers}
    >
      <div
        className={`absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 pt-[max(var(--sat),0.75rem)] transition-opacity duration-150 ${
          isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Закрыть"
          className="cursor-pointer rounded-full p-2 text-fg-secondary transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="min-w-0 truncate text-xs text-fg-secondary">{item.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-muted">{index + 1} / {items.length}</span>
        <button
          type="button"
          onClick={() => onToggle(item)}
          aria-label={isSelected ? 'Убрать из выбранных' : 'Выбрать'}
          aria-pressed={isSelected}
          className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors ${
            isSelected
              ? 'border-accent-strong bg-accent-strong text-white'
              : 'border-white/40 text-white/70 hover:border-white/70'
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center will-change-transform">
        <div ref={trackRef} className="flex h-full w-full will-change-transform">
          {items.map((entry, slideIndex) => (
            <div
              key={entry.id}
              className="relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden"
              aria-hidden={slideIndex !== index}
            >
              {Math.abs(slideIndex - index) <= 1 && (
                <div
                  ref={slideIndex === index ? imageRef : undefined}
                  className="flex h-full w-full items-center justify-center transition-transform duration-150"
                  style={slideIndex === index ? { transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` } : undefined}
                >
                  <PreviewImage item={entry} isActive={slideIndex === index} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pt-8 pb-[max(var(--sab),0.75rem)] transition-opacity duration-150 ${
          isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span className="text-[11px] text-fg-muted">
          {selected.length > 0 ? `${selected.length} выбрано` : 'ничего не выбрано'}
        </span>
        <button
          type="button"
          onClick={onAttach}
          disabled={selected.length === 0}
          className={`ml-auto shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
            selected.length === 0
              ? 'cursor-not-allowed bg-surface text-fg-dim'
              : 'cursor-pointer bg-accent-strong text-white hover:bg-accent-strong/90'
          }`}
        >
          Прикрепить
        </button>
      </div>
    </div>,
    document.body,
  );
};
