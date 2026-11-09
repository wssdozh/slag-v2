import React, { useRef, useLayoutEffect } from 'react';
import { UploadCloud } from 'lucide-react';
import { SendButton } from '../UI/SendButton';
import { useIsMobile } from '../../hooks/layout/useIsMobile';

export interface BaseComposerProps {
  /** Текстовое значение поля ввода */
  value: string;
  /** Обработчик изменения текста */
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Обработчик отправки (по Enter или кнопке Send) */
  onSubmit: () => void;
  /** Плейсхолдер инпута */
  placeholder?: string;
  /** Внешний ref на textarea */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Кастомный обработчик keydown (например, для навигации по автокомплиту) */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Обработчик вставки файлов/изображений */
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Блокировка textarea */
  disabled?: boolean;
  /** Заблокирована ли кнопка отправки */
  isSubmitDisabled?: boolean;
  /** Всплывающая подсказка кнопки отправки */
  submitTitle?: string;
  /** Кастомная кнопка отправки (если нужна замена стандартной) */
  sendButton?: React.ReactNode;
  /** Тулбар: инструменты слева */
  leftControls?: React.ReactNode;
  /** Тулбар: утилиты справа (перед кнопкой Send) */
  rightControls?: React.ReactNode;
  /** Верхний слот над textarea (Reply, файлы) */
  topSlot?: React.ReactNode;
  /** Верхний правый слот (кнопка раскрытия в полноэкранный редактор) */
  topRightSlot?: React.ReactNode;
  /** Оверлейный слот в зоне textarea (выпадающий список автокомплита) */
  overlaySlot?: React.ReactNode;
  /** Полное замещение панели управления (например, при активной записи войса/видео) */
  customControls?: React.ReactNode;
  /** Минимальная высота поля ввода в px (по умолчанию 22) */
  minHeight?: number;
  /** Максимальная высота поля ввода в px (по умолчанию 220) */
  maxHeight?: number;
  /** Вариант отображения: 'card' (со своей рамкой/фоном) или 'flat' (для модалок без матрёшки) */
  variant?: 'card' | 'flat';
  /** Скрыть поле textarea (например, при активном монохромном режиме войс-записи) */
  hideTextarea?: boolean;
  /** Флаг активного перетаскивания файлов над композером */
  isDraggingOver?: boolean;
  /** Обработчик входа курсора с файлами */
  onDragEnter?: React.DragEventHandler<HTMLDivElement>;
  /** Обработчик перемещения файлов над карточкой */
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  /** Обработчик ухода курсора с файлами */
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  /** Обработчик сброса файлов */
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  /** Диапазон в тексте для подсветки (например, @папка); красный цвет — от тона mention */
  highlightRange?: { start: number; end: number } | null;
  /** Дополнительные классы для контейнера-каркаса */
  className?: string;
}

/**
 * BaseComposer — единый эталонный каркас поля ввода в SLAG v2 (по эталону ленты).
 * Соблюдает 95% UI-контракт, антиматрёшечный принцип (отсутствие внутренних линий/коробок)
 * и инкапсулирует динамический авторесайз textarea с обработкой Enter/Shift+Enter.
 */
export const BaseComposer: React.FC<BaseComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  textareaRef,
  onKeyDown,
  onPaste,
  disabled = false,
  isSubmitDisabled = false,
  submitTitle = 'Отправить (Enter)',
  sendButton,
  leftControls,
  rightControls,
  topSlot,
  topRightSlot,
  overlaySlot,
  customControls,
  minHeight = 24,
  maxHeight = 220,
  variant = 'card',
  hideTextarea = false,
  isDraggingOver = false,
  highlightRange = null,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  className = '',
}) => {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const effectiveRef = textareaRef || localRef;

  // Динамический авто-ресайз поля ввода по содержимому без лишних reflow
  useLayoutEffect(() => {
    if (effectiveRef.current) {
      if (!value.trim()) {
        effectiveRef.current.style.height = `${minHeight}px`;
        return;
      }
      effectiveRef.current.style.height = 'auto';
      const targetHeight = Math.min(effectiveRef.current.scrollHeight, maxHeight);
      effectiveRef.current.style.height = `${Math.max(minHeight, targetHeight)}px`;
    }
  }, [value, minHeight, maxHeight, effectiveRef]);

  // The mirror has to scroll with the field, or the highlight drifts.
  useLayoutEffect(() => {
    if (mirrorRef.current && effectiveRef.current) {
      mirrorRef.current.scrollTop = effectiveRef.current.scrollTop;
    }
  }, [value, highlightRange, effectiveRef]);

  // Desktop keeps Enter-to-send. On a phone the on-screen Enter is the only
  // newline key, so sending stays on the composer button.
  const isMobile = useIsMobile();
  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onKeyDown) onKeyDown(e);
    if (isMobile || e.defaultPrevented) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isSubmitDisabled) {
        onSubmit();
        requestAnimationFrame(() => {
          effectiveRef.current?.focus({ preventScroll: true });
        });
      }
    }
  };

  const isFlat = variant === 'flat';

  return (
    <div data-composer-root="" className="composer-surface relative flex w-full min-w-0 justify-center select-none">
      {overlaySlot}
      <div
        data-composer-panel=""
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          isFlat
            ? `w-full flex flex-col gap-2 p-0 bg-transparent border-0 shadow-none relative ${
                isDraggingOver ? 'rounded-2xl ring-2 ring-blue-500/50 bg-blue-500/[0.04]' : ''
              } ${className}`
            : `rounded-2xl bg-surface-elevated ${
                isDraggingOver
                  ? 'ring-2 ring-blue-500/60 bg-blue-500/[0.06] shadow-blue-500/10'
                  : 'focus-within:ring-1 focus-within:ring-white/10'
              } p-2 flex flex-col gap-2 md:shadow-2xl md:shadow-black/50 transition-shadow w-full relative ${className}`
        }
      >
        {/* Drag & Drop Visual Dropzone Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0.5 z-30 rounded-xl bg-surface border-2 border-dashed border-blue-500/50 flex items-center justify-center gap-2 pointer-events-none select-none text-xs font-mono text-zinc-300 motion-fade">
            <UploadCloud className="w-4 h-4 text-blue-400 animate-bounce" />
            <span>Отпустите файлы для прикрепления</span>
          </div>
        )}
        {/* Both slots collapse to zero height instead of unmounting, so they share
            one gap-less column: a closed slot must not leave a permanent gap. */}
        {topSlot && (
          <div className="composer-context flex min-w-0 flex-col">
            {/* Верхний слот: Reply и вложенные в черновик файлы/войсы */}
            {topSlot}
          </div>
        )}

        {/* Зона ввода */}
        {!hideTextarea && (
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative flex min-w-0 flex-1">
            {highlightRange && (
              /* A textarea cannot colour a substring, so the same text is mirrored
                 underneath it and the field renders its own glyphs transparent. */
              <div
                ref={mirrorRef}
                aria-hidden="true"
                className="composer-mirror pointer-events-none absolute inset-0 z-0 select-none overflow-hidden whitespace-pre-wrap break-words py-0 text-base md:text-sm leading-normal text-fg-primary"
              >
                {value.slice(0, highlightRange.start)}
                <span className="text-mention">{value.slice(highlightRange.start, highlightRange.end)}</span>
                {value.slice(highlightRange.end)}
              </div>
            )}
            <textarea
              ref={effectiveRef}
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDownInternal}
              onPaste={onPaste}
              onScroll={(e) => {
                if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              rows={1}
              placeholder={placeholder}
              disabled={disabled}
              className={`min-w-0 flex-1 w-full bg-transparent text-base md:text-sm text-fg-primary placeholder-zinc-500 placeholder:truncate resize-none  ${
                value.trim() ? 'overflow-y-auto' : 'overflow-y-hidden'
              } relative z-10 leading-normal py-0 outline-none border-none`}
              style={{
                minHeight: `${minHeight}px`,
                maxHeight: `${maxHeight}px`,
                // The mirror paints the glyphs; the field keeps the caret, the
                // selection and the hit area only.
                ...(highlightRange ? { color: 'transparent', caretColor: 'var(--color-fg-primary)' } : {}),
              }}
            />
            </div>
            {topRightSlot && (
              <div className="composer-top-actions flex shrink-0 items-center gap-1">
                {topRightSlot}
              </div>
            )}
          </div>
        )}

        {/* Нижняя панель действий (Toolbar) — без внутренней линии-разделителя */}
        {customControls ? (
          customControls
        ) : (
          <div className="composer-toolbar relative flex min-w-0 items-end justify-between gap-2">
            {leftControls}

            <div className="flex shrink-0 items-center gap-1 ml-auto">
              {rightControls}

              {sendButton !== undefined ? (
                sendButton
              ) : (
                <SendButton
                  // Tapping must not move focus out of the textarea: on Android that
                  // closes the keyboard, and the refocus below opens it again — two
                  // animations the user reads as the composer shaking.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isSubmitDisabled) {
                      onSubmit();
                      requestAnimationFrame(() => {
                        const field = effectiveRef.current;
                        if (field && document.activeElement !== field) {
                          field.focus({ preventScroll: true });
                        }
                      });
                    }
                  }}
                  disabled={isSubmitDisabled}
                  label={isMobile ? submitTitle.replace(' (Enter)', '') : submitTitle}
                  className="composer-toolbar-control composer-send"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
