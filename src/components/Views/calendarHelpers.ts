export function getPriorityBadge(priority?: 'none' | 'low' | 'medium' | 'high'): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  checkboxBorder: string;
  checkboxHover: string;
} {
  switch (priority) {
    case 'high':
      return {
        bg: 'bg-rose-500/12 hover:bg-rose-500/18',
        border: 'border-rose-500/35',
        text: 'text-rose-200',
        dot: 'bg-rose-500',
        checkboxBorder: 'border-rose-500',
        checkboxHover: 'hover:border-rose-400 hover:bg-rose-500/25 text-rose-300',
      };
    case 'medium':
      return {
        bg: 'bg-amber-500/12 hover:bg-amber-500/18',
        border: 'border-amber-500/35',
        text: 'text-amber-200',
        dot: 'bg-amber-500',
        checkboxBorder: 'border-amber-400',
        checkboxHover: 'hover:border-amber-300 hover:bg-amber-400/25 text-amber-300',
      };
    case 'low':
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
        border: 'border-white/[0.08]',
        text: 'text-zinc-200',
        dot: 'bg-zinc-500',
        checkboxBorder: 'border-zinc-400',
        checkboxHover: 'hover:border-zinc-200 hover:bg-white/[0.12] text-zinc-200',
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
