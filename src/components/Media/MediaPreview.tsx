import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { readEntryThumbnail } from '../../lib/media/folderBrowser';
import { useSwipeGesture } from '../../hooks/gestures/useSwipeGesture';
import type { DeviceMediaItem, DevicePick, DeviceUri } from '../../types';

interface PreviewImageProps {
  uri: DeviceUri;
}

/** The big version of a grid cell: a wide thumbnail, not the original, so it opens instantly. */
const PreviewImage: React.FC<PreviewImageProps> = ({ uri }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void readEntryThumbnail(uri, 1400).then((value) => {
      if (alive) setSrc(value);
    });
    return () => { alive = false; };
  }, [uri]);

  if (!src) return <span className="text-[10px] text-fg-muted">открываю</span>;
  return <img src={src} alt="" draggable={false} className="max-h-full max-w-full select-none object-contain" />;
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
  const item = items[index];
  const isSelected = selected.some((pick) => pick.uri.uri === item?.uri.uri);

  const { onTouchStart, onTouchEnd } = useSwipeGesture({
    onSwipeLeft: () => { if (index < items.length - 1) onIndexChange(index + 1); },
    onSwipeRight: () => { if (index > 0) onIndexChange(index - 1); },
  });

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex select-none flex-col bg-black/95 motion-fade"
      data-testid="media-preview"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(var(--sat),0.75rem)]">
        <button
          type="button"
          onClick={onClose}
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
              : 'border-white/40 text-transparent hover:border-white/70'
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-1">
        <PreviewImage key={item.uri.uri} uri={item.uri} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-3 py-2.5 pb-[max(var(--sab),0.75rem)]">
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
    </div>
  );
};
