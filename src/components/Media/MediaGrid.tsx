import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Lock, Music, RefreshCw } from 'lucide-react';
import { readEntryThumbnail } from '../../lib/media/folderBrowser';
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

export interface MediaGridProps {
  kind: DeviceMediaKind;
  selected: DevicePick[];
  onToggle: (pick: DevicePick) => void;
  /** Attaching from the full-screen preview, where the sheet footer is not on screen. */
  onAttachSelected: () => void;
  /** The camera cell lives in the photo grid: one less place to hunt for it. */
  onCamera?: () => void;
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
export const MediaGrid: React.FC<MediaGridProps> = ({ kind, selected, onToggle, onAttachSelected, onCamera }) => {
  const { access, items, hasMore, isLoading, loadMore, request } = useDeviceGallery(kind, true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

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

  return (
    <>
      <div
        data-testid={`media-grid-${kind}`}
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 content-start gap-1 overflow-y-auto pr-1 [overflow-anchor:none]"
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

        {items.map((item: DeviceMediaItem, itemIndex: number) => {
          const order = orderOf(item.uri.uri);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPreviewIndex(itemIndex)}
              aria-label={item.name}
              className="relative aspect-square min-w-0 cursor-pointer overflow-hidden rounded-md bg-black/40"
            >
              {kind === 'audio' ? (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface px-1 text-fg-muted">
                  <Music className="h-4 w-4 shrink-0" />
                  <span className="w-full truncate text-center text-[9px] leading-tight">{item.name}</span>
                </span>
              ) : (
                <Thumb uri={item.uri} />
              )}
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
        })}

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
