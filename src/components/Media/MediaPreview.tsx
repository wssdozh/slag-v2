import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { readEntryBytes, readEntryThumbnail } from '../../lib/media/folderBrowser';
import { enterFromEdge, exitToEdge, motionEase, motionMs } from '../../lib/motion';
import type { DeviceMediaItem, DevicePick } from '../../types';

const MAX_ZOOM = 4;
/** Full bytes for the photo on screen; above this the stored thumbnail is all we show. */
const FULL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const SWIPE_COMMIT = 0.25;
/** ms of coasting the release velocity buys, same constant the sheet's spring uses. */
const PROJECT_MS = 180;
const DISMISS_PX = 120;
const FLICK_PX_MS = 0.35;

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
    void readEntryBytes(item.uri, item.mimeType)
      .then((value) => { if (alive) setSrc(value); })
      // The thumbnail is already on screen: a failed read degrades, it does not break.
      .catch(() => undefined);
    return () => { alive = false; };
  }, [isActive, item.mimeType, item.size, item.uri]);

  if (!src) return <span className="text-[10px] text-fg-muted">открываю</span>;
  return <img src={src} alt="" draggable={false} className="h-full w-full select-none object-contain" />;
};

type DragMode = 'idle' | 'x' | 'y' | 'pinch' | 'pan';

interface Drag {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  dx: number;
  dy: number;
  mode: DragMode;
  pointers: Map<number, { x: number; y: number }>;
  startZoom: number;
  startDistance: number;
  startPanX: number;
  startPanY: number;
  moved: boolean;
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const closingRef = useRef(false);

  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** The pager is placed by hand, so the layout effect must not snap over a running settle. */
  const placedRef = useRef(-1);
  // A new photo starts unzoomed; reset belongs to render, not to an effect.
  const [zoomIndex, setZoomIndex] = useState(index);
  if (zoomIndex !== index) {
    setZoomIndex(index);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const item = items[index];
  const isSelected = selected.some((pick) => item && pick.uri.uri === item.uri.uri);

  /** Write the pager offset straight to the node: a swipe must not wait for a re-render. */
  const placeTrack = useCallback((next: number, offset = 0, animate = false) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate
      ? `transform ${motionMs('base')}ms ${motionEase('settle')}`
      : 'none';
    track.style.transform = `translate3d(calc(${-next * 100}% + ${offset}px), 0, 0)`;
  }, []);

  useLayoutEffect(() => {
    if (placedRef.current === index) return;
    placedRef.current = index;
    placeTrack(index);
  }, [index, placeTrack]);

  useEffect(() => {
    const node = rootRef.current;
    if (node) enterFromEdge(node, 44);
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    const node = rootRef.current;
    const animation = node ? exitToEdge(node, 44) : undefined;
    if (!animation) {
      onClose();
      return;
    }
    closingRef.current = true;
    void animation.finished.then(onClose, onClose);
  }, [onClose]);

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

  const distanceOf = (pointers: Map<number, { x: number; y: number }>) => {
    const [first, second] = [...pointers.values()];
    return Math.hypot(first.x - second.x, first.y - second.y) || 1;
  };

  const commitZoom = useCallback((next: number) => {
    const clamped = Math.max(1, Math.min(MAX_ZOOM, next));
    const settled = clamped < 1.15 ? 1 : clamped;
    setZoom(settled);
    if (settled === 1) setPan({ x: 0, y: 0 });
  }, []);

  /** A zoomed photo pans only as far as its overflow, or it would be dragged off the screen. */
  const clampPan = useCallback((x: number, y: number, level: number) => {
    const limitX = ((rootRef.current?.clientWidth ?? 360) * (level - 1)) / 2;
    const limitY = ((rootRef.current?.clientHeight ?? 640) * (level - 1)) / 2;
    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y)),
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const drag = dragRef.current;
    if (!drag) {
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        velocity: 0,
        dx: 0,
        dy: 0,
        mode: 'idle',
        pointers: new Map(),
        startZoom: zoom,
        startDistance: 1,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
      };
    }
    const current = dragRef.current!;
    current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (current.pointers.size === 2) {
      current.mode = 'pinch';
      current.startDistance = distanceOf(current.pointers);
      current.startZoom = zoom;
    }
  }, [pan.x, pan.y, zoom]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.pointers.has(event.pointerId)) return;
    drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (drag.mode === 'pinch') {
      if (drag.pointers.size < 2) return;
      const next = drag.startZoom * (distanceOf(drag.pointers) / drag.startDistance);
      const clamped = Math.max(1, Math.min(MAX_ZOOM, next));
      if (imageRef.current) imageRef.current.style.transform = `scale(${clamped})`;
      return;
    }

    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientX - drag.lastX) / elapsed;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    drag.dx = event.clientX - drag.startX;
    drag.dy = event.clientY - drag.startY;

    if (zoom > 1) {
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) < 6) return;
      drag.moved = true;
      drag.mode = 'pan';
      const nextPan = clampPan(drag.startPanX + drag.dx, drag.startPanY + drag.dy, zoom);
      if (imageRef.current) {
        imageRef.current.style.transform = `scale(${zoom}) translate(${nextPan.x / zoom}px, ${nextPan.y / zoom}px)`;
      }
      return;
    }

    if (drag.mode === 'idle') {
      if (Math.hypot(drag.dx, drag.dy) < 6) return;
      drag.moved = true;
      drag.mode = Math.abs(drag.dx) > Math.abs(drag.dy) ? 'x' : 'y';
    }

    if (drag.mode === 'x') {
      const atEdge = (drag.dx > 0 && index === 0) || (drag.dx < 0 && index === items.length - 1);
      placeTrack(index, atEdge ? drag.dx * 0.3 : drag.dx);
      return;
    }

    if (drag.dy > 0 && stageRef.current) {
      stageRef.current.style.transition = 'none';
      stageRef.current.style.transform = `translate3d(0, ${drag.dy}px, 0) scale(${Math.max(0.8, 1 - drag.dy / 1600)})`;
    }
  }, [clampPan, index, items.length, placeTrack, zoom]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pointers.delete(event.pointerId);

    if (drag.mode === 'pinch') {
      if (drag.pointers.size === 0) {
        const applied = imageRef.current?.style.transform.match(/scale\(([\d.]+)\)/);
        commitZoom(applied ? Number(applied[1]) : zoom);
        dragRef.current = null;
      }
      return;
    }

    if (drag.mode === 'pan') {
      setPan(clampPan(drag.startPanX + drag.dx, drag.startPanY + drag.dy, zoom));
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'x') {
      const width = rootRef.current?.clientWidth ?? 360;
      const projected = drag.dx + drag.velocity * PROJECT_MS;
      const commit = Math.abs(projected) > width * SWIPE_COMMIT || Math.abs(drag.velocity) > FLICK_PX_MS;
      const next = commit
        ? Math.max(0, Math.min(items.length - 1, index + (projected < 0 ? 1 : -1)))
        : index;
      placedRef.current = next;
      placeTrack(next, 0, true);
      if (next !== index) onIndexChange(next);
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'y') {
      const stage = stageRef.current;
      if (stage) {
        stage.style.transition = `transform ${motionMs('base')}ms ${motionEase('settle')}`;
        stage.style.transform = '';
      }
      if (drag.dy > DISMISS_PX || drag.velocity > FLICK_PX_MS) {
        close();
      }
      dragRef.current = null;
      return;
    }

    // A press without movement is a tap: it hides or shows the chrome.
    if (!drag.moved) setIsChromeVisible((visible) => !visible);
    dragRef.current = null;
  }, [clampPan, close, commitZoom, index, items.length, onIndexChange, placeTrack, zoom]);

  const onPointerCancel = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.mode === 'x') placeTrack(index, 0, true);
    if (drag.mode === 'y' && stageRef.current) {
      stageRef.current.style.transition = `transform ${motionMs('base')}ms ${motionEase('settle')}`;
      stageRef.current.style.transform = '';
    }
  }, [index, placeTrack]);

  if (!item) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[120] flex select-none flex-col overflow-hidden bg-black"
      data-testid="media-preview"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
