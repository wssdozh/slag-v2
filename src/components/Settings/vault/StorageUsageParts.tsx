// The ring and the one-line rows of «занятое место»: geometry only, the numbers arrive as props.
import React from 'react';
import { formatUsageBytes, type UsageSegment } from '../../../lib/storage/usage';
import { toneOf } from './usageTone';

/** The composition of everything the store holds: total in the middle, one arc per sector. */
export const UsageRing: React.FC<{ segments: UsageSegment[]; total: number }> = ({ segments, total }) => {
  const size = 168;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const lengths = segments.map((segment) => (total > 0 ? (segment.bytes / total) * circumference : 0));

  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-tint-6"
        />
        {segments.map((segment, index) => {
          // A 2px gap keeps two neighbouring arcs from reading as one.
          const dash = Math.max(lengths[index] - 2, 0.5);
          const dashOffset = -lengths.slice(0, index).reduce((sum, value) => sum + value, 0);
          return (
            <circle
              key={segment.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              className={toneOf(segment.id).stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div
        data-testid="storage-total"
        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
      >
        <span className="font-mono text-base text-fg-primary">{formatUsageBytes(total)}</span>
        <span className="text-2xs text-fg-dim">всего</span>
      </div>
    </div>
  );
};

interface UsageLineProps {
  testId?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/** One line per entry, 32px tall: a second line of description is what made the old list tall. */
export const UsageLine: React.FC<UsageLineProps> = ({ testId, onClick, disabled = false, children }) => {
  const interactive = Boolean(onClick);
  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      {...(interactive
        ? { type: 'button' as const, onClick, disabled, 'aria-disabled': disabled }
        : {})}
      data-testid={testId}
      className={`flex h-8 w-full items-center gap-2 px-3.5 text-left ${
        interactive
          ? 'cursor-pointer transition-colors hover:bg-surface-hover active:bg-tint-10 active:duration-0'
          : ''
      } ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
    </Element>
  );
};

export const EmptyLine: React.FC = () => <div className="px-3.5 py-3 text-2xs text-fg-muted">пока пусто</div>;
