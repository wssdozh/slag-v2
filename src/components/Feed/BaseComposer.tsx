import React, { useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

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
  /** Верхний слот над textarea (Reply, чипсы, файлы) */
  topSlot?: React.ReactNode;
  /** Оверлейный слот в зоне textarea (выпадающий список автокомплита) */
  overlaySlot?: React.ReactNode;
  /** Полное замещение панели управления (например, при активной записи войса/видео) */
  customControls?: React.ReactNode;
  /** Минимальная высота поля ввода в px (по умолчанию 22) */
  minHeight?: number;
  /** Максимальная высота поля ввода в px (по умолчанию 220) */
  maxHeight?: number;
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
  overlaySlot,
  customControls,
  minHeight = 22,
  maxHeight = 220,
  className = '',
}) => {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const effectiveRef = textareaRef || localRef;

  // Динамический авто-ресайз поля ввода по содержимому
  useEffect(() => {
    if (effectiveRef.current) {
      effectiveRef.current.style.height = 'auto';
      const targetHeight = value.trim()
        ? Math.min(effectiveRef.current.scrollHeight, maxHeight)
        : minHeight;
      effectiveRef.current.style.height = `${targetHeight}px`;
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
      }
    }
  };

  return (
    <div className="w-full select-none relative">
      {overlaySlot}
      <div
        className={`rounded-2xl bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.12] p-2 md:p-2.5 flex flex-col gap-1 md:gap-1.5 shadow-2xl shadow-black/50 focus-within:border-white/20 transition-colors ${className}`}
      >
        {/* Верхний слот: Reply, вложенные в черновик файлы/войсы, чипсы */}
        {topSlot}

        {/* Зона ввода */}
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
            className="w-full bg-transparent text-base md:text-sm text-[#f4f4f5] placeholder-zinc-500 resize-none overflow-y-auto leading-normal py-0 px-1 outline-none border-none"
            style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
          />
        </div>

        {/* Нижняя панель действий (Toolbar) — без внутренней линии-разделителя */}
        {customControls ? (
          customControls
        ) : (
          <div className="flex items-center justify-between pt-1 gap-1.5 relative min-w-0">
            {leftControls}

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {rightControls}

              {sendButton !== undefined ? (
                sendButton
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isSubmitDisabled}
                  className={`w-ctrl-md h-ctrl-md rounded-lg flex items-center justify-center transition-all btn-press shrink-0 ${
                    !isSubmitDisabled
                      ? 'bg-white text-black hover:bg-zinc-200 active:scale-95 shadow-sm cursor-pointer'
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
