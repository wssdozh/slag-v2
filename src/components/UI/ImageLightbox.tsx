import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export interface LightboxImage {
  id?: string;
  name: string;
  url: string;
}

export interface ImageLightboxProps {
  images: LightboxImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [prevIndex, setPrevIndex] = useState(currentIndex);
  if (prevIndex !== currentIndex) {
    setPrevIndex(currentIndex);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }

  // Zoom handlers (scale 0.5 to 3 with step 0.25)
  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => {
      const next = Math.max(0.5, Math.round((prev - 0.25) * 100) / 100);
      if (next <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Navigate left / right
  const handlePrev = useCallback(() => {
    if (images.length > 1) {
      onNavigate((currentIndex - 1 + images.length) % images.length);
    }
  }, [currentIndex, images.length, onNavigate]);

  const handleNext = useCallback(() => {
    if (images.length > 1) {
      onNavigate((currentIndex + 1) % images.length);
    }
  }, [currentIndex, images.length, onNavigate]);

  // Keyboard navigation & controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // Mouse wheel zoom with non-passive listener to prevent page scrolling
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setScale(prev => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
      } else if (e.deltaY > 0) {
        setScale(prev => {
          const next = Math.max(0.5, Math.round((prev - 0.25) * 100) / 100);
          if (next <= 1) {
            setPosition({ x: 0, y: 0 });
          }
          return next;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  // Pointer drag & pan when zoomed
  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (scale <= 1 || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture release safety
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale === 1) {
      setScale(2);
    } else {
      resetZoom();
    }
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  return (
    <div
      ref={containerRef}
      onClick={onClose}
      className="fixed inset-0 z-50 z-[130] bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none animate-in fade-in duration-200 outline-none"
    >
      {/* 3. Upper Toolbar */}
      <div
        onClick={e => e.stopPropagation()}
        className="h-14 px-6 flex items-center justify-between border-b border-white/[0.06] bg-black/40 backdrop-blur-md z-10 shrink-0"
      >
        {/* Left: File name + Counter */}
        <div className="flex items-center gap-3 min-w-0 max-w-[55%]">
          <span
            className="text-sm font-medium text-zinc-200 truncate select-text"
            title={currentImage.name}
          >
            {currentImage.name}
          </span>
          <span className="text-zinc-400 font-mono text-xs px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] shrink-0">
            {currentIndex + 1} из {images.length}
          </span>
        </div>

        {/* Right: Zoom controls & Close button */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            title="Уменьшить (Zoom -)"
            aria-label="Уменьшить"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all outline-none disabled:opacity-25 disabled:pointer-events-none"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span
            onClick={resetZoom}
            title="Кликните для сброса (100%)"
            className="w-12 text-center text-zinc-400 font-mono text-xs cursor-pointer hover:text-zinc-200 transition-colors py-1"
          >
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 3}
            title="Увеличить (Zoom +)"
            aria-label="Увеличить"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all outline-none disabled:opacity-25 disabled:pointer-events-none"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={resetZoom}
            title="Сбросить масштаб (RotateCcw)"
            aria-label="Сбросить"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all outline-none"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/[0.08] mx-1.5" />

          <button
            type="button"
            onClick={onClose}
            title="Закрыть (Esc)"
            aria-label="Закрыть"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. Central Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden w-full h-full min-h-0">
        {/* Previous Button (ChevronLeft) */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              handlePrev();
            }}
            title="Предыдущее (←)"
            aria-label="Предыдущее изображение"
            className="absolute left-6 z-20 p-2.5 rounded-full bg-black/40 hover:bg-white/10 active:scale-95 text-zinc-400 hover:text-white border border-white/[0.08] backdrop-blur-md transition-all shadow-xl outline-none"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Current Image */}
        <div
          onClick={e => e.stopPropagation()}
          className="relative max-w-full max-h-full flex items-center justify-center"
        >
          <img
            src={currentImage.url}
            alt={currentImage.name}
            draggable={false}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            className={`max-h-[80vh] max-w-[85vw] object-contain select-none rounded-md shadow-2xl ${
              scale > 1
                ? isDragging
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-zoom-in'
            }`}
          />
        </div>

        {/* Next Button (ChevronRight) */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              handleNext();
            }}
            title="Следующее (→)"
            aria-label="Следующее изображение"
            className="absolute right-6 z-20 p-2.5 rounded-full bg-black/40 hover:bg-white/10 active:scale-95 text-zinc-400 hover:text-white border border-white/[0.08] backdrop-blur-md transition-all shadow-xl outline-none"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 5. Lower Panel */}
      <div
        onClick={e => e.stopPropagation()}
        className="h-12 px-6 flex items-center justify-center border-t border-white/[0.06] bg-black/40 backdrop-blur-md z-10 shrink-0"
      >
        <span className="text-zinc-500 font-medium text-xs tracking-wide select-none">
          ← / → для перелистывания • Колесико для зума • Esc для закрытия
        </span>
      </div>
    </div>
  );
};

export default ImageLightbox;
