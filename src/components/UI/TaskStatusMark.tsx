// Round task status glyph whose check stroke draws itself when the task is completed.
import React from 'react';

export interface TaskStatusMarkProps {
  done: boolean;
  className?: string;
}

// Tuned for the r=9 ring: the lucide check is drawn for the full 24px box and
// pokes out of a smaller circle.
const CHECK_PATH = 'M16.2 8.6 10.7 14.4 7.9 11.6';

/**
 * Round task status glyph. The stroke draws on completion so the state change is
 * visible at a glance; sizing comes from `className`, colours from `currentColor`.
 */
export const TaskStatusMark: React.FC<TaskStatusMarkProps> = ({ done, className = '' }) => {
  if (!done) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`text-success ${className}`}>
      <circle
        className="motion-check-ring"
        cx="12"
        cy="12"
        r="9"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        className="motion-check"
        d={CHECK_PATH}
        pathLength={1}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
