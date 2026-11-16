// A time of day: two snap wheels inside the app's dialog frame.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BaseModal } from '../Modals/BaseModal';
import { useIsMobile } from '../../hooks/layout/useIsMobile';

/** Five rows reads as a wheel; three reads as a list. */
const VISIBLE_ROWS = 5;
/** The phone pays for a real finger target, a pointer does not. */
const ROW_HEIGHT_DESKTOP = 36;
const ROW_HEIGHT_MOBILE = 44;
/** `HH:MM`, the only shape the prefs store accepts. */
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

interface Clock {
  hour: number;
  minute: number;
}

function readClock(value: string): Clock {
  const match = CLOCK.exec(value.trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: 0, minute: 0 };
}

function writeClock(clock: Clock): string {
  return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
}

const twoDigits = (value: number): string => String(value).padStart(2, '0');

interface WheelColumnProps {
  /** Column name for assistive tech: "часы" or "минуты". */
  label: string;
  count: number;
  /** The row the wheel opens on. Every later move is reported through `onChange`. */
  initialValue: number;
  itemHeight: number;
  /** Takes focus on mount, so arrows work without a click first. */
  autoFocus?: boolean;
  onChange: (value: number) => void;
  testId: string;
}

/**
 * One column of the picker. The scroll position is the value: the browser's own snap does
 * the stepping, so a fling, a wheel notch and a finger all land on a row instead of between.
 */
const WheelColumn: React.FC<WheelColumnProps> = ({
  label,
  count,
  initialValue,
  itemHeight,
  autoFocus = false,
  onChange,
  testId,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialValue);
  /** The last row this column reported, so a scroll event cannot become a save per frame. */
  const reported = useRef(initialValue);
  /** Where the wheel was asked to open. Later prop changes are not allowed to drag it back. */
  const openedOn = useRef(initialValue);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = openedOn.current * itemHeight;
  }, [itemHeight]);

  useEffect(() => {
    if (!autoFocus) return;
    // The dialog mounts behind its entrance transition; the first frame is the earliest moment
    // the wheel is both present and allowed to take focus, so arrows work without a click.
    const frame = requestAnimationFrame(() => {
      listRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  const indexAt = useCallback(
    (scrollTop: number) => Math.max(0, Math.min(count - 1, Math.round(scrollTop / itemHeight))),
    [count, itemHeight],
  );

  const report = useCallback((index: number) => {
    if (index === reported.current) return;
    reported.current = index;
    setActive(index);
    onChange(index);
  }, [onChange]);

  const handleScroll = useCallback(() => {
    const node = listRef.current;
    if (node) report(indexAt(node.scrollTop));
  }, [indexAt, report]);

  const moveTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(count - 1, index));
    report(clamped);
    listRef.current?.scrollTo({ top: clamped * itemHeight, behavior: 'smooth' });
  }, [count, itemHeight, report]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(active - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo(active + 1);
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      moveTo(active - VISIBLE_ROWS);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      moveTo(active + VISIBLE_ROWS);
    }
  }, [active, moveTo]);

  /** Rows above and below the band match the distance the eye already reads. */
  const half = itemHeight * Math.floor(VISIBLE_ROWS / 2);

  return (
    <div className="shrink-0" style={{ width: '5.5rem' }}>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${testId}-${active}`}
        tabIndex={0}
        data-testid={testId}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        // A tap on the wheel also arms the arrows: the row is not the only way in.
        onPointerDown={() => listRef.current?.focus({ preventScroll: true })}
        style={{ height: itemHeight * VISIBLE_ROWS, paddingTop: half, paddingBottom: half }}
        className="relative overflow-y-auto scrollbar-none snap-y snap-mandatory overscroll-contain outline-none ring-0"
      >
        {Array.from({ length: count }, (_, index) => {
          const distance = Math.abs(index - active);
          const isActive = distance === 0;
          return (
            <button
              key={index}
              type="button"
              role="option"
              id={`${testId}-${index}`}
              aria-selected={isActive}
              data-testid={`${testId}-${index}`}
              tabIndex={-1}
              onClick={() => moveTo(index)}
              style={{ height: itemHeight, opacity: isActive ? 1 : distance === 1 ? 0.55 : 0.2 }}
              className={`flex w-full snap-center items-center justify-center font-mono tabular-nums outline-none ring-0 cursor-pointer ${
                isActive
                  ? 'text-xl font-medium text-fg-primary'
                  : distance === 1
                    ? 'text-sm text-fg-secondary'
                    : 'text-xs text-fg-dim'
              }`}
            >
              {twoDigits(index)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface TimePickerProps {
  isOpen: boolean;
  /** Which boundary is being set; shown as the dialog title. */
  title: string;
  /** `HH:MM` the wheels open on. */
  value: string;
  onApply: (value: string) => void;
  onClose: () => void;
}

/**
 * A clock with no free typing: the wheels own the value, the footer owns the decision.
 * Nothing is written until "готово" — a wheel that was dragged and then dismissed leaves
 * the stored window exactly as it was.
 */
export const TimePicker: React.FC<TimePickerProps> = ({
  isOpen,
  title,
  value,
  onApply,
  onClose,
}) => {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<Clock>(() => readClock(value));
  const [opened, setOpened] = useState(isOpen);
  if (opened !== isOpen) {
    setOpened(isOpen);
    // Every open starts from what the row holds.
    if (isOpen) setDraft(readClock(value));
  }

  // Escape is a cancel, and it stops here: the settings screen behind it stays open.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const itemHeight = isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;

  const apply = useCallback(() => onApply(writeClock(draft)), [draft, onApply]);

  // Enter confirms from anywhere inside the wheels; the arrows are spent on the column.
  const handleBodyKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    apply();
  }, [apply]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      portal
      maxWidth="max-w-[320px]"
      className="overscroll-contain"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="time-picker-cancel"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors cursor-pointer"
          >
            отмена
          </button>
          <button
            type="button"
            data-testid="time-picker-apply"
            onClick={apply}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent-strong text-white hover:bg-accent-strong/90 transition-colors cursor-pointer"
          >
            готово
          </button>
        </div>
      }
    >
      <div
        onKeyDown={handleBodyKeyDown}
        className="relative px-4 py-3 select-none"
      >
        {/* One band across both columns: the row the wheels will report. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl bg-tint-8"
          style={{ height: itemHeight }}
        />
        <div className="relative flex items-start justify-center gap-3">
          <WheelColumn
            label="часы"
            count={24}
            initialValue={draft.hour}
            itemHeight={itemHeight}
            autoFocus
            testId="time-picker-hour"
            onChange={(hour) => setDraft((current) => ({ ...current, hour }))}
          />
          <WheelColumn
            label="минуты"
            count={60}
            initialValue={draft.minute}
            itemHeight={itemHeight}
            testId="time-picker-minute"
            onChange={(minute) => setDraft((current) => ({ ...current, minute }))}
          />
        </div>
      </div>
    </BaseModal>
  );
};
