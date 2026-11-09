import React, { useState } from 'react';
import { ArrowLeft, Check, Lock, RefreshCw } from 'lucide-react';
import { useDeviceGallery } from './useDeviceGallery';
import type { DeviceMediaItem } from '../../types';

export interface DeviceGalleryGridProps {
  onBack: () => void;
  onAttach: (items: DeviceMediaItem[]) => void;
  isAttaching: boolean;
}

/**
 * The phone's own photo library inside the attach sheet: newest first, tap to select, one button
 * to bring the chosen ones into the note. It replaces the system picker, which drops the person
 * out of the interface and loses the selection on the way back.
 */
export const DeviceGalleryGrid: React.FC<DeviceGalleryGridProps> = ({ onBack, onAttach, isAttaching }) => {
  const { access, items, hasMore, isLoading, loadMore, request } = useDeviceGallery('image', true);
  const [selected, setSelected] = useState<DeviceMediaItem[]>([]);

  const toggle = (item: DeviceMediaItem) => {
    setSelected((prev) => (
      prev.some((current) => current.id === item.id)
        ? prev.filter((current) => current.id !== item.id)
        : [...prev, item]
    ));
  };

  const indexOf = (id: string) => selected.findIndex((current) => current.id === id);

  return (
    <div className="flex flex-col min-h-0" data-testid="device-gallery">
      <div className="flex items-center gap-2 px-1 pb-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к источникам"
          className="p-1.5 rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-primary">Фото</p>
          <p className="text-[10px] text-fg-muted">Недавние · {items.length}</p>
        </div>
        <span className="ml-auto text-[10px] font-mono text-fg-muted">{selected.length > 0 ? `${selected.length} выбрано` : ''}</span>
      </div>

      {access !== 'granted' ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Lock className="w-5 h-5 text-fg-muted" />
          <p className="text-xs text-fg-primary">Нужен доступ к фото</p>
          <p className="text-[10px] text-fg-muted leading-relaxed">
            Приложение читает только имена, даты и размеры файлов. Сами фото остаются в телефоне, пока ты их не прикрепишь.
          </p>
          <button
            type="button"
            onClick={() => void request()}
            className="mt-1 px-3 py-1.5 rounded-md bg-accent-strong text-white text-xs font-medium hover:bg-accent-strong/90 transition-colors cursor-pointer"
          >
            Разрешить
          </button>
        </div>
      ) : (
        <>
          <div
            data-testid="device-gallery-grid"
            className="grid grid-cols-3 gap-1 overflow-y-auto min-h-0 max-h-[46vh] pr-1"
            onScroll={(event) => {
              const node = event.currentTarget;
              const nearEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 120;
              if (nearEnd && hasMore && !isLoading) loadMore();
            }}
          >
            {items.map((item) => {
              const order = indexOf(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  className="relative aspect-square rounded-md overflow-hidden bg-black/40 cursor-pointer"
                  aria-label={item.name}
                >
                  {item.thumb ? (
                    <img src={item.thumb} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full block bg-surface" />
                  )}
                  <span
                    className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono ${
                      order >= 0 ? 'bg-accent-strong text-white' : 'bg-black/50 border border-white/40 text-transparent'
                    }`}
                  >
                    {order >= 0 ? order + 1 : <Check className="w-2.5 h-2.5 opacity-0" />}
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
              <span className="col-span-3 py-6 text-center text-[10px] text-fg-muted">В галерее нет фото</span>
            )}
          </div>

          <button
            type="button"
            disabled={selected.length === 0 || isAttaching}
            onClick={() => onAttach(selected)}
            className={`mt-2 w-full py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              selected.length === 0 || isAttaching
                ? 'bg-surface text-fg-dim cursor-not-allowed'
                : 'bg-accent-strong text-white hover:bg-accent-strong/90'
            }`}
          >
            {isAttaching ? 'Прикрепляю…' : `Прикрепить${selected.length > 0 ? ` ${selected.length}` : ''}`}
          </button>
        </>
      )}
    </div>
  );
};
