// Calendar-only lookups: the priority badge palette, duration label, title cleanup.
import type { SlagItemPriority } from '../../types';
import { priorityTone } from '../UI/priorityTone';

export function getPriorityBadge(priority?: SlagItemPriority): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  checkboxBorder: string;
  checkboxHover: string;
} {
  switch (priorityTone(priority)) {
    case 'rose':
      return {
        bg: 'bg-rose-500/12 hover:bg-rose-500/18',
        border: 'border-rose-500/35',
        text: 'text-rose-200',
        dot: 'bg-rose-500',
        checkboxBorder: 'border-rose-500',
        checkboxHover: 'hover:border-rose-400 hover:bg-rose-500/25 text-rose-300',
      };
    case 'amber':
      return {
        bg: 'bg-amber-500/12 hover:bg-amber-500/18',
        border: 'border-amber-500/35',
        text: 'text-amber-200',
        dot: 'bg-amber-500',
        checkboxBorder: 'border-amber-400',
        checkboxHover: 'hover:border-amber-300 hover:bg-amber-400/25 text-amber-300',
      };
    case 'blue':
      return {
        bg: 'bg-blue-500/12 hover:bg-blue-500/18',
        border: 'border-blue-500/35',
        text: 'text-blue-200',
        dot: 'bg-blue-400',
        checkboxBorder: 'border-blue-400',
        checkboxHover: 'hover:border-blue-300 hover:bg-blue-400/25 text-blue-300',
      };
    default:
      return {
        bg: 'bg-surface-elevated hover:bg-surface-hover',
        border: 'border-tint-8',
        text: 'text-fg-soft',
        dot: 'bg-fg-muted',
        checkboxBorder: 'border-fg-secondary',
        checkboxHover: 'hover:border-fg-soft hover:bg-tint-12 text-fg-soft',
      };
  }
}

export function cleanTimeFromTitle(title: string): string {
  let clean = title;
  clean = clean.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[-—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, '').trim();
  clean = clean.replace(/(?:^|\s|[вВ@])\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, '').trim();
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean || title;
}

export function formatDurationBadge(mins: number): string {
  if (mins < 60) return `${mins}м`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}ч ${m}м` : `${h}ч`;
}
