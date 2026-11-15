// Class presets for the segmented strip, so mobile headers share one geometry.
/**
 * Пресеты классов для `ResponsiveSegmented`. Геометрия сегментных полос живёт
 * здесь, чтобы мобильные шапки не собирали её руками по второму разу.
 * `default` — прежний кит-вариант, его классы остаются в самом компоненте.
 */
export type SegmentedVariant = 'default' | 'xs' | 'plain' | 'tabs';

export interface SegmentedStripClasses {
  /** Контейнер полосы: подложка, паддинг, радиус и граница варианта. */
  container: string;
  /** Геометрия кнопки-сегмента. */
  button: string;
  /** Активный сегмент; подложка нужна, пока подвижная плашка ещё не измерена. */
  activeButton: (isIndicatorReady: boolean) => string;
  /** Неактивный сегмент. */
  idleButton: string;
  /** Подвижная плашка под активным сегментом; null — полоса без плашки. */
  indicator: { className: string; testId: string } | null;
}

export const SEGMENTED_STRIP_CLASSES: Record<Exclude<SegmentedVariant, 'default'>, SegmentedStripClasses> = {
  /** Компактный переключатель в шапке календаря: иконка + подпись 10px. */
  xs: {
    container: 'flex items-center bg-surface p-0.5 rounded-lg border border-tint-8 shrink-0',
    button:
      'px-1.5 py-0.5 rounded-md text-3xs font-medium transition-colors cursor-pointer flex items-center gap-1',
    activeButton: () => 'bg-tint-10 text-white shadow-xs font-semibold',
    idleButton: 'text-fg-secondary hover:text-fg-soft',
    indicator: null,
  },
  /** Плоская полоса без плашки: подписи 12px, как в переключателе экрана тасок. */
  plain: {
    container: 'flex items-center bg-surface p-0.5 rounded-lg border border-tint-8 shrink-0',
    button: 'px-2 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
    activeButton: () => 'bg-tint-10 text-white shadow-sm',
    idleButton: 'text-fg-secondary hover:text-fg-soft',
    indicator: null,
  },
  /** Таб-бар статусов: крупные сегменты со счётчиком и белой плашкой. */
  tabs: {
    container:
      'relative flex items-center justify-between gap-1 bg-surface/90 p-1 rounded-2xl border border-tint-6 overflow-x-auto scrollbar-none',
    button:
      'relative z-10 shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium motion-press flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap',
    activeButton: (isIndicatorReady: boolean) =>
      `${isIndicatorReady ? '' : 'bg-tint-10 shadow-sm '}text-white font-semibold`,
    idleButton: 'text-fg-secondary hover:text-white hover:bg-tint-4',
    indicator: {
      className:
        'absolute top-1 bottom-1 left-0 rounded-xl bg-tint-10 shadow-sm pointer-events-none transition-[transform,width] duration-200',
      testId: 'status-tab-pill',
    },
  },
};
