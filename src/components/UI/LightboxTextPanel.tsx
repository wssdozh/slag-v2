import React, { useCallback, useState } from 'react';
import { AlertCircle, Check, Copy, FileText, Loader2, RotateCcw, X } from 'lucide-react';
import type { LightboxImage } from '../../types';

export interface LightboxTextPanelProps {
  image: LightboxImage;
  isOpen: boolean;
  onClose: () => void;
  onRetryEnrich?: (image: LightboxImage) => void;
}

/**
 * What the OCR pass found in the picture, on the same plane as everything else: no cards inside
 * cards, the hierarchy is the two labels.
 */
export const LightboxTextPanel: React.FC<LightboxTextPanelProps> = ({ image, isOpen, onClose, onRetryEnrich }) => {
  const [isCopied, setIsCopied] = useState(false);
  const hasText = Boolean(image.extractedText || image.summary);

  const copy = useCallback(async () => {
    const parts = [
      image.summary ? `Суть: ${image.summary}` : '',
      image.extractedText || '',
    ].filter(Boolean);
    const textToCopy = parts.join('\n\n');
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // A phone webview can refuse the clipboard; the text is still selectable on screen.
    }
  }, [image.extractedText, image.summary]);

  return (
    <aside
      onClick={(event) => event.stopPropagation()}
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={`z-20 flex min-h-0 shrink-0 select-text flex-col overflow-hidden border-l border-white/[0.08] bg-panel transition-[width] duration-200 ease-out ${
        isOpen ? 'w-full sm:w-80 md:w-96' : 'w-0 border-l-0'
      }`}
    >
      <div className="flex h-full w-full shrink-0 flex-col sm:w-80 md:w-96">
        <div className="flex h-12 shrink-0 select-none items-center justify-between border-b border-white/[0.06] px-5">
          <span className="text-xs font-medium text-zinc-200">Текст изображения</span>
          <div className="flex items-center gap-1.5">
            {hasText && (
              <button
                type="button"
                onClick={() => void copy()}
                title="Скопировать текст в буфер"
                className="motion-press flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Копировать</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Закрыть панель (T)"
              className="cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {image.summary && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Суть изображения
              </span>
              <p className="font-sans text-xs leading-relaxed text-zinc-300">{image.summary}</p>
            </div>
          )}

          {image.summary && image.extractedText && <div className="h-px w-full bg-white/[0.06]" />}

          {image.extractedText && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Распознанный текст
              </span>
              <div className="select-text whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
                {image.extractedText}
              </div>
            </div>
          )}

          {image.enrichmentStatus === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
              <span className="font-mono text-xs">Распознавание текста через Qwen 3.8 27B...</span>
            </div>
          )}

          {image.enrichmentStatus === 'error' && (
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" /> Ошибка распознавания
              </div>
              {image.enrichmentError && (
                <div className="break-words font-mono text-[11px] text-rose-300/80">{image.enrichmentError}</div>
              )}
              {onRetryEnrich && (
                <button
                  type="button"
                  onClick={() => onRetryEnrich(image)}
                  className="motion-press mt-1 flex cursor-pointer items-center gap-1.5 self-start rounded bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
                >
                  <RotateCcw className="h-3 w-3" /> Повторить OCR
                </button>
              )}
            </div>
          )}

          {!hasText && image.enrichmentStatus !== 'processing' && image.enrichmentStatus !== 'error' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-zinc-500">
              <FileText className="h-7 w-7 opacity-30" />
              <div className="text-xs">На изображении нет текста</div>
              {onRetryEnrich && (
                <button
                  type="button"
                  onClick={() => onRetryEnrich(image)}
                  className="motion-press flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
                >
                  <FileText className="h-3.5 w-3.5 text-zinc-400" /> Распознать текст
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
