import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Lock, Pause, Play, RefreshCw } from 'lucide-react';
import { UI_DELAYS } from '../../config';
import { formatBytes } from '../../lib/formatBytes';
import { entryStreamSrc, readEntryThumbnail } from '../../lib/media/folderBrowser';
import { MediaPreview } from './MediaPreview';
import { useDeviceGallery } from './useDeviceGallery';
import type { DeviceMediaItem, DeviceMediaKind, DevicePick, DeviceUri } from '../../types';

interface ThumbProps {
  uri: DeviceUri;
}

/**
 * One thumbnail per cell, asked for only when the cell is about to be seen. A phone gallery has
 * hundreds of rows; decoding all of them on mount is what turns a scroll into a freeze.
 */
const Thumb: React.FC<ThumbProps> = ({ uri }) => {
  const holderRef = useRef<HTMLSpanElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const node = holderRef.current;
    if (!node) return;
    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (requested || !entries.some((entry) => entry.isIntersecting)) return;
      requested = true;
      observer.disconnect();
      void readEntryThumbnail(uri).then((value) => setSrc(value));
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [uri]);

  return (
    <span ref={holderRef} className="absolute inset-0 bg-surface">
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </span>
  );
};

interface AudioRowsProps {
  items: DeviceMediaItem[];
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
}

/** A `content://` URI needs the plugin's stream protocol: without it there are no bytes to play. */
const streamSrcFor = (item: DeviceMediaItem): string | null => {
  try {
    return entryStreamSrc(item.uri);
  } catch {
    return null;
  }
};

/**
 * Audio is never worth a full screen: no photo to look at, and the platform's own player is the
 * one thing worse than a list. Rows, one shared `<audio>`, play in place.
 */
const AudioRows: React.FC<AudioRowsProps> = ({ items, selected, onToggle }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const playing = items.find((item) => item.id === playingId) ?? null;
  const streamSrc = playing ? streamSrcFor(playing) : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !streamSrc) return;
    audio.play().catch(() => setPlayingId(null));
  }, [streamSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingId(null);
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, []);

  const togglePlay = (item: DeviceMediaItem) => {
    if (playingId !== item.id) {
      setPlayingId(item.id);
      return;
    }
    audioRef.current?.pause();
    setPlayingId(null);
  };

  return (
    <>
      <audio ref={audioRef} preload="none" src={streamSrc ?? undefined} />
      {items.map((item) => {
        const order = selected.findIndex((pick) => pick.uri.uri === item.uri.uri) + 1;
        const canPlay = streamSrcFor(item) !== null;
        const isPlaying = playingId === item.id;
        return (
          <div
            key={item.id}
            className="flex w-full shrink-0 items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface-hover"
          >
            <button
              type="button"
              onClick={() => togglePlay(item)}
              disabled={!canPlay}
              aria-label={isPlaying ? 'Пауза' : 'Прослушать'}
              aria-pressed={isPlaying}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:text-fg-primary disabled:cursor-default disabled:opacity-40"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onToggle(item)}
              aria-label={item.name}
              aria-pressed={order > 0}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-fg-primary">{item.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-fg-muted">{formatBytes(item.size)}</span>
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                  order > 0 ? 'bg-accent-strong text-white' : 'border border-white/25 text-transparent'
                }`}
              >
                {order > 0 ? order : ''}
              </span>
            </button>
          </div>
        );
      })}
    </>
  );
};

export interface MediaGridProps {
  kind: DeviceMediaKind;
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
  /** Attaching from the full-screen preview, where the sheet footer is not on screen. */
  onAttachSelected: () => void;
  /** The camera cell lives in the photo grid: one less place to hunt for it. */
  onCamera?: () => void;
  /** The sheet's scroll handoff needs the live scroller. */
  bodyRef?: (node: HTMLDivElement | null) => void;
}

const EMPTY_LABEL: Record<DeviceMediaKind, string> = {
  image: 'В галерее нет фото',
  video: 'В галерее нет видео',
  audio: 'На телефоне нет музыки',
};

const GRANT_LABEL: Record<DeviceMediaKind, string> = {
  image: 'Нужен доступ к фото',
  video: 'Нужен доступ к видео',
  audio: 'Нужен доступ к аудио',
};

/**
 * A paged grid of whatever the device media database holds for one kind. Selecting is the only
 * thing it does: the button that turns a selection into attachments lives in the sheet footer.
 */
export const MediaGrid: React.FC<MediaGridProps> = ({ kind, selected, onToggle, onAttachSelected, onCamera, bodyRef }) => {
  const { access, items, hasMore, isLoading, loadMore, request } = useDeviceGallery(kind, true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressTapRef = useRef(false);

  const isAudio = kind === 'audio';
  // A non-empty selection is the mode: the next tap adds or drops, it does not zoom.
  const isSelecting = selected.length > 0;

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  if (access !== 'granted') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Lock className="h-5 w-5 text-fg-muted" />
        <p className="text-xs text-fg-primary">{GRANT_LABEL[kind]}</p>
        <p className="text-[10px] leading-relaxed text-fg-muted">
          Приложение читает только имена, даты и размеры файлов. Сами файлы остаются в телефоне,
          пока ты их не прикрепишь.
        </p>
        <button
          type="button"
          onClick={() => void request()}
          className="mt-1 cursor-pointer rounded-md bg-accent-strong px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong/90"
        >
          Разрешить
        </button>
      </div>
    );
  }

  const orderOf = (uri: string) => selected.findIndex((pick) => pick.uri.uri === uri);

  const stopHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartRef.current = null;
  };

  /** Hold a tile to start a multi-selection, then keep tapping: no full screen in the way. */
  const startHold = (item: DeviceMediaItem) => (event: React.PointerEvent<HTMLButtonElement>) => {
    suppressTapRef.current = false;
    holdStartRef.current = { x: event.clientX, y: event.clientY };
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      suppressTapRef.current = true;
      try {
        navigator.vibrate?.(UI_DELAYS.HAPTIC_VIBRATION_MS);
      } catch {
        // Ignore: a buzz is a nicety, the selection already happened.
      }
      if (!selected.some((pick) => pick.uri.uri === item.uri.uri)) onToggle(item);
    }, UI_DELAYS.LONG_PRESS_MS);
  };

  const moveHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = holdStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) stopHold();
  };

  return (
    <>
      <div
        ref={bodyRef}
        data-testid={`media-grid-${kind}`}
        className={
          isAudio
            ? 'flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 [overflow-anchor:none]'
            : 'grid min-h-0 flex-1 auto-rows-min grid-cols-3 content-start gap-1 overflow-y-auto pr-1 [overflow-anchor:none]'
        }
        onScroll={(event) => {
          const node = event.currentTarget;
          const nearEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 120;
          if (nearEnd && hasMore && !isLoading) loadMore();
        }}
      >
        {onCamera && (
          <button
            type="button"
            onClick={onCamera}
            aria-label="Снять фото"
            className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/15 bg-surface text-fg-muted transition-colors hover:text-fg-primary"
          >
            <Camera className="h-4 w-4" />
            <span className="text-[9px]">снять</span>
          </button>
        )}

        {isAudio ? (
          <AudioRows items={items} selected={selected} onToggle={onToggle} />
        ) : (
          items.map((item: DeviceMediaItem, itemIndex: number) => {
            const order = orderOf(item.uri.uri);
            return (
              <button
                key={item.id}
                type="button"
                onPointerDown={startHold(item)}
                onPointerMove={moveHold}
                onPointerUp={stopHold}
                onPointerCancel={stopHold}
                onPointerLeave={stopHold}
                onClick={() => {
                  if (suppressTapRef.current) {
                    suppressTapRef.current = false;
                    return;
                  }
                  if (isSelecting) onToggle(item);
                  else setPreviewIndex(itemIndex);
                }}
                aria-label={item.name}
                aria-pressed={order >= 0}
                className="relative aspect-square min-w-0 cursor-pointer overflow-hidden rounded-md bg-black/40"
              >
                <Thumb uri={item.uri} />
                <span
                  className={`absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] ${
                    order >= 0
                      ? 'bg-accent-strong text-white'
                      : 'border border-white/40 bg-black/50 text-transparent'
                  }`}
                >
                  {order >= 0 ? order + 1 : <Check className="h-2.5 w-2.5 opacity-0" />}
                </span>
              </button>
            );
          })
        )}

        {isLoading && items.length === 0 && (
          <span className="col-span-3 flex items-center justify-center gap-2 py-6 text-[10px] text-fg-muted">
            <RefreshCw className="w-3 h-3 motion-safe:animate-spin" /> читаю галерею
          </span>
        )}
        {!isLoading && items.length === 0 && (
          <span className="col-span-3 py-6 text-center text-[10px] text-fg-muted">{EMPTY_LABEL[kind]}</span>
        )}
      </div>

      {previewIndex !== null && (
        <MediaPreview
          items={items}
          index={previewIndex}
          selected={selected}
          onToggle={onToggle}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          onAttach={onAttachSelected}
        />
      )}
    </>
  );
};
