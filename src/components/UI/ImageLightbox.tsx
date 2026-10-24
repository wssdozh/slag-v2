import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { LightboxImage } from '../../types';

export type { LightboxImage };

export interface ImageLightboxProps {
  images: LightboxImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  onRetryEnrich?: (image: LightboxImage) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  onRetryEnrich,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isTextPanelOpen, setIsTextPanelOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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

  const currentImage = images[currentIndex];
  const hasText = Boolean(currentImage?.extractedText || currentImage?.summary);

  const handleCopyText = useCallback(async () => {
    if (!currentImage) return;
    const parts = [
      currentImage.summary ? `Суть: ${currentImage.summary}` : '',
      currentImage.extractedText || '',
    ].filter(Boolean);
    const textToCopy = parts.join('\n\n');
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [currentImage]);

  // Keyboard navigation & controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isTextPanelOpen) {
          setIsTextPanelOpen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      } else if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setIsTextPanelOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose, isTextPanelOpen]);

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

        {/* Right: Text button + Zoom controls + Close button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Toggle Text / OCR Panel */}
          <button
            type="button"
            onClick={() => setIsTextPanelOpen(prev => !prev)}
            title={isTextPanelOpen ? 'Скрыть текст (T)' : 'Распознанный текст и описание (T)'}
            aria-label="Распознанный текст"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all outline-none border cursor-pointer active:scale-95 ${
              isTextPanelOpen
                ? 'bg-white/15 text-white border-white/20 shadow-sm'
                : hasText
                  ? 'bg-white/[0.06] text-zinc-300 hover:text-white border-white/10 hover:bg-white/10'
                  : 'text-zinc-500 hover:text-zinc-300 border-transparent hover:bg-white/[0.04]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Текст</span>
            {hasText && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
          </button>

          <div className="w-px h-4 bg-white/[0.08]" />

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

          <div className="w-px h-4 bg-white/[0.08] mx-0.5 sm:mx-1.5" />

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
      <div className="relative flex-1 flex items-stretch overflow-hidden w-full h-full min-h-0">
        {/* Left: Image Canvas */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden h-full min-w-0">
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
            className="relative max-w-full max-h-full flex items-center justify-center p-4"
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
              className={`max-h-[80vh] ${isTextPanelOpen ? 'max-w-[calc(85vw-360px)]' : 'max-w-[85vw]'} object-contain select-none rounded-md shadow-2xl transition-all duration-200 ${
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

        {/* Right: Text / OCR Side Panel */}
        {isTextPanelOpen && (
          <aside
            onClick={e => e.stopPropagation()}
            className="w-full sm:w-80 md:w-96 border-l border-white/[0.08] bg-[#0c0d0e]/95 backdrop-blur-2xl flex flex-col shrink-0 z-20 animate-in slide-in-from-right-4 duration-200 min-h-0 select-text"
          >
            {/* Header */}
            <div className="h-12 px-4 border-b border-white/[0.06] flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-200">Текст и описание</span>
              </div>
              <div className="flex items-center gap-1">
                {hasText && (
                  <button
                    type="button"
                    onClick={handleCopyText}
                    title="Скопировать текст в буфер"
                    className="px-2 py-1 rounded-md text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center gap-1.5 transition-all border border-white/[0.06] active:scale-95 cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsTextPanelOpen(false)}
                  title="Закрыть панель (T)"
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0 scrollbar-thin">
              {/* Summary if present */}
              {currentImage.summary && (
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] flex flex-col gap-1.5 shrink-0">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Суть изображения
                  </span>
                  <p className="text-xs text-zinc-200 leading-relaxed">
                    {currentImage.summary}
                  </p>
                </div>
              )}

              {/* OCR Text if present */}
              {currentImage.extractedText && (
                <div className="flex-1 flex flex-col min-h-0 gap-1.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    Распознанный текст (OCR)
                  </span>
                  <div className="flex-1 overflow-y-auto rounded-lg bg-black/40 border border-white/[0.06] p-3 text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text scrollbar-thin">
                    {currentImage.extractedText}
                  </div>
                </div>
              )}

              {/* Processing status */}
              {currentImage.enrichmentStatus === 'processing' && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
                  <span className="text-xs font-mono">Распознавание текста через Qwen 3.8 27B...</span>
                </div>
              )}

              {/* Error status */}
              {currentImage.enrichmentStatus === 'error' && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" /> Ошибка распознавания
                  </div>
                  {currentImage.enrichmentError && (
                    <div className="text-[11px] font-mono opacity-80 break-words">{currentImage.enrichmentError}</div>
                  )}
                  {onRetryEnrich && (
                    <button
                      type="button"
                      onClick={() => onRetryEnrich(currentImage)}
                      className="mt-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium self-start flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <RotateCcw className="w-3 h-3" /> Повторить OCR
                    </button>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!hasText && currentImage.enrichmentStatus !== 'processing' && currentImage.enrichmentStatus !== 'error' && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500 text-center">
                  <FileText className="w-8 h-8 opacity-40" />
                  <div className="text-xs">На изображении нет распознанного текста</div>
                  {onRetryEnrich && (
                    <button
                      type="button"
                      onClick={() => onRetryEnrich(currentImage)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border border-white/[0.08]"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Распознать текст
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 5. Lower Panel */}
      <div
        onClick={e => e.stopPropagation()}
        className="h-12 px-6 flex items-center justify-center border-t border-white/[0.06] bg-black/40 backdrop-blur-md z-10 shrink-0"
      >
        <span className="text-zinc-500 font-medium text-xs tracking-wide select-none">
          ← / → для перелистывания • Колесико для зума • T для текста • Esc для закрытия
        </span>
      </div>
    </div>
  );
};

export default ImageLightbox;
