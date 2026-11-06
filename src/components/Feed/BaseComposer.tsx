import React, { useRef, useLayoutEffect } from 'react';
import { Send, UploadCloud } from 'lucide-react';

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
  /** Слот метаданных/чипсов под textarea (активные свойства задачи, теги, папка) */
  propertiesSlot?: React.ReactNode;
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
  propertiesSlot,
  overlaySlot,
  customControls,
  minHeight = 24,
  maxHeight = 220,
  variant = 'card',
  hideTextarea = false,
  isDraggingOver = false,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  className = '',
}) => {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
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

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isSubmitDisabled) {
        onSubmit();
        requestAnimationFrame(() => {
          effectiveRef.current?.focus();
        });
      }
    }
  };

  const isFlat = variant === 'flat';

  return (
    <div className="w-full select-none relative flex justify-center">
      {overlaySlot}
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          isFlat
            ? `w-full flex flex-col gap-1.5 p-0 bg-transparent border-0 shadow-none relative ${
                isDraggingOver ? 'rounded-2xl ring-2 ring-blue-500/50 bg-blue-500/[0.04]' : ''
              } ${className}`
            : `rounded-2xl bg-surface-elevated/80 backdrop-blur-xl border ${
                isDraggingOver
                  ? 'border-blue-500/60 bg-blue-500/[0.06] shadow-blue-500/10'
                  : 'border-white/[0.12]'
              } p-2 sm:p-2.5 flex flex-col gap-1.5 shadow-2xl shadow-black/50 focus-within:border-white/20 transition-colors w-full relative ${className}`
        }
      >
        {/* Drag & Drop Visual Dropzone Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0.5 z-30 rounded-xl bg-surface/92 backdrop-blur-sm border-2 border-dashed border-blue-500/50 flex items-center justify-center gap-2 pointer-events-none select-none text-xs font-mono text-zinc-300 motion-fade">
            <UploadCloud className="w-4 h-4 text-blue-400 animate-bounce" />
            <span>Отпустите файлы для прикрепления</span>
          </div>
        )}
        {/* Кнопка в правом верхнем углу (раскрытие в полноэкранный редактор) */}
        {topRightSlot && (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center">
            {topRightSlot}
          </div>
        )}

        {/* Верхний слот: Reply, вложенные в черновик файлы/войсы, чипсы */}
        {topSlot}

        {/* Слот свойств: активные свойства задачи, теги, папка над полем ввода */}
        {propertiesSlot}

        {/* Зона ввода */}
        {!hideTextarea && (
          <div className="relative">
            <textarea
              ref={effectiveRef}
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDownInternal}
              onPaste={onPaste}
              rows={1}
              placeholder={placeholder}
              disabled={disabled}
              className={`w-full bg-transparent text-base md:text-sm text-fg-primary placeholder-zinc-500 placeholder:truncate resize-none ${
                topRightSlot ? 'pr-8' : 'pr-1'
              } ${
                value.trim() ? 'overflow-y-auto' : 'overflow-y-hidden'
              } leading-normal ${isFlat ? 'pt-1.5 pb-0.5 px-0.5' : 'pt-1.5 pb-1 px-1'} outline-none border-none`}
              style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
            />
          </div>
        )}

        {/* Нижняя панель действий (Toolbar) — без внутренней линии-разделителя */}
        {customControls ? (
          customControls
        ) : (
          <div className="flex items-center justify-between gap-2 relative min-w-0">
            {leftControls}

            <div className="flex items-center gap-1.5 max-md:gap-2.5 shrink-0 ml-auto">
              {rightControls}

              {sendButton !== undefined ? (
                sendButton
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isSubmitDisabled) {
                      onSubmit();
                      requestAnimationFrame(() => {
                        effectiveRef.current?.focus();
                      });
                    }
                  }}
                  disabled={isSubmitDisabled}
                  className={`w-ctrl-md h-ctrl-md rounded-lg flex items-center justify-center motion-press shrink-0 ${
                    !isSubmitDisabled
                      ? 'bg-white text-black hover:bg-zinc-200 shadow-sm cursor-pointer'
                      : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
                  }`}
                  title={submitTitle}
                >
                  <Send className="w-4 h-4 ml-0.5 fill-current" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
