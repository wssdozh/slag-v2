import React from 'react';
import { CircleDashed, Circle, CheckCircle2 } from 'lucide-react';
import type { KanbanColumnIconType } from './kanbanModel';

// Half-filled Circle for Linear "In Progress"
const InProgressIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 text-amber-500' }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8 2 A6 6 0 0 1 8 14 Z" fill="currentColor" />
  </svg>
);

export interface KanbanStatusIconProps {
  iconType: KanbanColumnIconType;
  iconColor: string;
}

/** Status glyph used by both the column header and the card's quick switcher. */
export const KanbanStatusIcon: React.FC<KanbanStatusIconProps> = ({ iconType, iconColor }) => {
  const className = `w-3.5 h-3.5 ${iconColor}`;

  switch (iconType) {
    case 'dashed':
      return <CircleDashed className={`${className} shrink-0`} />;
    case 'circle':
      return <Circle className={`${className} shrink-0`} />;
    case 'in_progress':
      return <InProgressIcon className={className} />;
    case 'done':
      return <CheckCircle2 className={`${className} shrink-0`} />;
  }
};
