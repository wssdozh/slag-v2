import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { MenuDropdown } from './MenuDropdown';
import { ChevronDown, Check } from 'lucide-react';
import type { SegmentedVariant } from './segmentedVariants';
import { SEGMENTED_STRIP_CLASSES } from './segmentedVariants';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  showLabelInExpanded?: boolean;
  showLabelInTrigger?: boolean;
  /** Класс подписи: мобильные полосы прячут часть подписи на узком экране. */
  labelClassName?: string;
  /** Домешать класс кнопке: у сегментов в полосе бывает своя раскладка иконки и подписи. */
  buttonClassName?: string;
  /** Хвост кнопки с доступом к активности: счётчик статуса и подобное. */
  trailing?: (isSelected: boolean) => React.ReactNode;
  title?: string;
  ariaLabel?: string;
}

export interface ResponsiveSegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  compact?: boolean;
  size?: 'sm' | 'md';
  direction?: 'down' | 'up' | 'auto';
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  /** Геометрия полосы: кит-вариант по умолчанию, `xs`/`plain`/`tabs` — мобильные шапки. */
  variant?: SegmentedVariant;
}

export function ResponsiveSegmented<T extends string = string>({
  value,
  onChange,
  options,
  compact = false,
  size = 'sm',
  direction = 'auto',
  className = '',
  triggerClassName = '',
  ariaLabel,
  variant = 'default',
}: ResponsiveSegmentedProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value) || options[0];
  const strip = variant === 'default' ? null : SEGMENTED_STRIP_CLASSES[variant];
  const hasIndicator = !compact && (!strip || strip.indicator !== null);

  const heightClass = size === 'sm' ? 'h-ctrl-sm' : 'h-ctrl-md';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return;
    const activeBtn = containerRef.current.querySelector<HTMLButtonElement>(`[data-segmented-value="${value}"]`);
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        ready: true,
      });
    }
  }, [value]);

  useLayoutEffect(() => {
    if (!hasIndicator) return;
    updateIndicator();
  }, [updateIndicator, options, hasIndicator]);

  useEffect(() => {
    if (!hasIndicator) return;
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator, hasIndicator]);

  // Compact Mode: Single dropdown trigger button displaying current active option
  if (compact) {
    const showTriggerLabel = selectedOption?.showLabelInTrigger ?? !selectedOption?.icon;

    return (
      <MenuDropdown
        ariaLabel={ariaLabel}
        className={className}
        direction={direction}
        minWidth={150}
        positioningWidth={160}
        clampLeft={false}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        trigger={
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel || selectedOption?.ariaLabel || selectedOption?.label}
          title={selectedOption?.title || selectedOption?.label}
          className={`${heightClass} px-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 ${
            isOpen ? 'bg-white/[0.06] text-white' : ''
          } flex items-center gap-1.5 text-xs transition-colors cursor-pointer shrink-0 ${triggerClassName}`}
        >
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          {showTriggerLabel && selectedOption?.label && (
            <span className="truncate text-xs font-medium max-w-[70px]">
              {selectedOption.label}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-150 shrink-0 ${
              isOpen ? 'rotate-180 text-zinc-300' : ''
            }`}
          />
        </button>
        }
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                isSelected
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                <span className="truncate">{opt.label}</span>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.5]" />}
            </button>
          );
        })}
      </MenuDropdown>
    );
  }

  // Mobile strip: the same slots, but the paddings/height of the host header
  if (strip) {
    return (
      <div
        ref={containerRef}
        aria-label={ariaLabel}
        className={`${strip.container} ${className}`.trim()}
      >
        {strip.indicator && indicatorStyle.ready && (
          <div
            data-testid={strip.indicator.testId}
            className={strip.indicator.className}
            style={{
              transform: `translateX(${indicatorStyle.left}px)`,
              width: `${indicatorStyle.width}px`,
              transitionTimingFunction: 'var(--ease-settle)',
            }}
          />
        )}
        {options.map((opt) => {
          const isSelected = opt.value === value;
          const showExpandedLabel = opt.showLabelInExpanded ?? true;

          return (
            <button
              key={opt.value}
              data-segmented-value={strip.indicator ? opt.value : undefined}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.title}
              aria-label={opt.ariaLabel || opt.label}
              className={`${strip.button} ${opt.buttonClassName ?? ''} ${isSelected ? strip.activeButton(indicatorStyle.ready) : strip.idleButton}`}
            >
              {opt.icon}
              {showExpandedLabel && opt.label && (
                opt.labelClassName ? (
                  <span className={opt.labelClassName}>{opt.label}</span>
                ) : (
                  <span>{opt.label}</span>
                )
              )}
              {opt.trailing?.(isSelected)}
            </button>
          );
        })}
      </div>
    );
  }

  // Expanded Mode: Segmented strip of buttons with sliding active pill
  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      className={`relative flex items-center ${heightClass} gap-0.5 shrink-0 select-none ${className}`}
    >
      {indicatorStyle.ready && (
        <div
          data-testid="segmented-pill"
          className="absolute top-0 bottom-0 left-0 rounded-md bg-white/10 shadow-sm pointer-events-none transition-[transform,width] duration-200"
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: `${indicatorStyle.width}px`,
            transitionTimingFunction: 'var(--ease-settle)',
          }}
        />
      )}
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const showExpandedLabel = opt.showLabelInExpanded ?? !opt.icon;

        return (
          <button
            key={opt.value}
            data-segmented-value={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.title || opt.label}
            aria-label={opt.ariaLabel || opt.label}
            className={`relative z-10 h-full ${
              opt.icon && !showExpandedLabel ? 'px-1.5' : 'px-2'
            } rounded-md text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              isSelected
                ? `${indicatorStyle.ready ? '' : 'bg-white/10'} text-white font-medium`
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {showExpandedLabel && opt.label && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
