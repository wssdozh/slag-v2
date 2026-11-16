// The dashed frame over the feed while files hover: what dropping them will do.
import React, { memo } from 'react';
import { Icon } from '../../UI/icons/Icon';
export interface FeedDropOverlayProps {
  /** Показывать ли рамку: файлы держат над лентой. */
  isVisible: boolean;
}

/**
 * Рамка поверх ленты, пока над ней держат файлы: что именно произойдёт, если отпустить.
 * Сама ловит события не она — их обрабатывает прокручиваемый контейнер под ней.
 */
const FeedDropOverlayComponent: React.FC<FeedDropOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-2 z-30 rounded-2xl bg-canvas border-2 border-dashed border-blue-500/40 flex flex-col items-center justify-center gap-2 pointer-events-none select-none motion-fade">
      <Icon name="action.upload" size="xl" tone="accent" className="animate-bounce" />
      <span className="text-sm font-medium text-fg-soft">
        Перетащите файлы сюда для создания заметки
      </span>
      <span className="text-xs text-fg-muted font-mono">
        Изображения, аудио, видео или документы сохранятся в локальное хранилище
      </span>
    </div>
  );
};

export const FeedDropOverlay = memo(FeedDropOverlayComponent);
